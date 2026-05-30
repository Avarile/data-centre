# AI Chat — Full Call Chain Analysis

## Overview

The AI chat system spans three layers: **Frontend** (Next.js app), **OpenAPI package** (shared types + fetch wrappers), and **Backend** (NestJS). Two flows exist: the primary **chat/generate-stream** flow and the **ingest-stream** flow for bulk file import into tables.

---

## 1. Frontend Layer

### Entry Points

**`ChatPanel.tsx`** — top-level orchestrator  
`apps/nextjs-app/src/features/app/blocks/table/chat-panel/ChatPanel.tsx`

```
ChatPanel
 ├─ state: messages[], isStreaming, isThinking, uploadingFiles, selectedFileIds
 ├─ useQuery(['chatFiles', baseId]) → listChatFiles(baseId)   # load uploaded file list
 ├─ handleFileInputChange(e)
 │    └─ uploadFile(file)
 │         ├─ getSignature({ type: UploadType.ChatFile, ... })  # GET /api/signature
 │         ├─ axios({ method, url, data: file })                # PUT/POST to S3
 │         ├─ notify(token, undefined, file.name)               # POST /api/notify
 │         └─ saveChatFile(baseId, { token, name, size, mimetype, path })
 │              └─ POST /api/{baseId}/chat-files
 │
 ├─ handleSubmit(PromptInputMessage)
 │    ├─ collect fileTokens  (selected chatFiles + completed uploadingFiles)
 │    ├─ push userMsg + assistantPlaceholder to messages[]
 │    ├─ setIsStreaming(true), setIsThinking(true)
 │    └─ streamAssistantReply(userText, history, fileTokens)
 │
 └─ streamAssistantReply(_userText, history, fileTokens)
      ├─ build apiMessages[]  (inject selectedRecordsContext into last user msg)
      ├─ aiGenerateStream(baseId, { messages: apiMessages, fileTokens }, signal)
      │    └─ fetch POST /api/{baseId}/ai/generate-stream  [native fetch, returns Response]
      ├─ reader = res.body.getReader()
      ├─ readStream(reader, appendChunk)   # helpers.ts — TextDecoder loop
      └─ appendChunk(chunk)
           ├─ scan chunk for \x00 separator
           ├─ pre-separator bytes  → message.reasoning  (collapsible thinking section)
           └─ post-separator bytes → message.content    (final visible answer)
```

### Child Components

**`ChatInputArea.tsx`**  
`chat-panel/components/ChatInputArea.tsx`

```
ChatInputArea
 ├─ PromptInputProvider (context provider for textarea state)
 ├─ PromptInput → PromptInputTextarea  (user types here)
 ├─ VoiceParser  (mic + TTS)
 ├─ file picker button → onAttachClick → <input type="file" ref>
 ├─ ModelSelector  (file selection dropdown, lists chatFiles)
 └─ PromptInputSubmit → onSubmit(PromptInputMessage) → ChatPanel.handleSubmit
```

**`VoiceParser.tsx`**  
`chat-panel/components/VoiceParser.tsx`

```
VoiceParser
 ├─ STT (Speech-to-Text)
 │    ├─ window.SpeechRecognition / webkitSpeechRecognition  (browser Web Speech API)
 │    ├─ recognition.onresult → controller.textInput.setInput(transcript)
 │    └─ toggleListening() → recognition.start() / recognition.stop()
 │
 └─ TTS (Text-to-Speech)
      ├─ playTts(text, fromUserGesture)
      │    ├─ stripForTts(text)  (strip markdown / emoji)
      │    ├─ aiTtsStream(baseId, cleanText, signal)
      │    │    └─ fetch POST /api/{baseId}/ai/tts  [native fetch, returns Response]
      │    ├─ res.blob() → URL.createObjectURL(blob)
      │    └─ new Audio().play()
      └─ auto-play: triggered when isStreaming flips false and isVoiceActive is true
```

