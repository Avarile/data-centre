# Knowledge Graph 3D — Implementation Plan

Companion to `current-design.md`. That document decides *what* and *why*; this one decides *in
what order*, *against which existing symbols*, and *how each step is proven*.

Every signature below was read out of the working tree. Where the design doc's code would not
compile or would misbehave against the real APIs, this plan **overrides it** and §0 says why.

---

## 0. Corrections to the design doc

The design was written against reconnaissance; the following were verified against the actual
source and differ. **Where this table conflicts with `current-design.md`, this plan wins.**

### 0.1 Would not compile

| # | Design says | Reality | Fix |
|---|---|---|---|
| C1 | Tiers as a const **object** + `z.enum(obj)` | `packages/openapi/src` has **zero** `} as const;` object literals. The established trio is a const **array**: `GatewayModelTypeValues` (`admin/setting/gateway-model.ts:12-14`), `AttachmentTransferModeValues` (`admin/setting/update.ts:125-127`) | Use `<Thing>Values` const array + `(typeof X)[number]` + `z.enum(X)` (§2.1) |
| C2 | `imports: [RecordModule, AuthModule]` | `AuthModule` exports only `[AuthService, AuthGuard]` (`auth.module.ts:64`) — it does **not** export `PermissionService`. Injection works anyway because `PermissionModule` is `@Global()` via `GlobalModule` | `imports: [RecordModule]` only (§4.4) |
| C3 | Node detail served from the graph read | `getRecordsFields` returns `Pick<IRecord,'id'\|'fields'>` — **no** `createdTime`/`lastModifiedTime`. The detail VO promises both | Detail endpoint uses `recordService.getRecord(...)`, which returns full `IRecord` (§4.3) |
| C4 | `getFieldsByProjection(tableId, string[])` | 2nd param is `{ [fieldNameOrId: string]: boolean }` | Wrap with `recordService.convertProjection(ids)` (§4.2) |
| C5 | `@Req() req` untyped / `Express.Request` | Global `Express.Request` has no `.headers`. `attachments.controller.ts:17` uses the correct form | `import type { Request, Response } from 'express'` (§4.5) |
| C6 | `import { RouteConfig }` | `@typescript-eslint/consistent-type-imports` is `error` | `import type { RouteConfig }` (§2.2) |
| C7 | `Spin` from `@teable/ui-lib/shadcn` | Not exported there | `import { Spin } from '@teable/ui-lib/base'`, or just use `Skeleton` (§9) |
| C8 | `useResizeObserver` reusable from the SDK | `packages/sdk/src/components/grid/index.ts` does not export `./hooks`, and `package.json#exports` has no deep subpath | Write a local hook (§8.3) |

### 0.2 Compiles, but is wrong at runtime

