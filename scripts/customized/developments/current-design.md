# Knowledge Graph 3D — Design

## Overview

A full-screen 3D force-directed view of the knowledge taxonomy held in the `knowledges` and
`knowledge_type` Teable tables, rendered as a **3-tier star**:

```text
                        knowledge_core            (tier 0 — synthetic, always exactly one)
                       /      |       \
              type:rec1   type:rec2   type:__unclassified__   (tier 1 — one per knowledge_type row)
              /   |   \       |                  |
           kn:a  kn:b kn:c   kn:d               kn:e          (tier 2 — one per knowledges row)
```

Three layers, in dependency order:

| Layer | Location | Delivers |
|-------|----------|----------|
| Contract | `packages/openapi/src/knowledge-graph/` | zod schemas, registered OpenAPI routes, typed axios clients |
| Backend | `apps/nestjs-backend/src/features/knowledge-graph/` | reads both tables, assembles the graph, serves it with an ETag |
| Frontend | `apps/nextjs-app/src/features/app/blocks/knowledge-graph/` | react-query + zustand + `react-force-graph-3d` canvas |

**In scope:** graph endpoint, node-detail endpoint, 3D canvas, type-filter legend, node
typeahead, detail panel, toolbar (auto-rotate / fullscreen / reset / counts).

**Out of scope** (present in the reference app, deliberately dropped): the terminal module, the
AI terminal overlay, and the `mock-state-control` simulation harness.

**Reference:** `/home/avarile/Documents/codeRepo/ai-agent-cluster/frontend/app/data-links-modal`.
Its `ForceGraph.tsx` is the visual and interaction model. It is **not** copied verbatim — three of
its behaviours are defective and are corrected here (§7.4 auto-rotate, §7.6 sprite disposal,
§7.7 staged load). Its 1050-node / 1663-link dataset is the empirical proof that this node budget
renders acceptably.

---

## 1. Data model and source of truth

### 1.1 The two tables

Both are Teable tables in this instance's **data plane** — not Prisma models. They are read
through `RecordService`, never through a Prisma model class.

| Table | Table ID | Fields |
|-------|----------|--------|
| `knowledge_type` | `tblWcq6Kof1AFHvbC5e` | `title` (`fldvL1LqKmEAfNKVBCO`), `context`, `is_active`, `deleted_at`, `created_at`, `updated_at` |
| `knowledges` | `tblVTWb1kxXSFPBq4Fq` | `title` (`fldROFj15OlD8COVxX0`), `context`, `is_active`, `deleted_at`, **`knowledge_type`** (`fldAEK8ULw9urxE0qiF`), `created_at`, `updated_at` |

Only `title` and `knowledge_type` field IDs are recorded anywhere in this repo
(`apps/mastra-ai/src/mastra/tools/db-query/knowledges/*.ts`). The remaining field IDs are **not**
known, so the backend resolves **all** field IDs by name at request time and asserts their types
(§2.3). Nothing hardcodes a `fld…` constant.

### 1.2 The `knowledge_type` cell shape — the load-bearing detail

`apps/mastra-ai/.../knowledge.ts:26` types this field as `string` with the comment *"Stores the
title of the linked knowledge_type record"*. **That annotation is wrong for the default
`cellFormat: 'json'`.** A Link cell decodes to `ILinkCellValue`:

```ts
// packages/core/src/models/field/derivate/link.field.ts:14
export const linkCellValueSchema = z.object({
  id: z.string().startsWith(IdPrefix.Record),
  title: z.string().optional(),
});
```

and it is a **single object** when the relationship is many-one, or a **non-empty array** when it
is one-many / many-many (`link.field.ts:21-27`). Which one applies here is not recorded in the
repo, and the field could in principle be plain text in some environment.

The extractor therefore handles all three shapes and never assumes (§2.4). Getting this wrong
does not throw — it silently makes **100% of knowledges orphans**, which is why it is called out
here rather than left to the implementer.

### 1.3 Soft delete, and why `is_active` is ignored

**Decision: `deleted_at isEmpty` is the only filter. `is_active` is not read at all** — not as a
filter, not as a projected field, not as a rendered attribute. Every non-deleted row becomes a
node regardless of its `is_active` value.

This is a product decision, and it is also the safe one. Checkbox cells persist `false` as `NULL`:

```ts
// apps/nestjs-backend/src/features/field/model/field-dto/checkbox-field.dto.ts
convertCellValue2DBValue(value: unknown): unknown {
  return value ? true : null;   // false is never stored
}
```

So `{ fieldId: is_active, operator: 'is', value: true }` compiles to `col = true` and would
**exclude every record whose checkbox was never touched** — the default for anything created via
the record API or a CSV import. `NULL` is indistinguishable from an explicit `false`, so no filter
built on this column can tell "never set" from "deactivated". Ignoring the column sidesteps that
ambiguity entirely.

Consequences that follow through the rest of the design:

- No `isActive` field on the node or node-detail schemas (§3.2, §3.4).
- No `is_active` in the read projection or the field-resolution specs (§2.3, §2.4).
- No `showInactive` toggle in the view store and no opacity ramp in the renderer (§5.3, §7.1).

Should activity ever need surfacing, it is an additive contract change — a new optional field plus
a renderer branch — not a rework.

The soft-delete filter, in Teable's filter DSL:

```ts
const notDeleted: IFilter = {
  conjunction: 'and',
  filterSet: [{ fieldId: deletedAtFieldId, operator: 'isEmpty', value: null }],
};
```

`isEmpty` requires `value: null` — `packages/core/src/models/view/filter/filter-item.ts:97,151`
rejects a non-null value for unary operators.

### 1.4 Node identity and tiers

Node IDs are namespaced so they are globally unique across two tables plus synthetic nodes:

| Node | ID | Tier | `recordId` |
|------|-----|------|-----------|
| Core | `core` | `core` | `null` |
| Type | `type:<recordId>` | `type` | the `knowledge_type` record ID |
| Unclassified bucket | `type:__unclassified__` | `type` | `null` |
| Knowledge | `kn:<recordId>` | `knowledge` | the `knowledges` record ID |

Tiers are a **const object plus a union type, not a TypeScript `enum`**. Enums are nominal: a
`KnowledgeNodeTier` declared in `@teable/openapi` and re-declared in the frontend would not be
mutually assignable, and every `Record<Tier, number>` lookup would need a cast. A const object is
structural, so backend, contract and frontend share one definition with no casts.

### 1.5 Orphan handling

A knowledge row whose `knowledge_type` is empty, unresolvable, or points at a soft-deleted type is
bucketed under the synthetic **`type:__unclassified__`** node, which links to core like any other
type node.

Chosen over linking orphans straight to core because it preserves the invariant **every tier-2
node has exactly one tier-1 parent**. The frontend's type filter, legend, colour derivation and
camera logic all rely on that invariant; direct core→knowledge links would require a third link
tier and a special case in each. There is deliberately **no `core-knowledge` link tier**.

The Unclassified node is emitted **only when it actually holds a child after the node budget is
applied** (§2.5), so truncation can never leave a childless placeholder branch.

---

## 2. Backend — `knowledge-graph` feature module

### 2.1 File tree

Flat feature-module layout (`module` / `controller` / `service` colocated), matching
`features/dashboard` and `features/pin`. No `open-api/` sub-directory — that split is only used
when a feature already has a core service consumed by share-db or the calculation engine
(`features/record`, `features/aggregation`), which this does not.

```text
apps/nestjs-backend/src/
├── configs/
│   └── knowledge.config.ts                        NEW
└── features/knowledge-graph/
    ├── knowledge-graph.module.ts                  NEW
    ├── knowledge-graph.controller.ts              NEW
    ├── knowledge-graph.service.ts                 NEW
    ├── knowledge-graph.assembler.ts               NEW  (pure, no Nest imports)
    ├── knowledge-graph.assembler.spec.ts          NEW
    └── types.ts                                   NEW  (field-name constants + row DTOs)
```

### 2.2 Configuration

Table IDs must be overridable per environment. Follows the `registerAs` + `Inject` helper +
`ConfigType` alias convention of `configs/base.config.ts`, whose `templateSpaceId` is the existing
precedent for injecting a well-known resource ID from the environment.

```ts
// apps/nestjs-backend/src/configs/knowledge.config.ts
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

export const knowledgeConfig = registerAs('knowledge', () => ({
  knowledgeTableId: process.env.KNOWLEDGE_TABLE_ID ?? 'tblVTWb1kxXSFPBq4Fq',
  knowledgeTypeTableId: process.env.KNOWLEDGE_TYPE_TABLE_ID ?? 'tblWcq6Kof1AFHvbC5e',
  maxKnowledgeNodes: Number(process.env.KNOWLEDGE_GRAPH_MAX_NODES ?? 2000),
}));

export const KnowledgeConfig = () => Inject(knowledgeConfig.KEY);
export type IKnowledgeConfig = ConfigType<typeof knowledgeConfig>;
```

Two required edits:

```diff
  // apps/nestjs-backend/src/configs/config.module.ts
+ import { knowledgeConfig } from './knowledge.config';
- const configurations = [ ...bootstrapConfigs, loggerConfig, ..., trashConfig ];
+ const configurations = [ ...bootstrapConfigs, loggerConfig, ..., trashConfig, knowledgeConfig ];
```

```diff
  // apps/nestjs-backend/src/configs/env.validation.schema.ts   (Joi, not zod)
+ KNOWLEDGE_TABLE_ID: Joi.string().pattern(/^tbl/),
+ KNOWLEDGE_TYPE_TABLE_ID: Joi.string().pattern(/^tbl/),
+ KNOWLEDGE_GRAPH_MAX_NODES: Joi.number().integer().min(1),
```

**Defaults live in `knowledge.config.ts` only — never in the Joi schema.** Nest applies Joi
defaults back onto `process.env` *before* the `registerAs` factory runs, so declaring them in both
places makes the `??` fallback dead code and a maintainer editing it sees no effect.

