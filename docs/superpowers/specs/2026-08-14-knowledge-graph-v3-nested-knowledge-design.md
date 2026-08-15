# Knowledge graph v3: nested knowledge, and finishing the v2 field migration

Date: 2026-08-14
Status: implemented and verified end-to-end against the live base

Areas:

- `apps/nestjs-backend/src/features/knowledge-graph`
- `apps/nextjs-app/src/features/app/blocks/knowledge-graph`
- `packages/openapi/src/knowledge-graph`
- `apps/mastra-ai/src/mastra/tools/db-query/knowledges`

## Problem

Two problems, and only one of them is a code problem.

**1. The v2 field migration was never finished.** The v2 code shipped (commits
`57aea5b` … `10972b3`) and reads `knowledge_type.parent_type` and
`knowledge.related_knowledge` as *optional* fields. Neither field exists in the
live base. Verified against Postgres on 2026-08-14:

```
knowledge_type (tblWcq6Kof1AFHvbC5e)
  title, context, created_at, updated_at, deleted_at, is_active, id,
  knowledges   (link oneMany -> knowledges, symmetric of knowledge.knowledge_type)
  credentials  (singleLineText)
  -- no parent_type

knowledges (tblVTWb1kxXSFPBq4Fq)
  title, context, created_at, updated_at, deleted_at, is_active, id,
  knowledge_type   (link manyOne -> knowledge_type, two-way, sym fldtBWHVokGwcAywjtc)
  knowledge_parent (link manyOne -> knowledges,     two-way, sym fldKzPJEFtElf4liepG)
  knowledges       (link oneMany -> knowledges,     two-way, sym fldzUUVy3q1vSWURhZD)
  -- no related_knowledge
```

Because `resolveFields` treats both as `required: false`, the graph does not
fail — it silently reports a flat taxonomy with zero relations. `parentOf` is
all-null, `cyclesDropped`/`maxDepth`/`relationCount`/`danglingRelations` are
permanently 0, and every one of the nested-type and relation code paths added in
v2 is dead in production. The feature exists; nothing has ever exercised it.

Data today: **32 types, all roots. 64 knowledges, all typed, none nested.** The
taxonomy that *should* be nested is encoded in the titles instead —
`database - postgresql`, `database - clickhouse`, `deployment - caddy`,
`deployment - k8s`, `search engine - qdrant`, `credential_apikey`.

**2. `knowledge_parent` exists and nothing reads it.** Someone added a two-way
ManyOne self-link on `knowledges` (plus its symmetric `knowledges` child field).
It is not in the v2 design, not in any plan, and `grep` for
`knowledge_parent|parentKnowledge` across the repo returns zero hits outside the
database. The backend never projects it, the assembler has no tier for it, and
`IKnowledgeRow`'s doc comment explicitly forbids the idea:

> Standalone, NOT extending `IKnowledgeTypeRow`: a knowledge has no parent type
> of its own, it has a type.

That comment is now wrong, and this design is what overturns it.

## Decisions

**1. One hierarchy engine, applied twice.** `knowledge-type-tree.ts` already
implements exactly what nested knowledge needs — deterministic cycle-breaking,
memoised depth/root resolution, parents-before-children ordering. It is typed on
`IKnowledgeTypeRow` for historical reasons only; nothing in it is
type-specific. Generalising it to an `IHierarchyRow` shape and running it a
second time over knowledge rows is the whole feature. No new algorithm.

**2. A knowledge's parent knowledge wins over its type.** `parentId` is
single-valued in the node schema, and depth, `rootTypeId`, subtree filtering and
the force layout all assume a tree. A nested knowledge attaches to its parent
knowledge and draws no type edge; its own `knowledge_type` becomes metadata for
the detail panel. When the parent does not resolve — missing, soft-deleted,
truncated away by the node budget, or cut by cycle-breaking — the knowledge
falls back to its type bucket. That is the same "unresolvable parent is a root"
rule `breakCycles` already applies to types, and it comes for free.

**3. `rootTypeId` stays a *type* id at every depth.** `colorForNode`
(`graphTheme.ts:41-48`) hashes `rootTypeId` into a hue, so a whole subtree
sharing one id is what makes clusters legible. A nested knowledge resolves its
root by walking the knowledge chain to the root knowledge, taking that
knowledge's bucket, and taking the bucket's root type. Disclosed trade-off: a
knowledge filed under type X but nested under a Y-rooted parent renders in Y's
family. That is the correct reading of "nesting means belonging", and the record's
own type is still shown in the detail panel.

