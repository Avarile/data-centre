# Knowledge graph v2: nested types and knowledge-to-knowledge relations

Date: 2026-08-02
Status: approved, not yet implemented

Areas:

- `apps/nestjs-backend/src/features/knowledge-graph`
- `apps/nextjs-app/src/features/app/blocks/knowledge-graph`
- `apps/mastra-ai/src/mastra/tools/db-query`
- `packages/openapi/src/knowledge-graph`

## Problem

The knowledge graph is a tree pretending to be a graph. Three limits are baked
into the current design, each asserted independently in a different layer:

1. **No knowledge-to-knowledge edges.** The one thing a knowledge graph exists
   to express — that two concepts relate — cannot be represented at all.
2. **Flat taxonomy.** `knowledge_type` records have no relationship to each
   other, so a taxonomy of any depth has to be flattened into sibling types.
3. **One type per knowledge, enforced by silent truncation.**
   `extractTypeRecordId` in `knowledge-graph.service.ts` takes `raw[0]` of a
   multi-valued link cell and drops the rest, with the comment "the 3-tier star
   admits exactly one parent per knowledge node". A record already linked to two
   types loses one, invisibly.

A fourth problem is structural rather than functional: the node field `typeId`
does three unrelated jobs at once. It is the colour key (`colorForNode`), the
filter key (`buildSimulationGraph.keep`), and the parent pointer. Any change to
one of the three breaks the other two, which is most of why this redesign
touches so many files.

## Current design

There is no SQL schema. `knowledge` and `knowledge_type` are two **Teable user
tables** in a base, pinned by id in `apps/nestjs-backend/src/configs/knowledge.config.ts`:

| table | id | fields |
|---|---|---|
| `knowledge` | `tblVTWb1kxXSFPBq4Fq` | `title`, `context`, `is_active`, `deleted_at`, `knowledge_type` |
| `knowledge_type` | `tblWcq6Kof1AFHvbC5e` | `title`, `context`, `is_active`, `deleted_at` |

Fields are resolved **by name** at request time and asserted against expected
`FieldType`s (`knowledge-graph/types.ts`); no `fld…` id is hardcoded on the
backend. `knowledge_type` is accepted as either a Link or a plain-text title
column, and **in the live deployment it is plain text** — `apps/mastra-ai/src/
mastra/tools/db-query/knowledges/knowledge.ts` types it `string` and documents
it as "stores the title of the linked knowledge_type record". The backend
resolves it back to a record id through a title→id map built in `getGraph`.

The graph shape is decided in exactly one place, `knowledge-graph.assembler.ts`,
which emits a 3-tier star: a synthetic `core` node linked to every type, and
each type linked to its knowledges. Knowledge nodes get `degree: 1` hardcoded.

## Decisions

Three forks were settled before this document was written.

**Type nesting is a strict tree.** Each type has at most one parent, so types
form a forest. A DAG was considered and rejected: colour-by-root-ancestor
becomes ambiguous when a type has two roots, subtree filtering degrades from a
walk to a reachability query, and cycle detection gets materially more
expensive. Nesting as normally meant is a tree.

**A knowledge belongs to exactly one type, enforced rather than truncated.**
Allowing many types was considered. Keeping one keeps colour and filtering
trivial, and nesting already supplies the expressiveness that multi-typing would
have added. The important change is that the constraint becomes *checked*: the
silent `raw[0]` truncation is deleted, not moved.

**Knowledge-to-knowledge links are plain symmetric associations.** No label, no
weight, no direction. A typed-relations table (`kind`, `weight`, direction) was
considered and deferred: it is a new table, a new CRUD surface, new mastra
tools, and directed arrows plus per-kind colour in the renderer. Adding it later
is additive.

## Storage design

Three field changes. No new tables.

| table | field | change | relationship | direction |
|---|---|---|---|---|
| `knowledge_type` | `parent_type` | **new** | self-Link, ManyOne | one-way |
| `knowledge` | `knowledge_type` | **converted** | Link, ManyOne | one-way |
| `knowledge` | `related_knowledge` | **new** | self-Link, ManyMany | **two-way** |