Table IDs are resolved from config, **not** by table name: `TableMeta.name` has no unique
constraint (`packages/db-main-prisma/prisma/postgres/schema.prisma:68-94`), is user-renameable,
and every existing resolution in the codebase goes through the ID.

### 2.3 Field resolution and type assertion

Field IDs are resolved by name per request via `RecordService.getFieldsByProjection(tableId)`
(DataLoader-cached, so this is not an extra round-trip per call), and each is asserted against its
expected type. A wrong assumption here produces an opaque 400 from the filter layer or a silently
empty graph, so it fails loudly instead.

```ts
// apps/nestjs-backend/src/features/knowledge-graph/types.ts
import { FieldType } from '@teable/core';

export const KNOWLEDGE_FIELD = {
  title: 'title',
  context: 'context',
  deletedAt: 'deleted_at',
  knowledgeType: 'knowledge_type',
} as const;
// is_active is deliberately absent — the graph never reads it (§1.3).

/** knowledge_type is accepted as either a Link or a plain-text title column (§1.2). */
export const KNOWLEDGE_TYPE_FIELD_TYPES = [FieldType.Link, FieldType.SingleLineText] as const;

export interface IResolvedField {
  id: string;
  name: string;
  type: FieldType;
  isMultipleCellValue: boolean;
}
```

```ts
// knowledge-graph.service.ts (excerpt)
private async resolveFields(
  tableId: string,
  specs: { name: string; types: readonly FieldType[]; required: boolean }[]
): Promise<Map<string, IResolvedField>> {
  const fields = await this.recordService.getFieldsByProjection(tableId);
  const byName = new Map(fields.map((f) => [f.name, f]));
  const resolved = new Map<string, IResolvedField>();

  for (const spec of specs) {
    const field = byName.get(spec.name);
    if (!field) {
      if (spec.required) {
        throw new CustomHttpException(
          `Table ${tableId} has no field named "${spec.name}"`,
          HttpErrorCode.NOT_FOUND
        );
      }
      continue;
    }
    if (!spec.types.includes(field.type)) {
      throw new CustomHttpException(
        `Field "${spec.name}" on table ${tableId} is ${field.type}, expected one of ${spec.types.join(', ')}`,
        HttpErrorCode.VALIDATION_ERROR
      );
    }
    resolved.set(spec.name, {
      id: field.id,
      name: field.name,
      type: field.type,
      isMultipleCellValue: Boolean(field.isMultipleCellValue),
    });
  }
  return resolved;
}
```

`CustomHttpException`'s third `data` argument is optional
(`apps/nestjs-backend/src/custom.exception.ts:10-18`), so omitting `localization` compiles without
touching the generated `src/types/i18n.generated.ts`. These are operator-facing configuration
faults, not localized end-user copy, so plain English messages are correct here.

### 2.4 Read path

`RecordService.getRecordsFields(tableId, query, useQueryModel = true)` — **not** `getRecords`.

| | `getRecords` | `getRecordsFields` |
|---|---|---|
| Round-trips | 2 (ID resolution, then hydration) | 1 SQL statement |
| `take` cap | hard-throws above 1000 (`record.service.ts:1966`) | none; `take: -1` means unlimited |
| Returns | full `IRecord` | `Pick<IRecord, 'id' \| 'fields'>` |

Only `id` and `fields` are needed, so the richer envelope is waste, and escaping the 1000-row cap
removes the need for a pagination loop. Cell values are still decoded by the field DTOs
(`record.service.ts:2315`), so Link cells arrive as objects rather than raw JSON strings — which a
raw Knex read would not give.

`take` is set to `maxKnowledgeNodes + 1`: fetching one row beyond the budget is how truncation is
detected without a second `COUNT(*)`.

```ts
const rows = await this.recordService.getRecordsFields(
  tableId,
  {
    fieldKeyType: FieldKeyType.Id,          // explicit: getRecordsFields does not default it
    projection: [...fieldIds],              // title + knowledge_type only; no is_active, no context
    filter: notDeleted,                     // deleted_at isEmpty (§1.3)
    ignoreViewQuery: true,                  // the graph is not a view; ignore view filters
    take: this.knowledgeConfig.maxKnowledgeNodes + 1,
  },
  true
);
```

`ignoreViewQuery: true` and the absence of record-level ACL are deliberate: the graph is a
base-wide taxonomy view gated solely by the `record|read` permission on the controller.
`RecordPermissionService.wrapView` is a no-op stub in this build
(`record-permission.service.ts:25-34`), so the controller guard is the only real gate — stated
here so a future reviewer does not have to re-derive it.

Filters passed to `RecordService` directly must use real `fld…` IDs. The name→ID rewriting done by
`FieldKeyPipe` is a request-scoped **controller** pipe and does not apply to internal service
calls.

The Link-cell extractor:

```ts
const extractTypeRecordId = (
  raw: unknown,
  titleToRecordId: ReadonlyMap<string, string>
): string | null => {
  if (raw == null) return null;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first == null) return null;
  // Link cell: a single {id,title} object, or the first element of an array (§1.2).
  if (typeof first === 'object' && 'id' in (first as object)) {
    return (first as ILinkCellValue).id;
  }
  // Plain-text fallback: the column stores the linked record's title.
  if (typeof first === 'string') return titleToRecordId.get(first) ?? null;
  return null;
};
```

Multi-valued links are truncated to the first entry — the 3-tier star model admits exactly one
parent per knowledge node. If the field turns out to be genuinely many-many, that is a contract
change (§3.7), not a patch.

### 2.5 The assembler (pure)

No Nest imports, no I/O — directly unit-testable and the only place graph shape is decided.

```ts
// apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts
import {
  KnowledgeLinkTier,
  KnowledgeNodeTier,
  KNOWLEDGE_CORE_NODE_ID,
  KNOWLEDGE_NODE_PREFIX,
  TYPE_NODE_PREFIX,
  UNCLASSIFIED_TYPE_NODE_ID,
  type IKnowledgeGraphLink,
  type IKnowledgeGraphNode,
  type IKnowledgeGraphStats,
} from '@teable/openapi';

/** Rest length per tier. Core→type is long and type→knowledge short, so the
 *  hierarchy reads as distinct shells rather than one undifferentiated cloud. */
const CORE_TYPE_DISTANCE = 260;
const TYPE_KNOWLEDGE_DISTANCE = 70;

export interface IKnowledgeTypeRow {
  recordId: string;
  title: string;
}

export interface IKnowledgeRow extends IKnowledgeTypeRow {
  /** recordId of the linked knowledge_type, or null when unlinked/unresolvable */
  typeRecordId: string | null;
}

export interface IAssembleOptions {
  maxKnowledgeNodes: number;
  coreLabel: string;
  unclassifiedLabel: string;
}

export interface IAssembledGraph {
  nodes: IKnowledgeGraphNode[];
  links: IKnowledgeGraphLink[];
  stats: IKnowledgeGraphStats;
}

const byTitleThenId = (a: IKnowledgeTypeRow, b: IKnowledgeTypeRow) =>
  a.title.localeCompare(b.title) || a.recordId.localeCompare(b.recordId);

export const assembleKnowledgeGraph = (
  types: IKnowledgeTypeRow[],
  knowledges: IKnowledgeRow[],
  options: IAssembleOptions
): IAssembledGraph => {
  const { maxKnowledgeNodes, coreLabel, unclassifiedLabel } = options;

  const sortedTypes = [...types].sort(byTitleThenId);
  const knownTypeIds = new Set(sortedTypes.map((t) => t.recordId));

  // Sort BEFORE truncating so the same dataset always yields the same subset
  // when the budget bites, keeping the payload (and its ETag) stable.
  const sorted = [...knowledges].sort(byTitleThenId);
  const truncated = sorted.length > maxKnowledgeNodes;
  const emitted = truncated ? sorted.slice(0, maxKnowledgeNodes) : sorted;

  const bucketOf = (row: IKnowledgeRow): string =>
    row.typeRecordId && knownTypeIds.has(row.typeRecordId)
      ? `${TYPE_NODE_PREFIX}${row.typeRecordId}`
      : UNCLASSIFIED_TYPE_NODE_ID;

  // Child counts are computed over the EMITTED set only, so orphanCount can never
  // exceed knowledgeCount and no synthetic bucket outlives its children.
  const childCount = new Map<string, number>();
  for (const row of emitted) {
    const bucket = bucketOf(row);
    childCount.set(bucket, (childCount.get(bucket) ?? 0) + 1);
  }
  const orphanCount = childCount.get(UNCLASSIFIED_TYPE_NODE_ID) ?? 0;

  // Every real type is emitted even with zero children — an empty branch is a
  // meaningful statement about the taxonomy. The synthetic bucket is not.
  const typeNodeIds = sortedTypes.map((t) => `${TYPE_NODE_PREFIX}${t.recordId}`);
  if (orphanCount > 0) typeNodeIds.push(UNCLASSIFIED_TYPE_NODE_ID);

  const nodes: IKnowledgeGraphNode[] = [
    {
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: KnowledgeNodeTier.Core,
      label: coreLabel,
      typeId: null,
      degree: typeNodeIds.length,
    },
  ];

  for (const type of sortedTypes) {
    const id = `${TYPE_NODE_PREFIX}${type.recordId}`;
    nodes.push({
      id,
      recordId: type.recordId,
      tier: KnowledgeNodeTier.Type,
      label: type.title,
      typeId: null,
      degree: childCount.get(id) ?? 0,
    });
  }

  if (orphanCount > 0) {
    nodes.push({
      id: UNCLASSIFIED_TYPE_NODE_ID,
      recordId: null,
      tier: KnowledgeNodeTier.Type,
      label: unclassifiedLabel,
      typeId: null,
      degree: orphanCount,
    });
  }

  for (const row of emitted) {
    nodes.push({
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: KnowledgeNodeTier.Knowledge,
      label: row.title,
      typeId: bucketOf(row),
      degree: 1,
    });
  }

  const links: IKnowledgeGraphLink[] = typeNodeIds.map((typeNodeId) => ({
    source: KNOWLEDGE_CORE_NODE_ID,
    target: typeNodeId,
    tier: KnowledgeLinkTier.CoreType,
    value: childCount.get(typeNodeId) ?? 0,
    distance: CORE_TYPE_DISTANCE,
  }));

  for (const row of emitted) {
    links.push({
      source: bucketOf(row),
      target: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      tier: KnowledgeLinkTier.TypeKnowledge,
      value: 1,
      distance: TYPE_KNOWLEDGE_DISTANCE,
    });
  }

  return {
    nodes,
    links,
    stats: {
      typeCount: typeNodeIds.length,
      knowledgeCount: emitted.length,
      orphanCount,
      nodeCount: nodes.length,
      linkCount: links.length,
      truncated,
    },
  };
};
```