**4. Rejected: emitting both a knowledge-parent and a type-knowledge edge.**
Richer on paper, but `parentId` cannot hold two values, so `depth`, `rootTypeId`,
`hiddenClosure` and the radial force would each need an independent tie-break
rule. The v2 doc already rejected a DAG for the type taxonomy on exactly these
grounds ("nesting as normally meant is a tree"); the same reasoning applies one
tier down.

## Storage design

Two field creations. No new tables, no data conversion, nothing lossy.

| table | field | id | relationship | direction |
|---|---|---|---|---|
| `knowledge_type` | `parent_type` | `fld924GlXY0tL5um2wk` | self-Link, ManyOne | **one-way** |
| `knowledges` | `related_knowledge` | `fldz7U2RsCfm0j1RZOs` | self-Link, ManyMany | two-way |
| `knowledges` | `knowledge_parent` | `fldzUUVy3q1vSWURhZD` | self-Link, ManyOne | two-way, pre-existing |

All three exist in the live base as of 2026-08-14 and the graph endpoint serves
`version: 3` against them. Each was verified by writing a real cell, reading the
graph, and clearing it again — the ETag returned to `"kg3-aad769b4ace58bf4"`
each time.

**Known cruft:** `knowledge_type` also carries an orphaned `child_types`
(`fldehPY6CjjdpeK3H6j`, oneMany, empty) left by the rename described below. It is
inert — no code resolves that name — but it cannot be removed through the API
while its twin stays soft-deleted. Clearing `deleted_time` on
`fldhCf1NQf4Tl4VDFMN` would make a normal `DELETE …/field/fldehPY6CjjdpeK3H6j`
work and take both rows with it.

Both are additive and start empty. An empty `parent_type` means "root" and an
empty `knowledge_parent` means "top-level knowledge", so the graph renders
byte-identically to today until someone fills a cell in. There is no pre-audit
step and no irreversible conversion — unlike the v2 text→Link migration, this is
safe to run at any time.

### Two-way is fine — but the auto-created symmetric field is a trap

Two-way self-links work: `knowledge_parent` (long-established, two-way) accepts
a `PATCH …/record/{recordId}` write and populates both sides, verified directly
against the live base. What is *not* fine is leaving the auto-created symmetric
field alone, and the two tables need opposite treatment.

**`generateSymmetricField` names the symmetric side after the SOURCE table**
(`field-supplement.service.ts:1975`), de-duplicated by `getUniqName`. So:

**`parent_type` (ManyOne self-link) — create it ONE-WAY.** Two-way puts a
**multi-valued field literally called `knowledge_type` on the knowledge_type
table**. `DETAIL_SPECS` resolves `knowledge_type` by name, finds that one instead
of the knowledge table's real single-valued one, and fails every type-node detail
request:

```
GET /base/{baseId}/knowledge-graph/node/type:reccVgbTtiSGacQURZG
400  Field "knowledge_type" on table tblWcq6Kof1AFHvbC5e is multi-valued;
     a knowledge belongs to exactly one type
```

**Renaming that symmetric field is not the fix — it destroys the other half.**
Renaming `fldehPY6CjjdpeK3H6j` to `child_types` did clear the 400, but it also
set `deleted_time` on `parent_type` (`fldhCf1NQf4Tl4VDFMN`) — verified in the
`field` table. The surviving half then cannot be deleted or converted through the
API at all, because both operations look up the now-missing twin:

```
DELETE …/field/fldehPY6CjjdpeK3H6j  -> 404 "Field not found in ForeignTable"
PUT    …/field/fldehPY6CjjdpeK3H6j/convert -> 404 (same)
```

Worse, the failure is silent at the graph layer: `parent_type` is `required:
false`, so the taxonomy just reads flat again. **Create `parent_type` one-way and
never rename a self-link's symmetric field.** One-way creates no symmetric at
all, so there is nothing to collide and nothing to break.

**`related_knowledge` (ManyMany self-link) — do NOT rename anything.** A
self-referencing ManyMany is symmetric, so Teable creates the pair but exposes
only **one** usable field — and it is the *symmetric* row
(`fldz7U2RsCfm0j1RZOs`), not the one the create call returns
(`fldTvK8TAoC33yBFbqa`, which never appears in `GET …/field`). Renaming what
looks like "the symmetric side" therefore renames the only field there is, and
every write fails:

```
404 field.key_not_found  fieldKey: "related_knowledge"
    availableFieldKeys: [… "knowledges", "related_knowledge_peers"]
```

Renaming it back to `related_knowledge` restores it. The lesson generalises:
after creating any self-link, **list the table's fields and confirm the name the
backend resolves by is actually present** before writing anything.

### Field creation payloads (what to run on a fresh base)

```jsonc
// POST /api/table/tblWcq6Kof1AFHvbC5e/field
{ "name": "parent_type", "type": "link",
  "options": { "relationship": "manyOne",
               "foreignTableId": "tblWcq6Kof1AFHvbC5e", "isOneWay": true } }

// POST /api/table/tblVTWb1kxXSFPBq4Fq/field
{ "name": "related_knowledge", "type": "link",
  "options": { "relationship": "manyMany",
               "foreignTableId": "tblVTWb1kxXSFPBq4Fq", "isOneWay": false } }
// no rename — the exposed field must keep the name `related_knowledge`
```

Then `GET …/field` on both tables and confirm `parent_type` reads
`manyOne / multi=n` and `related_knowledge` is present by that exact name.
Creating a field is not evidence it is resolvable.

`knowledge_parent` (`fldzUUVy3q1vSWURhZD`) is left exactly as it was. Its
symmetric is named `knowledges`, which is vague but harmless: nothing in
`KNOWLEDGE_FIELD` resolves that name, so it cannot shadow anything. Renaming it
to `child_knowledges` for symmetry with `child_types` is optional polish.

### The e2e fixture uses one-way, and that is not a contradiction

`knowledge-graph.e2e-spec.ts` creates all three self-links `isOneWay: true`.
Writing a two-way self-link **created moments earlier in the same setup** silently
no-ops there — 200, `lastModifiedTime` bumped, cell empty — which looks like a
race in symmetric-field setup, since the identical write against the live base's
long-established two-way field persists. One-way sidesteps both that and the
`knowledge_type` collision, and the backend reads only the ManyOne side either
way, so the fixture exercises the same code path production does.

### Not in scope: backfilling the type hierarchy

The 32 flat type titles encode a hierarchy (`database - *`, `deployment - *`,
`credential_*`, `search engine - *`) that could be lifted into `parent_type`
automatically. Deliberately excluded — deciding which prefixes are real groups is
a judgement call about the taxonomy, not a mechanical transform, and the graph is
correct either way. Parents get filled in by hand.

## Contract v3

`KNOWLEDGE_GRAPH_VERSION` goes **2 → 3**. Adding a value to
`KnowledgeLinkTierValues` breaks every exhaustive `Record<KnowledgeLinkTier, …>`,
which is a non-additive change by the rule already written on that constant. The
ETag prefix becomes `kg3-`.

### Link tiers, extended

```ts
export const KnowledgeLinkTierValues = [
  'core-type',
  'type-parent',
  'type-knowledge',
  'knowledge-parent',   // new: a knowledge nested under another knowledge
  'knowledge-knowledge',
] as const;
```

`knowledge-parent` is **structural**, so it joins `core-type` / `type-parent` /
`type-knowledge` as a link the budget may never drop. Only relations truncate.

### Node shape, unchanged

No new node fields. `parentId` may now hold a `kn:` id and `depth` may exceed
`maxDepth + 1`; both are described in place:

- `parentId` — "a type points at its parent type (or core at a root), a
  knowledge at its parent knowledge, or at its type when it has no parent
  knowledge."
- `depth` — "0 at a root type; a root knowledge is its type + 1; a nested
  knowledge is its parent knowledge + 1."

Keeping the node payload fixed matters: 64 nodes today, up to 2000 at the cap,
and every added field is paid for on every node.

### Stats, extended

`cyclesDropped` and `maxDepth` keep their exact current meaning (types) and have
their descriptions tightened to say so. Two additions, so the knowledge
hierarchy is observable the same way the type hierarchy already is:

```ts
maxKnowledgeDepth: z.number().int().meta({
  description: 'Deepest knowledge-under-knowledge nesting level reached.' }),
knowledgeCyclesDropped: z.number().int().meta({
  description: 'knowledge_parent edges cut to keep the knowledge tree acyclic.' }),
```