Teable supports self-referencing links in all four relationship kinds, one-way
and two-way; `field-duplicate.service.ts` handles them explicitly
(`selfLinkFields`, and "two-way self link field should only create one of it").

**`parent_type` is one-way on purpose.** A two-way link would create a symmetric
`child_types` field, which is a second stored representation of the same edge —
two places to disagree. Children are derived by inverting the parent map in one
pass, which the assembler has to do anyway to compute degrees.

**`related_knowledge` is two-way on purpose.** The relation is symmetric: if A
relates to B then B relates to A, and a one-way field would make that true only
when read from A. Teable maintains both sides. The assembler therefore sees each
pair twice and must emit one undirected edge per **unordered** pair, canonicalised
by ordering the two record ids — otherwise every association renders as two
coincident edges and double-counts in `degree`.

**Single-type enforcement** goes in the existing `resolveFields` assertion path
in `knowledge-graph.service.ts`, which already fails loudly on a wrong field
type. If `knowledge_type` resolves with `isMultipleCellValue === true`, the
request fails with a 400 naming the field. That is a schema misconfiguration,
caught once at field level — and because a single-valued Link cell cannot hold
two entries, no per-record error path is needed. `extractTypeRecordId` loses its
array branch entirely.

### `is_active`

Untouched and still unread by the graph, as documented in
`knowledge-graph/types.ts`. Out of scope here.

## Migration

The `knowledge_type` column is plain text today and holds titles. Converting it
to a Link is a data migration with a real failure mode: Teable matches on title,
and any title that matches no existing type silently empties the cell, moving
that record into the Unclassified bucket.

The migration is therefore three ordered steps, and the audit is not optional:

1. **Pre-audit.** List distinct `knowledge.knowledge_type` values that match no
   `knowledge_type.title`, and the count of records behind each. Fix or accept
   each one *before* converting. Run this as a read-only script; do not convert
   and inspect afterwards, because the original titles are gone once the cells
   empty.
2. **Convert** `knowledge_type` from `SingleLineText` to `Link` (ManyOne,
   one-way, foreign table `tblWcq6Kof1AFHvbC5e`).
3. **Add** `parent_type` and `related_knowledge`. Both start empty; an empty
   `parent_type` means "root", which is the correct reading of a taxonomy that
   has not been nested yet. The graph renders exactly as it does today until
   someone fills them in.

Steps 2 and 3 are field operations through the normal Teable field API, not SQL.

After step 2, `KNOWLEDGE_TYPE_FIELD_TYPES` in `knowledge-graph/types.ts` narrows
from `[Link, SingleLineText]` to `[Link]`, and the plain-text fallback path —
`titleToRecordId`, the `typeof first === 'string'` branch in
`extractTypeRecordId`, and the matching branch in `describeLink` — is deleted.
Keeping a dead text fallback around would mean a renamed type silently orphans
its children, which is the failure the Link conversion exists to remove.

## Contract v2

`KNOWLEDGE_GRAPH_VERSION` goes 1 → 2 in `packages/openapi/src/knowledge-graph/types.ts`.
A clean break, not an additive change: the only client is in this repo, and
carrying both shapes would double every branch in the assembler and the
simulation builder.

### Node tiers, unchanged

```
core | type | knowledge
```

`core` survives, but its role narrows — see "The core node" below.

### Link tiers, extended

```
core-type · type-parent · type-knowledge · knowledge-knowledge
```

### Node shape

`typeId` is retired and its three jobs split:

```ts
{
  id:         string,          // core | type:<recordId> | kn:<recordId>
  recordId:   string | null,   // null for synthetic nodes
  tier:       'core' | 'type' | 'knowledge',
  label:      string,
  parentId:   string | null,   // type -> parent type (or core at a root); knowledge -> its type
  rootTypeId: string | null,   // top ancestor type; a root type is its own. THE COLOUR KEY
  depth:      number,          // 0 at root types; knowledge = its type's depth + 1
  degree:     number,          // real: child types + child knowledges + relations
}
```