`degree` is precomputed server-side so the renderer never has to traverse links to size a node.

### 2.6 Service

```ts
@Injectable()
export class KnowledgeGraphService {
  constructor(
    private readonly recordService: RecordService,
    private readonly permissionService: PermissionService,
    @KnowledgeConfig() private readonly knowledgeConfig: IKnowledgeConfig
  ) {}

  async getGraph(baseId: string): Promise<IGetKnowledgeGraphVo> {
    const { knowledgeTableId, knowledgeTypeTableId } = this.knowledgeConfig;
    await this.assertTablesInBase(baseId, [knowledgeTableId, knowledgeTypeTableId]);

    // Types first: the knowledge read needs their titles to build the
    // text-column fallback map used by extractTypeRecordId (§2.4).
    const types = await this.readTypes(knowledgeTypeTableId);
    const titleToRecordId = new Map(types.map((t) => [t.title, t.recordId]));
    const knowledges = await this.readKnowledges(knowledgeTableId, titleToRecordId);

    const graph = assembleKnowledgeGraph(types, knowledges, {
      maxKnowledgeNodes: this.knowledgeConfig.maxKnowledgeNodes,
      coreLabel: 'knowledge_core',
      unclassifiedLabel: 'Unclassified',
    });

    return {
      version: KNOWLEDGE_GRAPH_VERSION,
      etag: `"kg${KNOWLEDGE_GRAPH_VERSION}-${createHash('sha1')
        .update(JSON.stringify(graph))
        .digest('hex')
        .slice(0, 16)}"`,
      ...graph,
    };
  }

  /** The configured tables must belong to the base in the route, otherwise any
   *  member of any base could read the knowledge tables through their own base. */
  private async assertTablesInBase(baseId: string, tableIds: string[]): Promise<void> {
    for (const tableId of tableIds) {
      const upper = await this.permissionService.getUpperIdByTableId(tableId);
      if (upper.baseId !== baseId) {
        throw new CustomHttpException(
          `Knowledge table ${tableId} does not belong to base ${baseId}`,
          HttpErrorCode.NOT_FOUND
        );
      }
    }
  }
}
```

**No server-side cache in v1.** This is two indexed SQL statements over hundreds to low-thousands
of rows. A cache would need an invalidation hook on record writes to both tables; without one,
a TTL cache is a correctness liability (an edit is invisible for the whole TTL) rather than a
performance win. The ETag delivers the bandwidth saving, which is the part that actually matters
at ~300 KB per response. **Upgrade path if profiling ever justifies it:** key a
`PerformanceCacheService` entry on `MAX(__last_modified_time)` across both tables — one cheap
query — so the cache self-invalidates rather than relying on a TTL.

### 2.7 Controller

```ts
@Controller('api/base/:baseId/knowledge-graph')
export class KnowledgeGraphController {
  constructor(private readonly knowledgeGraphService: KnowledgeGraphService) {}