Renaming the existing two to `typeCyclesDropped` / `maxTypeDepth` for symmetry
was considered and rejected: it churns the e2e snapshot and the assembler spec
for no behavioural gain, and the version bump does not make gratuitous breakage
free.

### Node detail

`ancestors` becomes the full root-first breadcrumb across both hierarchies:

```
[ root type … the root knowledge's type ] ++ [ root knowledge … parent knowledge ]
```

For an unnested knowledge this is byte-identical to today's output. `parentId` /
`parentLabel` remain "last entry of `ancestors`", which now correctly resolves to
the parent knowledge for a nested record.

## Assembler algorithm

The knowledge pass gains three steps and mirrors the type pass exactly.

**1. Generalise the hierarchy helpers.** `knowledge-type-tree.ts` currently takes
`IKnowledgeTypeRow[]`. Introduce the shape it actually needs:

```ts
export interface IHierarchyRow {
  recordId: string;
  title: string;
  parentRecordId: string | null;
}
```

`IKnowledgeTypeRow` becomes an alias for it. `IKnowledgeRow` now **extends** it —
`parentRecordId` is the parent *knowledge*, `typeRecordId` stays the type, so
nothing is modelled twice and the assembler comment that forbade this is
replaced. `breakCycles` and `resolveHierarchy` take `readonly IHierarchyRow[]`;
`orderDepthFirst` becomes `<T extends IHierarchyRow>(rows: T[], …): T[]`.
`byTitleThenId` already works on both. **No logic changes in this file.**

**2. Run the engine over the emitted knowledges.**

```ts
// `emitted` is already sorted with byTitleThenId — the precondition breakCycles
// documents. Passing the emitted (post-truncation) set is deliberate: breakCycles
// builds its `known` set from the rows it is given, so a parent dropped by the
// node budget resolves to null and the child falls back to its type bucket. The
// truncation fallback is the existing "unresolvable parent is a root" rule.
const { parentOf: knowledgeParentOf, cyclesDropped: knowledgeCyclesDropped } =
  breakCycles(emitted);
const { depthOf: knowledgeDepthOf, rootOf: knowledgeRootOf } =
  resolveHierarchy(knowledgeParentOf);
const orderedKnowledges = orderDepthFirst(emitted, knowledgeParentOf);
```

**3. Bucket only the root knowledges.** `bucketOf` is unchanged but is now
applied only where a type edge is actually drawn:

```ts
const isNested = (recordId: string) => knowledgeParentOf.get(recordId) != null;
const rowOf = new Map(emitted.map((row) => [row.recordId, row]));
// The bucket of the root of this knowledge's chain — for a root knowledge, its
// own bucket. This is what keeps rootTypeId a *type* id at every depth.
const anchorBucketOf = (recordId: string) =>
  bucketOf(rowOf.get(knowledgeRootOf.get(recordId) ?? recordId) as IKnowledgeRow);

for (const row of emitted) {
  if (isNested(row.recordId)) continue;   // nested rows draw no type edge
  const bucket = bucketOf(row);
  childCount.set(bucket, (childCount.get(bucket) ?? 0) + 1);
}
```

`orphanCount` therefore counts only *root* knowledges with no resolvable type. A
nested knowledge is neither bucketed nor an orphan, and `orphanCount <=
knowledgeCount` still holds.

**4. Node fields per knowledge**, with every unnested case reducing to today's
formula (`knowledgeDepthOf` is 0 for a root knowledge):

| field | value |
|---|---|
| `parentId` | `kn:<parent>` if nested, else `bucketOf(row)` |
| `rootTypeId` | `rootOfBucket(anchorBucketOf(row.recordId))` |
| `depth` | `depthOfBucket(anchorBucketOf(…)) + 1 + knowledgeDepthOf.get(id)` |
| `degree` | `1 + relationDegree + childKnowledgeCount` |

The `1` is still the node's own single structural edge, whether that edge points
at a type or at a parent knowledge. Nodes are emitted in `orderedKnowledges`
order so parents precede children, matching the type tier.

**5. Split `buildLinks`.** It already takes seven parameters with a comment
explaining that it exists to keep cognitive complexity in check; adding the
knowledge tier to it would defeat that. Split into `buildTypeLinks` (core-type,
type-parent, unclassified) and `buildKnowledgeLinks` (type-knowledge for roots,
knowledge-parent for nested). Both feed `structuralLinkCount`, so relations still
truncate around them and structural links are still never dropped.

