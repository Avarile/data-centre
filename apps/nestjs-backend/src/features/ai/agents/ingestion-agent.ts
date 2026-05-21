/* eslint-disable @typescript-eslint/naming-convention */
import type { LanguageModel, ModelMessage } from 'ai';
import { ToolLoopAgent } from 'ai';
import { z } from 'zod';

import {
  bashTool,
  buildSkillsPrompt,
  createNodeSandbox,
  getOrDiscoverSkills,
  loadDatabaseSchemaTool,
  loadSkillTool,
  queryDatabaseTool,
  readFileTool,
  skillSearchDir,
} from './general-agents';
import type { IContextState, ISkillMetadata, ISandbox } from './general-agents';

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

export function createIngestionAgent(model: LanguageModel): ToolLoopAgent<ICallOptions> {
  return new ToolLoopAgent<ICallOptions>({
    model,
    instructions: `You are a data ingestion agent for a data centre management system.
Your job is to parse file content provided in the conversation, map each item to the fields
of a target table, and create records in bulk. You must also identify and report any items
that could not be mapped.

## Mandatory workflow — follow every step in order

### Step 1 — Discover the target table schema
Call \`loadDatabaseSchema\` (no arguments) to retrieve all tables, fields, field types,
select options, and link relationships.

- Identify the table the user wants to ingest into (the "target table").
- For every link field in the target table, note the foreign table and its primary/label field
  so you can resolve record IDs later.
- If creating a contact, note that \`internal_contact_type\` is a required link; you must
  resolve a contact-type record ID before creating any contact.

### Step 2 — Understand the target table reference docs
After calling \`loadSkill\` with name \`teable-database-crud\`, read the reference file for
the target table (e.g. \`references/contacts.md\`) to learn:
- Which fields are required vs optional
- Which fields are read-only (never write these)
- Accepted values for singleSelect / multipleSelect fields

### Step 3 — Parse the file content
The file content is already embedded in the conversation context (inside <file_context> tags
or as part of the user message). Parse every row / object from that content.

For each item:
- Map each value to the best-matching writable field by name similarity and data type.
- Collect values that do not map to any table field into an "unmapped fields" list.
- If a required field is missing and cannot be defaulted, mark the entire item as
  "cannot be created" and record the reason.

### Step 4 — Resolve link IDs
For each link field you intend to populate, call:
\`node scripts/lookup-link-id.js '{"tableId":"<foreignTableId>","fieldId":"<primaryFieldId>","value":"<label>"}'\`
Use the returned \`firstId\` as the record ID.

If a lookup returns no match, attempt a fuzzy search using \`operator: "contains"\`.
If still no match, mark that field as unresolved and note it in the item's "issues" list
(do not block the whole record if the field is optional).

### Step 5 — Create records in batches
Group all mappable records (up to 1 000 per call) and create them with:
\`node scripts/create-records.js '{"tableId":"<tableId>","records":[...]}'  \`

Use display names as field keys (\`fieldKeyType=name\` is applied automatically by the script).

### Step 6 — Report results
After all creation attempts, write a clear final summary to the user:

1. **Created successfully**: N record(s) created — list titles/names.
2. **Partially created**: records where optional links could not be resolved — list which fields
   were skipped and why.
3. **Could not be created**: items that were missing required fields or had fatal mapping
   errors — list each item with the specific reason.

If every item was created successfully, say so clearly.
Never end your turn immediately after a tool call — always write a final text response.

## Database structure reminder
- \`loadDatabaseSchema\` returns table IDs (tblXXX), field IDs (fldXXX), types, and link targets.
- For link fields: single-link value = \`{ "id": "recXXX" }\`; multi-link = \`[{ "id": "recXXX" }]\`
- Never write read-only fields: record_id, created_at, update_at, rollup fields.
- Dates must be ISO 8601: \`"2024-01-15T10:30:00Z"\``,
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

export type IngestionAgentInput =
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };

export async function runIngestionAgent(model: LanguageModel, input: IngestionAgentInput) {
  const sandbox = createNodeSandbox(skillSearchDir);
  const skills = await getOrDiscoverSkills(sandbox, [skillSearchDir]);

  const agent = createIngestionAgent(model);

  return agent.stream({
    ...input,
    options: { sandbox, skills, state: {} },
    abortSignal: AbortSignal.timeout(120_000),
  });
}