  @Permissions('record|read')
  @Get()
  async getKnowledgeGraph(
    @Param('baseId') baseId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<IGetKnowledgeGraphVo | undefined> {
    const vo = await this.knowledgeGraphService.getGraph(baseId);
    res.setHeader('ETag', vo.etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('Vary', 'Cookie, Authorization');
    if (req.headers['if-none-match'] === vo.etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    return vo;
  }

  @Permissions('record|read')
  @Get('node/:nodeId')
  async getKnowledgeGraphNode(
    @Param('baseId') baseId: string,
    @Param('nodeId') nodeId: string
  ): Promise<IGetKnowledgeGraphNodeVo> {
    return this.knowledgeGraphService.getNode(baseId, nodeId);
  }
}
```

Notes:

- **Route shape is forced by the guard.** `PermissionGuard.defaultResourceId`
  (`permission.guard.ts:30-34`) reads `req.params.baseId || req.params.spaceId || req.params.tableId`.
  A `@Permissions`-annotated route exposing none of them throws *"Permission check ID does not
  exist"* at runtime. Mounting under `api/base/:baseId/...` satisfies it and makes the permission
  base-scoped, which is what this data is.
- **`@Permissions` is mandatory, not optional.** Omitting it does not mean "open" — it blocks API
  tokens entirely (`permission.guard.ts:230-238`), so the mastra app token would 403.
- **Do not add `@AllowAnonymous()`.** `RecordOpenApiController` carries it for share/template
  fallbacks; copying it here would open anonymous paths.
- `AuthGuard` and `PermissionGuard` are global `APP_GUARD`s (`global.module.ts:96-103`) — no
  `@UseGuards` needed.
- The `node/:nodeId` form (not `knowledge/:recordId`) is used because `nodeId` is exactly what the
  graph payload's `id` field carries, so the frontend passes through what it already holds. The
  service parses the `type:` / `kn:` prefix and returns 404 for `core` and for
  `type:__unclassified__`, neither of which has a backing record.
- **Browser XHR never observes the 304.** With `Cache-Control: private, no-cache` the browser
  revalidates and, on 304, serves the stored body to the caller as a 200 — so no client code
  handles 304. The explicit branch exists for non-browser callers (the mastra app token) that send
  `If-None-Match` themselves.

### 2.8 Failure modes

| Condition | Response | Exception |
|-----------|----------|-----------|
| Caller lacks `record\|read` on the base | 403 | `PermissionGuard` |
| Configured table missing / deleted | 404 | `CustomHttpException(HttpErrorCode.NOT_FOUND)` |
| Configured table not in this base | 404 | `CustomHttpException(HttpErrorCode.NOT_FOUND)` |
| Required field name absent | 404 | `CustomHttpException(HttpErrorCode.NOT_FOUND)` |
| Field present with unexpected type | 400 | `CustomHttpException(HttpErrorCode.VALIDATION_ERROR)` |
| `nodeId` malformed / synthetic / no record | 404 | `CustomHttpException(HttpErrorCode.NOT_FOUND)` |
| Zero rows in both tables | **200** | `{ nodes: [core], links: [], stats: { …0, truncated: false } }` |

An empty knowledge base is a valid state, not an error — it returns the lone core node and the
frontend renders an empty state (§8.1).

### 2.9 Module and registration

```ts
// knowledge-graph.module.ts
@Module({
  imports: [RecordModule, AuthModule],
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
```

```diff
  // apps/nestjs-backend/src/app.module.ts
+ import { KnowledgeGraphModule } from './features/knowledge-graph/knowledge-graph.module';

  export const appModules = {
    imports: [
      ...
      V2Module,
+     KnowledgeGraphModule,
    ],
```

`RecordModule` exports `RecordService` (`record.module.ts:22`). `RecordOpenApiService` has no list
method — every read lives on `RecordService`.

### 2.10 Performance and limits

- **Expected cardinality:** tens of types, hundreds to low-thousands of knowledges. The reference
  app renders 1050 nodes / 1663 links smoothly, which brackets the target.
- **Two SQL statements per request**, independent of row count, via `getRecordsFields`.
- **Node budget:** `KNOWLEDGE_GRAPH_MAX_NODES` (default 2000) applies to knowledge nodes only;
  types and core are always emitted. Exceeding it sets `stats.truncated`, which the UI must
  surface as a banner (§8.1) — silent truncation reads as "you are seeing everything".
- **Payload:** ~120 B/node + ~60 B/link ⇒ roughly 300 KB at the cap. `context` bodies are
  deliberately excluded (§3.2), which is what keeps this bounded.

---

## 3. API contract — `packages/openapi/src/knowledge-graph`

### 3.1 File tree

```text
packages/openapi/src/knowledge-graph/
├── types.ts        NEW   shared enums, node/link/stats schemas, id helpers
├── get.ts          NEW   GET the whole graph
├── get-node.ts     NEW   GET one node's detail
└── index.ts        NEW   barrel
```

Two barrel edits, and only two:

```diff
+ // packages/openapi/src/knowledge-graph/index.ts
+ export * from './types';
+ export * from './get';
+ export * from './get-node';
```

```diff
  // packages/openapi/src/index.ts
  export * from './user-integration';
+ export * from './knowledge-graph';
```

**`registerRoute` is a pure import side effect** (`utils.ts:14-19` pushes into a module-local
array). A missing barrel line compiles fine, but the route silently never appears in `/docs` or
`openapi.json`. Both lines above are load-bearing.

### 3.2 `types.ts`

```ts
import { z } from '../zod';

export const KNOWLEDGE_GRAPH_VERSION = 1;

export const KNOWLEDGE_CORE_NODE_ID = 'core';
export const TYPE_NODE_PREFIX = 'type:';
export const KNOWLEDGE_NODE_PREFIX = 'kn:';
export const UNCLASSIFIED_TYPE_NODE_ID = `${TYPE_NODE_PREFIX}__unclassified__`;

/** Const object, not a TS enum — enums are nominal and would not be assignable
 *  across the backend / contract / frontend boundary without casts (§1.4). */
export const KnowledgeNodeTier = {
  Core: 'core',
  Type: 'type',
  Knowledge: 'knowledge',
} as const;
export type IKnowledgeNodeTier = (typeof KnowledgeNodeTier)[keyof typeof KnowledgeNodeTier];

export const KnowledgeLinkTier = {
  CoreType: 'core-type',
  TypeKnowledge: 'type-knowledge',
} as const;
export type IKnowledgeLinkTier = (typeof KnowledgeLinkTier)[keyof typeof KnowledgeLinkTier];

export const knowledgeGraphNodeSchema = z.object({
  id: z.string().meta({
    description: 'Globally unique node id: "core", "type:<recordId>" or "kn:<recordId>".',
  }),
  recordId: z.string().nullable().meta({
    description: 'Backing Teable record id; null for synthetic nodes (core, unclassified).',
  }),
  tier: z.enum(['core', 'type', 'knowledge']).meta({ description: 'Depth in the 3-tier star.' }),
  label: z.string().meta({ description: 'Display title.' }),
  typeId: z.string().nullable().meta({
    description: 'Parent type node id for knowledge nodes; null for core and type nodes.',
  }),
  degree: z.number().int().meta({ description: 'Adjacent node count, precomputed for sizing.' }),
});
export type IKnowledgeGraphNode = z.infer<typeof knowledgeGraphNodeSchema>;

export const knowledgeGraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  tier: z.enum(['core-type', 'type-knowledge']),
  value: z.number().meta({ description: 'Edge weight; child count for core-type, 1 otherwise.' }),
  distance: z.number().meta({ description: 'Force-layout rest length for this tier.' }),
});
export type IKnowledgeGraphLink = z.infer<typeof knowledgeGraphLinkSchema>;

export const knowledgeGraphStatsSchema = z.object({
  typeCount: z.number().int(),
  knowledgeCount: z.number().int(),
  orphanCount: z.number().int().meta({ description: 'Emitted knowledges with no resolvable type.' }),
  nodeCount: z.number().int(),
  linkCount: z.number().int(),
  truncated: z.boolean().meta({ description: 'True when the node budget dropped rows.' }),
});
export type IKnowledgeGraphStats = z.infer<typeof knowledgeGraphStatsSchema>;
```

**`context` is deliberately absent from the node schema.** It is a free-text body of unbounded
length; including it would multiply the payload by an order of magnitude to serve a panel that
shows one node at a time. It is fetched on demand by `get-node.ts`.

There is **no `group` field.** Colour is derived on the client from a stable hash of the type id
(§7.1), so a type keeps its colour when siblings are added or removed. A server-assigned index
would reshuffle every colour on insert.

`.meta({...})`, **not** `.openapi({...})` — this fork is on zod 4.1.8 with
`@asteasolutions/zod-to-openapi` 8.1.0. There are zero `.openapi(` call sites left in
`packages/openapi/src`; 46 files use `.meta({`. Import `z` from `'../zod'`, never from `'zod'`,
or the extension is silently lost.

### 3.3 `get.ts`

```ts
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';
import { knowledgeGraphLinkSchema, knowledgeGraphNodeSchema, knowledgeGraphStatsSchema } from './types';

export const GET_KNOWLEDGE_GRAPH = '/base/{baseId}/knowledge-graph';

export const getKnowledgeGraphVoSchema = z.object({
  version: z.number().int().meta({ description: 'Payload shape version.' }),
  etag: z.string().meta({ description: 'Strong ETag over nodes+links+stats.' }),
  nodes: knowledgeGraphNodeSchema.array(),
  links: knowledgeGraphLinkSchema.array(),
  stats: knowledgeGraphStatsSchema,
});
export type IGetKnowledgeGraphVo = z.infer<typeof getKnowledgeGraphVoSchema>;

export const GetKnowledgeGraphRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_KNOWLEDGE_GRAPH,
  description:
    'Get the full knowledge graph for a base: a synthetic knowledge_core root, one node per knowledge_type record, and one node per knowledges record.',
  request: { params: z.object({ baseId: z.string() }) },
  responses: {
    200: {
      description: 'The assembled knowledge graph.',
      content: { 'application/json': { schema: getKnowledgeGraphVoSchema } },
    },
  },
  tags: ['knowledge-graph'],
});

export const getKnowledgeGraph = async (baseId: string) => {
  return axios.get<IGetKnowledgeGraphVo>(urlBuilder(GET_KNOWLEDGE_GRAPH, { baseId }));
};
```

**No query parameters in v1.** Type filtering and search both operate on data the client already
holds in full, so a server round-trip would add latency and nothing else. It
also removes a real hazard: a query-parameterised endpoint whose cache key ignores the parameters
serves one caller's filtered view to everyone. When a filter is genuinely needed server-side, it
arrives with a matching cache key or none at all.

URL constants omit the `/api` prefix — `axios` is created with `baseURL: '/api'`
(`axios.ts:96-98`) — and use brace params `{baseId}`, while the Nest controller uses `:baseId` and
includes `api/`. `urlBuilder` does an unvalidated string replace, so a placeholder-name typo
silently leaves `{baseId}` in the URL.

### 3.4 `get-node.ts`

```ts
export const GET_KNOWLEDGE_GRAPH_NODE = '/base/{baseId}/knowledge-graph/node/{nodeId}';

export const getKnowledgeGraphNodeVoSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  tier: z.enum(['type', 'knowledge']),
  label: z.string(),
  context: z.string().nullable().meta({ description: 'Full body text; may be long.' }),
  typeId: z.string().nullable(),
  typeLabel: z.string().nullable().meta({ description: 'Carried free by the link cell.' }),
  createdTime: z.string().nullable(),
  lastModifiedTime: z.string().nullable(),
});
export type IGetKnowledgeGraphNodeVo = z.infer<typeof getKnowledgeGraphNodeVoSchema>;

export const GetKnowledgeGraphNodeRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_KNOWLEDGE_GRAPH_NODE,
  description:
    'Get the full detail of one knowledge or knowledge_type node, including its context body.',
  request: { params: z.object({ baseId: z.string(), nodeId: z.string() }) },
  responses: {
    200: {
      description: 'The node detail.',
      content: { 'application/json': { schema: getKnowledgeGraphNodeVoSchema } },
    },
  },
  tags: ['knowledge-graph'],
});

export const getKnowledgeGraphNode = async (baseId: string, nodeId: string) => {
  return axios.get<IGetKnowledgeGraphNodeVo>(
    urlBuilder(GET_KNOWLEDGE_GRAPH_NODE, { baseId, nodeId })
  );
};
```

`tier` excludes `'core'`: the core node is synthetic and has no record, so the endpoint 404s for
it and the type says so.

**No `siblingCount`, no `neighbours`.** Both are computable client-side from the graph payload
already in cache (`nodes.filter(n => n.typeId === node.typeId)`) at zero request cost. Serving
them would mean a second aggregate query on every node click, unbounded and uncached.

### 3.5 Example response

```jsonc
{
  "version": 1,
  "etag": "\"kg1-4f2a91c7e08b5d31\"",
  "nodes": [
    { "id": "core", "recordId": null, "tier": "core", "label": "knowledge_core",
      "typeId": null, "degree": 2 },
    { "id": "type:recAAA", "recordId": "recAAA", "tier": "type", "label": "Architecture",
      "typeId": null, "degree": 2 },
    { "id": "type:recBBB", "recordId": "recBBB", "tier": "type", "label": "Operations",
      "typeId": null, "degree": 0 },
    { "id": "kn:recK01", "recordId": "recK01", "tier": "knowledge", "label": "Event sourcing",
      "typeId": "type:recAAA", "degree": 1 },
    { "id": "kn:recK02", "recordId": "recK02", "tier": "knowledge", "label": "CQRS boundaries",
      "typeId": "type:recAAA", "degree": 1 }
  ],
  "links": [
    { "source": "core", "target": "type:recAAA", "tier": "core-type", "value": 2, "distance": 260 },
    { "source": "core", "target": "type:recBBB", "tier": "core-type", "value": 0, "distance": 260 },
    { "source": "type:recAAA", "target": "kn:recK01", "tier": "type-knowledge", "value": 1, "distance": 70 },
    { "source": "type:recAAA", "target": "kn:recK02", "tier": "type-knowledge", "value": 1, "distance": 70 }
  ],
  "stats": { "typeCount": 2, "knowledgeCount": 2, "orphanCount": 0,
             "nodeCount": 5, "linkCount": 4, "truncated": false }
}
```

`type:recBBB` has `degree: 0` — a real type with no knowledges, rendered as a bare branch.

### 3.6 Contract-drift guard

Add to `knowledge-graph.assembler.spec.ts`:

```ts
expect(() => getKnowledgeGraphVoSchema.parse({ version, etag, ...assembleKnowledgeGraph(...) }))
  .not.toThrow();
```

The assembler and the schema live in different packages and will otherwise drift. This makes the
build fail rather than the renderer.

### 3.7 Versioning

`version` is a payload-shape integer, independent of the ETag. Additive fields do not bump it;
removing or retyping a field does. The frontend reads `version` only to log a mismatch — it is a
diagnostic, not a branch point. A genuinely multi-valued `knowledge_type` link (§2.4) would be a
version 2 change (`typeId` → `typeIds: string[]`), not a patch.

---

## 4. Frontend — dependencies

### 4.1 What to install

**Nothing 3D exists today.** `react-force-graph-3d`, `three`, `three-spritetext`,
`3d-force-graph`, `force-graph`, `d3-force-3d` are absent from every `package.json`, from
`pnpm-lock.yaml`, and from `node_modules/.pnpm`. This is a from-scratch install.

```bash
pnpm add --filter @teable/app react-force-graph-3d@1.29.1 three@0.183.2 three-spritetext@1.10.0
pnpm add --filter @teable/app -D @types/three@0.183.1
```

The workspace filter is `@teable/app` (the package `name`), not the directory `nextjs-app`.
`.npmrc` sets `save-prefix=''` and Renovate pins `apps/**`, so these are written as exact versions
automatically — do not hand-edit a caret in.

**`three` must be a direct dependency even though it arrives transitively.** `three-spritetext`
declares `three` as a *peer* (`>=0.86.0`) while `3d-force-graph` declares it as a hard
*dependency* (`>=0.179 <1`). With `.npmrc`'s `auto-install-peers=true` and
`strict-peer-dependencies=false`, pnpm silently installs a **second** `three` for the peer rather
than erroring. Two `three` instances break `instanceof`, so `SpriteText` labels never attach to
the scene and nothing logs an error. Pinning it directly forces dedupe. Verify after install:

```bash
ls node_modules/.pnpm | grep '^three@'   # must print exactly one line
```

No React peer conflict: `react-force-graph-3d` peers on `react: "*"` and `react-kapsule` on
`>=16.13.1`; this app is React 18.3.1.

### 4.2 Consequences to expect

| | Impact |
|---|---|
| Bundle | ~150–200 KB gzip added to the **lazy** chunk. `.size-limit.js` enforces 120 KB per page but measures only initial `manifest.pages` chunks, so a `next/dynamic({ssr:false})` chunk is not counted. The dynamic wrapper is what keeps the budget green. |
| `check-dist` | `apps/nextjs-app/.escheckrc` pins `ecmaVersion: "es2018"`; three r183 ships optional chaining and class fields. Expect `pnpm --filter @teable/app check-dist` to fail. Fix by bumping to `es2020` or adding the graph chunk to the existing `not` array. Not wired into any CI workflow today, but it breaks the root `g:check-dist`. |
| `transpilePackages` | **Do not add three or react-force-graph-3d.** They are ESM with proper `exports` maps and `next.config.js` already sets `esmExternals: true`. Transpiling three would slow every build for no benefit. Some ESM-only `d3-*` transitives may still need adding — the list already carries `d3-interpolate` and `d3-color` for exactly this reason. |
| Bundler | Next 16 defaults to **Turbopack**, so the `webpack()` hook in `next.config.js` is not applied. Any resolve tweak must go in the `turbopack.resolveAlias` block instead. Neither package needs a node builtin, so none should be required. |
| CSP | `next-secure-headers` enforces `defaultSrc: 'self'` and COEP/COOP `same-origin`. Bundled three is fine; do not load textures, fonts or HDRIs from a CDN, and keep any WebGL-sampled image same-origin or a `data:` URI. |

### 4.3 Placement: `apps/nextjs-app`, not `packages/sdk`

- `packages/sdk` is consumed by `plugins/` and `nextjs-statics`, which would inherit ~200 KB gzip
  of three they never use.
- `packages/sdk/package.json` declares only `.`, `./ui.config` and `./ui.config.cjs` in `exports`,
  so a three-dependent subpath would need a new export-map entry.
- SDK components use the hand-rolled `useTranslation` bound to the `sdk` namespace only; this
  feature wants normal `next-i18next` namespaced keys.

(Module resolution is *not* a reason — `packages/sdk/tsconfig.json:19` sets
`"moduleResolution": "Bundler"`, same as the app.)

Only the **query keys** go in the SDK (§5.2), because `ReactQueryKeys` is a single shared registry.

### 4.4 A note on the 3D requirement

The repo already ships `@xyflow/react@12.10.2` and `reactflow@11.11.1`. A 2D radial layout would
express the same 3-tier star at **zero** additional bundle cost. 3D is being built because it is
the stated requirement and it genuinely reads better at this branching factor — but if the bundle
or the `check-dist` fallout is unwelcome, the 2D fallback is cheap and already paid for.

---

## 5. Frontend — state management

### 5.1 Three kinds of state, kept apart

| Kind | Owner | Why it cannot merge with the others |
|------|-------|-------------------------------------|
| **Server data** — the graph payload, node details | react-query | Cached, revalidated, shared across mounts. Copying it into a store forks the cache and creates two sources of truth. |
| **View state** — focus, filters, search, auto-rotate | zustand | Must survive re-renders and be writable from several sibling components. Belongs in neither the query cache nor a ref. |
| **Imperative 3D handles** — the force-graph instance, sprite map, RAF id | `useRef` | Mutable, not renderable, and changing every frame. Putting any of it in state would re-render at 60 fps. |

The one rule that follows: **the graph passed to the canvas is derived, never stored.** It is a
`useMemo` over (server data × view state). Storing it would require an effect to keep it in sync —
the classic derived-state bug — and would make "filter changed" and "data refetched" two separate
update paths that can disagree.

### 5.2 Server state

Add to the shared registry (keep the file's `naming-convention` pragma):

```diff
  // packages/sdk/src/config/react-query-keys.ts
+ knowledgeGraph: (baseId: string) => ['knowledge-graph', baseId] as const,
+
+ knowledgeGraphNode: (baseId: string, nodeId: string) =>
+   ['knowledge-graph-node', baseId, nodeId] as const,
```

```ts
// apps/nextjs-app/src/features/app/blocks/knowledge-graph/hooks/useKnowledgeGraph.ts
import { useQuery } from '@tanstack/react-query';
import { getKnowledgeGraph } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId } from '@teable/sdk/hooks';

export const useKnowledgeGraph = () => {
  const baseId = useBaseId();

  return useQuery({
    queryKey: ReactQueryKeys.knowledgeGraph(baseId as string),
    queryFn: ({ queryKey }) => getKnowledgeGraph(queryKey[1]).then((res) => res.data),
    enabled: Boolean(baseId),
    // The graph changes only when someone edits the knowledge tables. 60s keeps a
    // tab-switch cheap while staying inside the window a human would call "fresh".
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
```

`useBaseId()` comes from `@teable/sdk/hooks` (`packages/sdk/src/hooks/use-base-id.ts:4`, barrelled
at `hooks/index.ts:37`); it reads `AnchorContext`, which `BaseLayout` provides. It returns
`undefined` outside that layout, hence `enabled`. (Note there is a *second*, unrelated `useBaseId`
at `packages/sdk/src/components/comment/hooks/useBaseId.ts` that reads `CommentContext` — it is not
exported from the hooks barrel and must not be imported here.)

The node-detail hook is the same shape, keyed on `nodeId`, `enabled: Boolean(baseId && nodeId)`.

**Global error toasts are automatic but silent for GETs.** The shared `QueryCache.onError` swallows
4xx on queries (logging only in dev), so a failed graph fetch shows the user nothing — the
component must render its own error state (§8.1).

**No SSR prefetch of the graph.** The consuming component is `next/dynamic({ ssr: false })`, so a
dehydrated payload would ship ~300 KB of JSON in the HTML for zero first-paint benefit. It would
also make every backend failure a hard 500 from `getServerSideProps` (`fetchQuery` rejects),
bypassing the designed error UI entirely. The page prefetches only `base` and `basePermission`,
exactly as `design.tsx` does.

### 5.3 View state

```ts
// apps/nextjs-app/src/features/app/blocks/knowledge-graph/useKnowledgeGraphStore.ts
import { create } from 'zustand';

interface IKnowledgeGraphState {
  focusedNodeId: string | null;
  /** EXCLUSIONS, not inclusions — see note below. */
  hiddenTypeIds: string[];
  searchQuery: string;
  autoRotate: boolean;
  showLegend: boolean;