| # | Trap | Consequence | Fix |
|---|---|---|---|
| R1 | `getRecord` defaults `fieldKeyType` to **`Name`** internally | Every `record.fields[field.id]` silently returns `undefined` | Always pass `fieldKeyType: FieldKeyType.Id` explicitly (§4.3) |
| R2 | `dbRecord2RecordFields` **drops** cells whose converted value is null | An empty `context` key is *absent*, not `null` | Read with `?? null`, never assume the key exists (§4.2) |
| R3 | Link cells are `ILinkCellValue` when `isMultipleCellValue` is falsy, `ILinkCellValue[]` when true — **not normalized** | Iterating a bare object yields its keys | Branch on `Array.isArray` (already in the design's extractor) (§4.2) |
| R4 | `field.isMultipleCellValue` is `boolean \| undefined` | Fails a strict `boolean` position | `?? false` |
| R5 | `getRecordsFields` reads `cls.get('user.id')` via `buildFilterSortQuery` | Throws outside a request context | Call only from the controller path — never a cron/bootstrap hook |
| R6 | `createdTime`/`lastModifiedTime` are `string \| undefined` on `IRecord` | A non-optional VO field fails its own zod validation | Mark both `.nullable()` in the detail VO (§2.3) |
| R7 | `vitest.config.ts` **excludes** `**/*.controller.spec.ts` | Such a spec silently reports 0 tests and exits 0 | Never create `knowledge-graph.controller.spec.ts`; controller coverage lives in e2e (§5) |
| R8 | `MoreMenu` renders only when `basePermission?.['base\|update']` | A read-only viewer could never reach a read-only graph | Register in `pageRoutes`, not `MoreMenu` (§10.2) |
| R9 | `Design.tsx`'s shell is `overflow-y-auto` | ResizeObserver ↔ scrollbar feedback loop around a measured canvas | `overflow-hidden` + `flex flex-col` + `min-h-0 flex-1` host (§9.1) |
| R10 | `getUpperIdByTableId` **throws** `NOT_FOUND`; never returns null | `if (!upper)` is dead code | Let it propagate; only compare `baseId` (§4.4) |

### 0.3 Environment facts the design assumed

- **No supertest, no jest** anywhere. E2E specs call the typed `@teable/openapi` clients; `initApp()`
  installs `axios.defaults.baseURL` + a cookie interceptor on the shared axios singleton. Unit and
  e2e both run on **vitest** (`vi.fn()`, not `jest.fn()`).
- `initApp()` is **memoized on `globalThis.initApp` and takes no arguments**, so
  `Test.createTestingModule().overrideProvider(...)` is unreachable from a spec. The design's
  "mutate the resolved config object" approach is the only mechanism that works, and it is the
  established one — `dual-db-split.e2e-spec.ts:206-224` is the model (it also *restores* the
  original value in `afterAll`, which the plan copies).
- `GitBranch` is **not** in `@teable/icons` (255 exports enumerated). Use `Network` / `Share2` /
  `Component` from `@teable/icons`, or `lucide-react` (a direct dep, already used in `Design.tsx`).
- There is a **second, duplicate** shadcn set at `apps/nextjs-app/src/components/ui/`. Importing
  from it alongside `@teable/ui-lib/shadcn` produces duplicate Radix context providers. Never use it.
- **No fullscreen utility exists** anywhere in the repo (zero `requestFullscreen` hits). §8.4 writes one.
- `take: -1` (unlimited) is honoured by `getRecordsFields` and is idiomatic here —
  `selection.service.ts:212-222` is the precedent.

---

## 1. Sequencing

Eleven phases. Each is independently compilable and independently revertable; the tree is green at
every phase boundary.

```text
P1  contract        packages/openapi/src/knowledge-graph            ── no deps
P2  config          apps/nestjs-backend/src/configs
P3  assembler       pure fn + unit spec                             ── depends on P1 types
P4  service+ctrl    feature module + app.module registration        ── depends on P1,P2,P3
P5  backend e2e                                                     ── depends on P4
P6  deps            three / react-force-graph-3d / three-spritetext
P7  shared FE       ReactQueryKeys + i18n namespace
P8  FE logic        pure utils, store, hooks                        ── depends on P1,P7
P9  FE components   canvas, legend, search, detail, toolbar         ── depends on P6,P8
P10 page + nav      route + sidebar entry
P11 verification    full typecheck / lint / test / manual pass
```

**Suggested commit boundaries:** P1 · P2+P3 · P4 · P5 · P6+P7 · P8 · P9 · P10 · P11.
P1–P5 are shippable without any frontend; the endpoint is independently useful to the mastra agent.

**Command reference** (workspace names are `@teable/openapi`, `@teable/backend`, `@teable/app`):

```bash
pnpm -F @teable/openapi typecheck && pnpm -F @teable/openapi lint && pnpm -F @teable/openapi build
pnpm -F @teable/backend  typecheck && pnpm -F @teable/backend  lint
pnpm -F @teable/backend  test-unit
pnpm -F @teable/backend  test-e2e        # runs pre-test-e2e seed first
pnpm -F @teable/app      typecheck && pnpm -F @teable/app lint
pnpm dev                                  # backend + app + mastra in parallel
```

---

## 2. P1 — Contract (`packages/openapi/src/knowledge-graph/`)

### 2.1 `types.ts`

Follows the `<Thing>Values` const-array trio (C1). Note `.meta()` is always **last** in the chain,
and lines must stay under **100 chars** (prettier runs as an eslint rule).

```ts
import { z } from '../zod';

export const KNOWLEDGE_GRAPH_VERSION = 1;

export const KNOWLEDGE_CORE_NODE_ID = 'core';
export const TYPE_NODE_PREFIX = 'type:';
export const KNOWLEDGE_NODE_PREFIX = 'kn:';
export const UNCLASSIFIED_TYPE_NODE_ID = `${TYPE_NODE_PREFIX}__unclassified__`;

export const KnowledgeNodeTierValues = ['core', 'type', 'knowledge'] as const;
export type KnowledgeNodeTier = (typeof KnowledgeNodeTierValues)[number];
export const knowledgeNodeTierSchema = z.enum(KnowledgeNodeTierValues);

export const KnowledgeLinkTierValues = ['core-type', 'type-knowledge'] as const;
export type KnowledgeLinkTier = (typeof KnowledgeLinkTierValues)[number];
export const knowledgeLinkTierSchema = z.enum(KnowledgeLinkTierValues);

export const knowledgeGraphNodeSchema = z.object({
  id: z.string().meta({ description: 'Unique node id: core, type:<recordId> or kn:<recordId>.' }),
  recordId: z.string().nullable().meta({ description: 'Record id; null for synthetic nodes.' }),
  tier: knowledgeNodeTierSchema.meta({ description: 'Depth in the 3-tier star.' }),
  label: z.string().meta({ description: 'Display title.' }),
  typeId: z.string().nullable().meta({ description: 'Parent type node id; null above tier 2.' }),
  degree: z.number().int().meta({ description: 'Adjacent node count, precomputed for sizing.' }),
});
export type IKnowledgeGraphNode = z.infer<typeof knowledgeGraphNodeSchema>;

export const knowledgeGraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  tier: knowledgeLinkTierSchema,
  value: z.number().meta({ description: 'Edge weight; child count for core-type, else 1.' }),
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

Because the tier types are **string unions**, the assembler writes `tier: 'core'` directly — there
is no runtime enum object to import, and nothing is nominal, so the same type flows through all
three packages without a cast.

### 2.2 `get.ts`

Import order is lint-enforced (`import/order`, alphabetize asc): `@asteasolutions` → `@teable/*` →
`../axios` → `../utils` → `../zod` → `./types`.

```ts
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';
import {
  knowledgeGraphLinkSchema,
  knowledgeGraphNodeSchema,
  knowledgeGraphStatsSchema,
} from './types';

export const GET_KNOWLEDGE_GRAPH = '/base/{baseId}/knowledge-graph';

export const getKnowledgeGraphVoSchema = z.object({
  version: z.number().int().meta({ description: 'Payload shape version.' }),
  etag: z.string().meta({ description: 'Strong ETag over nodes + links + stats.' }),
  nodes: knowledgeGraphNodeSchema.array(),
  links: knowledgeGraphLinkSchema.array(),
  stats: knowledgeGraphStatsSchema,
});
export type IGetKnowledgeGraphVo = z.infer<typeof getKnowledgeGraphVoSchema>;

export const GetKnowledgeGraphRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_KNOWLEDGE_GRAPH,
  description: 'Get the knowledge graph for a base: a synthetic core, one node per type, one per knowledge.',
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

### 2.3 `get-node.ts`

`createdTime` / `lastModifiedTime` are **`.nullable()`** (R6) — `IRecord` types them
`string | undefined` and `__last_modified_time` can be null in the database.

```ts
export const GET_KNOWLEDGE_GRAPH_NODE = '/base/{baseId}/knowledge-graph/node/{nodeId}';

export const getKnowledgeGraphNodeVoSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  tier: z.enum(['type', 'knowledge'] as const),
  label: z.string(),
  context: z.string().nullable().meta({ description: 'Full body text; may be long.' }),
  typeId: z.string().nullable(),
  typeLabel: z.string().nullable().meta({ description: 'Carried free by the link cell.' }),
  createdTime: z.string().nullable(),
  lastModifiedTime: z.string().nullable(),
});
export type IGetKnowledgeGraphNodeVo = z.infer<typeof getKnowledgeGraphNodeVoSchema>;
```

plus the matching `registerRoute` (`request.params` = `{ baseId, nodeId }`) and client
`getKnowledgeGraphNode(baseId, nodeId)` using `urlBuilder`.

### 2.4 Barrels

```ts
// packages/openapi/src/knowledge-graph/index.ts
export * from './types';
export * from './get';
export * from './get-node';
```

```diff
  // packages/openapi/src/index.ts — APPEND as the final line; the file is not alphabetized
  export * from './user-integration';
+ export * from './knowledge-graph';
```

Forgetting either line compiles cleanly but the route never reaches `/docs` and the client fn is
unreachable — `registerRoute` only runs as an import side effect.

**Verify P1**

```bash
pnpm -F @teable/openapi typecheck && pnpm -F @teable/openapi lint && pnpm -F @teable/openapi build
node -e "const o=require('./packages/openapi/dist/index.js');
  console.log(typeof o.getKnowledgeGraph, o.KNOWLEDGE_CORE_NODE_ID, o.KnowledgeNodeTierValues)"
```

> `typecheck` also compiles `@teable/core` sources (composite project). A pre-existing core error
> can masquerade as a knowledge-graph failure — check the reported path before debugging.

---

## 3. P2 — Backend configuration

`apps/nestjs-backend/src/configs/knowledge.config.ts` — copy the shape of `base.config.ts`
(`registerAs` + `Inject` helper + `ConfigType` alias):

```ts
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

Two registrations — **both** are required or `Inject(knowledgeConfig.KEY)` fails at boot:

```diff
  // apps/nestjs-backend/src/configs/config.module.ts
+ import { knowledgeConfig } from './knowledge.config';
- const configurations = [ ...bootstrapConfigs, ..., trashConfig ];
+ const configurations = [ ...bootstrapConfigs, ..., trashConfig, knowledgeConfig ];
```

```diff
  // apps/nestjs-backend/src/configs/env.validation.schema.ts   (Joi — NOT zod)
+ KNOWLEDGE_TABLE_ID: Joi.string().pattern(/^tbl/),
+ KNOWLEDGE_TYPE_TABLE_ID: Joi.string().pattern(/^tbl/),
+ KNOWLEDGE_GRAPH_MAX_NODES: Joi.number().integer().min(1),
```

No `.default()` in Joi — defaults live only in the config factory, because Joi defaults are written
back onto `process.env` *before* the factory runs and would make the `??` fallbacks dead code.

The mutable-object property of `registerAs` results is what makes the e2e override in §5 possible.

---

## 4. P3/P4 — Backend feature module

```text
apps/nestjs-backend/src/features/knowledge-graph/
├── types.ts                            field-name constants + row DTOs
├── knowledge-graph.assembler.ts        pure; no Nest imports
├── knowledge-graph.assembler.spec.ts   unit tests (co-located — required)
├── knowledge-graph.service.ts
├── knowledge-graph.controller.ts
└── knowledge-graph.module.ts
```

### 4.1 P3 — the assembler first

Build `types.ts` + `knowledge-graph.assembler.ts` + its spec **before** the service. It is pure,
it is where every graph-shape decision lives, and it is fully testable with no database.

Take the assembler body verbatim from `current-design.md` §2.5 with two adjustments:

- `IKnowledgeTypeRow` / `IKnowledgeRow` carry no `isActive` (already removed in the design).
- Tier literals are plain strings (`tier: 'core'`), since C1 replaced the enum object.

Row DTOs:

```ts
export interface IKnowledgeTypeRow {
  recordId: string;
  title: string;
}
export interface IKnowledgeRow extends IKnowledgeTypeRow {
  typeRecordId: string | null;
}
```

**Unit spec — `knowledge-graph.assembler.spec.ts`** (co-located under `src/`; a `.spec.ts` under
`test/` is picked up by *neither* config and never runs). Twelve cases from design §9, plus the
contract guard:

```ts
import { getKnowledgeGraphVoSchema, KNOWLEDGE_GRAPH_VERSION } from '@teable/openapi';
import { assembleKnowledgeGraph } from './knowledge-graph.assembler';

it('emits a payload that satisfies the published contract', () => {
  const graph = assembleKnowledgeGraph(types, knowledges, OPTS);
  expect(() =>
    getKnowledgeGraphVoSchema.parse({ version: KNOWLEDGE_GRAPH_VERSION, etag: '"x"', ...graph })
  ).not.toThrow();
});
```

That single assertion is what stops the assembler and the schema drifting apart across packages.

**Verify P3:** `pnpm -F @teable/backend test-unit` — confirm the reporter shows the new file with a
non-zero test count. A file reporting *0 tests* means the glob missed it.

### 4.2 Service — the graph read

```ts
const FIELD_SPECS = [
  { name: 'title', types: [FieldType.SingleLineText, FieldType.LongText], required: true },
  { name: 'deleted_at', types: [FieldType.Date], required: true },
  { name: 'knowledge_type', types: [FieldType.Link, FieldType.SingleLineText], required: false },
] as const;

// getFieldsByProjection takes a projection MAP, not string[] (C4).
const fields = await this.recordService.getFieldsByProjection(tableId);
```

Then read rows:

```ts
const rows = await this.recordService.getRecordsFields(
  tableId,
  {
    fieldKeyType: FieldKeyType.Id,
    projection: [titleFieldId, knowledgeTypeFieldId].filter(Boolean),
    filter: notDeleted,
    ignoreViewQuery: true,
    take: this.knowledgeConfig.maxKnowledgeNodes + 1,   // +1 detects truncation
  },
  true
);
```

Cell extraction must tolerate absent keys (R2) and un-normalized link values (R3, R4):

```ts
const title = (row.fields[titleFieldId] as string | undefined) ?? '';
const rawLink = row.fields[knowledgeTypeFieldId];          // undefined when the cell is empty
const isMulti = knowledgeTypeField.isMultipleCellValue ?? false;
const first = Array.isArray(rawLink) ? rawLink[0] : rawLink;
```

`extractTypeRecordId` is otherwise as designed: an object with an `id` → use `link.id`; a string →
look it up in the `titleToRecordId` map built from the types read; anything else → `null` (orphan).

Order matters: **read types first**, build `titleToRecordId`, then read knowledges — the text-column
fallback depends on it.

### 4.3 Service — the node detail read (C3, R1)

`getRecordsFields` cannot serve this endpoint. Use the single-record API and pass `fieldKeyType`
explicitly, or every field lookup returns `undefined`:

```ts
const record = await this.recordService.getRecord(tableId, recordId, {
  fieldKeyType: FieldKeyType.Id,       // MANDATORY — getRecord defaults to Name (R1)
  projection: [titleFieldId, contextFieldId, knowledgeTypeFieldId],
});

return {
  id: nodeId,
  recordId: record.id,
  tier,
  label: (record.fields[titleFieldId] as string | undefined) ?? '',
  context: (record.fields[contextFieldId] as string | undefined) ?? null,
  typeId,
  typeLabel,
  createdTime: record.createdTime ?? null,
  lastModifiedTime: record.lastModifiedTime ?? null,
};
```

`nodeId` is parsed by prefix: `type:` → the type table, `kn:` → the knowledge table, anything else
(including bare `core` and `type:__unclassified__`) → `NOT_FOUND`.

### 4.4 Service — base ownership check (C2, R10)

```ts
// PermissionService is available with no module import — PermissionModule is @Global().
private async assertTablesInBase(baseId: string, tableIds: string[]): Promise<void> {
  for (const tableId of tableIds) {
    // Throws CustomHttpException(NOT_FOUND) itself when the table is missing or soft-deleted.
    const { baseId: owner } = await this.permissionService.getUpperIdByTableId(tableId);
    if (owner !== baseId) {
      throw new CustomHttpException(
        `Knowledge table ${tableId} does not belong to base ${baseId}`,
        HttpErrorCode.NOT_FOUND
      );
    }
  }
}
```

Module:

```ts
@Module({
  imports: [RecordModule],          // NOT AuthModule (C2)
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
```

### 4.5 Controller (C5)

```ts
import type { Request, Response } from 'express';   // NOT the global Express namespace (C5)

@Controller('api/base/:baseId/knowledge-graph')
export class KnowledgeGraphController {
  @Permissions('record|read')
  @Get()
  async getKnowledgeGraph(
    @Param('baseId') baseId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,      // passthrough is mandatory
  ): Promise<IGetKnowledgeGraphVo | undefined> { /* … as designed */ }
}
```

Copy `dashboard.controller.ts` for the import block and decorator stack. Do **not** copy
`TableController`'s class-level `@UseGuards(V2FeatureGuard)` / `@AllowAnonymous()` stack.

### 4.6 Registration

```diff
  // apps/nestjs-backend/src/app.module.ts
