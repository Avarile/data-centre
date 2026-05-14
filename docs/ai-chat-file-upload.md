# AI Chat File Upload — Design & Implementation Reference

## Table of Contents

1. [Overview](#1-overview)
2. [Constraints & Design Decisions](#2-constraints--design-decisions)
3. [File Inventory](#3-file-inventory)
4. [Database Layer](#4-database-layer)
5. [Storage Layer](#5-storage-layer)
6. [Backend Module](#6-backend-module)
7. [OpenAPI Contract](#7-openapi-contract)
8. [Frontend — ChatPanel](#8-frontend--chatpanel)
9. [Full Call Chain — File Upload](#9-full-call-chain--file-upload)
10. [Full Call Chain — AI Generation with File Context](#10-full-call-chain--ai-generation-with-file-context)
11. [Full Call Chain — File Deletion](#11-full-call-chain--file-deletion)
12. [Access Control](#12-access-control)
13. [Text Extraction by MIME Type](#13-text-extraction-by-mime-type)
14. [Error Handling](#14-error-handling)
15. [Data Flow Diagram](#15-data-flow-diagram)

---

## 1. Overview

The AI chat file upload feature allows users to upload documents into a **base-scoped file library** accessible from the AI Chat panel. Uploaded files are stored in MinIO (object storage), tracked in PostgreSQL, and their text content is automatically extracted and injected as context when the user sends a chat message referencing those files.

The feature is surfaced in the AI Chat panel as two tabs:

- **Chat** — conversation interface with a paperclip button to attach files to the next message
- **Files** — persistent file management for the base, showing all uploaded files with delete capability

---

## 2. Constraints & Design Decisions

### Allowed file types

Only document formats that can be meaningfully read as text by an LLM are permitted:

| Format   | MIME Type                                                                   |
|----------|-----------------------------------------------------------------------------|
| PDF      | `application/pdf`                                                           |
| Plain text | `text/plain`                                                              |
| Markdown | `text/markdown`                                                             |
| HTML     | `text/html`                                                                 |
| CSV      | `text/csv`                                                                  |
| Word (.docx) | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Word (.doc) | `application/msword`                                                     |

This list is enforced in **two places** independently:
- **Frontend** (`ChatPanel.tsx`): checked before the upload begins, providing immediate feedback
- **Backend** (`chat-file.service.ts`): re-checked on `POST /api/:baseId/chat-files` as the authoritative gate

### Maximum file size: 10 MB

Enforced in both frontend and backend for the same reason.

### Scope: per base, shared across collaborators

Files are associated with a `baseId`, not a `userId`. All collaborators with `base|read` access can see and use the file list. This matches the mental model of "a base has a knowledge library". Deletion requires `base|delete` permission.

### Why a separate `chat_file` table instead of reusing `attachments`?

The existing `Attachments` table has no `baseId` column — it is keyed by token and linked to table records via the `attachments_table` join table. Adding `baseId` directly to `attachments` would couple the general-purpose attachment system to the AI-specific concept of a "base file library". A dedicated `chat_file` table keeps concerns separated and makes queries unambiguous.

### Why presigned URLs (not multipart POST to our backend)?

The existing attachment system already uses presigned URLs for all upload types. The client uploads directly to MinIO, bypassing the backend for the binary payload. This keeps binary data out of the NestJS process, scales better, and reuses infrastructure already proven in production. Only the metadata (token, path, size, mimetype) flows through the backend.

### Why soft-delete?

`deletedTime` is set rather than hard-deleting the row. This is consistent with the rest of the codebase (e.g. `Attachments`, `Collaborator`, `Trash`). It allows recovery and audit trails. The object in MinIO is deleted immediately on the delete call; the row lingers with a `deletedTime` timestamp.

---

## 3. File Inventory

### New files created

```
packages/
  db-main-prisma/
    prisma/postgres/migrations/
      20260514000000_add_chat_file/
        migration.sql                          ← SQL DDL for chat_file table

  openapi/src/
    chat-file/
      index.ts                                 ← Route definitions, Zod schemas, axios API functions

apps/
  nestjs-backend/src/features/
    chat-file/
      chat-file.module.ts                      ← NestJS module wiring
      chat-file.controller.ts                  ← REST endpoints (list / save / delete)
      chat-file.service.ts                     ← Business logic, text extraction
```

### Modified files

```
packages/
  db-main-prisma/
    prisma/postgres/
      schema.prisma                            ← Added ChatFile model

  openapi/src/
    ai/
      generate-stream.ts                       ← Added fileTokens?: string[] to aiGenerateRoSchema
    index.ts                                   ← Added export * from './chat-file'

apps/
  nestjs-backend/src/
    features/
      ai/
        ai.module.ts                           ← Imports ChatFileModule
        ai.service.ts                          ← Injects ChatFileService; generateStream now prepends file context
    app.module.ts                              ← Imports and registers ChatFileModule

  nextjs-app/src/features/app/blocks/table/
    chat-panel/
      ChatPanel.tsx                            ← Full rewrite: file upload flow, tabs, file management
```

### External packages added

```
apps/nestjs-backend/package.json
  + mammoth                                    ← Word (.docx / .doc) text extraction
  (pdf-parse was already present at 2.4.5)
```

---

## 4. Database Layer

### Schema

**File:** `packages/db-main-prisma/prisma/postgres/schema.prisma`

```prisma
model ChatFile {
  id          String    @id @default(cuid())
  token       String    @unique          // matches the token from the attachment presign flow
  name        String                     // original filename
  size        BigInt                     // file size in bytes
  mimetype    String                     // MIME type of the file
  path        String                     // MinIO object path (e.g. "chat-file/abc123")
  baseId      String    @map("base_id")  // which base this file belongs to
  createdBy   String    @map("created_by")
  createdTime DateTime  @default(now()) @map("created_time")
  deletedTime DateTime? @map("deleted_time")  // null = active; set = soft-deleted

  @@index([baseId])
  @@map("chat_file")
}
```

### Migration

**File:** `packages/db-main-prisma/prisma/postgres/migrations/20260514000000_add_chat_file/migration.sql`

Creates the `chat_file` table with a primary key, a unique index on `token`, and an index on `base_id` for fast per-base queries. Applied via `prisma migrate deploy`.

### Key fields explained

| Field       | Purpose |
|-------------|---------|
| `token`     | The presigned upload token generated by `AttachmentsService.signature()`. Used as the stable identifier to look up a file during AI generation (`fileTokens` in the request). Also unique so duplicate uploads are detectable. |
| `path`      | The actual object path within the MinIO bucket, returned by `notify()`. This is what the storage adapter uses to download the file for text extraction. |
| `baseId`    | Scopes the file to a base. All `listFiles` queries filter by this. |
| `deletedTime` | Soft-delete marker. Service methods always add `deletedTime: null` to WHERE clauses. |

---

## 5. Storage Layer

### Existing infrastructure reused

The project has a fully abstracted storage layer under:

```
apps/nestjs-backend/src/features/attachments/plugins/
  adapter.ts         ← Abstract base class defining the storage interface
  storage.module.ts  ← NestJS module that provides the adapter as @InjectStorageAdapter()
  storage.ts         ← Provider factory that resolves the concrete adapter from config
  minio.ts           ← MinIO implementation
  s3.ts              ← S3 implementation
  local.ts           ← Local filesystem implementation (dev/test)
  aliyun.ts          ← Aliyun OSS implementation
```

`ChatFileService` injects `StorageAdapter` via the `@InjectStorageAdapter()` decorator, which is provided by `StorageModule`. The concrete implementation (MinIO, S3, local, etc.) is selected at runtime from the environment configuration. The service never references MinIO directly.

### Upload type and bucket routing

**File:** `apps/nestjs-backend/src/features/attachments/plugins/adapter.ts`

`UploadType.ChatFile = 13` was already defined in the codebase. The adapter routes it to:

```typescript
// bucket: private
case UploadType.ChatFile:
  return storageConfig().privateBucket;

// directory prefix within the bucket
case UploadType.ChatFile:
  return 'chat-file';
```

**Reason for private bucket:** Chat files may contain sensitive business documents. Unlike avatars or plugin assets (which go to the public bucket), chat files must require an authenticated presigned URL to be read. They must never be directly URL-addressable by anyone who guesses the path.

### Presigned upload URL

The existing `POST /api/attachments/signature` endpoint (`AttachmentsService.signature()`) generates a time-limited presigned URL for direct PUT to MinIO. The frontend calls this with `type: UploadType.ChatFile`, and the backend returns a URL, upload method, token, and required request headers. The binary upload goes directly from the browser to MinIO — the backend never handles the file bytes during upload.

---

## 6. Backend Module

### Module wiring

**File:** `apps/nestjs-backend/src/features/chat-file/chat-file.module.ts`

```typescript
@Module({
  imports: [StorageModule],          // provides @InjectStorageAdapter()
  controllers: [ChatFileController],
  providers: [ChatFileService],
  exports: [ChatFileService],        // exported so AiModule can inject it
})
export class ChatFileModule {}
```

`ChatFileModule` is registered in `app.module.ts` alongside all other feature modules.

`AiModule` imports `ChatFileModule` so that `AiService` can inject `ChatFileService` without declaring it as a local provider. This keeps the dependency graph clean.

### Controller

**File:** `apps/nestjs-backend/src/features/chat-file/chat-file.controller.ts`

```
GET    /api/:baseId/chat-files           → listFiles(baseId)
POST   /api/:baseId/chat-files           → saveFile(baseId, body)
DELETE /api/:baseId/chat-files/:fileId   → deleteFile(baseId, fileId)
```

All routes use the `@Permissions` decorator with base-level permissions (see [Access Control](#12-access-control)).

Body on `POST` is validated with Zod via `ZodValidationPipe(saveChatFileRoSchema)` before reaching the service, so the service receives a typed `ISaveChatFileRo` object.

### Service

**File:** `apps/nestjs-backend/src/features/chat-file/chat-file.service.ts`

#### `listFiles(baseId)`

Queries `prisma.chatFile.findMany` where `baseId` matches and `deletedTime` is null. Returns all fields mapped to `IChatFileVo` (BigInt `size` is cast to `Number` because JSON serialization does not support BigInt).

#### `saveFile(baseId, dto)`

1. Validates `dto.mimetype` against `ALLOWED_MIME_TYPES` (Set lookup — O(1)).
2. Validates `dto.size <= MAX_FILE_SIZE` (10 MB).
3. Reads `userId` from the CLS (continuation-local storage) context — the authenticated user identity is placed there by the auth middleware and is available throughout the request without passing it as a parameter.
4. Writes a new row to `chat_file`.

Both validation checks throw `CustomHttpException` with `HttpErrorCode.VALIDATION_ERROR` on failure. This is the server-side authoritative check; frontend validation is a UX convenience that can be bypassed.

#### `deleteFile(baseId, fileId)`

1. Looks up the record with both `id = fileId` AND `baseId = baseId` in the WHERE clause. This double-condition prevents a user from deleting a file in another base even if they know its ID.
2. Sets `deletedTime` on the row (soft-delete).
3. Calls `storageAdapter.deleteFile(bucket, path)` to remove the object from MinIO. This is wrapped in a try/catch — if MinIO deletion fails (e.g. object already gone), the soft-delete in the database still succeeds and a warning is logged rather than failing the entire request.

#### `extractTextFromTokens(tokens)`

Called by `AiService.generateStream()` when the request contains `fileTokens`.

1. Queries `prisma.chatFile.findMany` for all records matching the provided tokens (batch lookup), filtering out soft-deleted files.
2. For each record, calls `extractTextFromFile(bucket, path, mimetype, name)`.
3. Each file's extracted text is wrapped with a `--- File: <name> ---` header and joined with double newlines, producing a single concatenated context string.

#### `extractTextFromFile(bucket, path, mimetype, filename)` (private)

Downloads the file from MinIO as a Node.js `Readable` stream using `storageAdapter.downloadFile(bucket, path)`. Buffers the stream into memory. Then branches on MIME type:

- **`application/pdf`** — passes buffer to `pdf-parse`, returns `result.text`
- **Word (`.docx` / `.doc`)** — passes `{ buffer }` to `mammoth.extractRawText()`, returns `result.value`
- **All other types** (text, markdown, HTML, CSV) — decodes buffer as UTF-8 string directly

Both `pdf-parse` and `mammoth` are loaded with `require()` inside the branch rather than at the top of the file. This is a deliberate choice: these libraries are heavy and only needed for specific MIME types. Lazy-loading avoids paying their startup cost on every request.

---

## 7. OpenAPI Contract

### Chat file endpoints

**File:** `packages/openapi/src/chat-file/index.ts`

Exported from `packages/openapi/src/index.ts` via `export * from './chat-file'`.

#### `GET /api/{baseId}/chat-files`

No request body. Returns `IChatFileVo[]`.

```typescript
interface IChatFileVo {
  id: string;
  token: string;
  name: string;
  size: number;         // bytes
  mimetype: string;
  path: string;
  baseId: string;
  createdBy: string;
  createdTime: string;  // ISO 8601
}
```

Frontend call: `listChatFiles(baseId)` → `axios.get<IChatFileVo[]>(...)`

#### `POST /api/{baseId}/chat-files`

Request body `ISaveChatFileRo`:

```typescript
interface ISaveChatFileRo {
  token: string;     // from the notify() response
  name: string;      // original filename
  size: number;      // bytes
  mimetype: string;
  path: string;      // MinIO object path from notify() response
}
```

Returns `IChatFileVo` (the newly created record).

Frontend call: `saveChatFile(baseId, data)` → `axios.post<IChatFileVo>(...)`

#### `DELETE /api/{baseId}/chat-files/{fileId}`

No body. Returns HTTP 200 with null body on success.

Frontend call: `deleteChatFile(baseId, fileId)` → `axios.delete(...)`

### AI generate-stream schema change

**File:** `packages/openapi/src/ai/generate-stream.ts`

`fileTokens` was added to `aiGenerateRoSchema` as an optional field:

```typescript
fileTokens: z.array(z.string()).optional()
```

The frontend passes the tokens of all successfully uploaded (but not yet consumed) files when submitting a chat message. The backend uses these tokens to fetch and extract file text before constructing the final prompt.

`aiGenerateStream()` is called with the native `fetch` API (not axios) to support streaming responses via `ReadableStream`. Tokens are serialized as part of the JSON body.

---

## 8. Frontend — ChatPanel

**File:** `apps/nextjs-app/src/features/app/blocks/table/chat-panel/ChatPanel.tsx`

### State managed by the component

| State variable     | Type                  | Purpose |
|--------------------|-----------------------|---------|
| `activeTab`        | `'chat' \| 'files'`   | Controls which tab is shown |
| `messages`         | `IMessage[]`          | In-memory chat history (not persisted) |
| `isStreaming`      | `boolean`             | Prevents double-submit while AI is responding |
| `isThinking`       | `boolean`             | Shows the reasoning indicator |
| `uploadingFiles`   | `IUploadingFile[]`    | Tracks files being uploaded in the current session |
| `uploadError`      | `string \| null`      | Displays a validation or network error |
| `chatFiles`        | `IChatFileVo[]`       | Fetched from the server; shown in the Files tab |

### `uploadingFiles` vs `chatFiles`

These are two distinct lists:

- `uploadingFiles` is **session-local**: files the user has added in the current browser session that are pending, uploading, or recently uploaded. Once the user submits a message, this list is cleared. This list is not persisted anywhere — it exists solely to show upload progress and collect `token` values for the next submission.
- `chatFiles` is **server-fetched**: all files ever uploaded to this base that have not been deleted. Populated by `GET /api/:baseId/chat-files` via React Query. Shown in the Files tab as the persistent library.

### File input element

A single `<input type="file" className="hidden">` is placed at the top of the Resizable container (outside both tabs). It is referenced by `fileInputRef` and shared by both tabs. Both the Chat tab's paperclip button and the Files tab's upload button call `fileInputRef.current?.click()` to open the OS file picker. The `accept` attribute is set to `ALLOWED_EXTENSIONS` to hint to the OS file picker, though MIME validation in `uploadFile()` is the authoritative check.

### `uploadFile(file)` — upload flow

Called once per file when the file input fires `onChange`. See [Call Chain §9](#9-full-call-chain--file-upload) for the full sequence.

### `handleSubmit(message)` — submission

```typescript
const fileTokens = uploadingFiles
  .filter((f) => !f.uploading && !f.error && f.token)
  .map((f) => f.token as string);
```

Only tokens from successfully completed uploads are included. Files still uploading or in error state are silently excluded. After submitting, `uploadingFiles` is cleared.

### React Query cache

`listChatFiles` is cached under `['chatFiles', baseId]`. After a successful upload (`saveChatFile`), `refetchFiles()` is called to update the Files tab. After a deletion, `queryClient.invalidateQueries({ queryKey: ['chatFiles', baseId] })` forces a refetch.

---

## 9. Full Call Chain — File Upload

```
User selects file(s) via file picker
         │
         ▼
ChatPanel: handleFileInputChange(e)
  │  iterates files, calls uploadFile(file) for each
  ▼
ChatPanel: uploadFile(file)
  │  1. Validate MIME type against ALLOWED_MIME_TYPES array
  │     → if invalid: set uploadError, return early
  │  2. Validate file.size <= MAX_FILE_SIZE (10 MB)
  │     → if too large: set uploadError, return early
  │  3. Add { id: tempId, name, uploading: true } to uploadingFiles state
  │
  │  ── Step A: Get presigned URL ────────────────────────────────────────────
  ▼
getSignature({ type: UploadType.ChatFile, contentLength, contentType, baseId })
  │  POST /api/attachments/signature
  │  [AttachmentsController → AttachmentsService.signature()]
  │  Backend generates a time-limited presigned URL for MinIO
  │  Returns: { url, uploadMethod, token, requestHeaders }
  │
  │  ── Step B: Direct upload to MinIO ───────────────────────────────────────
  ▼
axios({ method: uploadMethod, url, data: file, headers })
  │  Binary PUT directly from browser to MinIO presigned URL
  │  Backend is NOT involved — file bytes bypass the NestJS process
  │  MinIO stores the object at the path encoded in the presigned URL
  │
  │  ── Step C: Notify backend ───────────────────────────────────────────────
  ▼
notify(token, undefined, file.name)
  │  POST /api/attachments/notify/:token?filename=<name>
  │  [AttachmentsController → AttachmentsService.notify()]
  │  Backend verifies the token is valid in its cache
  │  Writes a record to the attachments table (hash, size, mimetype, path)
  │  Returns: { token, size, url, path, mimetype, presignedUrl }
  │
  │  ── Step D: Register chat file reference ─────────────────────────────────
  ▼
saveChatFile(baseId, { token, name, size, mimetype, path })
  │  POST /api/:baseId/chat-files
  │  [ChatFileController → ChatFileService.saveFile()]
  │  Backend re-validates MIME type and size (server-side gate)
  │  Reads userId from CLS (auth context)
  │  Writes row to chat_file table
  │  Returns IChatFileVo
  │
  ▼
uploadingFiles state updated: { uploading: false, token }
refetchFiles() called → Files tab list refreshed
```

---

## 10. Full Call Chain — AI Generation with File Context

```
User types a message and presses Enter (or clicks submit)
         │
         ▼
ChatPanel: handleSubmit(message)
  │  Collects fileTokens from uploadingFiles
  │  (only tokens where !uploading && !error && token exists)
  │  Appends user message + assistant placeholder to messages state
  │  Clears uploadingFiles state
  │
  ▼
ChatPanel: streamAssistantReply(userText, history, fileTokens)
  │
  │  ── HTTP request ─────────────────────────────────────────────────────────
  ▼
aiGenerateStream(baseId, { prompt, fileTokens }, abortSignal)
  │  POST /api/:baseId/ai/generate-stream
  │  Body: { prompt: "<preamble + history + user turn>", fileTokens: ["tok1", ...] }
  │  Uses fetch() (not axios) — returns a Response with a ReadableStream body
  │
  │  ── Backend: AiController ────────────────────────────────────────────────
  ▼
AiController.generateStream(baseId, aiGenerateRo, res)
  │  Validates body via ZodValidationPipe(aiGenerateRoSchema)
  │  Calls AiService.generateStream()
  │
  │  ── Backend: AiService ───────────────────────────────────────────────────
  ▼
AiService.generateStream(baseId, { prompt, fileTokens }, response)
  │  1. Calls getGenerationModelInstance(baseId, aiGenerateRo)
  │     → resolves LLM provider config from space integration or global settings
  │     → returns a Vercel AI SDK LanguageModel instance
  │
  │  2. If fileTokens present and non-empty:
  │     → calls ChatFileService.extractTextFromTokens(fileTokens)
  │
  │  ── Backend: ChatFileService ─────────────────────────────────────────────
  ▼
ChatFileService.extractTextFromTokens(tokens)
  │  Batch query: prisma.chatFile.findMany({ token: { in: tokens }, deletedTime: null })
  │  For each record:
  │
  ▼
ChatFileService.extractTextFromFile(bucket, path, mimetype, name)
  │  storageAdapter.downloadFile(bucket, path) → Readable stream
  │  streamToBuffer() → Buffer
  │
  │  Branch on mimetype:
  │  ├── application/pdf               → pdf-parse(buffer) → { text }
  │  ├── application/msword            → mammoth.extractRawText({ buffer }) → { value }
  │  ├── application/vnd...wordprocessingml → same mammoth path
  │  └── text/* (plain, md, html, csv) → buffer.toString('utf-8')
  │
  │  Returns concatenated string:
  │  "--- File: report.pdf ---\n<text>\n\n--- File: data.csv ---\n<text>"
  │
  │  ── Back in AiService ────────────────────────────────────────────────────
  ▼
AiService: effectivePrompt built:
  "The following files have been provided as context:\n\n<fileContext>\n\n<original prompt>"
  │
  ▼
runGeneralInfoAgent(modelInstance, effectivePrompt)
  │  Runs the Vercel AI SDK agent with the enriched prompt
  │  Returns a streaming result
  │
  ▼
result.pipeTextStreamToResponse(response)
  │  Streams text chunks back to the HTTP response
  │
  │  ── Frontend: readStream ─────────────────────────────────────────────────
  ▼
ChatPanel: readStream(reader, appendChunk)
  │  Reads chunks from the ReadableStream
  │  Each chunk appended to the last message in messages state
  │  React re-renders the message in real time (streaming effect)
  │
  ▼
Stream ends → setIsStreaming(false), setIsThinking(false)
```

---

## 11. Full Call Chain — File Deletion

```
User clicks trash icon on a file in the Files tab
         │
         ▼
ChatPanel: handleDeleteFile(fileId)
  │
  ▼
deleteChatFile(baseId, fileId)
  │  DELETE /api/:baseId/chat-files/:fileId
  │
  ▼
ChatFileController.deleteFile(baseId, fileId)
  │  @Permissions('base|delete') checked by AuthGuard
  │
  ▼
ChatFileService.deleteFile(baseId, fileId)
  │  1. prisma.chatFile.findFirst({ id: fileId, baseId, deletedTime: null })
  │     → 404 NotFoundException if not found or already deleted or wrong base
  │  2. prisma.chatFile.update({ deletedTime: new Date() })  [soft-delete]
  │  3. storageAdapter.deleteFile(bucket, record.path)       [MinIO hard-delete]
  │     → logged as warning if MinIO call fails; does not bubble up
  │
  ▼
queryClient.invalidateQueries(['chatFiles', baseId])
  │  React Query invalidates the cache key
  │
  ▼
useQuery re-fetches GET /api/:baseId/chat-files
Files tab list updated
```

---

## 12. Access Control

### Layer 1 — Authentication

All chat-file endpoints require a valid session. `ChatFileController` inherits the global `AuthGuard` applied at the NestJS app level. Unauthenticated requests receive HTTP 401.

### Layer 2 — Permission decorator

```typescript
// Reading and uploading: any collaborator with read access
@Permissions('base|read')   // GET list, POST save

// Deletion: requires explicit delete permission
@Permissions('base|delete') // DELETE
```

The `@Permissions` decorator is checked by the Teable permission guard that reads the user's collaborator role for the given `baseId` from the CLS context. Permissions are in the format `resource|action` and are loaded per-request.

### Layer 3 — baseId scoping in queries

Even if a user has permissions on one base, the `deleteFile` method explicitly includes `baseId` in the WHERE clause:

```typescript
prisma.chatFile.findFirst({ where: { id: fileId, baseId, deletedTime: null } })
```

This ensures a user cannot delete a file from a different base even if they know its `fileId`.

### Layer 4 — Server-side re-validation of file constraints

`saveFile()` re-validates MIME type and file size on the server. A client that bypasses frontend validation (e.g. via curl) still cannot store a disallowed file type in the `chat_file` table. The token that would be passed to `saveChatFile` might exist in MinIO from a direct presigned upload, but without a valid `chat_file` row, the token will never be used by `extractTextFromTokens`.

### Layer 5 — Token-based storage access

MinIO files in the private bucket cannot be accessed without a presigned URL. The `path` stored in `chat_file` is a private MinIO object path. To read the object, one must either:
- Have MinIO credentials (server only)
- Have a valid presigned read URL (generated server-side with expiry)

The frontend never calls MinIO directly for reads — file content is extracted server-side during AI generation.

---

## 13. Text Extraction by MIME Type

**File:** `apps/nestjs-backend/src/features/chat-file/chat-file.service.ts` — `extractTextFromFile()`

| MIME Type | Library | Notes |
|-----------|---------|-------|
| `application/pdf` | `pdf-parse@2.4.5` (already installed) | Extracts raw text from all PDF pages. Does not handle scanned/image-only PDFs (no OCR). |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` | Extracts plain text from `.docx` files. Ignores images, charts, headers/footers by default. |
| `application/msword` | `mammoth` | Same path as `.docx`; mammoth handles both binary `.doc` and `.docx` formats. |
| `text/plain` | — | Buffer decoded as UTF-8 directly. |
| `text/markdown` | — | Buffer decoded as UTF-8 directly. Markdown syntax is preserved and passed to the LLM as-is; LLMs handle markdown well natively. |
| `text/html` | — | Buffer decoded as UTF-8 directly. HTML tags are included; the LLM can parse them but this is a known limitation for heavily-styled HTML. |
| `text/csv` | — | Buffer decoded as UTF-8 directly. |

Both `pdf-parse` and `mammoth` are lazy-loaded (`require()` inside the branch) rather than imported at module level. This avoids initializing heavy native modules unless they are actually needed for a given request.

---

## 14. Error Handling

### Frontend (`ChatPanel.tsx`)

| Scenario | Behaviour |
|----------|-----------|
| Invalid MIME type selected | `uploadError` state set; error message shown above the input; upload aborted before any network call |
| File exceeds 10 MB | Same as above |
| `getSignature` fails | Caught in `uploadFile` try/catch; chip shows "Upload failed" in red |
| MinIO PUT fails | Same as above |
| `notify` or `saveChatFile` fails | Same as above |
| File still uploading at submit time | Its token is undefined; filtered out of `fileTokens`; silently not included |
| AI stream aborted | AbortController fires; if assistant message is empty it is removed from history |
| AI stream network error | Assistant message set to localized error string |

### Backend (`chat-file.service.ts`)

| Scenario | Behaviour |
|----------|-----------|
| Disallowed MIME type on `saveFile` | `CustomHttpException` with `VALIDATION_ERROR` → HTTP 400 |
| File too large on `saveFile` | Same |
| `deleteFile` record not found | `NotFoundException` → HTTP 404 |
| MinIO `deleteFile` fails on delete | Logged as `warn`; does not throw; soft-delete still committed |
| `extractTextFromFile` throws for one file | Caught per-file in `extractTextFromTokens`; logged as `warn`; remaining files still processed |

---

## 15. Data Flow Diagram

```
Browser                        NestJS Backend             MinIO / PostgreSQL
──────────────────────────     ──────────────────────     ─────────────────────────

┌─────────────────────────┐
│     ChatPanel.tsx       │
│                         │
│  [User selects file]    │
│        │                │
│  uploadFile(file)       │
│        │                │
│   [validate locally]    │
│        │                │
│  ① POST /attachments    │──────────────────────────►  AttachmentsService
│     /signature          │                              .signature()
│                         │◄──────────────────────────  { url, token, headers }
│                         │
│  ② PUT <presigned-url>  │──────────────────────────────────────────────────►  MinIO
│     (binary file)       │                                                     stores object
│                         │
│  ③ POST /attachments    │──────────────────────────►  AttachmentsService
│     /notify/:token      │                              .notify()
│                         │◄──────────────────────────  { path, size, mimetype }
│                         │                              ─────────────────────►  attachments table
│                         │
│  ④ POST /api/:baseId    │──────────────────────────►  ChatFileController
│     /chat-files         │                              .saveFile()
│                         │◄──────────────────────────  IChatFileVo
│                         │                              ─────────────────────►  chat_file table
│                         │
│  [User sends message]   │
│  handleSubmit()         │
│        │                │
│  ⑤ POST /api/:baseId    │──────────────────────────►  AiController
│     /ai/generate-stream │                              .generateStream()
│   { prompt,             │                                    │
│     fileTokens: [...] } │                              AiService
│                         │                              .generateStream()
│                         │                                    │
│                         │                              ChatFileService
│                         │                              .extractTextFromTokens()
│                         │                                    │
│                         │                              storageAdapter       ◄──  MinIO
│                         │                              .downloadFile()           downloads object
│                         │                                    │
│                         │                              pdf-parse / mammoth / utf-8
│                         │                                    │
│                         │                              prompt prepended with
│                         │                              file context
│                         │                                    │
│                         │                              runGeneralInfoAgent()
│                         │◄──────────────────────────  stream chunks
│  readStream()           │
│  append to messages     │
│  [UI updates in real    │
│   time as chunks arrive]│
└─────────────────────────┘
```