**`ChatConversation.tsx`** — renders messages[], splits reasoning vs answer  
**`ChatPanelHeader.tsx`** — clear session button → `ChatPanel.handleClearSession()`  
**`IngestionTab.tsx`** — calls `aiIngestStream()` → POST `/api/{baseId}/ai/ingest-stream`

### State Persistence

```
localStorage key: "chat-history:{baseId}"
 ├─ written: after every non-streaming state update (useEffect on messages)
 └─ read:    loadStoredMessages(baseId) on component mount
```

---

## 2. OpenAPI Package Layer (shared types + fetch wrappers)

`packages/openapi/src/ai/` and `packages/openapi/src/chat-file/`

### Chat / Generate

**`generate-stream.ts`**
```typescript
// Schema
IAiGenerateRo {
  prompt?:    string                           // single-shot
  messages?:  { role: 'user'|'assistant', content: string }[]  // multi-turn
  task?:      'coding' | 'embedding' | 'translation'
  modelKey?:  string                           // e.g. "openai@gpt-4o@my-provider"
  fileTokens?: string[]                        // uploaded file tokens for context
}

// Fetch wrapper (native fetch — returns Response for streaming)
aiGenerateStream(baseId, aiGenerateRo, signal?) → fetch POST /api/{baseId}/ai/generate-stream
```

**`ingest-stream.ts`**
```typescript
IAiIngestRo { files: File[], targetTable: string, description?: string }
aiIngestStream(baseId, ro, signal?) → fetch POST /api/{baseId}/ai/ingest-stream  (multipart/form-data)
```

**`ai/index.ts`** (TTS)
```typescript
aiTtsStream(baseId, text, signal?) → fetch POST /api/{baseId}/ai/tts
```

### Chat Files

**`chat-file/index.ts`**
```typescript
listChatFiles(baseId)              → axios GET  /api/{baseId}/chat-files
saveChatFile(baseId, dto)          → axios POST /api/{baseId}/chat-files
deleteChatFile(baseId, fileId)     → axios DELETE /api/{baseId}/chat-files/{fileId}
```

---

## 3. Backend Layer

### Controllers

**`AiController`**  
`apps/nestjs-backend/src/features/ai/ai.controller.ts`  
Route prefix: `api/:baseId/ai` | Guard: `@Permissions('base|read')`

| Method | Route | Handler → Service call |
|--------|-------|------------------------|
| POST | `/generate-stream` | `aiService.generateStream(baseId, aiGenerateRo, res)` |
| GET | `/config` | `aiService.getSimplifiedAIConfig(baseId)` |
| GET | `/disable-ai-actions` | `aiService.getAIDisableAIActions(baseId)` |
| POST | `/tts` | `aiService.tts(body.text, res)` |
| POST | `/ingest-stream` | `aiService.ingestStream(baseId, files, targetTable, description, res)` |

Ingest route uses `FilesInterceptor` (multer memoryStorage, max 10 files, 10 MB each, allowlisted MIME types).

**`ChatFileController`**  
`apps/nestjs-backend/src/features/chat-file/chat-file.controller.ts`  
Route prefix: `api/:baseId/chat-files`

| Method | Route | Service call |
|--------|-------|--------------|
| GET | `/` | `chatFileService.listFiles(baseId)` |
| POST | `/` | `chatFileService.saveFile(baseId, dto)` |
| DELETE | `/:fileId` | `chatFileService.deleteFile(baseId, fileId)` |

---

### AiService (facade)

`apps/nestjs-backend/src/features/ai/ai.service.ts`

Thin facade — composes all sub-services. External modules inject `AiService` only.

```
AiService
 ├─ generateStream()     → GenerationService.generateStream()
 ├─ ingestStream()       → GenerationService.ingestStream()
 ├─ generateText()       → GenerationService.generateText()
 ├─ tts()               → TtsService.tts()
 ├─ getAIConfig()        → AiConfigService.getAIConfig()
 ├─ getSimplifiedAIConfig() → AiConfigService.getSimplifiedAIConfig()
 ├─ getAIDisableAIActions() → AiConfigService.getAIDisableAIActions()
 ├─ getChatModelInstance()  → AiConfigService.getAIConfig() + ModelResolverService.getModelInstance() ×3
 ├─ getModelInstance()   → ModelResolverService.getModelInstance()
 ├─ getModelTags()       → ModelCapabilityService.getModelTags()
 ├─ findFirstVisionModel() → ModelCapabilityService.findFirstVisionModel()
 └─ fetchGatewayModelsFromApi() → GatewayModelService.fetchGatewayModelsFromApi()
```

