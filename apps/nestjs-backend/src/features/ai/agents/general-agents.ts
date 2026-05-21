/* eslint-disable @typescript-eslint/naming-convention */
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { LanguageModel, ModelMessage } from 'ai';
import { tool, ToolLoopAgent } from 'ai';
import { Pool } from 'pg';
import { z } from 'zod';

const execAsync = promisify(exec);

// Lazy singleton — initialised on first query so NestJS config / dotenv has time to load.
let _pool: Pool | null | undefined = undefined;

function getPool(): Pool | null {
  if (_pool !== undefined) return _pool;
  const url =
    process.env.PRISMA_DATA_DATABASE_URL ??
    process.env.PRISMA_META_DATABASE_URL ??
    process.env.PRISMA_DATABASE_URL ??
    process.env.DATABASE_URL;
  _pool = url ? new Pool({ connectionString: url }) : null;
  return _pool;
}

// ─── Sandbox abstraction ──────────────────────────────────────────────────────

interface ISandbox {
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
  readdir(
    dirPath: string,
    opts: { withFileTypes: true }
  ): Promise<{ name: string; isDirectory(): boolean }[]>;
  exec(command: string, opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
}

function createNodeSandbox(workingDirectory: string): ISandbox {
  return {
    async readFile(filePath) {
      const resolved = path.isAbsolute(filePath) ? filePath : path.join(workingDirectory, filePath);
      return fs.promises.readFile(resolved, 'utf-8');
    },

    async readdir(dirPath, _opts) {
      const resolved = path.isAbsolute(dirPath) ? dirPath : path.join(workingDirectory, dirPath);
      return fs.promises.readdir(resolved, { withFileTypes: true });
    },

    async exec(command, opts) {
      return execAsync(command, { cwd: opts?.cwd ?? workingDirectory });
    },

    async query(sql, params = []) {
      const pool = getPool();
      if (!pool) throw new Error('No database connection string found in environment');
      const client = await pool.connect();
      try {
        await client.query('BEGIN TRANSACTION READ ONLY');
        const result = await client.query(sql, params as unknown[]);
        await client.query('COMMIT');
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

// ─── Skill discovery ──────────────────────────────────────────────────────────

interface ISkillMetadata {
  name: string;
  description: string;
  path: string;
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) throw new Error('No frontmatter found');

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    result[key] = value;
  }

  if (!result['name'] || !result['description']) {
    throw new Error('SKILL.md frontmatter must contain both `name` and `description`');
  }
  return { name: result['name'], description: result['description'] };
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

/**
 * Scans each given directory for sub-folders that contain a SKILL.md file.
 */
async function discoverSkills(sandbox: ISandbox, directories: string[]): Promise<ISkillMetadata[]> {
  const skills: ISkillMetadata[] = [];
  const seenNames = new Set<string>();

  for (const dir of directories) {
    let entries: { name: string; isDirectory(): boolean }[];
    try {
      entries = await sandbox.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = `${dir}/${entry.name}`;
      const skillFile = `${skillDir}/SKILL.md`;

      try {
        const content = await sandbox.readFile(skillFile, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        if (seenNames.has(frontmatter.name)) continue;
        seenNames.add(frontmatter.name);

        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: skillDir,
        });
      } catch {
        continue;
      }
    }
  }

  return skills;
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSkillsPrompt(skills: ISkillMetadata[]): string {
  const skillsList = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');

  return `
## Skills

Use the \`loadSkill\` tool to load a skill when the user's request
would benefit from specialized instructions.

Available skills:
${skillsList}`;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

// Mutable per-request state shared across tool calls within the same agent invocation.
interface IContextState {
  skillDir?: string;
}

const loadSkillTool = tool({
  description:
    'Load a skill to get its full instructions and discover the path to its bundled ' +
    'scripts, references, and asset templates.',
  inputSchema: z.object({
    name: z.string().describe('The skill name to load'),
  }),
  execute: async ({ name }, { experimental_context: experimentalContext }) => {
    const { sandbox, skills, state } = experimentalContext as {
      sandbox: ISandbox;
      skills: ISkillMetadata[];
      state: IContextState;
    };

    const skill = skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!skill) {
      return {
        error: `Skill '${name}' not found. Available: ${skills.map((s) => s.name).join(', ')}`,
      };
    }

    const skillFile = `${skill.path}/SKILL.md`;
    const content = await sandbox.readFile(skillFile, 'utf-8');

    // Track the loaded skill directory so the bash tool uses the right CWD.
    state.skillDir = skill.path;

    return {
      skillDirectory: skill.path,
      content: stripFrontmatter(content),
    };
  },
});

const readFileTool = tool({
  description:
    'Read a file from the filesystem. Use this to load skill reference docs ' +
    '(e.g. references/contacts.md) or asset templates (e.g. assets/payload-templates.json) ' +
    'after calling loadSkill to obtain the skillDirectory.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path, or path relative to the sandbox working directory'),
  }),
  execute: async ({ path: filePath }, { experimental_context: experimentalContext }) => {
    const { sandbox } = experimentalContext as { sandbox: ISandbox };
    try {
      return await sandbox.readFile(filePath, 'utf-8');
    } catch (err) {
      return { error: `Could not read file: ${(err as Error).message}` };
    }
  },
});

const bashTool = tool({
  description:
    'Execute a shell command in the skill working directory. ' +
    'Use this to run skill scripts, e.g.: ' +
    '`node scripts/get-records.js \'{"tableId":"tblXXX","take":20}\'`. ' +
    'The TEABLE_API_TOKEN environment variable must be set in the process environment. ' +
    'Always call loadSkill first so the correct working directory is set.',
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
  }),
  execute: async ({ command }, { experimental_context: experimentalContext }) => {
    const { sandbox, state } = experimentalContext as {
      sandbox: ISandbox;
      state: IContextState;
    };

    // Allowlist: only `node scripts/<name>.js [optional-arg]` — no path traversal, no other binaries.
    if (!/^node\s+scripts\/[\w-]+\.js(?:\s.*)?$/s.test(command) || command.includes('..')) {
      return { error: 'Only `node scripts/<name>.js [arg]` commands are permitted' };
    }

    if (!state.skillDir) {
      return { error: 'No skill loaded. Call loadSkill first to set the working directory.' };
    }

    try {
      return await sandbox.exec(command, { cwd: state.skillDir });
    } catch (err) {
      return { error: `Command failed: ${(err as Error).message}` };
    }
  },
});

