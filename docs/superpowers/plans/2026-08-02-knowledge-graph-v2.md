# Knowledge Graph v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the knowledge graph from a flat 3-tier star into a real graph: `knowledge_type` records nest into a tree, and `knowledge` records link to each other.

**Architecture:** Three new/changed Teable link fields drive everything. The backend assembler (`knowledge-graph.assembler.ts`) stays the single pure place where graph shape is decided and grows four steps: break cycles in the type tree, compute depth and root ancestor, emit structural links, emit deduped relations under a link budget. The published contract replaces the overloaded `typeId` with `parentId` (structure), `rootTypeId` (colour) and `depth`. The frontend derives its type filter from the `parentId` closure instead of a single-parent equality check.

**Tech Stack:** NestJS + Teable RecordService (backend), zod + `@asteasolutions/zod-to-openapi` (contract), React + zustand + react-force-graph-3d (frontend), Mastra + raw `fetch` against the Teable REST API (AI agent), vitest everywhere (backend, frontend and mastra all use vitest 4; there is no jest in this repo).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-02-knowledge-graph-v2-nested-types-and-relations-design.md`. Read it before Task 1.
- `KNOWLEDGE_GRAPH_VERSION` becomes `2`. The e2e ETag assertion `/^"kg1-[0-9a-f]{16}"$/` becomes `kg2`.
- Backend never hardcodes a `fld…` id — fields are resolved by name through `resolveFields` and asserted. Keep it that way.
- Every tier-keyed lookup stays **total**, with a `??` fallback. An unknown tier returning `undefined` makes d3 compute NaN positions and the scene renders empty with no error at all.
- The `core` node stays in `graphData` while invisible. Three-forcegraph filters only its render digest by visibility, so removing it would split the graph into disconnected components.
- Structural links (`core-type`, `type-parent`, `type-knowledge`) are **never** dropped by a budget. Only relations are.
- Cycle-breaking must be **deterministic** — the same back-edge on every run. The ETag in `getGraph` is a sha1 over the whole payload, so nondeterminism there means the ETag churns between identical requests.
- No `Co-Authored-By` trailer on commits (`.claude/settings.json` has no `attribution.commit`).
- Do not `git add -A`: `scripts/customized/developments/current-goal.md` and `.claude-flow/data/pending-insights.jsonl` are unrelated dirty files. Stage explicit paths.
- Backend, frontend and mastra all run **vitest 4**. There is no jest in this repo — `npx vitest run <path>` for unit tests, `pnpm test-e2e` for e2e.
- e2e tests need a seeded Postgres (`pre-test-e2e` runs `prisma-db-seed --e2e`). Where the environment has no database, write the e2e assertions as the task specifies and record the run as deferred in the ledger — do not delete or weaken the test to make a command pass.
- Locale files are English-only placeholders today (`de`, `zh`, `ja` all read "Types"). New keys go into all 10 locales with the English string.

## File Structure

**Contract** — `packages/openapi/src/knowledge-graph/`
- `types.ts` — version, node ids, tier unions, node/link/stats zod schemas. All shape decisions live here.
- `get-node.ts` — the detail endpoint's response schema.

**Backend** — `apps/nestjs-backend/src/features/knowledge-graph/`
- `types.ts` — field-name constants and the `IFieldSpec` contract used by `resolveFields`.
- `knowledge-graph.service.ts` — I/O only: resolve fields, read rows, map cells to row structs.
- `knowledge-graph.assembler.ts` — pure. Cycle-breaking, depth/root, link emission, budgets.
- `knowledge-graph.assembler.spec.ts` — the only backend unit test that matters.
- `../../configs/knowledge.config.ts` — table ids and budgets.

**Frontend** — `apps/nextjs-app/src/features/app/blocks/knowledge-graph/`
- `utils/buildSimulationGraph.ts` — view-state filtering, hidden-subtree closure.
- `utils/graphTheme.ts` — colour and all four tier-keyed force lookups.
- `KnowledgeGraphLegend.tsx` — the type tree.
- `KnowledgeNodeDetailPanel.tsx` — ancestor breadcrumb.
- `KnowledgeGraph.tsx` — wiring, sibling count, truncation banner.

**Mastra** — `apps/mastra-ai/src/mastra/tools/db-query/`
- `teable-client.ts` — the only place HTTP options are set.
- `knowledges/link-cell.ts` *(new)* — one tolerant reader for link cells.
- `knowledges/knowledge.ts`, `knowledges/knowledge-type.ts`, `knowledges/knowledge-service.ts`, `db-search-tools.ts`.

---

### Task 1: Contract v2 fields, additively

Adds the new node fields and link tiers **without** removing `typeId` or changing `truncated`. Everything keeps compiling; Task 10 does the removal once every consumer has moved. The assembler is updated in the same task because the new node fields are required, so its object literals would not typecheck otherwise.

**Files:**
- Modify: `packages/openapi/src/knowledge-graph/types.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts`
- Test: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.spec.ts`

**Interfaces:**
- Produces: `IKnowledgeGraphNode` gains `parentId: string | null`, `rootTypeId: string | null`, `depth: number`. `KnowledgeLinkTier` gains `'type-parent' | 'knowledge-knowledge'`. `KNOWLEDGE_GRAPH_VERSION === 2`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Add to `knowledge-graph.assembler.spec.ts`:

```ts
describe('v2 node fields', () => {
  it('gives every type a core parent, itself as root, and depth 0', () => {
    const graph = assembleKnowledgeGraph([type('recT1', 'Alpha')], [], OPTS);
    const alpha = graph.nodes.find((n) => n.id === 'type:recT1');

    expect(alpha).toMatchObject({
      parentId: KNOWLEDGE_CORE_NODE_ID,
      rootTypeId: 'type:recT1',
      depth: 0,
    });
  });

  it('parents a knowledge onto its type and puts it one level deeper', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [knowledge('recK1', 'one', 'recT1')],
      OPTS
    );
    const kn = graph.nodes.find((n) => n.id === 'kn:recK1');

    expect(kn).toMatchObject({
      parentId: 'type:recT1',
      rootTypeId: 'type:recT1',
      depth: 1,
    });
  });

  it('roots an unclassified knowledge on the synthetic bucket', () => {
    const graph = assembleKnowledgeGraph([], [knowledge('recK1', 'one')], OPTS);
    const kn = graph.nodes.find((n) => n.id === 'kn:recK1');

    expect(kn).toMatchObject({
      parentId: UNCLASSIFIED_TYPE_NODE_ID,
      rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
      depth: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/knowledge-graph.assembler.spec.ts -t "v2 node fields"`
Expected: FAIL — the returned nodes have no `parentId`/`rootTypeId`/`depth` keys, so `toMatchObject` reports undefined.

- [ ] **Step 3: Extend the contract**

In `packages/openapi/src/knowledge-graph/types.ts`, set the version and tiers:

```ts
export const KNOWLEDGE_GRAPH_VERSION = 2;

// core -> type (roots only) -> nested types -> knowledge, plus peer relations.
export const KnowledgeLinkTierValues = [
  'core-type',
  'type-parent',
  'type-knowledge',
  'knowledge-knowledge',
] as const;
```

and add the three fields to `knowledgeGraphNodeSchema`, keeping `typeId` for now:

```ts
export const knowledgeGraphNodeSchema = z.object({
  id: z.string().meta({ description: 'Unique node id: core, type:<recordId> or kn:<recordId>.' }),
  recordId: z.string().nullable().meta({ description: 'Record id; null for synthetic nodes.' }),
  tier: knowledgeNodeTierSchema.meta({ description: 'Which tier this node belongs to.' }),
  label: z.string().meta({ description: 'Display title.' }),
  /** @deprecated superseded by parentId; removed in Task 10. */
  typeId: z.string().nullable(),
  parentId: z.string().nullable().meta({
    description: 'Structural parent: a type points at its parent type (or core at a root), a knowledge at its type.',
  }),
  rootTypeId: z.string().nullable().meta({
    description: 'Top ancestor type. The colour key — a whole subtree shares a hue family.',
  }),
  depth: z.number().int().meta({
    description: 'Nesting depth. 0 at a root type; a knowledge is its type + 1. Not meaningful for core, which reports 0.',
  }),
  degree: z.number().int().meta({ description: 'Adjacent node count, precomputed for sizing.' }),
});
```

- [ ] **Step 4: Populate the fields in the assembler**

In `knowledge-graph.assembler.ts`, the four node emissions become — core:

```ts
  const nodes: IKnowledgeGraphNode[] = [
    {
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: coreLabel,
      typeId: null,
      parentId: null,
      rootTypeId: null,
      // Depth is undefined for a node outside the taxonomy; 0 is the neutral
      // report, and `tier` is what distinguishes core from a root type.
      depth: 0,
      degree: typeNodeIds.length,
    },
  ];
```

each real type:

```ts
  for (const type of sortedTypes) {
    const id = `${TYPE_NODE_PREFIX}${type.recordId}`;
    nodes.push({
      id,
      recordId: type.recordId,
      tier: 'type',
      label: type.title,
      typeId: null,
      parentId: KNOWLEDGE_CORE_NODE_ID,
      rootTypeId: id,
      depth: 0,
      degree: childCount.get(id) ?? 0,
    });
  }
```

the unclassified bucket:

```ts
  if (orphanCount > 0) {
    nodes.push({
      id: UNCLASSIFIED_TYPE_NODE_ID,
      recordId: null,
      tier: 'type',
      label: unclassifiedLabel,
      typeId: null,
      parentId: KNOWLEDGE_CORE_NODE_ID,
      rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
      depth: 0,
      degree: orphanCount,
    });
  }
```