---

### GenerationService — Core AI Logic

`apps/nestjs-backend/src/features/ai/service/generation.service.ts`

#### `generateStream(baseId, aiGenerateRo, response)`

```
1. AiConfigService.getAIConfig(baseId)          # fetch + merge space/instance AI config (30s cache)
2. getTaskModelKey(config, task)                # resolve modelKey from task type or use explicit key
3. ModelResolverService.getModelInstance(modelKey, llmProviders)
4. ModelCapabilityService.getModelTags(modelKey, llmProviders)
     └─ supportsTools = tags.includes('tool-use')

5. response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })

IF supportsTools:
  6a. injectFileContext / injectFileContextToMessages(messages, fileTokens)
        └─ ChatFileService.buildFileContext(fileTokens)
             ├─ query chatFile table for tokens
             ├─ download from storage
             └─ parse (PDF via pdf-parse, Word via mammoth, text as-is)
  6b. runGeneralInfoAgent(modelInstance, input, baseId)   [agents/general-agents.ts]
        └─ returns textStream (AsyncIterable<string>)
  6c. stream loop:
        ├─ buffer until [ANSWER]\n marker found
        ├─ pre-marker text → response.write(reasoning)
        ├─ response.write('\x00')              # separator for frontend split
        └─ post-marker text → response.write(answer)
  6d. fallback: if totalText === 0 after agent → streamText() direct (no tools)

ELSE (no tool-use):
  6e. streamText({ model, messages/prompt })
        └─ iterate textStream → response.write(chunk)

7. response.end()
```

#### `ingestStream(baseId, files, targetTable, description, response)`

```
1. AiConfigService.getAIConfig(baseId)
2. ModelResolverService.getModelInstance(modelKey, llmProviders)
3. For each file: ChatFileService.extractTextFromBuffer(buffer, mimetype)
4. Build prompt: "Ingest ... into table {targetTable}" + <file_context>
5. response.writeHead(200, ...)
6. runIngestionAgent(modelInstance, { prompt })
7. iterate textStream → response.write(chunk)
8. response.end()
```

#### `generateText(baseId, aiGenerateRo)` (non-streaming, used internally)

```
1. AiConfigService.getAIConfig(baseId)
2. ModelResolverService.getModelInstance(modelKey, llmProviders)
3. generateText({ model, prompt })  [ai SDK]
4. return result.text
```

---

### AiConfigService

`apps/nestjs-backend/src/features/ai/service/ai-config.service.ts`

```
getAIConfig(baseId)   [@PerformanceCache ttl=30s]
 ├─ prisma.base.findUniqueOrThrow({ id: baseId }) → get spaceId
 ├─ prisma.integration.findFirst({ resourceId: spaceId, type: AI, enable: true }) → space AI config
 ├─ settingService.getSetting([SettingKey.AI_CONFIG]) → instance AI config
 └─ merge strategy:
      • No space config → use instance config, mark all providers isInstance=true
      • No instance chatModel.lg → use space config only
      • Both present → instance chatModel triple overrides space; providers merged (space first, instance fills gaps), instance providers marked isInstance=true

getSimplifiedAIConfig(baseId) → getAIConfig() with secrets redacted
getAIDisableAIActions(baseId) → union of disabledAIActions from space + instance
```

---

### ModelResolverService

`apps/nestjs-backend/src/features/ai/service/model-resolver.service.ts`

**Model key format:** `{type}@{model}@{providerName}`  
Examples: `openai@gpt-4o@teable`, `aiGateway@anthropic/claude-sonnet-4@teable`, `openai@gpt-4o@my-byok`