- `parentId` carries structure.
- `rootTypeId` carries colour, so a whole subtree shares a hue family.
- Filtering derives from the `parentId` closure, computed client-side.
- `degree` stops being hardcoded `1` for knowledge nodes, which matters because
  `nodeValFor` sizes type nodes by degree and would otherwise mis-size them once
  a type has both child types and child knowledges.

### Link shape

Unchanged fields (`source`, `target`, `tier`, `value`, `distance`), with two new
tiers flowing through them. `knowledge-knowledge` edges carry `value: 1`.

### Stats

```ts
{
  typeCount, knowledgeCount, orphanCount,
  relationCount,       // knowledge-knowledge edges emitted, after pair dedup
  maxDepth,            // deepest type nesting reached
  cyclesDropped,       // parent_type back-edges removed
  danglingRelations,   // relations pointing at a record not in the emitted set
  nodeCount, linkCount,
  truncated: { nodes: boolean, links: boolean },
}
```

`truncated` changing from `boolean` to an object is the one stats change that
breaks a caller: `KnowledgeGraph.tsx:147` renders a banner from it.

### Node detail (`get-node.ts`)

`getKnowledgeGraphNodeVoSchema` gains, replacing the flat `typeId`/`typeLabel` pair:

```ts
{
  ...existing,
  parentId:    string | null,
  parentLabel: string | null,
  ancestors:   { id: string; label: string }[],  // root-first breadcrumb, excludes self
  relatedCount: number,                          // knowledge tier only; 0 for types
}
```

`ancestors` is what makes a deep taxonomy navigable from the detail panel — with
nesting, "type: Databases" alone no longer tells you where you are.

## Assembler algorithm

`knowledge-graph.assembler.ts` stays the single pure place where graph shape is
decided, and stays the only backend unit under test. It grows four steps.

**1. Break cycles in `parent_type`.** User data, so `A→B→A` is reachable, as is
`A→A`. Types are processed in the existing sorted order (`byTitleThenId`); each
is walked up through parents with a visited set, memoised across walks. The edge
that closes a cycle is dropped and that type becomes a root. Sorted processing
makes the *same* edge drop every run, which keeps the payload — and therefore
the ETag digest computed in `getGraph` — stable across requests. Counted in
`stats.cyclesDropped`.

A parent pointing at a soft-deleted or absent type is the same case: treat as
root. That mirrors how an unresolvable `knowledge_type` is treated today.

**2. Compute `depth` and `rootTypeId`.** One memoised walk up the now-acyclic
parent map. `maxDepth` falls out of it.

**3. Emit structural links.** `core→root types` only, `type-parent` for every
surviving parent edge, `type-knowledge` for every emitted knowledge.

**4. Emit relations.** For each emitted knowledge, read its `related_knowledge`
ids; drop any endpoint not in the emitted set (counted in
`stats.danglingRelations`); canonicalise each pair by ordering the two record
ids; dedupe; sort deterministically; then truncate to the link budget.

### The core node

Retained, still never drawn, still the `recenterOnCore` target. Its role narrows
from "parent of every type" to "tether for root types only", so `core-type`
links equal the root count rather than the type count.

It stays for the reason documented in `buildSimulationGraph.ts`: three-forcegraph
filters only its render digest by visibility while feeding every node to the
simulation, so an invisible core keeps otherwise-disconnected branches in one
component. Knowledge-to-knowledge relations will connect *some* branches, but
nothing guarantees the graph is connected, so the tether is still load-bearing.

### Unclassified

Unchanged in spirit: a synthetic root type (`depth: 0`, `parentId: core`,
`rootTypeId` itself) holding knowledges with no resolvable type. It is emitted
only when it has children, as today.

### Budgets

`maxKnowledgeNodes` (default 2000) keeps its meaning and its
`take: budget + 1` truncation probe. A second budget joins it in
`knowledge.config.ts`:

```
KNOWLEDGE_GRAPH_MAX_LINKS, default 6000
```