and each knowledge:

```ts
  for (const row of emitted) {
    const bucket = bucketOf(row);
    nodes.push({
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: 'knowledge',
      label: row.title,
      typeId: bucket,
      parentId: bucket,
      rootTypeId: bucket,
      depth: 1,
      degree: 1,
    });
  }
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/`
Expected: PASS, including the pre-existing cases — nothing above changes counts or ordering.

- [ ] **Step 6: Update the e2e version assertions**

In `apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts`:

```ts
    expect(data.version).toBe(2);
    expect(data.etag).toMatch(/^"kg2-[0-9a-f]{16}"$/);
```

- [ ] **Step 7: Typecheck the frontend is untouched**

Run: `cd apps/nextjs-app && npx tsc --noEmit -p tsconfig.json`
Expected: clean. `typeId` still exists, so no consumer breaks.

- [ ] **Step 8: Commit**

```bash
git add packages/openapi/src/knowledge-graph/types.ts \
        apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts \
        apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.spec.ts \
        apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts
git commit -m "feat(knowledge-graph): add v2 node fields alongside typeId"
```

---

### Task 2: Pre-audit script for the text→Link migration

`knowledge.knowledge_type` is a plain-text column holding titles. Converting it to a Link matches on title, and **any title that matches no type silently empties the cell** — the original string is then unrecoverable. This script is the only thing standing between the migration and silent data loss, so it runs and is reviewed before Task 4.

**Files:**
- Create: `scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts`

**Interfaces:**
- Produces: a printed report. No code depends on it.
- Consumes: `TEABLE_BASE_URL` / `TEABLE_API_KEY` from the environment, the same pair `apps/mastra-ai/src/mastra/tools/db-query/teable-client.ts` reads.

- [ ] **Step 1: Write the script**

```ts
/* eslint-disable no-console */
/**
 * Read-only audit, run BEFORE converting knowledge.knowledge_type from text to
 * a Link. Teable matches on title during that conversion and silently empties
 * any cell whose title matches no knowledge_type record — and the original
 * string is gone afterwards, so this cannot be checked retrospectively.
 */
const BASE_URL = process.env.TEABLE_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.TEABLE_API_KEY ?? '';
const KNOWLEDGE_TABLE_ID = process.env.KNOWLEDGE_TABLE_ID ?? 'tblVTWb1kxXSFPBq4Fq';
const KNOWLEDGE_TYPE_TABLE_ID = process.env.KNOWLEDGE_TYPE_TABLE_ID ?? 'tblWcq6Kof1AFHvbC5e';

const fetchAll = async (tableId: string): Promise<{ id: string; fields: Record<string, unknown> }[]> => {
  const out: { id: string; fields: Record<string, unknown> }[] = [];
  for (let skip = 0; ; skip += 1000) {
    const url = new URL(`${BASE_URL}/api/table/${tableId}/record`);
    url.searchParams.set('fieldKeyType', 'name');
    url.searchParams.set('take', '1000');
    url.searchParams.set('skip', String(skip));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) throw new Error(`GET ${tableId}: ${res.status} ${res.statusText}`);
    const { records } = (await res.json()) as { records: typeof out };
    out.push(...records);
    if (records.length < 1000) return out;
  }
};

const main = async () => {
  const [types, knowledges] = await Promise.all([
    fetchAll(KNOWLEDGE_TYPE_TABLE_ID),
    fetchAll(KNOWLEDGE_TABLE_ID),
  ]);

  const titles = new Set(types.map((t) => String(t.fields.title ?? '')));
  const unmatched = new Map<string, number>();
  let empty = 0;

  for (const row of knowledges) {
    const raw = row.fields.knowledge_type;
    if (raw == null || raw === '') {
      empty++;
      continue;
    }
    if (typeof raw !== 'string') {
      throw new Error(`knowledge_type is already not text on ${row.id}: ${JSON.stringify(raw)}`);
    }
    if (!titles.has(raw)) unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
  }

  console.log(`types:            ${types.length}`);
  console.log(`knowledges:       ${knowledges.length}`);
  console.log(`already empty:    ${empty}`);
  console.log(`distinct titles that will NOT match: ${unmatched.size}`);
  for (const [title, count] of [...unmatched].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${JSON.stringify(title)}`);
  }
  const lost = [...unmatched.values()].reduce((a, b) => a + b, 0);
  console.log(`\nrecords that would lose their type: ${lost}`);
  process.exitCode = lost > 0 ? 1 : 0;
};

void main();
```

- [ ] **Step 2: Run it against the live base**

Run: `TEABLE_API_KEY=… npx tsx scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts`
Expected: a report. Exit code 1 means records would lose their type — that is the signal to fix data before Task 4, not a script bug.

- [ ] **Step 3: Commit**

```bash
git add scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts
git commit -m "chore(knowledge-graph): add pre-migration knowledge_type title audit"
```

---

### Task 3: Mastra reads link cells tolerantly and writes with typecast

The agent reads and writes `knowledge_type` as a bare title string. After the conversion its reads return `{ id, title }` objects and its writes fail. The fix is deliberately **shape-tolerant**, so this task is safe to land before, during, and after the migration — which is what lets Task 4 be a data-only change instead of a big-bang commit.

`String(r.fields.knowledge_type)` on a link cell yields `"[object Object]"`. That does not throw — it feeds plausible nonsense to an LLM. This task removes both occurrences.

**Files:**
- Create: `apps/mastra-ai/src/mastra/tools/db-query/knowledges/link-cell.ts`
- Create: `apps/mastra-ai/tests/knowledges/link-cell.test.ts`
- Modify: `apps/mastra-ai/src/mastra/tools/db-query/teable-client.ts:47-76`
- Modify: `apps/mastra-ai/src/mastra/tools/db-query/knowledges/knowledge.ts:24-25`
- Modify: `apps/mastra-ai/src/mastra/tools/db-query/knowledges/knowledge-type.ts`
- Modify: `apps/mastra-ai/src/mastra/tools/db-query/knowledges/knowledge-service.ts:61-62`
- Modify: `apps/mastra-ai/src/mastra/tools/db-query/db-search-tools.ts:52,135`
- Test: `apps/mastra-ai/tests/knowledges/knowledge.test.ts`, `apps/mastra-ai/tests/knowledges/knowledge-service.test.ts`

**Interfaces:**
- Produces: `linkTitle(raw: unknown): string | undefined`, `linkTitles(raw: unknown): string[]`, `linkId(raw: unknown): string | undefined` from `knowledges/link-cell.js`. Type `LinkCell = string | { id: string; title?: string }`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `apps/mastra-ai/tests/knowledges/link-cell.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { linkTitle, linkTitles, linkId, linkIds } from '../../src/mastra/tools/db-query/knowledges/link-cell.js';

describe('linkTitle', () => {
  it('reads a link cell object', () => {
    expect(linkTitle({ id: 'rec1', title: 'Technical' })).toBe('Technical');
  });

  it('passes a plain string through, so it works before the migration too', () => {
    expect(linkTitle('Technical')).toBe('Technical');
  });

  it('takes the first entry of a multi-valued cell', () => {
    expect(linkTitle([{ id: 'rec1', title: 'A' }, { id: 'rec2', title: 'B' }])).toBe('A');
  });

  it('is undefined for empty, null and a titleless link', () => {
    expect(linkTitle(null)).toBeUndefined();
    expect(linkTitle(undefined)).toBeUndefined();
    expect(linkTitle('')).toBeUndefined();
    expect(linkTitle([])).toBeUndefined();
    expect(linkTitle({ id: 'rec1' })).toBeUndefined();
  });

  it('never yields the [object Object] string', () => {
    expect(linkTitle({ id: 'rec1', title: 'Technical' })).not.toContain('object Object');
  });
});

describe('linkTitles', () => {
  it('reads every entry and drops the titleless ones', () => {
    expect(linkTitles([{ id: 'r1', title: 'A' }, { id: 'r2' }, { id: 'r3', title: 'C' }])).toEqual(['A', 'C']);
  });

  it('is empty for null', () => {
    expect(linkTitles(null)).toEqual([]);
  });
});

describe('linkId', () => {
  it('reads the record id, and is undefined for a pre-migration string', () => {
    expect(linkId({ id: 'rec1', title: 'Technical' })).toBe('rec1');
    expect(linkId('Technical')).toBeUndefined();
  });
});