const queryDatabaseTool = tool({
  description:
    'Execute a read-only SELECT query directly against the PostgreSQL database. ' +
    'Use $1, $2, ... placeholders for parameters. ' +
    'Prefer this over the bash scripts when you need joins, aggregations, or schema introspection.',
  inputSchema: z.object({
    sql: z.string().describe('A SELECT SQL statement with positional placeholders ($1, $2, ...)'),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe('Bound parameter values for the placeholders'),
  }),
  execute: async ({ sql, params = [] }, { experimental_context: experimentalContext }) => {
    const { sandbox } = experimentalContext as { sandbox: ISandbox; skills: ISkillMetadata[] };

    if (!/^\s*SELECT\b/i.test(sql.trimStart())) {
      return { error: 'Only SELECT statements are allowed via queryDatabase' };
    }

    try {
      return await sandbox.query(sql, params);
    } catch (err) {
      return { error: `Query failed: ${(err as Error).message}` };
    }
  },
});

const loadDatabaseSchemaTool = tool({
  description:
    'Discover the live database schema: all spaces, bases, tables, fields, and link relationships. ' +
    'MUST be called before any queryDatabase or bash call so you know the correct table IDs, ' +
    'field IDs, field types, and how tables relate to each other.',
  inputSchema: z.object({
    baseId: z
      .string()
      .optional()
      .describe('Optional: restrict discovery to a single base ID (tblXXX). Omit to load all.'),
  }),
  execute: async ({ baseId }, { experimental_context: experimentalContext }) => {
    const { sandbox } = experimentalContext as { sandbox: ISandbox };

    const whereClause = baseId ? 'WHERE b.id = $1' : '';
    const params: string[] = baseId ? [baseId] : [];

    const tableSql = `
      SELECT
        tm.id          AS table_id,
        tm.name        AS table_name,
        tm.db_table_name,
        b.id           AS base_id,
        b.name         AS base_name,
        s.id           AS space_id,
        s.name         AS space_name
      FROM table_meta tm
      JOIN base b ON tm.base_id = b.id
      JOIN space s ON b.space_id = s.id
      ${whereClause}
      ORDER BY s.name, b.name, tm.name
    `;

    let tables: Array<{
      table_id: string;
      table_name: string;
      base_id: string;
      base_name: string;
      space_id: string;
      space_name: string;
    }>;
    try {
      const result = await sandbox.query(tableSql, params);
      tables = result.rows as typeof tables;
    } catch (err) {
      return { error: `Failed to load tables: ${(err as Error).message}` };
    }

    if (tables.length === 0) {
      return { error: 'No tables found. Check that the database is reachable and contains data.' };
    }

    const tableIds = tables.map((t) => t.table_id);

    const fieldSql = `
      SELECT
        f.id          AS field_id,
        f.name        AS field_name,
        f.type        AS field_type,
        f.table_id,
        f.is_primary,
        f.options
      FROM field f
      WHERE f.table_id = ANY($1)
      ORDER BY f.table_id, f.is_primary DESC NULLS LAST, f.name
    `;

    let rawFields: Array<{
      field_id: string;
      field_name: string;
      field_type: string;
      table_id: string;
      is_primary: boolean;
      options: unknown;
    }>;
    try {
      const result = await sandbox.query(fieldSql, [tableIds]);
      rawFields = result.rows as typeof rawFields;
    } catch (err) {
      return { error: `Failed to load fields: ${(err as Error).message}` };
    }

    const schema = tables.map((table) => {
      const fields = rawFields
        .filter((f) => f.table_id === table.table_id)
        .map((f) => {
          const opts = f.options as Record<string, unknown> | null | undefined;
          return {
            id: f.field_id,
            name: f.field_name,
            type: f.field_type,
            isPrimary: f.is_primary,
            linkedTableId:
              f.field_type === 'link' && opts
                ? (opts['foreignTableId'] as string | undefined)
                : undefined,
            selectOptions:
              (f.field_type === 'singleSelect' || f.field_type === 'multipleSelect') && opts
                ? ((opts['choices'] as Array<{ name: string }> | undefined) ?? []).map(
                    (c) => c.name
                  )
                : undefined,
          };
        });

      return { ...table, fields };
    });

    // Build a human-readable relationship summary
    const links: string[] = [];
    for (const table of schema) {
      for (const field of table.fields) {
        if (field.linkedTableId) {
          const target = schema.find((t) => t.table_id === field.linkedTableId);
          if (target) {
            links.push(
              `${table.table_name} (${table.table_id}).${field.name} (${field.id}) → ${target.table_name} (${target.table_id})`
            );
          }
        }
      }
    }

    return {
      tableCount: schema.length,
      schema,
      relationshipSummary: links,
    };
  },
});