```
parseModelKey(modelKey) → { type, model, name }
isGatewayModel(modelKey) → type === 'aiGateway'
checkInstanceAIModel(modelKey) → modelKey.endsWith('@teable')

getModelConfig(modelKey, llmProviders)
 ├─ IF gateway: settingService.getSetting() → aiGatewayApiKey + aiGatewayBaseUrl
 └─ ELSE: find provider in llmProviders by type+name → return { type, model, baseUrl, apiKey }

getModelInstance(modelKey, llmProviders, isImageGeneration?)
 ├─ getModelConfig(...)
 ├─ IF aiGateway: createGateway({ apiKey, baseURL? })(model)
 └─ ELSE: match type to modelProviders map → create provider instance:
      openai           → createOpenAI({ apiKey, baseURL })
      anthropic        → createAnthropic({ apiKey })
      google           → createGoogleGenerativeAI({ apiKey })
      azure            → createAzure(...)
      cohere           → createCohere(...)
      mistral          → createMistral(...)
      deepseek         → createDeepSeek(...)
      xai              → createXai(...)
      togetherai       → createTogetherAI(...)
      ollama           → createOllama(...)
      amazonbedrock    → createAmazonBedrock(...)
      openrouter       → createOpenRouter(...)
      (default)        → createOpenAI compatible wrapper
```

---

### ModelCapabilityService

`apps/nestjs-backend/src/features/ai/service/model-capability.service.ts`

```
getModelTags(modelKey, llmProviders) → GatewayModelTag[]
 ├─ IF gateway model: GatewayModelService.getGatewayModelConfig(modelId) → tags[]
 └─ ELSE: find provider in llmProviders → return provider.tags or []

findFirstVisionModel(llmProviders)
 └─ first gateway or custom provider where tags includes 'vision'
```

Tags include: `'tool-use'`, `'vision'`, `'file-input'`, etc.

---

### GatewayModelService

`apps/nestjs-backend/src/features/ai/service/gateway-model.service.ts`

```
fetchGatewayModelsFromApi()  → GET https://ai-gateway.vercel.sh/v1/models
getGatewayModelConfig(modelId) → local static config or API fallback → { tags, pricing, ... }
getGatewayModelPricing(modelId) → { inputPrice, outputPrice }
```

---

### TtsService

`apps/nestjs-backend/src/features/ai/service/tts.service.ts`

```
tts(text, response)
 ├─ read ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID from env
 ├─ fetch POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream
 │    body: { text, model_id }
 │    Accept: audio/mpeg
 └─ Readable.fromWeb(upstream.body).pipe(response)
      Content-Type: audio/mpeg, Transfer-Encoding: chunked
```

---

### ChatFileService

`apps/nestjs-backend/src/features/chat-file/chat-file.service.ts`

```
listFiles(baseId)       → prisma.chatFile.findMany({ where: { baseId, deletedTime: null } })
saveFile(baseId, dto)   → prisma.chatFile.create({ data: { ...dto, baseId, createdBy: userId } })
deleteFile(baseId, id)  → prisma.chatFile.update({ data: { deletedTime: new Date() } })

buildFileContext(tokens[]) → string | null
 ├─ query chatFile by tokens
 ├─ download each file from storage (signed URL)
 └─ extractTextFromBuffer(buffer, mimetype)
      ├─ PDF  → pdf-parse(buffer) → text
      ├─ Word → mammoth.extractRawText({ buffer }) → text
      └─ text/markdown/html/csv → buffer.toString('utf-8')

extractTextFromBuffer(buffer, mimetype) → string   # also used by ingestStream
```

---

## 4. Agent Layer

### GeneralInfoAgent

`apps/nestjs-backend/src/features/ai/agents/general-agents.ts`

Activated when model has `tool-use` capability.