Relations are superlinear in a way nodes never were — one well-connected hub can
contribute hundreds of edges — and the renderer's cost is per-link. Structural
links (`core-type`, `type-parent`, `type-knowledge`) are **never** dropped: the
taxonomy must stay intact or the layout loses its skeleton. Only relations are
truncated, and `truncated.links` reports it.

## Backend changes

`apps/nestjs-backend/src/features/knowledge-graph/`

| file | change |
|---|---|
| `types.ts` | `KNOWLEDGE_FIELD` gains `parentType: 'parent_type'`, `relatedKnowledge: 'related_knowledge'`. `KNOWLEDGE_TYPE_FIELD_TYPES` narrows to `[FieldType.Link]`. |
| `knowledge-graph.service.ts` | `GRAPH_TYPE_SPECS` projects `parent_type`; `GRAPH_KNOWLEDGE_SPECS` projects `related_knowledge`; `DETAIL_SPECS` projects both. `extractTypeRecordId` loses its array and string branches and becomes a single-link reader shared by both tables. `describeLink` is replaced by an ancestor-chain walk. `resolveFields` asserts `knowledge_type.isMultipleCellValue === false`. `readTypes`/`readKnowledges` return the new columns. `titleToRecordId` is deleted. |
| `knowledge-graph.assembler.ts` | The four steps above. |
| `knowledge-graph.assembler.spec.ts` | Extended — see Testing. |

`IKnowledgeTypeRow` gains `parentRecordId: string | null`; `IKnowledgeRow`
gains `relatedRecordIds: string[]`.

Note that `getNode`'s ancestor walk needs the full type table, not just the one
record — it resolves a chain. That is a second read on the detail path, which is
acceptable: the detail endpoint is one record at a time and already reads
`context`, the largest column.

## Frontend changes

`apps/nextjs-app/src/features/app/blocks/knowledge-graph/`

| file | change |
|---|---|
| `utils/buildSimulationGraph.ts` | `keep()` becomes a subtree closure: build the descendant set of `hiddenTypeIds` once from `parentId`, then drop any node whose id or `parentId` chain is in it. Links survive only when both endpoints do — already true structurally, now load-bearing for relations. |
| `utils/graphTheme.ts` | `colorForNode` keys the hue off `rootTypeId` and varies lightness by `depth`. `LINK_DISTANCE` and `LINK_STRENGTH` gain `type-parent` and `knowledge-knowledge`. |
| `KnowledgeGraphLegend.tsx` | Flat list → indented tree ordered by `depth`; toggling a parent cascades to its subtree. `VISIBLE_ROWS`/`ROW_HEIGHT` sizing still applies, now over a flattened tree. |
| `KnowledgeNodeDetailPanel.tsx` | Renders the `ancestors` breadcrumb instead of a single `typeLabel`, plus `relatedCount`. |
| `KnowledgeGraph.tsx` | `siblingCount` (lines 83–86) switches `typeId` → `parentId`. The truncation banner (line 147) reads `stats.truncated.nodes`. |
| `KnowledgeGraphCanvas.tsx` | `LABELLED_TIERS` unchanged (core + type). No force-effect change: the tier-keyed `*For` helpers already route new tiers through the same code path. |
| `useKnowledgeGraphStore.ts` | Unchanged. `hiddenTypeIds` keeps its exclusion semantics; the closure is computed in `buildSimulationGraph`, not stored — storing it would need an effect to keep it in sync with the graph. |
| `KnowledgeNodeSearch.tsx` | Unchanged; it reads only `tier` and `label`. |
| `KnowledgeGraphToolbar.tsx` | Unchanged; reads `typeCount` and visible counts. |

## Layout and forces

`knowledge-knowledge` is the first force in this graph that pulls **across**
clusters, which is precisely what the clustering retune of the same date was
built to prevent (see
`2026-08-02-knowledge-graph-organic-clusters-design.md`). Two related knowledges
in different type clusters will drag those clusters together.

Starting values, to be confirmed by sweep rather than by eye:

| tier | distance | strength | reasoning |
|---|---|---|---|
| `type-parent` | 90 | 0.35 | Holds a subtree together, looser than a type holds its own leaves so nesting reads as nesting. |
| `knowledge-knowledge` | 140 | 0.05 | Long and weak: relations should *bend* the layout, not dominate it. |

