import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { LanguageModel, ModelMessage } from 'ai';
import { tool, ToolLoopAgent } from 'ai';
import { Pool } from 'pg';
import { z } from 'zod';

const execAsync = promisify(exec);

// Module-level singleton — one pool shared across all sandbox instances.
const sharedPool: Pool | null = (() => {
  const databaseUrl =
    process.env.PRISMA_DATA_DATABASE_URL ??
    process.env.PRISMA_META_DATABASE_URL ??
    process.env.PRISMA_DATABASE_URL ??
    process.env.DATABASE_URL;
  return databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
})();

// ─── Sandbox abstraction ──────────────────────────────────────────────────────
// Abstracts filesystem + shell execution so the agent can run in any environment.

interface ISandbox {
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
  readdir(
    dirPath: string,
    opts: { withFileTypes: true }
  ): Promise<{ name: string; isDirectory(): boolean }[]>;
  exec(command: string): Promise<{ stdout: string; stderr: string }>;
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

    async exec(command) {
      return execAsync(command, { cwd: workingDirectory });
    },

    async query(sql, params = []) {
      if (!sharedPool) throw new Error('No database connection string found in environment');
      const client = await sharedPool.connect();
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

  // Minimal YAML key: value parser sufficient for name/description scalar strings.
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
 * Follows the progressive-disclosure pattern from ai-sdk.dev/cookbook/guides/agent-skills:
 * only names + descriptions are loaded at discovery time; full instructions are
 * deferred until the agent calls `loadSkill`.
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

const loadSkillTool = tool({
  description:
    'Load a skill to get its full instructions and discover the path to its bundled ' +
    'scripts, references, and asset templates.',
  inputSchema: z.object({
    name: z.string().describe('The skill name to load'),
  }),
  execute: async ({ name }, { experimental_context: experimentalContext }) => {
    const { sandbox, skills } = experimentalContext as {
      sandbox: ISandbox;
      skills: ISkillMetadata[];
    };

    const skill = skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!skill) {
      return {
        error: `Skill '${name}' not found. Available: ${skills.map((s) => s.name).join(', ')}`,
      };
    }

    const skillFile = `${skill.path}/SKILL.md`;
    const content = await sandbox.readFile(skillFile, 'utf-8');

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
    'Execute a shell command in the sandbox working directory. ' +
    'Use this to run skill scripts, e.g.: ' +
    '`node scripts/get-records.js \'{"tableId":"tblXXX","take":20}\'`. ' +
    'The TEABLE_API_TOKEN environment variable must be set in the process environment.',
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
  }),
  execute: async ({ command }, { experimental_context: experimentalContext }) => {
    const { sandbox } = experimentalContext as { sandbox: ISandbox };

    // Allowlist: only `node scripts/<name>.js [optional-arg]` — no path traversal, no other binaries.
    if (
      !/^node\s+scripts\/[a-zA-Z0-9_-]+\.js(?:\s+.*)?$/s.test(command) ||
      command.includes('..')
    ) {
      return { error: 'Only `node scripts/<name>.js [arg]` commands are permitted' };
    }

    try {
      return await sandbox.exec(command);
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
});

type ICallOptions = z.infer<typeof callOptionsSchema>;

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Creates a general information analysis agent backed by the Teable database skill.
 *
 * The agent follows the progressive-disclosure skills pattern:
 *   1. Skill names + descriptions are listed in the system prompt at startup.
 *   2. When the user's request matches a skill, the agent calls `loadSkill` to
 *      read the full SKILL.md instructions on demand.
 *   3. The agent then uses `readFile` and `bash` to access reference docs and
 *      execute CRUD scripts against the Teable database.
 *
 * @see https://ai-sdk.dev/cookbook/guides/agent-skills
 */
export function createGeneralInfoAgent(model: LanguageModel): ToolLoopAgent<ICallOptions> {
  return new ToolLoopAgent<ICallOptions>({
    model,
    instructions: `You are a general information analysis agent for a data centre management system.

You can query and update an organisational database that tracks contacts, tasks, projects,
departments, goals, roles, SaaS applications, licences, knowledge articles, and IT support tickets.

When the user asks for information or an action that involves the database:
1. Identify which entity or entities are relevant.
2. Call \`loadSkill\` with the matching skill name to receive precise instructions,
   field IDs, and the path to helper scripts and reference files.
3. Use \`readFile\` to read any reference or asset files listed in the skill.
4. Use \`bash\` to execute the appropriate script (get-records, create-records,
   update-record, delete-record, or lookup-link-id) with a JSON argument.
5. Interpret the script output and provide a clear, concise answer.

When executing database scripts always:
- Use field IDs (fldXXX) for filter and orderBy parameters.
- Use display names for record field values (fieldKeyType=name is automatic).
- Resolve link field record IDs with lookup-link-id.js before creating or updating records.
- Never write to READ-ONLY fields (record_id, created_at, rollup fields).

You also have a \`queryDatabase\` tool for read-only SQL queries directly against the
PostgreSQL database. Use it when you need:
- Joins across multiple tables
- Aggregations (COUNT, SUM, AVG, GROUP BY)
- Schema introspection (information_schema.tables / columns)
- Queries not easily expressed through the bash scripts

Always use parameterised queries ($1, $2, ...) and never include user-supplied
strings directly in SQL.

## Teable Internal Schema

Teable stores data in a three-level hierarchy:
  space (workspace) → base → table_meta → record

Key PostgreSQL tables:
  - "space"       — workspaces (id, name)
  - "base"        — databases/bases within a space (id, name, space_id)
  - "table_meta"  — table definitions (id, name, base_id, db_table_name)
  - "field"       — field/column definitions per table (id, name, type, table_id)
  - "record"      — rows, one row per Teable record; field values stored in the "fields" JSONB column keyed by field ID

To query record data via SQL, join through table_meta → record and use the "fields" JSONB column:
  SELECT r.fields->>'fldXXX' AS field_value FROM record r
  JOIN table_meta tm ON r.table_id = tm.id
  WHERE tm.id = 'tblXXX';

## Application Table Registry

All business data lives in these 14 Teable tables. Each table ID is the \`table_id\` in the record table.

### Lookup / Reference tables (read before creating linked records)
| Table Name         | Table ID              | Primary field (Label fldID)              | Purpose |
|--------------------|-----------------------|------------------------------------------|---------|
| contact-type       | tblXWCU7zG6yVPpnH50  | fldnyYl4qoi7Rj2vuWH                      | Classifies a contact (e.g. Employee, Contractor, Vendor). REQUIRED when creating contacts. |
| contact-profession | tblSceUZHrMe5psnhCZ  | fldSKRAlDgG0I9HuUld                      | The profession / job discipline of a contact. |
| knowledge-type     | tbl2vKKo0l3RfSvKzM1  | fldkBfd3ambfvY33532                      | Category for knowledge articles. |

### Core entity tables
| Table Name        | Table ID              | Primary field (Label fldID)              | Purpose |
|-------------------|-----------------------|------------------------------------------|---------|
| contacts          | tblBVWS56TLkQqW3J4z  | fldCwghjVZqx0SBTQSH                      | People — employees, contractors, vendors etc. |
| departments       | tblLalSqgqccQQ9eehi  | fldGv6a7UyZeoSKvsj9                      | Organisational departments. |
| roles             | tblZJc88eoY1SPWmtdg  | fld25zMEwmPljt7ZIhp                      | Job roles / positions. |
| tasks             | tblEtuOcO68wvO2nCoM  | fldPe1ctffKlzdVjJyp                      | Work tasks with status lifecycle. |
| daily-task-view   | tblfVf2gSF1axjKxXAP  | fldG6PfABHNZvyZ1o7h                      | Daily grouping of tasks; rollup counts delivered vs total. |
| projects          | tbluBET7kwcH7WDUxVf  | fldFRlJHm1dEuamLKpX                      | Projects that contain tasks and link to goals. |
| goals             | tblJBmCNhL3D3nqgWl5  | fldm0XMjAcfl0Cqz7Zm                      | Strategic goals; type = milestone or objective. |
| applications      | tbl46utYSpisOZ94FXE  | fldvVqLa4A5ShgedTJj                      | SaaS applications the company subscribes to. |
| licences          | tbl9fT4iH6G4GXzdA9B  | fldx5XCSERLvj8xmE4m                      | Junction: one contact ↔ one application, with access_level. |
| knowledges        | tblFH854k0qcvWMaXUx  | fldNAitxen8e6dr7QF5                      | Knowledge-base articles; may have attachments. |
| it-support-ticket | tbl8Ule7YoA9LrViroC  | fldQx8eP9mcsy8II7Q4                      | IT helpdesk tickets. |

## Relationship Map

Read left-to-right as "table A links to table B via field":

contacts (tblBVWS56TLkQqW3J4z)
  fldvakGkDtRXYOEBNxu  internal_contact_type     → contact-type  [REQUIRED, single link]
  fld5jvIWvcZm7waQiBr  internal_contact_profession → contact-profession
  fldH533OMLkSWAmQiYA  tasks                      → tasks
  fldboPhfNXcf1GJtVYN  projects                   → projects
  fldluX15rOczzzhznKH  department                 → departments
  fld2ilgjEnTHPah0SKX  role                       → roles

tasks (tblEtuOcO68wvO2nCoM)
  fldvUeNsKu56NoQ8lHM  assigned_to                → contacts
  fldhS1tK8YWkT921lFQ  project_name               → projects
  fld3gARpWaNluRUwTwZ  knowledge_involved         → knowledges

daily-task-view (tblfVf2gSF1axjKxXAP)
  fldnox69ipS2mXWUoip  daily_tasks                → tasks  [rollup: task_delivered, task_total]

projects (tbluBET7kwcH7WDUxVf)
  fldyGfTOcDPSX46pcBr  tasks                      → tasks
  fldIaCVQ2ErzGwHEwgg  lead_by                    → contacts
  fld7a95yKf4hgCyIV2x  goal                       → goals

departments (tblLalSqgqccQQ9eehi)
  fldXF2qhneT4SdnsZHz  contacts                   → contacts

roles (tblZJc88eoY1SPWmtdg)
  fldluJKyKVAncY86goO  contacts                   → contacts

applications (tbl46utYSpisOZ94FXE)
  fldx7LpNO4Jx65zYZFw  licences                   → licences

licences (tbl9fT4iH6G4GXzdA9B)  ← junction table
  fldiz8LvNpayZWDnRuM  user                       → contacts
  fldA25l18psqCWCbmek  application                → applications
  fldw6ftC6qP18mI0dJF  access_level               (options: user, power_user, admin, super_admin, disabled)

knowledges (tblFH854k0qcvWMaXUx)
  fld6AGvzdXknJXirdJy  knowledge_type             → knowledge-type
  fldcGWoaSJk7BfHKCYR  tasks                      → tasks

it-support-ticket (tbl8Ule7YoA9LrViroC)
  flduXjEXWtCxpIlgoUW  requester_name             → contacts
  fld17eWiUPc7HihzO8R  assigned_to                → contacts
  fld2L563WzZ9lIbFkNl  type    (options: Hardware, Software, Network, Onboard, Offboard, Access issues, Credential updates, Other)
  fldJRDkWVoUYCtxw9Gs  priority (options: Critical, High, Medium, Low)
  fld4NzF52VlXTYtlA9v  status   (options: Open, In Progress, On Hold, Resolved, Closed)

contact-type (tblXWCU7zG6yVPpnH50)
  fld9dMELOhAw618pDKR  contacts-internal          → contacts  [reverse side of contacts.internal_contact_type]

contact-profession (tblSceUZHrMe5psnhCZ)
  fld3WhZxZox1r55OSp0  contacts-internal          → contacts  [reverse side of contacts.internal_contact_profession]

knowledge-type (tbl2vKKo0l3RfSvKzM1)
  fldHcnuYGYRRcS2uuhX  knowledges                 → knowledges  [reverse side of knowledges.knowledge_type]

goals (tblJBmCNhL3D3nqgWl5)
  fldEaHXR6bqsh68Y9BT  goal_type (options: milestone, objective)

## Common Query Patterns

To find all tasks for a contact by name (SQL):
  SELECT r.fields->>'fldPe1ctffKlzdVjJyp' AS task_label,
         r.fields->>'fldsf3yMmXHyvxE3L6w' AS status
  FROM record r
  WHERE r.table_id = 'tblEtuOcO68wvO2nCoM'
    AND r.fields->'fldvUeNsKu56NoQ8lHM' @> $1::jsonb;
  -- $1 = '[{"title":"<contact Label>"}]'

To list all licences for an application (SQL):
  SELECT r.fields->>'fldx5XCSERLvj8xmE4m' AS licence_label,
         r.fields->>'fldw6ftC6qP18mI0dJF' AS access_level
  FROM record r
  WHERE r.table_id = 'tbl9fT4iH6G4GXzdA9B'
    AND r.fields->'fldA25l18psqCWCbmek' @> $1::jsonb;
  -- $1 = '[{"title":"<application Label>"}]'`,
    tools: {
      loadSkill: loadSkillTool,
      readFile: readFileTool,
      bash: bashTool,
      queryDatabase: queryDatabaseTool,
    },
    callOptionsSchema,
    maxRetries: 5,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: `${settings.instructions ?? ''}\n\n${buildSkillsPrompt(options.skills)}`,
      experimental_context: {
        sandbox: options.sandbox,
        skills: options.skills,
      },
    }),
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────

// The `ai/` feature directory — discoverSkills scans its sub-folders for SKILL.md files.
// In production, ensure sandbox/** assets are copied to dist alongside compiled JS.
const skillSearchDir = path.join(__dirname, '..');

// Lazy singleton — skills are discovered once on first request and reused.
// Skills change only when SKILL.md files are added/modified, which requires a restart.
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

/**
 * Discovers available skills (cached after first call), creates the agent, and streams
 * a response for the given input.
 *
 * @param model - A language model instance (from AiService.getModelInstance).
 * @param input - Either a single-turn { prompt } or multi-turn { messages }.
 */
export async function runGeneralInfoAgent(model: LanguageModel, input: AgentInput) {
  const sandbox = createNodeSandbox(skillSearchDir);
  const skills = await getOrDiscoverSkills(sandbox, [skillSearchDir]);

  const agent = createGeneralInfoAgent(model);

  return agent.stream({
    ...input,
    options: { sandbox, skills },
    abortSignal: AbortSignal.timeout(90_000),
  });
}