describe('linkIds', () => {
  it('reads every record id from a two-way related_knowledge cell', () => {
    expect(linkIds([{ id: 'r1', title: 'A' }, { id: 'r2' }])).toEqual(['r1', 'r2']);
  });

  it('is empty for null and for pre-migration strings', () => {
    expect(linkIds(null)).toEqual([]);
    expect(linkIds(['A', 'B'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mastra-ai && npx vitest run tests/knowledges/link-cell.test.ts`
Expected: FAIL — cannot resolve `link-cell.js`.

- [ ] **Step 3: Write the reader**

Create `apps/mastra-ai/src/mastra/tools/db-query/knowledges/link-cell.ts`:

```ts
/**
 * Teable link cells are `{ id, title }` (or an array of them when the field is
 * multi-valued), while the same column was plain text before the v2 migration.
 * These readers accept both, which is what lets the agent keep working across
 * the conversion rather than needing to land in the same commit as it.
 *
 * `String(cell)` on a link object yields "[object Object]" — it does not throw,
 * it feeds nonsense to the model. That is the failure these exist to prevent.
 */
export type LinkCell = string | { id: string; title?: string };

const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

const titleOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (value && typeof value === 'object' && 'title' in value) {
    const title = (value as { title?: unknown }).title;
    return typeof title === 'string' && title !== '' ? title : undefined;
  }
  return undefined;
};

export const linkTitle = (raw: unknown): string | undefined => titleOf(first(raw));

export const linkTitles = (raw: unknown): string[] => {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(titleOf).filter((t): t is string => t !== undefined);
};

export const linkId = (raw: unknown): string | undefined => {
  const value = first(raw);
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

export const linkIds = (raw: unknown): string[] => {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .map((v) => (v && typeof v === 'object' && 'id' in v ? (v as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mastra-ai && npx vitest run tests/knowledges/link-cell.test.ts`
Expected: PASS.

- [ ] **Step 5: Send typecast on writes**

In `apps/mastra-ai/src/mastra/tools/db-query/teable-client.ts`, add `typecast: true` to both bodies. `teableCreate`:

```ts
    body: JSON.stringify({
      fieldKeyType: 'name',
      // Coerces a title string into a link cell. Without this every write to a
      // link column fails once knowledge_type stops being plain text.
      typecast: true,
      records: fields.map((f) => ({ fields: f })),
    }),
```

`teableUpdate`:

```ts
    body: JSON.stringify({ fieldKeyType: 'name', typecast: true, record: { fields } }),
```

- [ ] **Step 6: Widen the read types and fix the two `String()` calls**

In `knowledges/knowledge.ts`, replace the `knowledge_type` field declaration:

```ts
import type { LinkCell } from './link-cell.js';

export interface KnowledgeFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Link cell after the v2 migration, a bare title before it. Read with linkTitle(). */
  knowledge_type?: LinkCell;
  /** Two-way self-link, v2. Read with linkIds(). */
  related_knowledge?: LinkCell[];
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}
```

Writes still accept a title, so widen the input aliases rather than narrowing them:

```ts
type CreateInput = Pick<KnowledgeFields, 'title'> &
  Partial<Pick<KnowledgeFields, 'context' | 'is_active' | 'deleted_at'>> & {
    /** A title; typecast turns it into a link. */
    knowledge_type?: string;
  };

type UpdateInput = Partial<Pick<KnowledgeFields, 'title' | 'context' | 'is_active' | 'deleted_at'>> & {
  knowledge_type?: string;
};
```

In `knowledges/knowledge-type.ts`, add the parent field to `KnowledgeTypeFields`:

```ts
  /** Self-link to the parent type, v2. Empty means this type is a root. */
  parent_type?: LinkCell;
```

In `db-search-tools.ts`, both line 52 and line 135 become:

```ts
        knowledge_type: linkTitle(r.fields.knowledge_type),
```

with `import { linkTitle } from './knowledges/link-cell.js';` at the top. The zod result schemas at lines 13 and 20 stay `z.string().optional()` — only the extraction changes.

In `knowledges/knowledge-service.ts`, `getKnowledgesWithType` resolves by title through `linkTitle`:

```ts
  return knowledgesResult.records.map((knowledge) => {
    const title = linkTitle(knowledge.fields.knowledge_type);
    return { knowledge, type: title ? typeByTitle.get(title) : undefined };
  });
```

- [ ] **Step 7: Update the existing fixtures**

In `apps/mastra-ai/tests/knowledges/knowledge-service.test.ts`, the read fixtures at lines 43, 132, 150, 162, 180 hold `knowledge_type: 'Technical'`. Add a post-migration variant alongside one of them so both shapes are covered:

```ts
  it('resolves the type from a link cell', async () => {
    const tRec = { id: 'tRec1', fields: { title: 'Technical' } };
    const kRec = {
      id: 'knRec1',
      fields: { title: 'Deploy', knowledge_type: { id: 'tRec1', title: 'Technical' } },
    };
    vi.mocked(listKnowledges).mockResolvedValue({ records: [kRec] as never });
    vi.mocked(listKnowledgeTypes).mockResolvedValue({ records: [tRec] as never });

    const [result] = await getKnowledgesWithType();

    expect(result.type?.fields.title).toBe('Technical');
  });
```

The write assertions at `knowledge.test.ts:110-112` and `knowledge-service.test.ts:94,124` now see `typecast: true` in the request body. Update the expected body accordingly.

- [ ] **Step 8: Run the mastra tests**

Run: `cd apps/mastra-ai && npx vitest run tests/knowledges/`
Expected: PASS.

- [ ] **Step 9: Confirm nothing still stringifies a link cell**

Run: `grep -rn "String(r.fields\|String(knowledge.fields\|fields.knowledge_type" apps/mastra-ai/src`
Expected: every hit goes through `linkTitle`/`linkTitles`/`linkId`. Any bare `String(...)` left is a bug.

- [ ] **Step 10: Commit**

```bash
git add apps/mastra-ai/src/mastra/tools/db-query/ apps/mastra-ai/tests/knowledges/
git commit -m "feat(mastra): read link cells tolerantly and write with typecast"
```

---

### Task 4: Field migration (operational)

Data and schema change against the live base. No application code. Task 3 must be deployed first — the agent's writes fail the moment the column becomes a Link without `typecast`.

**Files:** none. This is a sequence of Teable field operations.

**Interfaces:**
- Produces: `knowledge.knowledge_type` as a single-valued Link; `knowledge_type.parent_type` and `knowledge.related_knowledge` as new empty Links.
- Consumes: the Task 2 audit report.

- [ ] **Step 1: Re-run the audit immediately before converting**

Run: `TEABLE_API_KEY=… npx tsx scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts`
Expected: `records that would lose their type: 0`. If not zero, stop and fix the data — either create the missing types or correct the titles. Do not proceed on a non-zero count.

- [ ] **Step 2: Convert `knowledge.knowledge_type` to a Link**

Convert the field on table `tblVTWb1kxXSFPBq4Fq` from `singleLineText` to `link` with:

```json
{ "type": "link", "options": { "relationship": "manyOne", "foreignTableId": "tblWcq6Kof1AFHvbC5e", "isOneWay": true } }
```

`manyOne` is what makes the cell single-valued — many knowledges to one type. `isOneWay` avoids creating a symmetric field on the type table that nothing reads.

- [ ] **Step 3: Add `parent_type` to `knowledge_type`**

On table `tblWcq6Kof1AFHvbC5e`, create field `parent_type`:

```json
{ "name": "parent_type", "type": "link", "options": { "relationship": "manyOne", "foreignTableId": "tblWcq6Kof1AFHvbC5e", "isOneWay": true } }
```

Self-referencing and one-way: children are derived by inverting the parent map, so a symmetric `child_types` field would be a second stored copy of the same edge.

- [ ] **Step 4: Add `related_knowledge` to `knowledge`**

On table `tblVTWb1kxXSFPBq4Fq`, create field `related_knowledge`:

```json
{ "name": "related_knowledge", "type": "link", "options": { "relationship": "manyMany", "foreignTableId": "tblVTWb1kxXSFPBq4Fq", "isOneWay": false } }
```

Two-way here, unlike the other two: the relation is symmetric, and a one-way field would make "A relates to B" true only when read from A.

- [ ] **Step 5: Verify the conversion kept every link**

Run: `TEABLE_API_KEY=… npx tsx scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts`
Expected: the script now throws `knowledge_type is already not text on rec…`. That error **is** the pass condition — it proves the column is no longer text. Confirm separately, via the Teable UI or a record read, that the count of knowledges with a non-empty `knowledge_type` matches the pre-conversion count from Step 1.

- [ ] **Step 6: Confirm the graph still renders**

Load the knowledge graph page. Expected: unchanged from before the migration — `parent_type` and `related_knowledge` are empty, so the taxonomy is still flat and there are no relations yet.

---

### Task 5: Nested types — cycle-breaking, depth and root ancestor

**Files:**
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/types.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.service.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts`
- Test: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.spec.ts`

**Interfaces:**
- Produces: `IKnowledgeTypeRow` gains `parentRecordId: string | null`. `IAssembledGraph['stats']` gains `cyclesDropped: number` and `maxDepth: number`. Type nodes are emitted in depth-first order (roots by title, then children by title) — the legend in Task 9 relies on parents preceding children.
- Consumes: Task 1's `parentId`/`rootTypeId`/`depth` node fields.

**Note:** `IKnowledgeRow extends IKnowledgeTypeRow` today. Adding `parentRecordId` to the type row would wrongly give knowledge rows a parent field. Decouple them into two standalone interfaces as part of this task.

- [ ] **Step 1: Write the failing tests**

Replace the `type` helper in `knowledge-graph.assembler.spec.ts` and add the suite:

```ts
const type = (
  recordId: string,
  title: string,
  parentRecordId: string | null = null
): IKnowledgeTypeRow => ({ recordId, title, parentRecordId });

describe('nested types', () => {
  it('reports depth and root ancestor down a three-level chain', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    const at = (id: string) => graph.nodes.find((n) => n.id === `type:${id}`);

    expect(at('a')).toMatchObject({ parentId: 'core', rootTypeId: 'type:a', depth: 0 });
    expect(at('b')).toMatchObject({ parentId: 'type:a', rootTypeId: 'type:a', depth: 1 });
    expect(at('c')).toMatchObject({ parentId: 'type:b', rootTypeId: 'type:a', depth: 2 });
    expect(graph.stats.maxDepth).toBe(2);
  });

  it('links core to roots only, and parents to children', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha'), type('b', 'Beta', 'a')], [], OPTS);

    expect(graph.links.filter((l) => l.tier === 'core-type').map((l) => l.target)).toEqual(['type:a']);
    expect(graph.links.filter((l) => l.tier === 'type-parent')).toEqual([
      { source: 'type:a', target: 'type:b', tier: 'type-parent', value: 1, distance: expect.any(Number) },
    ]);
  });

  it('counts child types and child knowledges in a type degree', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a')],
      [knowledge('k1', 'one', 'a')],
      OPTS
    );

    expect(graph.nodes.find((n) => n.id === 'type:a')?.degree).toBe(2);
  });

  it('gives a knowledge its type depth plus one, and the type root', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a')],
      [knowledge('k1', 'one', 'b')],
      OPTS
    );

    expect(graph.nodes.find((n) => n.id === 'kn:k1')).toMatchObject({
      parentId: 'type:b',
      rootTypeId: 'type:a',
      depth: 2,
    });
  });

  it('treats a self-parent as a root and counts it', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha', 'a')], [], OPTS);

    expect(graph.nodes.find((n) => n.id === 'type:a')).toMatchObject({ parentId: 'core', depth: 0 });
    expect(graph.stats.cyclesDropped).toBe(1);
  });

  it('breaks a two-cycle and a three-cycle without hanging', () => {
    const two = assembleKnowledgeGraph([type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')], [], OPTS);
    expect(two.stats.cyclesDropped).toBe(1);
    expect(two.nodes.filter((n) => n.tier === 'type' && n.parentId === 'core')).toHaveLength(1);

    const three = assembleKnowledgeGraph(
      [type('a', 'Alpha', 'c'), type('b', 'Beta', 'a'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    expect(three.stats.cyclesDropped).toBe(1);
  });

  it('drops the SAME edge on every run, because the ETag depends on it', () => {
    const rows = () => [type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')];
    const first = assembleKnowledgeGraph(rows(), [], OPTS);
    const again = assembleKnowledgeGraph(rows(), [], OPTS);

    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it('treats a parent pointing at a missing type as a root, not as a drop', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha', 'ghost')], [], OPTS);

    expect(graph.nodes.find((n) => n.id === 'type:a')).toMatchObject({ parentId: 'core', depth: 0 });
    expect(graph.stats.cyclesDropped).toBe(0);
  });

  it('emits parents before their children', () => {
    const graph = assembleKnowledgeGraph(
      [type('b', 'Beta', 'a'), type('a', 'Alpha'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    const order = graph.nodes.filter((n) => n.tier === 'type').map((n) => n.id);

    expect(order).toEqual(['type:a', 'type:b', 'type:c']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/knowledge-graph.assembler.spec.ts -t "nested types"`
Expected: FAIL — `parentRecordId` is not a property of `IKnowledgeTypeRow`, so the file does not even compile.

- [ ] **Step 3: Split the row interfaces and add the parent**

In `knowledge-graph.assembler.ts`:

```ts
export interface IKnowledgeTypeRow {
  recordId: string;
  title: string;
  /** recordId of the parent type, or null when this type is a root. */
  parentRecordId: string | null;
}

/** Standalone, NOT extending IKnowledgeTypeRow: a knowledge has no parent type
 *  of its own, it has a type. Inheriting parentRecordId here would model the
 *  taxonomy edge twice. */
export interface IKnowledgeRow {
  recordId: string;
  title: string;
  /** recordId of the linked knowledge_type, or null when unlinked/unresolvable */
  typeRecordId: string | null;
}
```

`byTitleThenId` is typed on the shared shape, so narrow its parameter:

```ts
const byTitleThenId = (a: { title: string; recordId: string }, b: { title: string; recordId: string }) =>
  a.title.localeCompare(b.title) || a.recordId.localeCompare(b.recordId);
```

- [ ] **Step 4: Add cycle-breaking and depth resolution**

Add above `assembleKnowledgeGraph`:

```ts
/**
 * `parent_type` is user data, so A->B->A and A->A are both reachable, and a
 * naive walk up the chain would loop forever.
 *
 * Types are visited in the caller's sorted order and the edge that CLOSES a
 * cycle is cut, which makes the outcome deterministic: the same edge goes on
 * every run. That matters beyond tidiness — getGraph hashes the whole payload
 * into the ETag, so a nondeterministic break would churn the ETag between two
 * identical requests.
 */
const breakCycles = (sortedTypes: IKnowledgeTypeRow[]) => {
  const known = new Set(sortedTypes.map((t) => t.recordId));
  const parentOf = new Map<string, string | null>();
  let cyclesDropped = 0;

  for (const type of sortedTypes) {
    const parent = type.parentRecordId;
    if (parent === type.recordId) {
      // Self-parent: a cycle of length one.
      parentOf.set(type.recordId, null);
      cyclesDropped++;
      continue;
    }
    // A parent that no longer resolves is a root, not a dropped cycle — the
    // same treatment an unresolvable knowledge_type already gets.
    parentOf.set(type.recordId, parent && known.has(parent) ? parent : null);
  }

  for (const type of sortedTypes) {
    const seen = new Set<string>([type.recordId]);
    let current = parentOf.get(type.recordId) ?? null;
    while (current) {
      if (seen.has(current)) {
        parentOf.set(current, null);
        cyclesDropped++;
        break;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  }

  return { parentOf, cyclesDropped };
};

/** One memoised walk up the now-acyclic parent map. Safe to recurse: the depth
 *  is the tree's, and breakCycles guarantees termination. */
const resolveHierarchy = (parentOf: ReadonlyMap<string, string | null>) => {
  const depthOf = new Map<string, number>();
  const rootOf = new Map<string, string>();

  const resolve = (recordId: string): { depth: number; root: string } => {
    const cached = depthOf.get(recordId);
    if (cached !== undefined) {
      return { depth: cached, root: rootOf.get(recordId) as string };
    }
    const parent = parentOf.get(recordId) ?? null;
    const result =
      parent === null
        ? { depth: 0, root: recordId }
        : (() => {
            const up = resolve(parent);
            return { depth: up.depth + 1, root: up.root };
          })();
    depthOf.set(recordId, result.depth);
    rootOf.set(recordId, result.root);
    return result;
  };

  for (const recordId of parentOf.keys()) {
    resolve(recordId);
  }
  return { depthOf, rootOf };
};

/** Depth-first over the parent map: roots by title, then each subtree. The
 *  legend indents by depth and needs parents to precede their children. */
const orderDepthFirst = (
  sortedTypes: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>
): IKnowledgeTypeRow[] => {
  const childrenOf = new Map<string | null, IKnowledgeTypeRow[]>();
  for (const type of sortedTypes) {
    const parent = parentOf.get(type.recordId) ?? null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(type);
    else childrenOf.set(parent, [type]);
  }
  const out: IKnowledgeTypeRow[] = [];
  const walk = (parent: string | null) => {
    for (const child of childrenOf.get(parent) ?? []) {
      out.push(child);
      walk(child.recordId);
    }
  };
  walk(null);
  return out;
};
```

- [ ] **Step 5: Wire them into the assembler**

Inside `assembleKnowledgeGraph`, after `const sortedTypes = [...types].sort(byTitleThenId);`:

```ts
  const { parentOf, cyclesDropped } = breakCycles(sortedTypes);
  const { depthOf, rootOf } = resolveHierarchy(parentOf);
  const orderedTypes = orderDepthFirst(sortedTypes, parentOf);
  const maxDepth = orderedTypes.reduce((max, t) => Math.max(max, depthOf.get(t.recordId) ?? 0), 0);

  const typeNodeId = (recordId: string) => `${TYPE_NODE_PREFIX}${recordId}`;
  const rootNodeIdOf = (recordId: string) => typeNodeId(rootOf.get(recordId) ?? recordId);
  const parentNodeIdOf = (recordId: string) => {
    const parent = parentOf.get(recordId) ?? null;
    return parent === null ? KNOWLEDGE_CORE_NODE_ID : typeNodeId(parent);
  };
```

Type degree now counts child types as well as child knowledges:

```ts
  const childTypeCount = new Map<string, number>();
  for (const type of orderedTypes) {
    const parent = parentOf.get(type.recordId) ?? null;
    if (parent !== null) {
      const id = typeNodeId(parent);
      childTypeCount.set(id, (childTypeCount.get(id) ?? 0) + 1);
    }
  }
```

Emit type nodes from `orderedTypes` instead of `sortedTypes`:

```ts
  for (const type of orderedTypes) {
    const id = typeNodeId(type.recordId);
    nodes.push({
      id,
      recordId: type.recordId,
      tier: 'type',
      label: type.title,
      typeId: null,
      parentId: parentNodeIdOf(type.recordId),
      rootTypeId: rootNodeIdOf(type.recordId),
      depth: depthOf.get(type.recordId) ?? 0,
      degree: (childCount.get(id) ?? 0) + (childTypeCount.get(id) ?? 0),
    });
  }
```

Knowledge nodes inherit depth and root from their bucket. The unclassified bucket is a root, so it resolves to depth 0 and itself:

```ts
  const depthOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID ? 0 : depthOf.get(bucketId.slice(TYPE_NODE_PREFIX.length)) ?? 0;
  const rootOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID
      ? UNCLASSIFIED_TYPE_NODE_ID
      : rootNodeIdOf(bucketId.slice(TYPE_NODE_PREFIX.length));
```

```ts
  for (const row of emitted) {
    const bucket = bucketOf(row);
    nodes.push({
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: 'knowledge',
      label: row.title,
      typeId: bucket,
      parentId: bucket,
      rootTypeId: rootOfBucket(bucket),
      depth: depthOfBucket(bucket) + 1,
      degree: 1,
    });
  }
```

Links: `core-type` for roots only, `type-parent` for the rest.

```ts
const TYPE_PARENT_DISTANCE = 90;
```

```ts
  const links: IKnowledgeGraphLink[] = [];
  for (const type of orderedTypes) {
    const id = typeNodeId(type.recordId);
    const parent = parentOf.get(type.recordId) ?? null;
    links.push(
      parent === null
        ? {
            source: KNOWLEDGE_CORE_NODE_ID,
            target: id,
            tier: 'core-type',
            value: childCount.get(id) ?? 0,
            distance: CORE_TYPE_DISTANCE,
          }
        : {
            source: typeNodeId(parent),
            target: id,
            tier: 'type-parent',
            value: 1,
            distance: TYPE_PARENT_DISTANCE,
          }
    );
  }
  if (orphanCount > 0) {
    links.push({
      source: KNOWLEDGE_CORE_NODE_ID,
      target: UNCLASSIFIED_TYPE_NODE_ID,
      tier: 'core-type',
      value: orphanCount,
      distance: CORE_TYPE_DISTANCE,
    });
  }
```

Core degree counts roots, not all types:

```ts
  const rootCount =
    orderedTypes.filter((t) => (parentOf.get(t.recordId) ?? null) === null).length +
    (orphanCount > 0 ? 1 : 0);
```

Use `rootCount` for the core node's `degree` — it tethers roots now, not every
type. Keep the existing `typeNodeIds` array: the links loop no longer uses it,
but `stats.typeCount` still does, and it must go on counting **all** types plus
the unclassified bucket, not just the roots. Add `cyclesDropped` and `maxDepth`
to the returned `stats`.

- [ ] **Step 6: Read `parent_type` in the service**

In `knowledge-graph/types.ts`:

```ts
export const KNOWLEDGE_FIELD = {
  title: 'title',
  context: 'context',
  deletedAt: 'deleted_at',
  knowledgeType: 'knowledge_type',
  parentType: 'parent_type',
  relatedKnowledge: 'related_knowledge',
} as const;

/** Self-link on knowledge_type. Link only — a text parent could not survive a rename. */
export const PARENT_TYPE_FIELD_TYPES = [FieldType.Link] as const;
```

In `knowledge-graph.service.ts`, add a dedicated single-link reader beside the
existing `extractTypeRecordId`. Do **not** reuse `extractTypeRecordId` here: it
still carries the plain-text title-map fallback that only ever applied to
`knowledge_type`, and `parent_type` is Link-only. Task 7 collapses the two once
that fallback is deleted.

```ts
/** Reads the linked recordId out of a single-valued link cell. */
const extractLinkRecordId = (raw: unknown): string | null => {
  if (raw == null) {
    return null;
  }
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first && typeof first === 'object' && 'id' in (first as object)) {
    return (first as ILinkCellValue).id;
  }
  return null;
};
```

Then project the field:

```ts
const GRAPH_TYPE_SPECS: IFieldSpec[] = [
  { name: KNOWLEDGE_FIELD.title, types: TITLE_TYPES, required: true },
  { name: KNOWLEDGE_FIELD.deletedAt, types: [FieldType.Date], required: true },
  { name: KNOWLEDGE_FIELD.parentType, types: PARENT_TYPE_FIELD_TYPES, required: false },
];
```

and return it from `readTypes`:

```ts
  private async readTypes(tableId: string): Promise<IKnowledgeTypeRow[]> {
    const fields = await this.resolveFields(tableId, GRAPH_TYPE_SPECS);
    const titleField = this.required(fields, KNOWLEDGE_FIELD.title, tableId);
    const deletedAtField = this.required(fields, KNOWLEDGE_FIELD.deletedAt, tableId);
    const parentField = fields.get(KNOWLEDGE_FIELD.parentType);

    const projection = parentField ? [titleField.id, parentField.id] : [titleField.id];
    const rows = await this.readRows(tableId, projection, deletedAtField.id);

    return rows.map((row) => ({
      recordId: row.id,
      title: (row.fields[titleField.id] as string | undefined) ?? '',
      parentRecordId: parentField ? extractLinkRecordId(row.fields[parentField.id]) : null,
    }));
  }
```

`parent_type` is `required: false` so a base that has not added the field yet keeps working — every type simply reads as a root.

- [ ] **Step 7: Run the tests**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/`
Expected: PASS, all suites.

- [ ] **Step 8: Extend the e2e fixture with a nested type**

In `knowledge-graph.e2e-spec.ts`, add the `parent_type` field after the tables exist:

```ts
    await createField(typeTable.id, {
      name: 'parent_type',
      type: FieldType.Link,
      options: { relationship: Relationship.ManyOne, foreignTableId: typeTable.id },
    });
```

then make Beta a child of Alpha after both records exist, and assert:

```ts
  it('nests a child type under its parent', async () => {
    const { data } = await getKnowledgeGraph(baseId);
    const beta = data.nodes.find((n) => n.recordId === betaTypeId);

    expect(beta).toMatchObject({ parentId: `type:${alphaTypeId}`, depth: 1 });
    expect(data.links.some((l) => l.tier === 'type-parent')).toBe(true);
  });
```

Update the existing counts: `typeCount` is unchanged at 3, but the `core-type` link count drops to the root count.

- [ ] **Step 9: Run the e2e suite**

Run: `cd apps/nestjs-backend && pnpm test-e2e -- knowledge-graph`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/nestjs-backend/src/features/knowledge-graph/ apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts
git commit -m "feat(knowledge-graph): nest knowledge types with cycle-safe depth and root"
```

---

### Task 6: Knowledge-to-knowledge relations

**Files:**
- Modify: `apps/nestjs-backend/src/configs/knowledge.config.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.service.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts`
- Test: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.spec.ts`

**Interfaces:**
- Produces: `IKnowledgeRow` gains `relatedRecordIds: string[]`. `IAssembleOptions` gains `maxLinks: number`. Stats gain `relationCount` and `danglingRelations`. Knowledge `degree` becomes `1 + relations`.
- Consumes: Task 5's assembler structure.

- [ ] **Step 1: Write the failing tests**

Update the `knowledge` helper and add the suite:

```ts
const knowledge = (
  recordId: string,
  title: string,
  typeRecordId: string | null = null,
  relatedRecordIds: string[] = []
): IKnowledgeRow => ({ recordId, title, typeRecordId, relatedRecordIds });

describe('relations', () => {
  const OPTS_L = { ...OPTS, maxLinks: 100 };

  it('emits a symmetric relation exactly once', () => {
    const graph = assembleKnowledgeGraph(
      [],
      [knowledge('k1', 'one', null, ['k2']), knowledge('k2', 'two', null, ['k1'])],
      OPTS_L
    );
    const relations = graph.links.filter((l) => l.tier === 'knowledge-knowledge');

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ source: 'kn:k1', target: 'kn:k2', value: 1 });
    expect(graph.stats.relationCount).toBe(1);
  });

  it('counts relations in degree on both endpoints', () => {
    const graph = assembleKnowledgeGraph(
      [],
      [
        knowledge('k1', 'one', null, ['k2', 'k3']),
        knowledge('k2', 'two', null, ['k1']),
        knowledge('k3', 'three', null, ['k1']),
      ],
      OPTS_L
    );

    expect(graph.nodes.find((n) => n.id === 'kn:k1')?.degree).toBe(3); // its type + 2 relations
    expect(graph.nodes.find((n) => n.id === 'kn:k2')?.degree).toBe(2);
  });

  it('drops a relation to a record outside the emitted set', () => {
    const graph = assembleKnowledgeGraph([], [knowledge('k1', 'one', null, ['ghost'])], OPTS_L);

    expect(graph.links.filter((l) => l.tier === 'knowledge-knowledge')).toHaveLength(0);
    expect(graph.stats.danglingRelations).toBe(1);
  });

  it('drops a self-relation', () => {
    const graph = assembleKnowledgeGraph([], [knowledge('k1', 'one', null, ['k1'])], OPTS_L);

    expect(graph.links.filter((l) => l.tier === 'knowledge-knowledge')).toHaveLength(0);
    expect(graph.stats.danglingRelations).toBe(1);
  });

  it('truncates relations but never structural links', () => {
    const types = [type('a', 'Alpha')];
    const rows = [
      knowledge('k1', 'one', 'a', ['k2', 'k3']),
      knowledge('k2', 'two', 'a', ['k1', 'k3']),
      knowledge('k3', 'three', 'a', ['k1', 'k2']),
    ];
    // 1 core-type + 3 type-knowledge = 4 structural, leaving room for 1 relation.
    const graph = assembleKnowledgeGraph(types, rows, { ...OPTS, maxLinks: 5 });

    expect(graph.links.filter((l) => l.tier !== 'knowledge-knowledge')).toHaveLength(4);
    expect(graph.links.filter((l) => l.tier === 'knowledge-knowledge')).toHaveLength(1);
    expect(graph.stats.truncated).toBe(true);
  });

  it('orders relations deterministically', () => {
    const rows = () => [
      knowledge('k3', 'three', null, ['k1']),
      knowledge('k1', 'one', null, ['k3', 'k2']),
      knowledge('k2', 'two', null, ['k1']),
    ];
    expect(JSON.stringify(assembleKnowledgeGraph([], rows(), OPTS_L))).toBe(
      JSON.stringify(assembleKnowledgeGraph([], rows(), OPTS_L))
    );
  });
});
```

Add `maxLinks: 100` to the shared `OPTS` object so the existing suites still typecheck.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/knowledge-graph.assembler.spec.ts -t "relations"`
Expected: FAIL — `relatedRecordIds` and `maxLinks` are not on the interfaces.

- [ ] **Step 3: Extend the interfaces**

```ts
export interface IKnowledgeRow {
  recordId: string;
  title: string;
  typeRecordId: string | null;
  /** recordIds from the two-way related_knowledge cell. */
  relatedRecordIds: string[];
}

export interface IAssembleOptions {
  maxKnowledgeNodes: number;
  maxLinks: number;
  coreLabel: string;
  unclassifiedLabel: string;
}
```

- [ ] **Step 4: Build the relation set before emitting nodes**

Node `degree` has to count relations, so relations are computed **before** the node loop. Insert after `emitted` is established:

```ts
const KNOWLEDGE_KNOWLEDGE_DISTANCE = 140;

/** Canonical key for an unordered pair. related_knowledge is two-way, so every
 *  association arrives twice — once from each end — and would otherwise render
 *  as two coincident edges and double-count in degree. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
```

```ts
  const emittedIds = new Set(emitted.map((row) => row.recordId));
  const seenPairs = new Set<string>();
  const pairs: { source: string; target: string }[] = [];
  let danglingRelations = 0;

  for (const row of emitted) {
    for (const other of row.relatedRecordIds) {
      if (other === row.recordId || !emittedIds.has(other)) {
        danglingRelations++;
        continue;
      }
      const key = pairKey(row.recordId, other);
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      const [source, target] = row.recordId < other ? [row.recordId, other] : [other, row.recordId];
      pairs.push({ source, target });
    }
  }
  pairs.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  const relationDegree = new Map<string, number>();
  for (const pair of pairs) {
    relationDegree.set(pair.source, (relationDegree.get(pair.source) ?? 0) + 1);
    relationDegree.set(pair.target, (relationDegree.get(pair.target) ?? 0) + 1);
  }
```

Knowledge `degree` becomes:

```ts
      degree: 1 + (relationDegree.get(row.recordId) ?? 0),
```

- [ ] **Step 5: Emit relations under the link budget**

After all structural links are pushed:

```ts
  // `maxLinks` comes from the destructured options at the top of the function:
  //   const { maxKnowledgeNodes, maxLinks, coreLabel, unclassifiedLabel } = options;
  //
  // Structural links are never dropped: without the taxonomy the layout loses
  // its skeleton. Only relations are truncated.
  const roomForRelations = Math.max(0, maxLinks - links.length);
  const relationsTruncated = pairs.length > roomForRelations;
  const emittedPairs = relationsTruncated ? pairs.slice(0, roomForRelations) : pairs;

  for (const pair of emittedPairs) {
    links.push({
      source: `${KNOWLEDGE_NODE_PREFIX}${pair.source}`,
      target: `${KNOWLEDGE_NODE_PREFIX}${pair.target}`,
      tier: 'knowledge-knowledge',
      value: 1,
      distance: KNOWLEDGE_KNOWLEDGE_DISTANCE,
    });
  }
```

Note that `relationDegree` is computed over **all** pairs while only `emittedPairs` are drawn, so a truncated graph reports a degree higher than its visible edges. That is deliberate: degree drives node *sizing*, and a hub should not shrink because the budget hid some of its edges. Add that as a comment.

`stats` gains `relationCount: emittedPairs.length` and `danglingRelations`. `truncated` stays a boolean for now — `truncated: truncated || relationsTruncated` — and becomes an object in Task 10.

- [ ] **Step 6: Read `related_knowledge` in the service**

Add the spec and a multi-value reader in `knowledge-graph.service.ts`:

```ts
/** Reads every linked recordId out of a multi-valued link cell. */
const extractRelatedRecordIds = (raw: unknown): string[] => {
  if (raw == null) {
    return [];
  }
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter((v): v is ILinkCellValue => typeof v === 'object' && v !== null && 'id' in v)
    .map((v) => v.id);
};
```

```ts
const GRAPH_KNOWLEDGE_SPECS: IFieldSpec[] = [
  { name: KNOWLEDGE_FIELD.title, types: TITLE_TYPES, required: true },
  { name: KNOWLEDGE_FIELD.deletedAt, types: [FieldType.Date], required: true },
  { name: KNOWLEDGE_FIELD.knowledgeType, types: KNOWLEDGE_TYPE_FIELD_TYPES, required: false },
  { name: KNOWLEDGE_FIELD.relatedKnowledge, types: [FieldType.Link], required: false },
];
```

`readKnowledges` projects it and returns `relatedRecordIds`. Pass the new budget in `getGraph`:

```ts
    const graph = assembleKnowledgeGraph(types, knowledges, {
      maxKnowledgeNodes,
      maxLinks,
      coreLabel: 'knowledge_core',
      unclassifiedLabel: 'Unclassified',
    });
```

- [ ] **Step 7: Add the budget to config**

In `apps/nestjs-backend/src/configs/knowledge.config.ts`:

```ts
  /**
   * Relations are superlinear in a way nodes never were — one well-connected
   * hub contributes hundreds of edges — and the renderer's cost is per-link.
   */
  maxLinks: Number(process.env.KNOWLEDGE_GRAPH_MAX_LINKS ?? 6000),
```

- [ ] **Step 8: Run the tests**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/nestjs-backend/src/features/knowledge-graph/ apps/nestjs-backend/src/configs/knowledge.config.ts
git commit -m "feat(knowledge-graph): emit deduped knowledge relations under a link budget"
```

---

### Task 7: Enforce single-type, drop the text fallback, add detail ancestors

The migration is done, so the plain-text path is dead weight — and leaving it in means a renamed type silently orphans its children, which is the exact failure the Link conversion removed.

**Files:**
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/types.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.service.ts`
- Modify: `packages/openapi/src/knowledge-graph/get-node.ts`
- Test: `apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts`

**Interfaces:**
- Produces: `IGetKnowledgeGraphNodeVo` gains `parentId`, `parentLabel`, `ancestors: { id: string; label: string }[]`, `relatedCount: number`; loses `typeId`/`typeLabel`. `IFieldSpec` gains `singleValued?: boolean`.
- Consumes: Task 5's `readTypes`.

- [ ] **Step 1: Narrow the accepted field types**

In `knowledge-graph/types.ts`:

```ts
/** Link only. The plain-text form was accepted before the v2 migration; keeping
 *  it would mean a renamed type silently orphans every child. */
export const KNOWLEDGE_TYPE_FIELD_TYPES = [FieldType.Link] as const;

export interface IFieldSpec {
  name: string;
  types: readonly FieldType[];
  required: boolean;
  /** When true, a multi-valued field is a configuration error. */
  singleValued?: boolean;
}
```

- [ ] **Step 2: Assert single-valued and delete the text path**

In `resolveFields`, after the type check:

```ts
      if (spec.singleValued && field.isMultipleCellValue) {
        throw new CustomHttpException(
          `Field "${spec.name}" on table ${tableId} is multi-valued; a knowledge belongs to exactly one type`,
          HttpErrorCode.VALIDATION_ERROR
        );
      }
```

Mark `knowledgeType` and `parentType` with `singleValued: true` in `GRAPH_KNOWLEDGE_SPECS`, `GRAPH_TYPE_SPECS` and `DETAIL_SPECS`.

`extractTypeRecordId` collapses into the `extractLinkRecordId` added in Task 5 — with the text fallback gone the two are the same function, and `knowledge_type` is now asserted single-valued so there is no array to truncate:

```ts
/** Reads the linked recordId out of a single-valued link cell. Both
 *  knowledge_type and parent_type are asserted single-valued in resolveFields,
 *  so there is no multi-value case to silently drop. */
const extractLinkRecordId = (raw: unknown): string | null => {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'object' && 'id' in (raw as object)) {
    return (raw as ILinkCellValue).id;
  }
  return null;
};
```

Delete `extractTypeRecordId`, delete `titleToRecordId` from `getGraph`, drop the title-map parameter from `readKnowledges`, and delete `describeLink` entirely. Point `readKnowledges` at `extractLinkRecordId`.

- [ ] **Step 3: Extend the detail contract**

In `packages/openapi/src/knowledge-graph/get-node.ts`, replace `typeId` and `typeLabel`:

```ts
  parentId: z.string().nullable().meta({ description: 'Parent node id: a type for a knowledge, a parent type for a type.' }),
  parentLabel: z.string().nullable(),
  ancestors: z
    .object({ id: z.string(), label: z.string() })
    .array()
    .meta({ description: 'Root-first breadcrumb, excluding this node. Empty for a root type.' }),
  relatedCount: z.number().int().meta({ description: 'Peer relations; always 0 for a type node.' }),
```

- [ ] **Step 4: Build the ancestor chain in getNode**

```ts
    // The chain needs the whole type table, not one record: it walks parents.
    // Acceptable on this path — it serves one record at a time and already
    // reads `context`, the largest column in either table.
    const types = await this.readTypes(knowledgeTypeTableId);
    const byRecordId = new Map(types.map((t) => [t.recordId, t]));

    const chainFrom = (startRecordId: string | null): { id: string; label: string }[] => {
      const chain: { id: string; label: string }[] = [];
      const seen = new Set<string>();
      let current = startRecordId;
      while (current && !seen.has(current)) {
        seen.add(current);
        const node = byRecordId.get(current);
        if (!node) break;
        chain.unshift({ id: `${TYPE_NODE_PREFIX}${node.recordId}`, label: node.title });
        current = node.parentRecordId;
      }
      return chain;
    };
```

The `seen` guard is not defensive padding: `parent_type` is user data and the assembler's cycle-breaking does not run on this path.

For a knowledge node, `ancestors` is `chainFrom(typeRecordId)`; for a type node it is `chainFrom(parentRecordId)`. `parentId`/`parentLabel` come from the last entry. `relatedCount` is `extractRelatedRecordIds(...).length` for a knowledge and `0` for a type.

- [ ] **Step 5: Run the backend tests**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/ && pnpm test-e2e -- knowledge-graph`
Expected: PASS. The e2e detail assertions need updating from `typeId`/`typeLabel` to `parentId`/`ancestors`.

- [ ] **Step 6: Commit**

```bash
git add apps/nestjs-backend/src/features/knowledge-graph/ packages/openapi/src/knowledge-graph/get-node.ts apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts
git commit -m "feat(knowledge-graph): require a link type and expose ancestor chains"
```

---

### Task 8: Frontend adopts parentId and rootTypeId

Still leaves `typeId` in the contract, so this task is independently shippable.

**Files:**
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.ts`
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/graphTheme.ts`
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraph.tsx:83-86`
- Test: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.spec.ts`

**Interfaces:**
- Produces: `hiddenClosure(nodes, hiddenTypeIds): Set<string>` exported from `buildSimulationGraph.ts`. `colorForNode` now takes `Pick<IKnowledgeGraphNode, 'tier' | 'id' | 'rootTypeId' | 'depth'>`.
- Consumes: Tasks 5–7.

- [ ] **Step 1: Write the failing tests**

```ts
describe('hidden subtree closure', () => {
  const nodes = [
    { id: 'core', tier: 'core', parentId: null, rootTypeId: null, depth: 0 },
    { id: 'type:a', tier: 'type', parentId: 'core', rootTypeId: 'type:a', depth: 0 },
    { id: 'type:b', tier: 'type', parentId: 'type:a', rootTypeId: 'type:a', depth: 1 },
    { id: 'type:c', tier: 'type', parentId: 'type:b', rootTypeId: 'type:a', depth: 2 },
    { id: 'type:z', tier: 'type', parentId: 'core', rootTypeId: 'type:z', depth: 0 },
  ] as unknown as IKnowledgeGraphNode[];

  it('hides grandchildren when a root is hidden', () => {
    expect(hiddenClosure(nodes, ['type:a'])).toEqual(new Set(['type:a', 'type:b', 'type:c']));
  });

  it('leaves siblings alone when a leaf type is hidden', () => {
    expect(hiddenClosure(nodes, ['type:c'])).toEqual(new Set(['type:c']));
  });

  it('is empty when nothing is hidden', () => {
    expect(hiddenClosure(nodes, [])).toEqual(new Set());
  });
});

describe('buildSimulationGraph with nesting', () => {
  it('drops a knowledge whose ancestor type is hidden', () => {
    const graph = {
      version: 2,
      etag: '"kg2-test"',
      nodes: [
        { id: 'core', recordId: null, tier: 'core', label: 'core', parentId: null, rootTypeId: null, depth: 0, degree: 1 },
        { id: 'type:a', recordId: 'a', tier: 'type', label: 'A', parentId: 'core', rootTypeId: 'type:a', depth: 0, degree: 1 },
        { id: 'type:b', recordId: 'b', tier: 'type', label: 'B', parentId: 'type:a', rootTypeId: 'type:a', depth: 1, degree: 1 },
        { id: 'kn:1', recordId: '1', tier: 'knowledge', label: 'k', parentId: 'type:b', rootTypeId: 'type:a', depth: 2, degree: 1 },
      ],
      links: [],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    const result = buildSimulationGraph(graph, ['type:a']);
    expect(result.nodes.map((n) => n.id)).toEqual(['core']);
  });

  it('drops a relation when either endpoint is hidden', () => {
    const graph = {
      version: 2,
      etag: '"kg2-test"',
      nodes: [
        { id: 'core', recordId: null, tier: 'core', label: 'core', parentId: null, rootTypeId: null, depth: 0, degree: 2 },
        { id: 'type:a', recordId: 'a', tier: 'type', label: 'A', parentId: 'core', rootTypeId: 'type:a', depth: 0, degree: 1 },
        { id: 'type:b', recordId: 'b', tier: 'type', label: 'B', parentId: 'core', rootTypeId: 'type:b', depth: 0, degree: 1 },
        { id: 'kn:1', recordId: '1', tier: 'knowledge', label: 'k1', parentId: 'type:a', rootTypeId: 'type:a', depth: 1, degree: 2 },
        { id: 'kn:2', recordId: '2', tier: 'knowledge', label: 'k2', parentId: 'type:b', rootTypeId: 'type:b', depth: 1, degree: 2 },
      ],
      links: [
        { source: 'kn:1', target: 'kn:2', tier: 'knowledge-knowledge', value: 1, distance: 140 },
      ],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    expect(buildSimulationGraph(graph, []).links).toHaveLength(1);
    expect(buildSimulationGraph(graph, ['type:b']).links).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.spec.ts`
Expected: FAIL — `hiddenClosure` is not exported.

- [ ] **Step 3: Implement the closure**

In `buildSimulationGraph.ts`:

```ts
/**
 * Expands the user's hidden type ids to include every descendant type.
 *
 * Iterates to a fixpoint rather than assuming an ordering: the assembler does
 * emit parents before children, but relying on that here would couple the
 * client's filter to the server's emission order, and the coupling would be
 * invisible until someone reordered the assembler.
 */
export const hiddenClosure = (
  nodes: readonly IKnowledgeGraphNode[],
  hiddenTypeIds: readonly string[]
): Set<string> => {
  const hidden = new Set(hiddenTypeIds);
  const typeNodes = nodes.filter((node) => node.tier === 'type');
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of typeNodes) {
      if (!hidden.has(node.id) && node.parentId && hidden.has(node.parentId)) {
        hidden.add(node.id);
        changed = true;
      }
    }
  }
  return hidden;
};
```

and rewrite `keep`:

```ts
  const hidden = hiddenClosure(graph.nodes, hiddenTypeIds);
  const keep = (node: IKnowledgeGraphNode): boolean => {
    if (node.tier === 'core') {
      return true;
    }
    if (node.tier === 'type') {
      return !hidden.has(node.id);
    }
    return !hidden.has(node.parentId ?? '');
  };
```

- [ ] **Step 4: Colour by root and depth**

In `graphTheme.ts`:

```ts
/**
 * Hue comes from the ROOT ancestor, so a whole subtree reads as one family;
 * lightness comes from depth, so nesting is legible within that family. The
 * floors keep a deep type from going darker than its own children, which would
 * read as an inverted hierarchy.
 */
export const colorForNode = (
  node: Pick<IKnowledgeGraphNode, 'tier' | 'id' | 'rootTypeId' | 'depth'>
): string => {
  if (node.tier === 'core') {
    return CORE_COLOR;
  }
  const key = node.rootTypeId;
  if (!key || key === UNCLASSIFIED_TYPE_NODE_ID) {
    return UNCLASSIFIED_COLOR;
  }
  const hue = hashHue(key);
  if (node.tier === 'type') {
    return `hsl(${hue} 72% ${Math.max(40, 62 - node.depth * 8)}%)`;
  }
  return `hsl(${hue} 52% ${Math.max(30, 46 - Math.max(0, node.depth - 1) * 5)}%)`;
};
```

- [ ] **Step 5: Add a colour test**

```ts
describe('colorForNode with nesting', () => {
  it('gives a subtree one hue and darkens with depth', () => {
    const hueOf = (c: string) => c.match(/hsl\((\d+)/)?.[1];
    const lightOf = (c: string) => Number(c.match(/ (\d+)%\)$/)?.[1]);

    const root = colorForNode({ tier: 'type', id: 'type:a', rootTypeId: 'type:a', depth: 0 });
    const child = colorForNode({ tier: 'type', id: 'type:b', rootTypeId: 'type:a', depth: 1 });

    expect(hueOf(child)).toBe(hueOf(root));
    expect(lightOf(child)).toBeLessThan(lightOf(root));
  });

  it('keeps a type lighter than its own knowledges at every depth', () => {
    const lightOf = (c: string) => Number(c.match(/ (\d+)%\)$/)?.[1]);
    for (const depth of [0, 1, 2, 3, 8]) {
      const type = colorForNode({ tier: 'type', id: 'type:x', rootTypeId: 'type:a', depth });
      const kn = colorForNode({ tier: 'knowledge', id: 'kn:1', rootTypeId: 'type:a', depth: depth + 1 });
      expect(lightOf(type)).toBeGreaterThan(lightOf(kn));
    }
  });
});
```

- [ ] **Step 6: Move siblingCount onto parentId**

`KnowledgeGraph.tsx` lines 83-86:

```ts
    if (!focusedNode?.parentId) {
      return 0;
    }
    return (data?.nodes ?? []).filter((node) => node.parentId === focusedNode.parentId).length;
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/app/blocks/knowledge-graph --ext .ts,.tsx`
Expected: PASS, clean typecheck, clean lint.

- [ ] **Step 8: Commit**

```bash
git add apps/nextjs-app/src/features/app/blocks/knowledge-graph/
git commit -m "feat(knowledge-graph): filter by type subtree and colour by root ancestor"
```

---

### Task 9: Legend tree and detail breadcrumb

**Files:**
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraphLegend.tsx`
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeNodeDetailPanel.tsx`
- Modify: `packages/common-i18n/src/locales/*/knowledgeGraph.json` (all 10)

**Interfaces:**
- Consumes: `depth` on type nodes (Task 5), `ancestors`/`relatedCount` on the detail response (Task 7).

- [ ] **Step 1: Add the i18n keys**

To every locale file under `packages/common-i18n/src/locales/*/knowledgeGraph.json` — all ten currently hold English text, so add the English string in each:

```json
  "detail": {
    "path": "Path",
    "related": "{{count}} related knowledges",
```

- [ ] **Step 2: Indent the legend by depth**

The type list already arrives parents-before-children from the assembler. Indent each row and keep the fixed `h-6` height that `VISIBLE_ROWS` depends on:

```tsx
            <button
              key={type.id}
              type="button"
              onClick={() => onToggleType(type.id)}
              aria-pressed={!hidden}
              // paddingLeft, not a nested list: the row height must stay exactly
              // h-6 for the VISIBLE_ROWS cap above to mean what it says.
              style={{ paddingLeft: `${0.5 + type.depth * 0.75}rem` }}
              className={cn(
                'flex h-6 w-full items-center gap-2 rounded pr-2 text-left text-xs hover:bg-accent',
                hidden && 'opacity-40'
              )}
            >
```

A parent toggle already cascades — `hiddenClosure` in Task 8 expands the stored id to the subtree, so the store keeps holding just the id the user clicked.

- [ ] **Step 3: Render the breadcrumb and relation count**

In `KnowledgeNodeDetailPanel.tsx`, replace the single-type line:

```tsx
          {data?.ancestors && data.ancestors.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {t('knowledgeGraph:detail.path')}: {data.ancestors.map((a) => a.label).join(' / ')}
            </p>
          )}
          {Boolean(data?.relatedCount) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('knowledgeGraph:detail.related', { count: data?.relatedCount })}
            </p>
          )}
```

- [ ] **Step 4: Verify in the running app**

Run the app, open the knowledge graph, and confirm: child types are indented under parents; hiding a parent greys the whole subtree and removes its knowledges from the canvas; clicking a nested node shows a `Path` breadcrumb.

- [ ] **Step 5: Run checks and commit**

Run: `cd apps/nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

```bash
git add apps/nextjs-app/src/features/app/blocks/knowledge-graph/ packages/common-i18n/src/locales/
git commit -m "feat(knowledge-graph): show the type tree in the legend and ancestors in detail"
```

---

### Task 10: Remove `typeId`, split `truncated`

Every consumer has moved. This is the clean break the design called for.

**Files:**
- Modify: `packages/openapi/src/knowledge-graph/types.ts`
- Modify: `apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts`
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraph.tsx:147`
- Test: both spec files, plus the e2e

**Interfaces:**
- Produces: `IKnowledgeGraphNode` without `typeId`. `stats.truncated` becomes `{ nodes: boolean; links: boolean }`.

- [ ] **Step 1: Update the tests first**

In `knowledge-graph.assembler.spec.ts`, the empty-input case becomes:

```ts
    expect(graph.nodes[0]).toEqual({
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: OPTS.coreLabel,
      parentId: null,
      rootTypeId: null,
      depth: 0,
      degree: 0,
    });
    expect(graph.stats).toEqual({
      typeCount: 0,
      knowledgeCount: 0,
      orphanCount: 0,
      relationCount: 0,
      danglingRelations: 0,
      cyclesDropped: 0,
      maxDepth: 0,
      nodeCount: 1,
      linkCount: 0,
      truncated: { nodes: false, links: false },
    });
```

and the Task 6 truncation test asserts `truncated: { nodes: false, links: true }`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/`
Expected: FAIL — extra `typeId` key, and `truncated` is a boolean.

- [ ] **Step 3: Drop the field and split the flag**

Remove `typeId` from `knowledgeGraphNodeSchema` and from all four node emissions. Replace the stats field:

```ts
  truncated: z
    .object({
      nodes: z.boolean().meta({ description: 'The node budget dropped knowledges.' }),
      links: z.boolean().meta({ description: 'The link budget dropped relations.' }),
    })
    .meta({ description: 'Per-dimension truncation; structural links are never dropped.' }),
```

and in the assembler return `truncated: { nodes: truncated, links: relationsTruncated }`.

- [ ] **Step 4: Update the banner**

`KnowledgeGraph.tsx:147`:

```tsx
      {data?.stats.truncated.nodes && (
```

- [ ] **Step 5: Run everything**

Run:
```bash
cd apps/nestjs-backend && npx vitest run src/features/knowledge-graph/ && pnpm test-e2e -- knowledge-graph
cd ../nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/app/blocks/knowledge-graph --ext .ts,.tsx
```
Expected: all PASS. A `typeId` reference surviving anywhere shows up here as a typecheck error.

- [ ] **Step 6: Commit**

```bash
git add packages/openapi/src/knowledge-graph/types.ts apps/nestjs-backend/src/features/knowledge-graph/ apps/nextjs-app/src/features/app/blocks/knowledge-graph/ apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts
git commit -m "feat(knowledge-graph)!: drop typeId and split truncated per dimension"
```

---

### Task 11: Force tiers for the new links, then re-sweep

`knowledge-knowledge` is the first force in this graph that pulls **across** clusters — precisely what the organic-cluster retune was built to prevent. Until this task the new tiers fall through to `DEFAULT_LINK_DISTANCE`/`DEFAULT_LINK_STRENGTH`, which renders but does not look right.

**Files:**
- Modify: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/graphTheme.ts`
- Test: `apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.spec.ts`

**Interfaces:**
- Consumes: `KnowledgeLinkTier` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
describe('force tiers for v2 links', () => {
  it('holds a subtree tighter than it holds a peer relation', () => {
    expect(linkStrengthFor('type-parent')).toBeGreaterThan(linkStrengthFor('knowledge-knowledge'));
    expect(linkDistanceFor('knowledge-knowledge')).toBeGreaterThan(linkDistanceFor('type-parent'));
  });

  it('keeps a relation weaker than the link holding a leaf to its type, so relations bend the layout instead of dominating it', () => {
    expect(linkStrengthFor('knowledge-knowledge')).toBeLessThan(linkStrengthFor('type-knowledge'));
  });

  it('still falls back for an unknown tier', () => {
    expect(Number.isFinite(linkStrengthFor('not-a-tier'))).toBe(true);
    expect(Number.isFinite(linkDistanceFor('not-a-tier'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.spec.ts -t "force tiers"`
Expected: FAIL — both new tiers currently return the defaults, so the orderings do not hold.

- [ ] **Step 3: Add the entries**

```ts
export const LINK_DISTANCE: Record<KnowledgeLinkTier, number> = {
  'core-type': 260,
  'type-parent': 90,
  'type-knowledge': 32,
  'knowledge-knowledge': 140,
};
```

```ts
export const LINK_STRENGTH: Record<KnowledgeLinkTier, number> = {
  'core-type': 0.005,
  // Holds a subtree together, looser than a type holds its own leaves, so
  // nesting reads as nesting rather than as one merged cluster.
  'type-parent': 0.35,
  'type-knowledge': 0.7,
  // Long and weak on purpose. This is the only edge that crosses clusters, and
  // the cluster layout depends on repulsion staying local — a relation should
  // bend the arrangement, not drag two clusters into one.
  'knowledge-knowledge': 0.05,
};
```

- [ ] **Step 4: Run the test**

Run: `cd apps/nextjs-app && npx vitest run src/features/app/blocks/knowledge-graph`
Expected: PASS.

- [ ] **Step 5: Re-run the layout sweep**

Point the headless harness at the new tiers. It replays `d3-force-3d` — the same solver `three-forcegraph` uses — with the same force set, `alphaDecay` 0.015 and 220 ticks, over synthetic graphs at ~116 / ~410 / ~1006 nodes. Extend its graph builder to add nested types and a realistic density of relations (roughly 1 relation per 5 knowledges, some crossing clusters), then measure:

- **outward bias** — mean cosine between a leaf's offset from its type and that type's direction from the scene centre. Must stay in the 0.03–0.07 band it currently holds. Above ~0.2 the radial star is creeping back.
- **min type gap vs cluster radius** — currently ~111 against ~53. A ratio under about 1.5 means clusters are merging.

Expected: outward bias unchanged within the band. If it regresses, `LINK_STRENGTH['knowledge-knowledge']` is the first knob to lower — **not** `CHARGE_DISTANCE_MAX`, which is coupled to `LINK_DISTANCE['type-knowledge']` as documented in `graphTheme.ts`.

- [ ] **Step 6: Verify in the running app**

Load a base with nested types and relations. Confirm clusters still read as separate islands, subtrees sit near their parents, and related knowledges are pulled toward each other without collapsing their clusters together.

- [ ] **Step 7: Commit**

```bash
git add apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/
git commit -m "feat(knowledge-graph): tune forces for nested types and peer relations"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Storage: `parent_type`, `knowledge_type` conversion, `related_knowledge` | 4 |
| Single-type enforcement at field level | 7 |
| Migration pre-audit | 2 |
| Text fallback removal, `KNOWLEDGE_TYPE_FIELD_TYPES` narrowing | 7 |
| Contract v2 node shape, link tiers, version | 1, 10 |
| Stats v2 incl. per-dimension `truncated` | 6, 10 |
| `get-node.ts` ancestors + relatedCount | 7 |
| Cycle-breaking, determinism | 5 |
| Depth / rootTypeId | 5 |
| Core tethers roots only | 5 |
| Relation pair dedup, dangling, link budget | 6 |
| Frontend subtree filter | 8 |
| Colour by root + depth | 8 |
| Legend tree, detail breadcrumb, i18n | 9 |
| `siblingCount`, truncation banner | 8, 10 |
| Force tiers + sweep | 11 |
| Mastra typecast + link reads + tests | 3 |