```
runGeneralInfoAgent(model, input, baseId?)
 ├─ createNodeSandbox(skillSearchDir)
 │    ├─ readFile(path, 'utf-8')         → fs.promises.readFile
 │    ├─ readdir(dir, opts)              → fs.promises.readdir
 │    ├─ exec(command, opts)             → child_process.exec (in skillDir CWD)
 │    └─ query(sql, params)              → pg Pool (READ ONLY transaction)
 │
 ├─ getOrDiscoverSkills(sandbox, [skillSearchDir])  [lazy singleton]
 │    └─ discoverSkills(): scan for subdirs with SKILL.md → parse frontmatter → ISkillMetadata[]
 │
 └─ createGeneralInfoAgent(model).stream({ ...input, options: { sandbox, skills, state, baseId } })
      abortSignal: AbortSignal.timeout(90_000)
```

**System prompt (3-step mandatory workflow):**
1. `loadDatabaseSchema` — discover live schema (spaces → bases → tables → fields → links)
2. Plan and execute (query or skill)
3. Return answer starting with `[ANSWER]\n` token

**Available tools:**

| Tool | What it does |
|------|-------------|
| `loadDatabaseSchema` | SELECT from table_meta, base, space, field → returns full schema + relationship summary |
| `queryDatabase` | SELECT-only parameterised query via pg pool |
| `loadSkill` | Read SKILL.md, set `state.skillDir` |
| `readFile` | Read any file relative to skillDir |
| `bash` | Run `node scripts/<name>.js [arg]` in skillDir (allowlisted command pattern only) |

**Skill sandbox scripts** (in `sandbox/teable-database-crud/scripts/`):
- `get-records.js` — fetch records from a table
- `create-records.js` — batch-create records (up to 1000)
- `update-record.js` — update a single record
- `delete-record.js` — delete a record
- `lookup-link-id.js` — resolve link field record IDs

**Answer streaming:**  
Agent emits all text. `[ANSWER]\n` marker in the stream separates reasoning from final answer. `GenerationService` converts the marker to `\x00` before forwarding to the client.

---

### IngestionAgent

`apps/nestjs-backend/src/features/ai/agents/ingestion-agent.ts`

```
runIngestionAgent(model, { prompt })
 ├─ same sandbox + skills infrastructure as GeneralInfoAgent
 └─ workflow:
      1. loadDatabaseSchema → find target table
      2. loadSkill('teable-database-crud')
      3. parse file content from <file_context>
      4. map fields, resolve link IDs via lookup-link-id.js
      5. bash: node scripts/create-records.js (batched ≤1000)
      6. stream result report (created / partial / failed counts)
```

---

## 5. Full Call Chain Diagrams

### A. Chat Message (tool-use model)

```
User types message
  └─ ChatPanel.handleSubmit(PromptInputMessage)
       ├─ collect fileTokens (from selectedFileIds + uploadingFiles)
       ├─ push userMsg + assistantPlaceholder to messages[]
       ├─ setIsStreaming(true), setIsThinking(true)
       └─ streamAssistantReply(text, history, fileTokens)
            └─ aiGenerateStream(baseId, { messages, fileTokens }, signal)
                 └─ fetch POST /api/{baseId}/ai/generate-stream
                      └─ AiController.generateStream()
                           └─ AiService.generateStream()
                                └─ GenerationService.generateStream()
                                     ├─ AiConfigService.getAIConfig(baseId)
                                     │    ├─ prisma: get spaceId from base
                                     │    ├─ prisma: get space AI integration config
                                     │    └─ settingService: get instance AI config → merge
                                     │
                                     ├─ getTaskModelKey(config, task)
                                     │
                                     ├─ ModelResolverService.getModelInstance(modelKey, providers)
                                     │    ├─ getModelConfig() → resolve baseUrl + apiKey
                                     │    └─ createGateway/createOpenAI/etc.(model)
                                     │
                                     ├─ ModelCapabilityService.getModelTags(modelKey, providers)
                                     │    └─ supportsTools = includes('tool-use')  ✓
                                     │
                                     ├─ ChatFileService.buildFileContext(fileTokens)
                                     │    ├─ prisma: query chatFile by tokens
                                     │    ├─ storage: download files
                                     │    └─ parse PDF/Word/text → markdown block
                                     │
                                     └─ runGeneralInfoAgent(modelInstance, input, baseId)
                                          ├─ createNodeSandbox()
                                          ├─ getOrDiscoverSkills()
                                          └─ ToolLoopAgent.stream()
                                               ├─ [TOOL] loadDatabaseSchema → pg SELECT
                                               ├─ [TOOL] queryDatabase / loadSkill / bash / readFile
                                               └─ text stream → "[reasoning...][ANSWER]\n[answer...]"

Response stream (text/plain; utf-8):
  GenerationService: "[reasoning]\x00[answer]" → response.write(chunks)
  Frontend appendChunk(): pre-\x00 → message.reasoning, post-\x00 → message.content
  ChatConversation renders: collapsible <reasoning> + visible <answer>
```