  setFocusedNode: (nodeId: string | null) => void;
  toggleType: (typeNodeId: string) => void;
  showAllTypes: () => void;
  setSearchQuery: (query: string) => void;
  setAutoRotate: (on: boolean) => void;
  toggleLegend: () => void;
  reset: () => void;
}

const INITIAL = {
  focusedNodeId: null,
  hiddenTypeIds: [] as string[],
  searchQuery: '',
  autoRotate: true,
  showLegend: true,
};

export const useKnowledgeGraphStore = create<IKnowledgeGraphState>((set) => ({
  ...INITIAL,
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  toggleType: (typeNodeId) =>
    set((state) => ({
      hiddenTypeIds: state.hiddenTypeIds.includes(typeNodeId)
        ? state.hiddenTypeIds.filter((id) => id !== typeNodeId)
        : [...state.hiddenTypeIds, typeNodeId],
    })),
  showAllTypes: () => set({ hiddenTypeIds: [] }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  toggleLegend: () => set((state) => ({ showLegend: !state.showLegend })),
  reset: () => set(INITIAL),
}));
```

zustand is v4.5.2: plain `create<T>(...)`. The curried `create<T>()(...)` form is required **only**
with middleware such as `persist`; this store is intentionally not persisted, so the plain form is
correct.

Two deliberate choices:

- **`hiddenTypeIds` (exclusions), not `selectedTypeIds` (inclusions).** The type list is not known
  until the graph loads. An inclusion list would start empty — meaning "show nothing" — and would
  need an effect to seed itself from server data once it arrives, which is exactly the
  derived-state bug §5.1 avoids. An exclusion list is correct both before and after load with no
  effect at all.
- **`isFullscreen` is *not* in the store.** The browser owns it (`document.fullscreenElement`).
  A mirrored copy desyncs the moment the user presses Escape. It is read through a small hook that
  subscribes to `fullscreenchange`.

### 5.4 Derived simulation graph

```ts
// .../knowledge-graph/utils/buildSimulationGraph.ts
export interface ISimulationNode extends IKnowledgeGraphNode {
  x?: number; y?: number; z?: number;      // written by the force simulation
}

export interface ISimulationGraph {
  nodes: ISimulationNode[];
  links: IKnowledgeGraphLink[];
}

export const EMPTY_SIMULATION_GRAPH: ISimulationGraph = { nodes: [], links: [] };

export const buildSimulationGraph = (
  graph: IGetKnowledgeGraphVo | undefined,
  hiddenTypeIds: readonly string[]
): ISimulationGraph => {
  if (!graph) return EMPTY_SIMULATION_GRAPH;

  const hidden = new Set(hiddenTypeIds);
  const keep = (node: IKnowledgeGraphNode): boolean => {
    if (node.tier === KnowledgeNodeTier.Type) return !hidden.has(node.id);
    if (node.tier === KnowledgeNodeTier.Knowledge) return !hidden.has(node.typeId ?? '');
    return true;                                    // core is always kept
  };

  // Clone every node. react-force-graph MUTATES what it is given — it writes
  // x/y/z/vx/vy/vz onto nodes and replaces link.source/target with node object
  // references. Handing it the react-query cached objects would corrupt the cache
  // and break structural sharing on the next refetch.
  const nodes = graph.nodes.filter(keep).map((node) => ({ ...node }));
  const keptIds = new Set(nodes.map((node) => node.id));
  const links = graph.links
    .filter((link) => keptIds.has(link.source) && keptIds.has(link.target))
    .map((link) => ({ ...link }));

  return { nodes, links };
};
```

Consumed as:

```ts
const graph = useMemo(
  () => buildSimulationGraph(data, hiddenTypeIds),
  [data, hiddenTypeIds]
);
```

Two consequences worth stating explicitly:

- **Identity stability is the performance contract.** `react-force-graph` diffs `graphData` by
  reference; a new object means a full scene teardown and re-simulation. The memo must produce a
  new object *only* when data or filters actually change.
- **After the first tick, `link.source` is a node object, not a string.** Any callback reading it
  must handle both (`typeof s === 'string' ? s : s.id`). The filter above runs on the pre-simulation
  clone, where they are still strings.

---

## 6. Frontend — components

### 6.1 File tree

Under `apps/nextjs-app/src/features/app/blocks/knowledge-graph/`. A **new sibling** of the existing
`blocks/graph/`, which is the calculation-engine field-dependency plan display and unrelated.
`blocks/index.ts` is `export {}` — there is no barrel; import concretely via the `@/features/*`
path alias.

```text
apps/nextjs-app/src/features/app/blocks/knowledge-graph/
├── DynamicKnowledgeGraph.tsx        next/dynamic ssr:false wrapper
├── KnowledgeGraph.tsx               orchestrator: query, states, layout
├── KnowledgeGraphCanvas.tsx         the ForceGraph3D scene
├── KnowledgeGraphToolbar.tsx        auto-rotate / fullscreen / reset / counts
├── KnowledgeGraphLegend.tsx         type list, click to toggle
├── KnowledgeNodeSearch.tsx          typeahead over knowledge + type nodes
├── KnowledgeNodeDetailPanel.tsx     detail fetch + render
├── useKnowledgeGraphStore.ts        zustand view state
├── hooks/
│   ├── useKnowledgeGraph.ts
│   ├── useKnowledgeGraphNode.ts
│   └── useFullscreen.ts
├── utils/
│   ├── buildSimulationGraph.ts
│   └── graphTheme.ts                colour, size, distance
└── types.ts                         re-exports contract types; declares no new tiers
```

Each file stays under 500 lines per the project's `CLAUDE.md`. The reference `ForceGraph.tsx` is
525 lines precisely because it fuses all of the above into one component.

`types.ts` **re-exports** the contract types and must not re-declare them:

```ts
export { KnowledgeLinkTier, KnowledgeNodeTier } from '@teable/openapi';
export type { IKnowledgeGraphLink, IKnowledgeGraphNode, IKnowledgeNodeTier } from '@teable/openapi';
```

### 6.2 Component contracts

```ts
// DynamicKnowledgeGraph.tsx — mirrors blocks/erd/DynamicBaseErd.tsx exactly
export const DynamicKnowledgeGraph = dynamic(
  () => import('./KnowledgeGraph').then((mod) => mod.KnowledgeGraph),
  { loading: () => <Skeleton className="size-full" />, ssr: false }
);

interface IKnowledgeGraphCanvasProps {
  graph: ISimulationGraph;
  width: number;
  height: number;
  backgroundColor: string;
  focusedNodeId: string | null;
  autoRotate: boolean;
  onNodeClick: (nodeId: string | null) => void;
  /** Called when the user grabs the scene, so auto-rotate can yield. */
  onUserInteract: () => void;
}