New rest length beside the existing tier constants:

```ts
/** Tighter than type→knowledge: a nested knowledge should read as part of its
 *  parent's lobe, not as a sibling leaf of the type. */
const KNOWLEDGE_PARENT_DISTANCE = 50;
```

(The client discards `link.distance` and uses its own table — see below. The
backend constant is kept consistent for API consumers other than our canvas.)

## Backend service changes

| file | change |
|---|---|
| `knowledge-graph/types.ts` | `KNOWLEDGE_FIELD` gains `knowledgeParent: 'knowledge_parent'`. |
| `knowledge-graph.service.ts` | `GRAPH_KNOWLEDGE_SPECS` and `DETAIL_SPECS` gain `{ name: knowledgeParent, types: [FieldType.Link], required: false, singleValued: true }` — `required: false` so a base without the field keeps working, `singleValued` so a ManyMany misconfiguration fails loudly rather than silently dropping parents. `readKnowledges` projects it and reads it with the existing `extractLinkRecordId`. |
| `knowledge-graph.service.ts` (`getNode`) | Builds the knowledge breadcrumb (below). |

### `getNode` and the cross-endpoint agreement invariant

`getNode` already reads the **whole** type table on the detail path so its
breadcrumb agrees with the graph's cycle-breaking — the F3 regression documented
at `knowledge-type-tree.spec.ts:66-78` and fixed in `10972b3`. The knowledge
chain has the identical failure mode, so it gets the identical treatment:
`getNode` calls the existing `readKnowledges` and reuses `breakCycles` on the
result, rather than walking `knowledge_parent` with per-level `getRecord` calls.

```ts
const knowledges = await this.readKnowledges(knowledgeTableId);
const { parentOf: knowledgeParentOf } = breakCycles([...knowledges].sort(byTitleThenId));
// For a nested knowledge the type chain hangs off the ROOT of the knowledge
// chain, not off this record's own knowledge_type — the same anchor the
// assembler uses for rootTypeId, so the two endpoints agree.
```

Cost: one extra indexed query per detail click, projecting four small columns —
64 rows today, ≤2001 at the cap. That is the price of the agreement invariant,
and it is the same price the type table already pays. If the knowledge table
grows past the point where this is comfortable, the escape hatch is a recursive
CTE that walks only the ancestor chain, with a matching cycle rule — a change to
make deliberately, with the F3 test extended to cover it, not by accident.

## Frontend changes

The union extension produces **exactly two compile errors**, both in
`graphTheme.ts` — the `Record<KnowledgeLinkTier, number>` tables at `:113` and
`:146`. Everything else in the list below compiles cleanly and would be silently
wrong, which is why it is enumerated.

### 1. `utils/buildSimulationGraph.ts` — the load-bearing fix

`hiddenClosure` gates on `tier === 'type'` (`:34`) and `keep()` assumes a
knowledge's `parentId` is a type id (`:72`). With nesting, hiding a type would
drop its direct knowledges but keep every nested descendant — which then also
loses its edges at `:81-83` and floats disconnected.

The fix generalises the existing fixpoint rather than special-casing:

```ts
// Cascade over every non-core node, not just types: a hidden type must take its
// nested knowledges with it, transitively, exactly as it takes its child types.
const cascadable = nodes.filter((node) => node.tier !== 'core');
…
if (!hidden.has(node.id) && node.parentId && hidden.has(node.parentId)) { … }
```

`keep()` then collapses to one uniform rule:

```ts
const keep = (node: IKnowledgeGraphNode): boolean =>
  node.tier === 'core' || !hidden.has(node.id);
```

The closure may now contain `kn:` ids, and `KnowledgeGraphLegend` derives
`hiddenCount`/`allHidden` from the list it is handed (`:47-48`). So
`KnowledgeGraph.tsx:88-91` must intersect the closure with the type nodes it
already computes before passing it down — one `.filter`, and the legend's
contract is unchanged.

### 2. `utils/graphTheme.ts`

```ts
// Tighter and stiffer than type-knowledge (32 / 0.7): a nested knowledge should
// sit inside its parent's lobe rather than beside it.
LINK_DISTANCE['knowledge-parent'] = 24;
LINK_STRENGTH['knowledge-parent'] = 0.8;
```