+ import { KnowledgeGraphModule } from './features/knowledge-graph/knowledge-graph.module';
      V2Module,
+     KnowledgeGraphModule,
```

**Verify P4**

```bash
pnpm -F @teable/backend typecheck && pnpm -F @teable/backend lint
pnpm dev   # then, against a base whose knowledge tables are configured:
curl -i -b "$COOKIE" localhost:3000/api/base/$BASE_ID/knowledge-graph | head -30
curl -s -b "$COOKIE" -H "If-None-Match: $ETAG" -o /dev/null -w '%{http_code}\n' \
  localhost:3000/api/base/$BASE_ID/knowledge-graph      # expect 304
```

---

## 5. P5 — Backend e2e

`apps/nestjs-backend/test/knowledge-graph.e2e-spec.ts`. No supertest; typed clients only.

```ts
import type { INestApplication } from '@nestjs/common';
import { FieldType } from '@teable/core';
import { getKnowledgeGraph, getKnowledgeGraphNode } from '@teable/openapi';
import { knowledgeConfig, type IKnowledgeConfig } from '../src/configs/knowledge.config';
import { createTable, permanentDeleteTable, initApp } from './utils/init-app';
import { getError } from './utils/get-error';

describe('KnowledgeGraph (e2e)', () => {
  let app: INestApplication;
  let cfg: IKnowledgeConfig;
  let original: Pick<IKnowledgeConfig, 'knowledgeTableId' | 'knowledgeTypeTableId'>;
  let typeTableId = '';
  let knowledgeTableId = '';
  const baseId = globalThis.testConfig.baseId;

  beforeAll(async () => {
    // initApp() is memoized and takes no args — overrideProvider is unreachable.
    app = (await initApp()).app;

    typeTableId = (await createTable(baseId, { name: 'knowledge_type', fields: [...] })).id;
    knowledgeTableId = (await createTable(baseId, { name: 'knowledges', fields: [...] })).id;

    // The only working override: mutate the resolved registerAs object
    // (dual-db-split.e2e-spec.ts:206-224 is the model — save and restore).
    cfg = app.get(knowledgeConfig.KEY);
    original = {
      knowledgeTableId: cfg.knowledgeTableId,
      knowledgeTypeTableId: cfg.knowledgeTypeTableId,
    };
    cfg.knowledgeTableId = knowledgeTableId;
    cfg.knowledgeTypeTableId = typeTableId;
  });

  afterAll(async () => {
    Object.assign(cfg, original);                 // restore — specs share one app instance
    await permanentDeleteTable(baseId, knowledgeTableId);
    await permanentDeleteTable(baseId, typeTableId);
  });
});
```

Cases:

| # | Assertion |
|---|---|
| 1 | 200; `nodes[0].id === 'core'`; `stats` matches the fixture counts |
| 2 | A row with `deleted_at` set **disappears** |
| 3 | Rows with `is_active` `true` / `false` / never-set are **all three present** — the regression guard for design §1.3 |
| 4 | A knowledge with no link lands under `type:__unclassified__` |
| 5 | `getKnowledgeGraphNode(baseId, 'kn:<id>')` returns the `context` body and non-null timestamps |
| 6 | `getError(() => getKnowledgeGraphNode(baseId, 'core'))` → `error?.status === 404` |
| 7 | Tables owned by another base → **404** |
| 8 | Non-member user → **403** (guard, not service). Distinct from 7 — do not conflate |

`fileParallelism: false` and all specs share the seeded `bseTestBaseId`, so the `afterAll` teardown
is mandatory, not hygiene.

**Verify P5:** `pnpm -F @teable/backend test-e2e` (runs the `pre-test-e2e` seed first — invoking
vitest directly against `vitest-e2e.config.ts` fails on the missing fixture rows).

---

## 6. P6 — Frontend dependencies

```bash
pnpm add --filter @teable/app react-force-graph-3d@1.29.1 three@0.183.2 three-spritetext@1.10.0
pnpm add --filter @teable/app -D @types/three@0.183.1
ls node_modules/.pnpm | grep '^three@'      # MUST print exactly one line
```

The dedupe check is not optional. `three-spritetext` peers on `three` while `3d-force-graph`
depends on it; with `auto-install-peers=true` and `strict-peer-dependencies=false` pnpm will
happily install a *second* copy, which breaks `instanceof` so sprite labels silently never attach.

```diff
  // apps/nextjs-app/.escheckrc — three r183 ships ES2020 syntax