interface IKnowledgeGraphLegendProps {
  types: IKnowledgeGraphNode[];        // tier === 'type', already sorted
  hiddenTypeIds: readonly string[];
  onToggleType: (typeNodeId: string) => void;
  onShowAll: () => void;
}

interface IKnowledgeNodeSearchProps {
  nodes: IKnowledgeGraphNode[];        // tier !== 'core'
  onSelect: (nodeId: string) => void;
  onClear: () => void;
}

interface IKnowledgeNodeDetailPanelProps {
  nodeId: string;
  /** Computed client-side from the cached graph — never fetched. */
  siblingCount: number;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

interface IKnowledgeGraphToolbarProps {
  stats: IKnowledgeGraphStats;
  visibleNodeCount: number;
  visibleLinkCount: number;
  autoRotate: boolean;
  onAutoRotateChange: (on: boolean) => void;
  onResetView: () => void;
  onRefresh: () => void;
  fullscreenTargetRef: RefObject<HTMLElement>;
}
```

`fullscreenTargetRef` is **the same element** the canvas interaction listeners attach to. If they
differ, entering fullscreen re-parents one and not the other, and auto-rotate stops yielding to the
user exactly where it is most visible.

`onRefresh` calls `queryClient.invalidateQueries({ queryKey: ReactQueryKeys.knowledgeGraph(baseId) })`,
not a bare `refetch()` — invalidation is what the codebase uses and what updates every observer.

### 6.3 Page and navigation

```text
apps/nextjs-app/src/pages/base/[baseId]/knowledge-graph.tsx      NEW
```

Cloned from `pages/base/[baseId]/design.tsx`: `withEnv(ensureLogin(withAuthSSR(...)))`, prefetch
`base` + `basePermission` only, `dehydrate`, `getTranslationsProps`, and
`Node.getLayout = (page, props) => <BaseLayout {...props}>{page}</BaseLayout>`.

Static files in `pages/base/[baseId]/` take precedence over the `[[...slug]].tsx` catch-all, so no
routing change is needed.

Sidebar entry: a `DropdownMenuItem` in `MoreMenu` inside
`features/app/blocks/base/base-side-bar/BasePageRouter.tsx`, alongside Design and Trash.

Two layout constraints from the shell:

- `src/styles/global.css` sets `html, body { overflow: hidden }`, so the page sizes itself
  (`h-screen` / absolute inset) and manages its own scrolling.
- `BaseLayout` wraps children in a flex row with `min-w-80 flex-1` and **suppresses right-click
  globally** (`onContextMenu={(e) => e.preventDefault()}`). The graph gets a flex child, not the
  viewport; any context menu needs `stopPropagation`.

---

## 7. 3D rendering specification

### 7.1 Colour

```ts
// utils/graphTheme.ts

/** FNV-1a. Stable and data-independent: a type keeps its hue when siblings are
 *  added or removed, which an index-based palette could never guarantee. */
const hashHue = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
};

export const CORE_COLOR = '#e8e3d9';
export const UNCLASSIFIED_COLOR = '#6b7280';

export const colorForNode = (node: IKnowledgeGraphNode): string => {
  if (node.tier === KnowledgeNodeTier.Core) return CORE_COLOR;
  const key = node.tier === KnowledgeNodeTier.Type ? node.id : node.typeId;
  if (!key || key === UNCLASSIFIED_TYPE_NODE_ID) return UNCLASSIFIED_COLOR;
  const hue = hashHue(key);
  // Type nodes read brighter than their children, so the tier is legible by value
  // as well as position.
  return node.tier === KnowledgeNodeTier.Type
    ? `hsl(${hue} 72% 62%)`
    : `hsl(${hue} 52% 46%)`;
};
```

Node opacity is a flat constant (`nodeOpacity={0.9}` on the canvas). There is no per-node opacity
ramp, because `is_active` — the only attribute that would have driven one — is not read (§1.3).

### 7.2 Size and layout forces

```ts
export const NODE_VAL: Record<IKnowledgeNodeTier, (degree: number) => number> = {
  core: () => 40,
  type: (degree) => 8 + Math.min(degree, 40) * 0.6,
  knowledge: () => 2,
};

export const LINK_DISTANCE: Record<IKnowledgeLinkTier, number> = {
  'core-type': 260,
  'type-knowledge': 70,
};
export const DEFAULT_LINK_DISTANCE = 120;

export const TIER_CHARGE: Record<IKnowledgeNodeTier, number> = {
  core: -600,
  type: -280,
  knowledge: -40,
};
export const DEFAULT_CHARGE = -60;
```

**Every tier-keyed lookup must be total:**

```ts
fg.d3Force('link')?.distance((l: IKnowledgeGraphLink) => LINK_DISTANCE[l.tier] ?? DEFAULT_LINK_DISTANCE);
fg.d3Force('charge')?.strength((n: ISimulationNode) => TIER_CHARGE[n.tier] ?? DEFAULT_CHARGE);
```

An unknown tier returning `undefined` makes d3 compute `NaN` positions; every node collapses to
`NaN` and the scene renders **empty with no error** — the hardest failure mode in this design to
diagnose. The `??` fallbacks make an unknown tier degrade to a neutral node instead.

### 7.3 Labelling policy

**Always-on `SpriteText` labels for `core` and `type` only. Knowledge labels on hover/focus.**

Each `SpriteText` allocates a canvas-backed `THREE.Texture` plus a `SpriteMaterial` and adds a draw
call. Labelling every node at the 2000-node budget means 2000 textures and 2000 extra draw calls —
frame rate collapses and VRAM balloons. Core + types is bounded at roughly 1 + 50, which is free.
This is also the right *information* design: the tier-1 taxonomy is the thing worth reading at
rest; individual knowledge titles are worth reading on approach.

### 7.4 Auto-rotate — corrected

The reference implementation rotates the camera about the **world Z axis**:

```ts
camera.position.set(x * cos - y * sin, x * sin + y * cos, z);   // reference — broken
```

`react-force-graph-3d` starts the camera at `{ x: 0, y: 0, z: distance }`. With `x === 0 && y === 0`
that expression evaluates to `(0, 0, z)` every frame: **auto-rotate does nothing until the user
manually orbits off the Z axis** — precisely when they no longer want it. It also writes
`camera.position` and calls `camera.lookAt` every frame while TrackballControls writes the same
properties from its own `target`, so the two fight and the up-vector drifts.

Correct version — orbit about the world **Y** axis through the controls target, and let the
controls own `lookAt`:

```ts
const ROTATE_SPEED = 0.0016;   // rad/frame ≈ 5.5°/s at 60 fps

