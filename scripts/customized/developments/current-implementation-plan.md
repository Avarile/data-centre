# MCP Server — Implementation Plan

Companion to `current-design.md`. That document decides *what* and *why*; this one decides
*against which existing symbols* and *how each step is proven*.

> The previous contents of this file (Knowledge Graph 3D plan) are committed at `aadc634` and
> recoverable with
> `git show aadc634:scripts/customized/developments/current-implementation-plan.md`.

Every signature below was read out of the working tree. **Where this plan conflicts with
`current-design.md`, this plan wins**, and §0 says why.

---

## 0. Corrections to the design doc

### 0.1 Would not compile / would not resolve

| # | Design implies | Reality | Fix |
|---|---|---|---|
| C1 | `McpModule` imports `PermissionModule` to get `PermissionService` | `PermissionModule` is `@Global()` and exports `PermissionService` (`permission.module.ts:7,21`). `TrashModule` injects it **without** importing (`trash.module.ts:19-32`) | Do **not** import `PermissionModule`. Inject `PermissionService` directly |
| C2 | Import `TableModule` / `RecordModule` for the open-api services | `TableModule` exports `[FieldModule, RecordModule, TableService, TablePermissionService]` (`table.module.ts:12`) — **not** `TableOpenApiService`. `RecordModule` exports `RecordService` only (`record.module.ts:22`) | Import the `*OpenApiModule`s: `TableOpenApiModule` :53, `FieldOpenApiModule` :39, `RecordOpenApiModule` :43, `ViewOpenApiModule` :27. Import `RecordModule` **as well**, for `RecordService` reads |
| C3 | `createTable(baseId, ro)` takes the raw create RO | Signature is `createTable(baseId, tableRo: ICreateTableWithDefault)` (:220). The controller applies `TablePipe` (`table-open-api.controller.ts:154`), which is `prepareCreateTableRo(value)` (`table.pipe.ts:9`) | Call `prepareCreateTableRo(ro)` — exported from `table.pipe.helper.ts:7` — before `createTable` |
| C4 | `update_table` needs only `tableId` | `updateName(baseId, tableId, name)` :599, `updateDescription(baseId, tableId, description)` :611, `updateIcon` :605 — all require `baseId` | Resolve `baseId` from `tableId` via `PermissionService.getUpperIdByTableId`, or take `baseId` as a tool argument |

### 0.2 Compiles, but is wrong at runtime

| # | Trap | Consequence | Fix |
|---|---|---|---|
| R1 | `getRecord` defaults `fieldKeyType = FieldKeyType.Name` (`record.service.ts:1082`) | Every `record.fields[field.id]` silently returns `undefined` | Always pass `fieldKeyType: FieldKeyType.Id` explicitly. Same for `getRecords` |
| R2 | Omitting `cls.set('permissions', …)` after `validPermissions` | Silent wrong output, HTTP 200 (design §4.3) | The registry pipeline sets it. No tool may call a service outside the pipeline |
| R3 | `Promise.all` over batched tool calls | Interleaved writes to one request-scoped cls store, cross-contaminated permissions | Sequential dispatch, enforced in `tool-registry.ts` |
| R4 | `vitest.config.ts:39` excludes `**/*.controller.spec.ts` | Such a spec reports 0 tests and exits 0 | Never create `mcp.controller.spec.ts`. Controller coverage is e2e |

### 0.3 Environment facts

- **Trash retention is declared but unimplemented.** `configs/trash.config.ts` defines
  `retention: 30d` and `scanInterval: 1h`, but the **only** consumer is `config.module.ts:29`
  registering it. No `@Cron`, no `ScheduleModule` anywhere in the backend. The only deletions of
  `tableTrash` / `recordTrash` rows are user-initiated restore (`trash.service.ts:863-867,888`),
  user-initiated trash reset (`:957`, gated on `table|trash_reset`), and permanent table deletion
  (`:1051-1055`).
  **Design §6.1's premise holds, and is stronger than assumed** — recovery is currently unbounded,
  and the declared *intent* of 30 days would still far exceed the window in which a user notices a
  bad delete. No change to §6 required.