- "ecmaVersion": "es2018",
+ "ecmaVersion": "es2020",
```

Do **not** add these to `transpilePackages`. If a build surfaces an ESM-only `d3-*` transitive,
add just that package (the list already carries `d3-interpolate` and `d3-color` for this reason).
Next 16 defaults to Turbopack, so the `webpack()` hook is inert — any resolve fix belongs in
`turbopack.resolveAlias`.

**Verify P6:** `pnpm -F @teable/app typecheck` and `pnpm -F @teable/app build`.

---

## 7. P7 — Shared frontend plumbing

### 7.1 Query keys

```diff
  // packages/sdk/src/config/react-query-keys.ts  (keep the file's naming-convention pragma)
+ knowledgeGraph: (baseId: string) => ['knowledge-graph', baseId] as const,
+
+ knowledgeGraphNode: (baseId: string, nodeId: string) =>
+   ['knowledge-graph-node', baseId, nodeId] as const,
```

### 7.2 i18n — five files, all required

1. `packages/common-i18n/src/locales/en/knowledge-graph.json` — the key set from design §8.4.
2. The same file copied into the other nine locale dirs (`it, zh, fr, ja, ru, de, uk, tr, es`).
   `next-i18next.config.js` lists all ten; a missing file yields empty strings, not a fallback.
3. `packages/common-i18n/src/I18nNamespaces.ts` — **both** an
   `import type knowledgeGraph from './locales/en/knowledge-graph.json';` line **and** a
   `'knowledge-graph': typeof knowledgeGraph;` interface member. Omitting either produces a
   confusing error at the *config* file, not at the json.
4. `apps/nextjs-app/src/features/i18n/base-all.config.ts` — add `'knowledge-graph'` to both the
   union type and the array.
5. `packages/common-i18n/src/locales/en/common.json` — add `noun.knowledgeGraph`, because the
   sidebar label is rendered with `t('common:noun.knowledgeGraph')` like its `design` / `trash`
   siblings. Missing → the raw key string renders.

> No CI check enforces locale parity — the only parity spec is hardcoded to the `table` namespace.
> Missing keys will not fail the build.

---

## 8. P8 — Frontend logic (no rendering)

Everything here is pure or hook-level and testable without WebGL.

- **`utils/buildSimulationGraph.ts`** — as designed (two args; `showInactive` is gone). The
  node-cloning comment is load-bearing: `react-force-graph` mutates what it receives and would
  otherwise corrupt the react-query cache.
- **`utils/graphTheme.ts`** — `hashHue`, `colorForNode`, `NODE_VAL`, `LINK_DISTANCE`,
  `TIER_CHARGE`, and the `DEFAULT_*` fallbacks. Every tier-keyed lookup uses `??`; an unknown tier
  returning `undefined` makes d3 produce `NaN` positions and the scene renders empty with no error.
- **`useKnowledgeGraphStore.ts`** — zustand v4.5.2, plain `create<T>(...)` (the curried
  `create<T>()(...)` form is only needed with middleware). `hiddenTypeIds` holds exclusions.
- **`hooks/useKnowledgeGraph.ts` / `useKnowledgeGraphNode.ts`** — react-query v5 object form,
  `useBaseId()` from `@teable/sdk/hooks`, `enabled: Boolean(baseId)`.
- **`hooks/useResizeObserver.ts`** — write locally (C8). The SDK's version is not exported and
  applies a grid-specific `document.body.clientHeight - window.innerHeight` fudge that would
  mis-size a 3D canvas.
- **`hooks/useFullscreen.ts`** — write from scratch; nothing in the repo uses the Fullscreen API.
  Own `document.fullscreenElement`, subscribe to `fullscreenchange`, and never mirror the flag into
  the store.

Optional unit spec: `buildSimulationGraph` and `colorForNode` are pure and worth covering. If you
add one, it must contain at least one test — `apps/nextjs-app` sets `passWithNoTests: false`.

---

## 9. P9 — Frontend components

Order: `KnowledgeGraphCanvas` → `Legend` → `Search` → `DetailPanel` → `Toolbar` → `KnowledgeGraph`
(orchestrator) → `DynamicKnowledgeGraph`. Build the canvas against a hardcoded 3-node fixture
first, so rendering is proven before the query is wired in.

### 9.1 Layout contract (R9)

The host must not scroll:

```tsx
<div className="flex h-screen flex-col overflow-hidden bg-background">
  <header className="shrink-0 border-b …">…</header>
  <div ref={containerRef} className="relative min-h-0 flex-1">
    {width > 0 && height > 0 && <KnowledgeGraphCanvas width={width} height={height} … />}
  </div>