The headless harness used for the clustering work re-points at the new tiers in
about a minute: it replays `d3-force-3d` with the same force set and measures
outward bias, closest-type-pair distance, and cluster radius. Re-run it once the
new tiers exist and confirm outward bias has not regressed from its current
0.03–0.07. `CHARGE_DISTANCE_MAX` (110) and the `core-type` tether (0.005) are
the two knobs most likely to need adjusting, and they are coupled to
`LINK_DISTANCE['type-knowledge']` as documented in `graphTheme.ts`.

## mastra-ai changes

This is the coupling most likely to be missed, because nothing in the backend or
frontend references it. The AI agent reads and writes `knowledge_type` **as a
plain title string**. Converting the column to a Link breaks both paths, so
these change in the same commit as the migration — not as a follow-up.

`apps/mastra-ai/src/mastra/`

| file | change |
|---|---|
| `tools/db-query/teable-client.ts` | `teableCreate` and `teableUpdate` send `typecast: true`. This is the whole reason the write path can stay title-based: Teable's record API coerces a title string into a link cell when `typecast` is set (`packages/openapi/src/record/get.ts:26`). Without it every write to `knowledge_type` fails after the conversion. |
| `tools/db-query/knowledges/knowledge.ts` | `KnowledgeFields.knowledge_type` changes from `string` to the link cell shape `{ id: string; title?: string }` **on read**, while create/update inputs stay `string` and rely on typecast. `listKnowledgesByType` (line 75) filters `FIELD_IDS.knowledge_type` with `operator: 'is', value: typeName` — against a Link field that comparison must target the linked record's title or id per Teable's link filter semantics; verify against the running instance before relying on it. Gains `related_knowledge`. |
| `tools/db-query/knowledges/knowledge-type.ts` | `KnowledgeTypeFields` gains `parent_type`. Same read/write asymmetry. |
| `tools/db-query/knowledges/knowledge-service.ts` | `getKnowledgesWithType` (line 61) resolves the type via `typeByTitle.get(knowledge.fields.knowledge_type)` — a title lookup that becomes an id lookup, which is strictly better: it stops depending on title uniqueness. `createKnowledgeWithType` keeps passing a title, now carried by typecast. |
| `tools/db-query/db-search-tools.ts` | Lines 52 and 135 do `String(r.fields.knowledge_type)` — on a link cell that stringifies to `[object Object]`. Both must read `.title`. The zod result schemas at lines 13 and 20 stay `z.string().optional()`; only the extraction changes. |
| `tools/db-query/db-create-tools.ts` | Line 39 description unchanged in behaviour; auto-creating the type still works through `ensureKnowledgeType`. |
| `tools/db-query/db-update-by-id-tools.ts` | Line 35 keeps `knowledge_type: z.string()` — the agent still speaks titles. |
| `agents/knowledge-agent-non-rag.ts` | Lines 103 and 116 describe `knowledge_type` in the system prompt; wording only. |
| `tests/knowledges/knowledge.test.ts`, `tests/knowledges/knowledge-service.test.ts` | Fixtures at `knowledge.test.ts:40,110` and `knowledge-service.test.ts:43,94,124,132,150,162,180` all use `knowledge_type: 'Technical'` as a bare string. Read fixtures become link cells; write assertions gain `typecast: true`. |

Optionally, the agent gains tools for the new fields (`set-parent-type`,
`relate-knowledges`). Not required for the migration and deliberately not
specified here — it is a separate piece of work with its own prompt-design
questions.

## Testing

**`knowledge-graph.assembler.spec.ts`** (currently 224 lines) is where the new
logic earns its keep, because the assembler is pure:

- a two-level and a three-level type tree: `depth`, `rootTypeId`, `parentId`
- a type with both child types and child knowledges: `degree` counts both
- self-parent (`A→A`) and a 2-cycle and a 3-cycle: back-edge dropped, node
  becomes a root, `cyclesDropped` accurate, and — the important one — **the same
  edge is dropped across repeated runs**, since the ETag depends on it