### B. Chat Message (non-tool-use model)

```
... (same up to getModelTags)
  └─ supportsTools = false
       └─ streamText({ model, messages/prompt })   [ai SDK]
            └─ iterate textStream → response.write(chunk)
               (no \x00 separator — frontend shows all text as answer)
```

### C. File Upload

```
User clicks attach → <input type="file" />
  └─ ChatPanel.uploadFile(file)
       ├─ getSignature({ type: UploadType.ChatFile, contentLength, contentType, baseId })
       │    └─ GET /api/attachment/signature
       ├─ axios PUT/POST → S3/cloud storage (direct upload, no backend proxy)
       ├─ notify(token, undefined, file.name)
       │    └─ POST /api/notify  → confirms upload, returns { path, size, mimetype }
       └─ saveChatFile(baseId, { token, name, size, mimetype, path })
            └─ POST /api/{baseId}/chat-files
                 └─ ChatFileController.saveFile()
                      └─ ChatFileService.saveFile() → prisma.chatFile.create()
```

### D. Voice — STT (Speech to Text)

```
User clicks mic button
  └─ VoiceParser.toggleListening()
       └─ window.SpeechRecognition.start()
            └─ onresult(event) → transcript
                 └─ controller.textInput.setInput(transcript)
                      └─ PromptInputTextarea value updated
                           └─ user reviews → submits → Chat flow A/B above
```

### E. Voice — TTS (Text to Speech)

```
AI reply finishes streaming (isStreaming flips false)
  └─ VoiceParser auto-play (if isVoiceActive):
       └─ playTts(lastAssistantMessage, false)
            ├─ stripForTts(text)  (remove markdown, code blocks, emoji)
            ├─ aiTtsStream(baseId, cleanText, signal)
            │    └─ fetch POST /api/{baseId}/ai/tts
            │         └─ AiController.tts()
            │              └─ AiService.tts()
            │                   └─ TtsService.tts()
            │                        └─ fetch POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream
            │                             └─ Readable.fromWeb(body).pipe(response)
            ├─ res.blob() → URL.createObjectURL(blob)
            └─ new Audio(url).play()
```

### F. File Ingestion

```
User uploads file(s) on Ingest tab + selects target table
  └─ IngestionTab.handleIngest()
       └─ aiIngestStream(baseId, { files, targetTable, description }, signal)
            └─ fetch POST /api/{baseId}/ai/ingest-stream  (multipart/form-data)
                 └─ AiController.ingestStream()
                      └─ AiService.ingestStream()
                           └─ GenerationService.ingestStream()
                                ├─ AiConfigService.getAIConfig(baseId)
                                ├─ ModelResolverService.getModelInstance()
                                ├─ ChatFileService.extractTextFromBuffer() × N files
                                └─ runIngestionAgent(model, { prompt })
                                     └─ ToolLoopAgent.stream()
                                          ├─ loadDatabaseSchema → find target table
                                          ├─ loadSkill('teable-database-crud')
                                          ├─ readFile(references/...) optional
                                          ├─ bash: node scripts/lookup-link-id.js
                                          ├─ bash: node scripts/create-records.js (batched)
                                          └─ stream: "Created N records..."
```

---

## 6. Key Data Structures