</div>
```

`react-force-graph-3d` needs explicit numeric `width`/`height` — it has no `fitView`. Gate the
mount on non-zero dimensions or the first frame initialises a 0×0 WebGL context.
`BaseErd` is **not** a precedent here: it relies on ReactFlow's `fitView` inside a parent with
inline `calc()` sizing.

### 9.2 Component notes

- **Imports:** `@teable/ui-lib/shadcn` for `Button`, `Skeleton`, `Alert`, `Command`, `Popover`,
  `Switch`, `Badge`, `cn`. `Spin` only from `@teable/ui-lib/base` (C7). Never from
  `apps/nextjs-app/src/components/ui/`.
- **Search:** set `shouldFilter={false}` on `<Command>` and filter the node list yourself. cmdk
  1.0.0's built-in fuzzy filter over ~2000 items is a per-keystroke cost, and we already hold the
  full list.
- **Detail panel:** `siblingCount` is computed from the cached graph
  (`nodes.filter(n => n.typeId === node.typeId).length`), never fetched.
- **Toolbar refresh:** `queryClient.invalidateQueries({ queryKey: ReactQueryKeys.knowledgeGraph(baseId) })`,
  not a bare `refetch()`.
- **Icons:** `Network` / `Share2` / `Component` from `@teable/icons`, or `lucide-react`.
  `GitBranch` is **not** in `@teable/icons`.
- **Dynamic wrapper:** mirror `blocks/erd/DynamicBaseErd.tsx` exactly — `ssr: false` is mandatory
  (the library touches `window` at import time) and it is also what keeps three out of the initial
  page chunk measured by `.size-limit.js`.

### 9.3 Canvas lifecycle

Implement design §7.4–§7.7 as written, in this order — each is a real defect in the reference:

1. Auto-rotate orbits world **Y** around `controls.target`, and calls `controls.update()` rather
   than `camera.lookAt`.
2. Cancel listeners attach to `fg.renderer().domElement`.
3. `disposeSprites()` runs on graph change **and** unmount.
4. No staged progressive load — one stable `useMemo`.
5. Unmount: `pauseAnimation()` → `disposeSprites()` → `_destructor?.()`. `reactStrictMode: true`
   runs effects twice in dev, so a missing teardown leaks a second WebGL context immediately.

**Do not write a component-level unit spec.** `apps/nextjs-app` runs on happy-dom, which has no
WebGL; `react-force-graph-3d` throws on import. Coverage belongs to the P8 pure modules.

---

## 10. P10 — Page and navigation

### 10.1 Page

`apps/nextjs-app/src/pages/base/[baseId]/knowledge-graph.tsx`, cloned from `design.tsx`. Prefetch
**only** `base` and `basePermission` — not the graph. `fetchQuery` rejects on error, which would
turn every backend 404 into a hard 500 and bypass the error UI entirely; and the consumer is
`ssr: false`, so a dehydrated payload is dead weight in the HTML.

`getTranslationsProps(context, baseAllConfig.i18nNamespaces)` takes the **context**, not a locale
string — it reads the locale from the `X-Server-Locale` response header.

Static files in `pages/base/[baseId]/` win over the `[[...slug]].tsx` catch-all; no routing change.

### 10.2 Sidebar (R8)

Register in **`pageRoutes`**, not `MoreMenu`. `MoreMenu` renders only when
`basePermission?.['base|update']`, which would hide a read-only view from read-only users.

```diff
  // features/app/blocks/base/base-side-bar/BasePageRouter.tsx
        [
+         {
+           href: `/base/${baseId}/knowledge-graph`,
+           label: t('common:noun.knowledgeGraph'),
+           Icon: Network,
+           hidden: false,
+         },
          {
            href: `/base/${baseId}/authority-matrix`,
```

`hidden: false` must be explicit. The annotated element type has no `hidden` member and the array
relies on inference before `.filter((item) => !item.hidden)` — an entry omitting the key can break
`item.hidden` resolution.

> This entry will be the **first ever visible `pageRoutes` item** — the only existing one is
> `hidden: true`, so the `<ul>`/`UpgradeWrapper` render path is effectively unexercised. Check it
> visually, and confirm the whole router is skipped under `useIsReadOnlyPreview()`.

---

## 11. P11 — Verification

```bash
pnpm g:typecheck
pnpm g:lint
pnpm -F @teable/backend test-unit
pnpm -F @teable/backend test-e2e
pnpm -F @teable/app build
pnpm -F @teable/app check-size          # dynamic chunk must not enter the 120 kb page budget
ls node_modules/.pnpm | grep '^three@'  # exactly one
```

Manual pass against a base with real data:

| # | Check |
|---|---|
| 1 | Graph renders; core at centre, one branch per type, correct counts in the toolbar |
| 2 | Type colours stable across a reload, and unchanged when an unrelated type is added |
| 3 | Legend toggles hide/show a branch; "show all" restores |
| 4 | Search selects a node, camera flies to it, auto-rotate stops |
| 5 | Auto-rotate actually rotates **from first paint** (the reference's bug) and yields on drag |
| 6 | Detail panel shows the context body and timestamps |
| 7 | Empty base → empty state, canvas not mounted |
| 8 | `KNOWLEDGE_GRAPH_MAX_NODES=5` → truncation banner appears |
| 9 | Toggle every type off → "all types hidden", no NaN/blank canvas |
| 10 | Navigate away and back 10× — WebGL contexts do not accumulate (DevTools → Memory) |
| 11 | `prefers-reduced-motion: reduce` → auto-rotate starts off |
| 12 | `/docs` lists both routes under the `knowledge-graph` tag |

### Rollback

Phases are additive except four edits, which are the entire revert surface:
`packages/openapi/src/index.ts`, `apps/nestjs-backend/src/app.module.ts`,
`apps/nestjs-backend/src/configs/config.module.ts`, and `BasePageRouter.tsx`.
Reverting those four removes the feature from the running system; the rest is dead code.

---

## 12. Risks carried into implementation

| Risk | Detection | Response |
|---|---|---|
| `knowledges.knowledge_type` is **multi-valued** | `GET /api/table/tblVTWb1kxXSFPBq4Fq/field` → `isMultipleCellValue: true` | Ship v1 taking the first link (already handled). A true many-many taxonomy is a `typeIds: string[]` contract v2, not a patch. **Check this before P3** — it is the only finding that could change the node schema |
| `deleted_at` is not a Date field | The P4 field-type assertion throws at first request | Widen `FIELD_SPECS.deleted_at` to the real type. `isEmpty` is valid for both Date and text |
| Knowledge tables live outside the page's base | P5 case 7 fails, or the endpoint 404s in dev | Revisit the route shape — an instance-global graph needs a different mount point and loses per-base authorisation |
| Two `three` copies | `ls node_modules/.pnpm \| grep '^three@'` shows 2 | Pin `three` in `apps/nextjs-app/package.json`; there is no catalog/override to fix it centrally |
| `check-dist` fails on ES2020 | `pnpm -F @teable/app check-dist` | Already handled by the `.escheckrc` bump in P6 |
| Mastra app token gets 403 | Agent calls fail after P4 | The token needs `record|read` in scope **and** the base inside its allowlist — `getPermissions` intersects user and token permissions. Not automatic |