- parent pointing at a missing type: treated as root, not dropped
- a symmetric relation appearing in both records' cells: emitted **once**
- a relation to a record dropped by the node budget: not emitted,
  `danglingRelations` incremented
- link budget exceeded: structural links all survive, relations truncated,
  `truncated.links` true, `truncated.nodes` false
- unclassified bucket still emitted only when non-empty

**`buildSimulationGraph.spec.ts`** gains subtree-hiding: hiding a parent hides
grandchildren; hiding a leaf type leaves siblings alone; a relation is dropped
when either endpoint is hidden.

**`knowledge-graph.e2e-spec.ts`** (202 lines) needs its fixture tables extended
with the three fields, plus one nested type and one relation, and the
`typeId` → `parentId`/`rootTypeId` assertions updated.

**Not tested by unit tests:** the force values, as before. They are verified by
the headless replay harness described above.

## Rollout order

Each step leaves the system working.

1. **Contract v2** in `packages/openapi` — types only; nothing consumes the new
   fields yet.
2. **Pre-audit script** and its output reviewed. Blocking: step 3 is lossy
   without it.
3. **Field migration** (convert `knowledge_type`, add `parent_type` and
   `related_knowledge`) **and mastra-ai changes together**. These two cannot be
   separated: the moment the column becomes a Link, the agent's reads return
   objects and its writes fail without `typecast`.
4. **Backend**: service + assembler + specs.
5. **Frontend**: simulation builder, theme, legend, detail panel.
6. **Force sweep** and final tuning.

## Risks

**The text→Link conversion is lossy and irreversible in place.** Titles that
match nothing empty their cells, and the original strings are not recoverable
afterwards. Mitigated only by the pre-audit in step 2 — which is why it is a
blocking step and not a suggestion.

**mastra-ai fails silently rather than loudly.** `String(r.fields.knowledge_type)`
on a link cell yields `[object Object]`: a search tool that returns plausible
nonsense to an LLM rather than throwing. Grep for `knowledge_type` across
`apps/mastra-ai` after the migration and confirm every read goes through
`.title`.

**`listKnowledgesByType`'s filter semantics against a Link field — RESOLVED, and
it was a real bug.** This was the one item flagged as needing a running instance.
It did not: reading the server settles it. A Link field is `cellValueType String`
+ `dbFieldType Json`, which routes to the JSON cell-value filter
(`filter-query.abstract.ts:251-255`), whose `is` handler for a link is
`jsonb_extract_path_text(cell, 'id') = ?`
(`postgres/cell-value-filter/single-value/json-cell-value-filter.adapter.ts:47-51`).
It compares the RECORD ID and never the title.

So filtering that column with a title matches nothing. Before the migration the
column is text and the filter works; after it, `listKnowledgesByType` and the
agent's `list-knowledges` tool return an empty list with no error — the agent
reports "no knowledges of that type". Silent wrong answers to an LLM are the
worst failure mode available here, and the bug is dormant until the migration
runs, which is exactly when nobody is looking for it.

Fixed by resolving the title to a type record id and filtering on the id.

**Relations undo the cluster layout.** Cross-cluster edges pull clusters
together, which is the exact force the clustering work removed. The starting
strength of 0.05 is a guess pending the sweep; if the layout regresses, the
relation strength is the first knob, not `CHARGE_DISTANCE_MAX`.

**Deep taxonomies clutter the label layer.** `LABELLED_TIERS` labels every type,
which was bounded at ~50 in a flat taxonomy. A deep tree can carry many more, and
each `SpriteText` is a texture plus a draw call. If it bites, the fix is a depth
cutoff on labelling, not on rendering.

## Out of scope

- Typed/directed/weighted relations and the `knowledge_relation` table. The
  contract change here is compatible with adding them later: a `kind` and
  `weight` on the link shape would be additive.
- `is_active`, still unread by the graph.
- New mastra agent tools for setting parents and relations.
- Multi-type membership for knowledge records — explicitly decided against.