The organic-clusters invariant applies: `CHARGE_DISTANCE_MAX = 110` must stay
above the cluster radius, and nesting grows that radius (32 + 24 = 56 from the
type node for one level, still comfortably clear). Retuning either value means
re-checking the pair, and the numbers above are starting values pending the
harness run below.

`NODE_VAL.knowledge` (`:102`) discards `degree`, so a parent knowledge renders
identically to a leaf and nesting gets no size cue. Make it degree-aware while
leaving leaves exactly where they are:

```ts
// degree 1 (a leaf: one structural edge, no children, no relations) is today's
// constant, so no existing node changes size.
knowledge: (degree) =>
  KNOWLEDGE_NODE_VAL * (1 + Math.min(Math.max(degree - 1, 0), 12) * 0.25),
```

`nodeVal` is volumetric, so a 12-child parent gains roughly 1.6× radius.

### 3. `KnowledgeGraphCanvas.tsx`

`LABELLED_TIERS = {core, type}` (`:92`) leaves every knowledge unlabelled,
including parents — which makes a nested group unreadable. Label knowledge nodes
that actually have children, derived from the links already in hand rather than
from a new payload field:

```ts
const parentKnowledgeIds = useMemo(
  () => new Set(graph.links.filter((l) => l.tier === 'knowledge-parent')
                          .map((l) => linkEndpointId(l.source))),
  [graph.links]
);
```

This finally gives `linkEndpointId` (`buildSimulationGraph.ts:109`) a production
caller — it is currently exported and tested with none.

### 4. `KnowledgeGraph.tsx` — sibling count

`siblingCount` (`:101-106`) matches on `parentId` alone, so it already counts a
type's child types as siblings of its knowledges. Nesting makes it worse. Add the
tier to the predicate: `node.parentId === focusedNode.parentId && node.tier ===
focusedNode.tier`.

### 5. Force harness

The organic-clusters doc pins the validation method: replay through headless
`d3-force-3d` and measure outward bias (target 0.03–0.07, was 0.81 before the
retune) and min-type-gap vs cluster radius, at 116 / 410 / 1006 nodes. A new
structural tier changes the force balance, so this is re-run with nested
knowledge in the fixture, and the two new constants are adjusted to hold the
existing bounds. **No force value ships unmeasured.**

## mastra-ai changes

Read-only, following the existing `parent_type` precedent on
`KnowledgeTypeFields` exactly:

```ts
// knowledge.ts — KnowledgeFields
/** Self-link to the parent knowledge, v3. Empty means this is a top-level knowledge. */
knowledge_parent?: LinkCell;
```