### `IMessage` (frontend)
```typescript
{ role: 'user' | 'assistant'; content: string; reasoning?: string }
```

### `IAiGenerateRo` (request body)
```typescript
{
  prompt?:     string
  messages?:   { role: 'user'|'assistant'; content: string }[]
  task?:       'coding' | 'embedding' | 'translation'    // default: 'coding'
  modelKey?:   string   // format: type@model@providerName
  fileTokens?: string[]
}
```

### Model Key Format
```
{type}@{model}@{providerName}

Gateway:  aiGateway@anthropic/claude-sonnet-4@teable
OpenAI:   openai@gpt-4o@teable
BYOK:     openai@gpt-4o@my-custom-provider
```

### Chat Model Triple (`chatModel`)
```
sm  — small/fast model (low-cost completions)
md  — medium model (balanced)
lg  — large model (full capability, required for tool-use / agents)
```

### `\x00` Stream Separator
Backend emits `\x00` between reasoning and final answer. Frontend splits on it:
- Pre-`\x00` bytes → `message.reasoning` (collapsible thinking UI)
- Post-`\x00` bytes → `message.content` (visible answer)

---

## 7. Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `ELEVENLABS_API_KEY` | TtsService | ElevenLabs authentication |
| `ELEVENLABS_VOICE_ID` | TtsService | Voice ID (default: `EXAVITQu4vr4xnSDxMaL`) |
| `ELEVENLABS_MODEL_ID` | TtsService | Model (default: `eleven_turbo_v2`) |
| `PRISMA_DATA_DATABASE_URL` | GeneralInfoAgent sandbox | pg pool for queryDatabase tool |
| `TEABLE_API_TOKEN` | Agent bash scripts | Teable API auth for skill scripts |

---

## 8. File Index

### Frontend
| File | Role |
|------|------|
| `chat-panel/ChatPanel.tsx` | Top-level orchestrator — state, upload, submit, stream |
| `chat-panel/components/ChatInputArea.tsx` | Input UI, file picker, model/file selector |
| `chat-panel/components/VoiceParser.tsx` | STT (Web Speech API) + TTS (ElevenLabs) |
| `chat-panel/components/ChatConversation.tsx` | Renders messages[], reasoning/answer split |
| `chat-panel/components/IngestionTab.tsx` | File ingestion UI |
| `chat-panel/helpers.ts` | `readStream()`, `loadStoredMessages()`, `countSelectedRows()` |
| `chat-panel/types.ts` | `IMessage`, `IUploadingFile`, `IGridSelection` |

### OpenAPI Package
| File | Role |
|------|------|
| `ai/generate-stream.ts` | `IAiGenerateRo` schema + `aiGenerateStream()` fetch |
| `ai/ingest-stream.ts` | `aiIngestStream()` fetch (multipart) |
| `ai/index.ts` | `aiTtsStream()` fetch |
| `chat-file/index.ts` | `listChatFiles`, `saveChatFile`, `deleteChatFile` (axios) |

### Backend
| File | Role |
|------|------|
| `ai/ai.controller.ts` | HTTP routes |
| `ai/ai.service.ts` | Facade — composes sub-services |
| `ai/service/generation.service.ts` | Core stream orchestration logic |
| `ai/service/ai-config.service.ts` | Config fetch + merge (30s cache) |
| `ai/service/model-resolver.service.ts` | Model key parsing + provider instantiation |
| `ai/service/model-capability.service.ts` | Tag/capability lookup (tool-use gate) |
| `ai/service/gateway-model.service.ts` | AI Gateway model registry |
| `ai/service/tts.service.ts` | ElevenLabs TTS proxy |
| `ai/agents/general-agents.ts` | ToolLoopAgent, all tools, skill discovery, sandbox |
| `ai/agents/ingestion-agent.ts` | File-to-records ingestion agent |
| `chat-file/chat-file.controller.ts` | Chat file CRUD HTTP routes |
| `chat-file/chat-file.service.ts` | File storage, text extraction (PDF/Word/text) |