- `operationId` is generated unconditionally on both record delete (`record-delete.service.ts:77`)
  and view delete (`view-open-api.service.ts:109`), so the trash listener's `if (!operationId)`
  guard never trips. Trash capture does **not** depend on `windowId`. Confirms design §2.
- Undo/redo *does* require `windowId` (`undo-redo-operation.service.ts:267`) — irrelevant to us, but
  do not conflate the two mechanisms.
- `PermissionService.validPermissions` is already called imperatively outside a guard in
  `trash.service.ts:779-784`. Design §4's approach is idiomatic, not novel.
- Config idiom is `registerAs('<ns>', () => ({ … Number(process.env.X ?? default) }))` plus an
  `Inject` helper and a `ReturnType` type — see `threshold.config.ts:7`, `trash.config.ts:8`.

---

## 1. Module wiring

`features/mcp/mcp.module.ts`, modelled on `TrashModule`:

```ts
@Module({
  imports: [
    SpaceModule,             // SpaceService            (space.module.ts:15)
    BaseModule,              // BaseService             (base.module.ts:64)
    TableOpenApiModule,      // TableOpenApiService     (:53)
    FieldOpenApiModule,      // FieldOpenApiService     (:39)
    RecordOpenApiModule,     // RecordOpenApiService    (:43)
    ViewOpenApiModule,       // ViewOpenApiService      (:27)
    RecordModule,            // RecordService (reads)   (:22)
  ],
  controllers: [McpController, McpManifestController],
  providers: [McpService, McpToolRegistry],
})
export class McpModule {}
```

`PermissionService` is injected directly — no import (C1).

---

## 2. Execution order

Phases 2–9 are defined in `todo-list`. This plan adds the per-phase symbol bindings:

| Tool | Call | Notes |
|---|---|---|
| `list_spaces` | `SpaceService.getSpaceList()` :132 | Already token-filtered via `filterSpaceListWithAccessToken` :117 |
| `list_bases` | `SpaceService.getBaseListBySpaceId(spaceId)` :258 / `BaseService.getAllBaseList()` :152 | |
| `list_tables` | `TableOpenApiService.getTables(baseId)` :312 | |
| `get_table_schema` | `getTable(baseId, tableId)` :308 + `FieldOpenApiService.getFields(tableId, query)` :551 | needs `baseId` (C4 resolver) |
| `list_views` | `ViewService` via `ViewOpenApiModule` | |
| `query_records` | `RecordService.getRecords(tableId, query)` :1033 | `fieldKeyType: Id` (R1); cap `take` |
| `get_record` | `RecordService.getRecord(tableId, recordId, query)` :1075 | `fieldKeyType: Id` (R1) |
| `create_records` | `RecordOpenApiService.multipleCreateRecords(tableId, ro)` :65 | |
| `update_record` | `RecordOpenApiService.updateRecord(tableId, recordId, ro)` :172 | |
| `delete_records` | `RecordOpenApiService.deleteRecords(tableId, recordIds)` :213 | cap at `maxDeletePerCall` |
| `create_table` | `prepareCreateTableRo(ro)` → `createTable(baseId, prepared)` :220 | C3 |
| `update_table` | `updateName` :599 / `updateDescription` :611 / `updateIcon` :605 | C4 |
| `create_field` | `FieldOpenApiService.createField(tableId, fieldRo)` :1330 | |
| `create_view` | `ViewOpenApiService.createView(tableId, viewRo)` :86 | |
| `delete_view` | `ViewOpenApiService.deleteView(tableId, viewId)` :102 | trash-recoverable |

---

## 3. Proof obligations

Each phase closes only when its row is green:

| Phase | Proven by |
|---|---|
| 2 | Real MCP SDK `Client` completes `initialize` + `tools/list` |
| 3 | Reads return correct data under a least-privilege PAT; no out-of-scope names in listings |
| 4 | Writes succeed; delete capped; **delete → trash restore round-trip passes in e2e** |
| 5 | Catalogue matches design §5 exactly; exclusions asserted absent |
| 6 | Browser: create token → copy snippet → real client connects |
| 7 | Full permission matrix green |
| 8 | `/security-review` + `/code-review` findings resolved |
| 9 | Manual end-to-end with real Claude Code including trash restore |
