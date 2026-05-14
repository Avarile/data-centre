import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { LanguageModel } from 'ai';
import { tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const execAsync = promisify(exec);

// ─── Sandbox abstraction ──────────────────────────────────────────────────────
// Abstracts filesystem + shell execution so the agent can run in any environment.

interface ISandbox {
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
  readdir(
    dirPath: string,
    opts: { withFileTypes: true }
  ): Promise<{ name: string; isDirectory(): boolean }[]>;
  exec(command: string): Promise<{ stdout: string; stderr: string }>;
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
    try {
      return await sandbox.exec(command);
    } catch (err) {
      return { error: `Command failed: ${(err as Error).message}` };
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
- Never write to READ-ONLY fields (record_id, created_at, rollup fields).`,
    tools: {
      loadSkill: loadSkillTool,
      readFile: readFileTool,
      bash: bashTool,
    },
    callOptionsSchema,
    maxRetries: 3,
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

/**
 * Discovers available skills, creates the agent, and runs it against the given prompt.
 *
 * @param model  - A language model instance (from AiService.getModelInstance).
 * @param prompt - The user's natural-language request.
 * @param extraSkillDirs - Optional additional directories to scan for skills.
 */
export async function runGeneralInfoAgent(
  model: LanguageModel,
  prompt: string,
  extraSkillDirs: string[] = []
) {
  const sandbox = createNodeSandbox(skillSearchDir);
  const skills = await discoverSkills(sandbox, [skillSearchDir, ...extraSkillDirs]);

  const agent = createGeneralInfoAgent(model);

  return agent.stream({
    prompt,
    options: { sandbox, skills },
  });
}