// ─── Call options schema ──────────────────────────────────────────────────────

const callOptionsSchema = z.object({
  sandbox: z.custom<ISandbox>(),
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      path: z.string(),
    })
  ),
  state: z.custom<IContextState>(),
});

type ICallOptions = z.infer<typeof callOptionsSchema>;

// ─── Agent factory ────────────────────────────────────────────────────────────

export function createGeneralInfoAgent(model: LanguageModel): ToolLoopAgent<ICallOptions> {
  return new ToolLoopAgent<ICallOptions>({
    model,
    instructions: `You are a general information analysis agent for a data centre management system.

You can query and update an organisational database. The database schema is NOT fixed — it
evolves over time, so you must discover it live on every request.

## Mandatory 3-step workflow for any database-related request

### Step 1 — Confirm the database and load the schema
Call \`loadDatabaseSchema\` (no arguments needed for a full discovery) BEFORE any other
database operation. This will return:
- All spaces, bases, and tables (with their IDs)
- All fields per table (field ID, name, type, whether it is the primary/label field)
- Link relationships between tables (which field in table A points to table B)
- Select/multi-select option values

You must be aware of:
  - How many tables exist and what they are named
  - The exact table_id (tblXXX) and field_id (fldXXX) for each table and field
  - Which fields are link fields and what table they point to

### Step 2 — Plan and execute the query
Using the discovered schema:
1. Identify which table(s) are relevant to the user's request.
2. If the request involves skills (e.g. creating or updating records), call \`loadSkill\`
   with the matching skill name for precise scripting instructions, then use \`readFile\`
   and \`bash\` accordingly.
3. For read-only lookups, joins, or aggregations, use \`queryDatabase\` with the real
   field IDs and table IDs obtained in Step 1.
4. Always use parameterised queries ($1, $2, ...) — never interpolate user strings into SQL.

### Step 3 — Return a clear answer
After ALL tool calls are complete, write a final text response to the user.
- If records were found: summarise the key details in a readable format.
- If nothing was found: state what was searched and suggest alternatives.
- Never end your turn after a tool call without a text response.
- Never output only pre-tool narration (e.g. "Let me search...") as your final output.

## Teable internal PostgreSQL structure

Teable stores data in a three-level hierarchy:
  space → base → table_meta → record

Key system tables:
  - "space"       — workspaces (id, name)
  - "base"        — databases/bases (id, name, space_id)
  - "table_meta"  — table definitions (id, name, base_id, db_table_name)
  - "field"       — column definitions (id, name, type, table_id, is_primary, options JSONB)
  - "record"      — rows; field values live in the "fields" JSONB column keyed by field ID

To query record data via SQL after discovering the schema:
  SELECT r.fields->>'<field_id>' AS field_value
  FROM record r
  WHERE r.table_id = '<table_id>';

For link fields, the value is a JSONB array of objects with a "title" key:
  r.fields->'<link_field_id>' @> '[{"title":"<label>"}]'::jsonb

## General rules
- Use field IDs (fldXXX) for filter and orderBy parameters, never display names.
- Resolve link field record IDs with lookup-link-id.js before creating or updating records.
- Never write to read-only fields (record_id, created_at, rollup fields).`,
    tools: {
      loadSkill: loadSkillTool,
      readFile: readFileTool,
      bash: bashTool,
      queryDatabase: queryDatabaseTool,
      loadDatabaseSchema: loadDatabaseSchemaTool,
    },
    callOptionsSchema,
    maxRetries: 5,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: `${settings.instructions ?? ''}\n\n${buildSkillsPrompt(options.skills)}`,
      experimental_context: {
        sandbox: options.sandbox,
        skills: options.skills,
        state: options.state,
      },
    }),
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────

// In the webpack bundle __dirname resolves to the dist/ output directory.
// The CopyPlugin copies src/features/ai/sandbox → dist/features/ai/sandbox (full builds).
// During development (before a full build), fall back to the TypeScript source tree so
// skills are available immediately without requiring a rebuild first.
const distSandboxDir = path.join(__dirname, 'features', 'ai');
const srcSandboxDir = path.resolve(__dirname, '..', 'src', 'features', 'ai');
const skillSearchDir = fs.existsSync(path.join(distSandboxDir, 'sandbox', 'SKILL.md'))
  ? distSandboxDir
  : srcSandboxDir;

// Lazy singleton — skills are discovered once on first request and reused.
let cachedSkillsPromise: Promise<ISkillMetadata[]> | null = null;

function getOrDiscoverSkills(sandbox: ISandbox, directories: string[]): Promise<ISkillMetadata[]> {
  if (!cachedSkillsPromise) {
    cachedSkillsPromise = discoverSkills(sandbox, directories);
  }
  return cachedSkillsPromise;
}

export type AgentInput =
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };

export async function runGeneralInfoAgent(model: LanguageModel, input: AgentInput) {
  const sandbox = createNodeSandbox(skillSearchDir);
  const skills = await getOrDiscoverSkills(sandbox, [skillSearchDir]);

  const agent = createGeneralInfoAgent(model);

  return agent.stream({
    ...input,
    options: { sandbox, skills, state: {} },
    abortSignal: AbortSignal.timeout(90_000),
  });
}