useEffect(() => {
  if (!autoRotate) return;
  let raf = 0;
  const tick = () => {
    const fg = fgRef.current;
    const controls = fg?.controls();
    if (fg && controls) {
      const cam = fg.camera();
      const { x: tx, z: tz } = controls.target;
      const dx = cam.position.x - tx;
      const dz = cam.position.z - tz;
      const cos = Math.cos(ROTATE_SPEED);
      const sin = Math.sin(ROTATE_SPEED);
      cam.position.x = tx + dx * cos + dz * sin;
      cam.position.z = tz + dz * cos - dx * sin;
      // y is the orbit axis and is left untouched.
      controls.update();          // owns lookAt and the up vector — never call lookAt here
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [autoRotate]);
```

Yielding to the user — listeners go on the renderer's own canvas, which is the element that
actually receives the gestures and survives the fullscreen re-parent:

```ts
useEffect(() => {
  const el = fgRef.current?.renderer().domElement;
  if (!el) return;
  const stop = () => setAutoRotate(false);
  el.addEventListener('pointerdown', stop, { passive: true });
  el.addEventListener('wheel', stop, { passive: true });
  return () => {
    el.removeEventListener('pointerdown', stop);
    el.removeEventListener('wheel', stop);
  };
}, [setAutoRotate]);
```

### 7.5 Camera focus

On focus, ease the camera along the vector from the scene centre to the node, holding a
tier-dependent standoff:

```ts
const FOCUS_DISTANCE: Record<IKnowledgeNodeTier, number> = {
  core: 420, type: 180, knowledge: 90,
};

const focusNode = (node: ISimulationNode) => {
  const distance = FOCUS_DISTANCE[node.tier] ?? 150;
  const { x = 0, y = 0, z = 0 } = node;
  const ratio = 1 + distance / Math.hypot(x, y, z || 1);
  fgRef.current?.cameraPosition(
    { x: x * ratio, y: y * ratio, z: z * ratio },
    { x, y, z },
    900
  );
};
```

`cameraPosition` animates and drives the controls target itself, so it composes with §7.4 rather
than fighting it. Focus also sets `autoRotate` false — an animated camera move and a rotation loop
writing the same property is incoherent.

### 7.6 Sprite lifecycle

```ts
const disposeSprites = (map: Map<string, SpriteText>) => {
  map.forEach((sprite) => {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
  map.clear();
};
```

Called **both** when the graph identity changes and on unmount. Clearing the map without disposing
leaks one GPU texture per sprite per rebuild for the lifetime of the page; toggling the legend a
few dozen times on a 20-type base ends in a lost WebGL context.

Sprites are cached by `node.id` and reused across filter changes rather than rebuilt, so a legend
toggle does not churn the whole label set.

### 7.7 Lifecycle and performance

- **No staged progressive load.** The reference sets `graphData` three times per change (empty →
  nodes-only → full). Since force-graph diffs by reference, that is three full scene
  teardown/rebuild cycles per filter toggle, runs `nodeThreeObject` for every node twice, and
  orphans the intermediate sprites. At this cardinality there is nothing to stage. One stable memo
  (§5.4) replaces it.
- **Sizing** via the repo's `ResizeObserver` pattern (`packages/sdk/src/components/grid/hooks/useResizeObserver.ts`):
  observe the container, store `{width, height}`, `disconnect()` on unmount. Not window listeners —
  the sidebar can resize the container without a window resize.
- **Unmount teardown** — required, and doubly so because `reactStrictMode: true` runs effects twice
  in dev:
  ```ts
  useEffect(() => () => {
    fgRef.current?.pauseAnimation();
    disposeSprites(spriteMapRef.current);
    fgRef.current?._destructor?.();
  }, []);
  ```
- **Hidden tab:** pause on `visibilitychange` and resume only if still mounted, with the listener
  registered in the *same* effect that owns the teardown so ordering is guaranteed:
  ```ts
  useEffect(() => {
    const onChange = () => {
      const fg = fgRef.current;
      if (!fg) return;                       // already torn down
      document.hidden ? fg.pauseAnimation() : fg.resumeAnimation();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  ```
- **Cooldown:** `cooldownTicks={120}` with `d3AlphaDecay={0.015}` — the simulation settles and stops
  burning CPU, matching the reference's tuning.

---

## 8. States, accessibility, theming, i18n

### 8.1 States that must be handled

| State | Condition | Render |
|-------|-----------|--------|
| Loading | `isPending` | `Skeleton` filling the container |
| Error | `isError` | `Alert` + retry button. **Required** — the global handler silently swallows GET 4xx. |
| Empty | `stats.typeCount === 0 && stats.knowledgeCount === 0` | Empty-state copy; **do not mount the canvas** |
| Single node | `graph.nodes.length <= 1` | Canvas mounts, but **skip `zoomToFit`** — a one-point bounding box yields an undefined camera distance |
| Truncated | `stats.truncated` | Persistent banner naming the cap. Silent truncation reads as completeness. |
| All types hidden | `nodes.length === 1` after filtering | "All types hidden" + a Show-all action |
| No WebGL | `!document.createElement('canvas').getContext('webgl2')` | Static fallback: the type list as a nested outline, with the same labels and counts |

### 8.2 Accessibility

- **The outline fallback is not only for missing WebGL.** The same nested type→knowledge list is
  reachable behind a toggle, so the graph's information is available without a pointer or depth
  perception. A `<canvas>` cannot be made accessible; a parallel DOM tree can.
- The search typeahead is fully keyboard-driven (↑/↓/Enter/Escape) and moves focus and camera
  together, so keyboard users can reach any node.
- `prefers-reduced-motion: reduce` initialises `autoRotate` to `false` and shortens the
  `cameraPosition` transition to 0. Continuous orbit is a vestibular trigger.
- The canvas gets `role="img"` and an `aria-label` carrying the live node/link counts.

### 8.3 Theming

**The fork is effectively dark-only at the token level**: in
`packages/ui-lib/src/shadcn/global.shadcn.css` the `:root` block (lines 6-42) and the `.dark` block
(lines 44-81) carry identical values (`--background: 0 0% 12%`). `useTheme().resolvedTheme` still
flips, so branching canvas colours on it would send the canvas light while the surrounding chrome
stays dark.

So the canvas background is **read from the container's computed CSS variable**, not from the theme
hook:

```ts
const backgroundColor = useMemo(() => {
  if (!containerRef.current) return 'hsl(0 0% 12%)';
  const raw = getComputedStyle(containerRef.current).getPropertyValue('--background').trim();
  return raw ? `hsl(${raw})` : 'hsl(0 0% 12%)';
}, [resolvedTheme]);
```

It tracks whatever the design system actually renders — today dark, and correctly light if the
`:root` block is ever fixed. Node hues (§7.1) are chosen to hold contrast against both. All
surrounding chrome uses semantic Tailwind classes (`bg-background`, `text-foreground`,
`border-border`), never hardcoded hex.

### 8.4 i18n

Components live in `apps/nextjs-app`, so they use `next-i18next` with `'namespace:key'` — **not**
the SDK's hand-rolled `useTranslation`.

A new `knowledge-graph` namespace requires exactly three edits plus the locale files:

```diff
  // packages/common-i18n/src/I18nNamespaces.ts
+ import type knowledgeGraph from './locales/en/knowledge-graph.json';

  export interface I18nNamespaces {
    ...
+   'knowledge-graph': typeof knowledgeGraph;
  }
```

```diff
  // apps/nextjs-app/src/features/i18n/base-all.config.ts
  i18nNamespaces: I18nActiveNamespaces<
-   | 'common' | 'space' | ... | 'oauth'
+   | 'common' | 'space' | ... | 'oauth' | 'knowledge-graph'
  >;
  ...
- i18nNamespaces: ['common', 'space', ..., 'oauth'],
+ i18nNamespaces: ['common', 'space', ..., 'oauth', 'knowledge-graph'],
```

New file `packages/common-i18n/src/locales/en/knowledge-graph.json` (and a copy in each of the
other nine locales — `it, zh, fr, ja, ru, de, uk, tr, es` — seeded from `en`):

```json
{
  "title": "Knowledge Graph",
  "core": "knowledge_core",
  "unclassified": "Unclassified",
  "stats": { "nodes": "{{count}} nodes", "links": "{{count}} links", "types": "{{count}} types" },
  "toolbar": { "autoRotate": "Auto rotate", "fullscreen": "Fullscreen",
               "exitFullscreen": "Exit fullscreen", "resetView": "Reset view",
               "refresh": "Refresh", "outline": "Outline view" },
  "legend": { "title": "Types", "showAll": "Show all", "hidden": "{{count}} hidden" },
  "search": { "placeholder": "Search knowledge…", "noResults": "No nodes match \"{{query}}\"" },
  "detail": { "context": "Context", "type": "Type", "siblings": "{{count}} sibling knowledges",
              "updated": "Updated {{time}}", "openRecord": "Open record" },
  "empty": { "title": "No knowledge yet",
             "description": "Add records to knowledges or knowledge_type to populate the graph." },
  "truncated": { "banner": "Showing the first {{count}} knowledges. Narrow the view to see the rest." },
  "error": { "title": "Could not load the knowledge graph", "retry": "Retry" },
  "webgl": { "title": "3D rendering unavailable",
             "description": "Your browser does not support WebGL. Showing the outline instead." }
}
```

The `en` file is the type source — a key used in code but absent there is a compile error.

---

## 9. Testing

**Unit — `knowledge-graph.assembler.spec.ts`** (the assembler is pure, so this is where the real
coverage lives):

1. Empty input → exactly one `core` node, zero links, all counts zero, `truncated: false`.
2. Types with no knowledges → every type emitted with `degree: 0`; no Unclassified node.
3. Knowledge with a valid link → `typeId` is `type:<recordId>`; one `type-knowledge` link.
4. Knowledge with a null / unknown / soft-deleted-type link → bucketed to Unclassified; the
   Unclassified node is emitted exactly once regardless of orphan count.
5. **No orphans → no Unclassified node and no `core → unclassified` link.**
6. Node IDs are unique across the whole graph, including when a `knowledges` record and a
   `knowledge_type` record share a record id suffix.
7. Determinism: shuffling the input arrays yields a byte-identical result.
8. Truncation: `maxKnowledgeNodes` smaller than the input sets `truncated`, and
   `stats.knowledgeCount === maxKnowledgeNodes`.
9. **Truncation that drops every orphan → no childless Unclassified node** (the interaction that
   an independent `orphanCount` would get wrong).
10. `orphanCount <= knowledgeCount` always.
11. Every `tier: 'knowledge'` node has a `typeId` that resolves to an emitted tier-1 node — the
    invariant the whole frontend rests on.
12. Contract guard: `getKnowledgeGraphVoSchema.parse(...)` does not throw (§3.6).

**E2E — `apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts`:**

The config is read once at module init and `ConfigModule` is registered with `cache: true`, so
mutating `process.env` after boot does nothing — and the fixture tables cannot exist before boot
because creating them is an HTTP call. The order that actually works:

```ts
const app = await initApp();
const typeTable = await createTable(baseId, { name: 'knowledge_type', fields: [...] });
const knowledgeTable = await createTable(baseId, { name: 'knowledges', fields: [...] });

// registerAs returns a plain mutable object held by the DI container.
const cfg = app.get<IKnowledgeConfig>(knowledgeConfig.KEY);
cfg.knowledgeTypeTableId = typeTable.id;
cfg.knowledgeTableId = knowledgeTable.id;
```

Cases: 200 with the expected shape; a soft-deleted row (`deleted_at` set) disappears; rows with
`is_active` set to `true`, to `false`, and never set are **all three present** (this pins the §1.3
decision — it is the assertion that fails if someone later reintroduces an `is_active` predicate);
`node/:nodeId` returns the `context` body; `node/core` 404s; a base the user can read but whose
tables are elsewhere → **404**; a base the user is not a member of → **403** (the guard, not the
service). Conflating those two status codes is the common mistake here.

**Not tested at unit level:** the canvas component. `apps/nextjs-app` runs Vitest on
`happy-dom@15.11.6`, which has no `WebGLRenderingContext`, so three's `WebGLRenderer` constructor
throws on import. All logic worth testing is already extracted into `buildSimulationGraph` and
`graphTheme`, which are pure and test cleanly.

---

## 10. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KNOWLEDGE_TABLE_ID` | `tblVTWb1kxXSFPBq4Fq` | Teable table ID for `knowledges` |
| `KNOWLEDGE_TYPE_TABLE_ID` | `tblWcq6Kof1AFHvbC5e` | Teable table ID for `knowledge_type` |
| `KNOWLEDGE_GRAPH_MAX_NODES` | `2000` | Hard cap on emitted knowledge nodes |

Defaults are declared **only** in `apps/nestjs-backend/src/configs/knowledge.config.ts` (§2.2).

---

## 11. File index

### New — contract

```text
packages/openapi/src/knowledge-graph/types.ts
packages/openapi/src/knowledge-graph/get.ts
packages/openapi/src/knowledge-graph/get-node.ts
packages/openapi/src/knowledge-graph/index.ts
```

### New — backend

```text
apps/nestjs-backend/src/configs/knowledge.config.ts
apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.module.ts
apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.controller.ts
apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.service.ts
apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.ts
apps/nestjs-backend/src/features/knowledge-graph/knowledge-graph.assembler.spec.ts
apps/nestjs-backend/src/features/knowledge-graph/types.ts
apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts
```

### New — frontend

```text
apps/nextjs-app/src/pages/base/[baseId]/knowledge-graph.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/DynamicKnowledgeGraph.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraph.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraphCanvas.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraphToolbar.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeGraphLegend.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeNodeSearch.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/KnowledgeNodeDetailPanel.tsx
apps/nextjs-app/src/features/app/blocks/knowledge-graph/useKnowledgeGraphStore.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/types.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/hooks/useKnowledgeGraph.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/hooks/useKnowledgeGraphNode.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/hooks/useFullscreen.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/buildSimulationGraph.ts
apps/nextjs-app/src/features/app/blocks/knowledge-graph/utils/graphTheme.ts
packages/common-i18n/src/locales/{en,it,zh,fr,ja,ru,de,uk,tr,es}/knowledge-graph.json
```

### Modified

```text
packages/openapi/src/index.ts                                    + export * from './knowledge-graph'
packages/sdk/src/config/react-query-keys.ts                      + 2 query keys
packages/common-i18n/src/I18nNamespaces.ts                       + knowledge-graph namespace
apps/nestjs-backend/src/app.module.ts                            + KnowledgeGraphModule
apps/nestjs-backend/src/configs/config.module.ts                 + knowledgeConfig
apps/nestjs-backend/src/configs/env.validation.schema.ts         + 3 Joi entries
apps/nextjs-app/package.json                                     + 3 deps, 1 devDep
apps/nextjs-app/.escheckrc                                       es2018 -> es2020 (§4.2)
apps/nextjs-app/src/features/i18n/base-all.config.ts             + namespace
apps/nextjs-app/src/features/app/blocks/base/base-side-bar/BasePageRouter.tsx   + MoreMenu entry
```

### Post-change checks

```bash
pnpm -F @teable/openapi lint && pnpm -F @teable/openapi typecheck && pnpm -F @teable/openapi build
pnpm -F @teable/app typecheck
ls node_modules/.pnpm | grep '^three@'     # must be exactly one line
```

---

## 12. Decisions taken, and what was rejected

| Decision | Rejected alternative | Why |
|----------|---------------------|-----|
| Ignore `is_active` entirely; filter on `deleted_at` only | Filter `is_active is true`, or carry it per-node and dim | Product decision: every non-deleted row is a node. Also the safe reading — checkbox stores `false` as `NULL`, so no predicate on that column can distinguish "never set" from "deactivated" (§1.3) |
| Orphans → synthetic Unclassified type node | Orphans linked straight to core | Preserves "every tier-2 node has one tier-1 parent", which the filter, legend, colour and camera logic all assume (§1.5) |
| Table IDs from env config | Resolve by table name | `TableMeta.name` has no unique constraint and is user-renameable; every existing resolution is by ID (§2.2) |
| `getRecordsFields` | `getRecords` | Single SQL statement, and escapes the hard 1000-row cap that applies even to internal callers (§2.4) |
| Const object for tiers | TypeScript `enum` | Enums are nominal; a re-declared enum breaks assignability across package boundaries (§1.4) |
| Client-side filtering, no query params | `typeIds` / `limit` query params on the endpoint | The client holds the whole graph; a parameterised endpoint whose cache key ignores parameters serves one caller's filter to everyone (§3.3) |
| Colour from a hash of `typeId` | Server-assigned numeric `group` | An index reshuffles every colour when a type is inserted (§3.2) |
| No server cache; ETag only | 60 s TTL cache | Two indexed queries do not need a cache, and a TTL with no invalidation hook makes edits invisible for the TTL (§2.6) |
| No SSR prefetch of the graph | `fetchQuery` in `getServerSideProps` | The component is `ssr: false`, so it ships ~300 KB of dead JSON, and `fetchQuery` turns every backend failure into a hard 500 (§5.2) |
| Single stable `useMemo` for graph data | Staged 3-phase progressive load | force-graph diffs by reference; staging causes three full rebuilds per filter toggle and orphans sprites (§7.7) |
| Orbit about world **Y** | Reference's world-**Z** orbit | Z-orbit is a mathematical no-op from the default camera position (§7.4) |
| Labels on core + types only | Labels on every node | One canvas texture and draw call per sprite; 2000 sprites collapses the frame rate (§7.3) |
| 3D via `react-force-graph-3d` | 2D radial via the already-installed `@xyflow/react` | 3D is the stated requirement and reads better at this branching factor; the 2D fallback is noted at §4.4 as a zero-bundle option |

### Open questions for the implementer

1. **Is `knowledges.knowledge_type` single- or multi-valued?** The extractor handles both and takes
   the first entry (§2.4). If it is genuinely many-many, `typeId` → `typeIds: string[]` is a
   version 2 contract change, not a patch. Confirm with
   `GET /api/table/tblVTWb1kxXSFPBq4Fq/field` against the live instance before implementing.
2. **Is `deleted_at` a Date field or text?** `isEmpty` compiles to `col IS NULL` for a DateTime
   column but `col IS NULL OR col = ''` for a String column. Harmless either way here, but the
   field-type assertion in §2.3 must name the right type or it will reject a valid table.
3. **Do the two tables live in the base the page is mounted on?** §2.6 asserts they do and 404s
   otherwise. If they are meant to be instance-global and readable from any base, the route shape
   changes and per-base authorisation goes with it.