Read with `linkId()` from `link-cell.ts` (single-valued ManyOne). **No writer**,
and no `FIELD_IDS` entry — `CreateInput`/`UpdateInput` already omit `parent_type`
for the same reason, and nothing filters or orders by parent. Agent tools for
*setting* parents were already listed out of scope by v2 ("a separate piece of
work with its own prompt-design questions") and stay there.

The symmetric `knowledges` child field is deliberately not modelled: children are
derived from the parent map, per decision 1 of the v2 storage design.

## Testing

**`knowledge-graph.assembler.spec.ts`** — new `describe('nested knowledge')`,
mirroring the existing `describe('nested types')` block. The `knowledge` factory
(`:24-35`) gains a trailing `parentRecordId` parameter, so existing calls are
untouched. Cases:

- three-level chain: `parentId` / `rootTypeId` / `depth` per level, `maxKnowledgeDepth: 2`
- a nested knowledge draws **no** `type-knowledge` link, and its type bucket's
  `childCount` / `degree` excludes it
- `orphanCount` excludes nested knowledges even when their own type is unresolvable
- child's `knowledge_type` differs from its parent's → `rootTypeId` follows the
  parent's family (pins decision 3)
- parent truncated away by `maxKnowledgeNodes` → child falls back to its type
  bucket, is not orphaned, draws a `type-knowledge` link
- self-parent and 2-cycle → `knowledgeCyclesDropped`, same-edge determinism
- parents emitted before children
- degree counts child knowledges additively with relations
- the existing invariant sweep at `:201-221` extends from "every knowledge
  `parentId` resolves to an emitted type node" to "…to an emitted type **or
  knowledge** node"

**`knowledge-type-tree.spec.ts`** — factories re-typed to `IHierarchyRow`; the
F3 agreement regression (`:98-141`) gains a knowledge-chain case, since `getNode`
now walks a second hierarchy that can disagree the same way.

**`knowledge-graph.e2e-spec.ts`** — one `createField` for `knowledge_parent` on
`knowledgeTable` (`foreignTableId: knowledgeTable.id`, `Relationship.ManyOne`,
`isOneWay: false`), following the `related_knowledge` block at `:68-77`; one
`updateRecordByApi` after creation to nest `k-unset` under `k-active`; the stats
snapshot at `:159-173` updated with the new counters; the ETag regex moved to
`/^"kg3-[0-9a-f]{16}"$/` and `version === 3`. Add an assertion that the nested
record's `ancestors` breadcrumb spans both hierarchies.

**Frontend** — `buildSimulationGraph.spec.ts`: `hiddenClosure` cascades through a
knowledge chain; hiding a type removes its nested descendants and leaves no
edgeless survivors; the two new `graphTheme` tier entries resolve rather than
falling through to `DEFAULT_LINK_DISTANCE`.

## Rollout order

1. **Create `parent_type` and `related_knowledge`, then rename `parent_type`'s
   symmetric field to `child_types`** (and rename nothing on
   `related_knowledge` — see above). `knowledge_parent` is left untouched.
   Purely additive: the graph's ETag was byte-identical before and after
   (`"kg3-aad769b4ace58bf4"`), which is the check that the empty fields changed
   nothing. **Done 2026-08-14.**
2. **Generalise `knowledge-type-tree.ts`** to `IHierarchyRow`, with its spec. Pure
   refactor, no behaviour change, ships independently.
3. **Contract v3** — link tier, stats, version bump, descriptions.
4. **Assembler + service**, with the assembler spec.
5. **Frontend**, with the force-harness re-run.
6. **e2e**, then **mastra-ai** read support.

Steps 1 and 2 are safe on their own. Step 3 is the breaking one and must land
with 4 and 5 together, since the client reads no version guard.

## Risks

**1. The version bump is unguarded.** The client never reads `version` or `etag`
from `IGetKnowledgeGraphVo`. A backend on v3 serving a client on v2 hits
`linkDistanceFor`'s `??` fallback and renders `knowledge-parent` at
`DEFAULT_LINK_DISTANCE = 120` / strength `0.3` — wrong-looking, not broken. Both
ship from this monorepo, so this is a deploy-ordering note, not a design flaw.

**2. Deep nesting compounds the label problem.** v2 already flagged that deep
taxonomies clutter the label layer, and labelling parent knowledges (frontend
change 3) adds a second source. The fix, if it bites, is a depth cutoff on
*labelling* only — never on rendering.

**3. `getNode` now reads the knowledge table.** Bounded and indexed, but it is a
per-click cost that scales with the table rather than the ancestor chain.
Accepted deliberately to preserve the F3 agreement invariant; the recursive-CTE
escape hatch is described above.

**4. Colour inheritance will surprise someone.** A knowledge filed under
`database - postgresql` but nested under a `deployment`-rooted parent renders in
the deployment family. This is decision 3, taken on purpose; the detail panel
must therefore keep showing the record's own type, or the classification becomes
invisible.

**5. Two hierarchies, two cycle-break passes, one ETag.** Both passes must stay
deterministic or the digest churns between identical requests. The pre-sort
requirement `breakCycles` documents now applies in a second place, and it is a
precondition the type system cannot enforce — the spec case for it is not
optional.

**6. A silently-empty self-link column is indistinguishable from an unused one.**
Nothing in the stack separates "nobody has nested anything yet" from "every write
was accepted and discarded" — both read as `parentOf` all-null and a flat graph.
Two mechanisms can produce the second: a write to a freshly-created two-way
self-link (see the fixture note), and a rename that moves the field off the name
`KNOWLEDGE_FIELD` resolves by. After any schema change here, the cheap check is
to write one cell, read it back, and confirm the graph's ETag moved.

## Out of scope

- Backfilling `parent_type` from the `X - Y` title convention (see above).
- Writers for `knowledge_parent` — mastra-ai reads only, matching `parent_type`.
- Typed / directed / weighted relations, still deferred from v2.
- Multi-type membership for knowledge records, still explicitly decided against.
- `is_active`, still unread by the graph.
