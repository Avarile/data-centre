 AI Design Analysis

  Call Chain

  User input (ChatPanel.tsx)
    → POST /api/{baseId}/ai/generate-stream
    → AiController.generateStream()
    → AiService.generateStream()
        ├─ getGenerationModelInstance()        # DB: 3 queries per call
        │     └─ getAIConfig() → getModelInstance()
        ├─ injectFileContext(prompt, tokens)   # ChatFileService: serial file parse
        └─ runGeneralInfoAgent(model, prompt)  # fresh agent + sandbox per call
              ├─ discoverSkills()              # filesystem scan every request
              ├─ createGeneralInfoAgent()      # rebuilds 400-line system prompt
              └─ agent.stream({ prompt })      # single-turn, no history
    → result.pipeTextStreamToResponse(response)
    → Frontend readStream() → Streamdown render

  ---
  Issues

  Critical / Security

  1. Unrestricted bash tool (general-agents.ts:200-217)
  The LLM can execute any shell command with no allowlist or sandboxing. A prompt-injected or hallucinating model could run rm -rf, curl to
  exfiltrate data, or install packages. The intended use is only node scripts/*.js.

  2. SQL SELECT check is regex-only (general-agents.ts:234)
  if (!/^\s*SELECT\b/i.test(sql.trimStart()))
  This doesn't prevent SELECT ...; DROP TABLE ...; (multi-statement), SELECT pg_exec(...), or SELECT ... INTO OUTFILE. The LLM generates the
  entire SQL — needs a proper read-only DB role or transaction-level enforcement (SET TRANSACTION READ ONLY).
  
  3. Database pool leak (general-agents.ts:32)
  new Pool() is created inside createNodeSandbox(), which is called on every request. These pools are never .end()-ed, leaking PostgreSQL
  connections until the server runs out.

  ---
  Functional / Design

  4. No conversation history (ai.service.ts:408-418)
  IAiGenerateRo only has a prompt: string. Each generateStream call creates a fresh agent with a single-turn prompt — the LLM has zero memory
  of previous turns. For a chat interface this means every message is answered without context from prior messages.

  5. Full agent rebuilt per request (general-agents.ts:462-476)
  Every request: creates a new pg Pool, scans the filesystem for SKILL.md files, and rebuilds the 400-line system prompt from scratch. Skills
  don't change at runtime — this work should be done once.

  6. Config fetches 3 DB queries per request (ai.service.ts:240-251)
  getAIConfig() always hits the DB: base.findUnique + integration.findFirst + settingService.getSetting(). A second getSetting() call can also
   happen in getModelTags. The PerformanceCacheService is already injected but unused for this.

  7. File extraction is serial (chat-file.service.ts:136-155)
  for (const record of records) {
    const text = await this.extractTextFromFile(...);  // sequential
  } 
  Multiple uploaded files are parsed one-at-a-time. Promise.all() would parallelize this with no code complexity cost.

  8. No error handling in streaming path (ai.service.ts:408-418)
  async generateStream(...): Promise<void> {
    // no try/catch
    const result = await runGeneralInfoAgent(modelInstance, enrichedPrompt);
    result.pipeTextStreamToResponse(response);
  } 
  If runGeneralInfoAgent throws after streaming has begun, the exception reaches NestJS's filter after headers are already sent. The client
  sees a truncated stream with no error signal.
  
  9. Agent has no timeout (general-agents.ts:472-475)
  agent.stream() runs indefinitely. A hung LLM call or infinite tool-call loop (capped at maxRetries: 5 per turn but the outer loop has no
  wall-clock limit) will hold the HTTP connection open until nginx/proxy kills it, while the backend process continues running.

  ---
  Minor
  
  10. Dynamic require() for pdf-parse and mammoth (chat-file.service.ts:178, 188)
  Using require() at runtime bypasses TypeScript static analysis and triggers ESLint suppressions. Replace with top-level imports (both
  libraries are CJS-compatible with NestJS).

  11. Hardcoded CLI user-agent (util.ts:95)
  const claudeCodeDefaultUa = 'claude-cli/2.1.71 (external, cli)';
  The version will go stale. More importantly, impersonating a specific CLI version to route through Claude Code's API quota is a ToS risk.

  12. Provider deduplication gap (ai.service.ts:296-307)
  When both space and instance configs have overlapping providers, they're merged with spread without deduplication. getModelConfig() uses
  .find() so only the first (space) match is returned — instance fallback silently fails.

  ---
  Improvement Suggestions

  ┌──────────┬──────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────┐
  │ Priority │                                            Change                                            │            Where            │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Pass messages: CoreMessage[] in IAiGenerateRo and forward to agent.stream({ messages })      │ ai.service.ts, openapi      │
  │          │                                                                                              │ types                       │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤

  11. Hardcoded CLI user-agent (util.ts:95)
  const claudeCodeDefaultUa = 'claude-cli/2.1.71 (external, cli)';
  The version will go stale. More importantly, impersonating a specific CLI version to route through Claude Code's API quota is a ToS risk.

  12. Provider deduplication gap (ai.service.ts:296-307)
  When both space and instance configs have overlapping providers, they're merged with spread without deduplication. getModelConfig() uses
  .find() so only the first (space) match is returned — instance fallback silently fails.

  ---
  Improvement Suggestions

  ┌──────────┬──────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────┐
  │ Priority │                                            Change                                            │            Where            │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Pass messages: CoreMessage[] in IAiGenerateRo and forward to agent.stream({ messages })      │ ai.service.ts, openapi      │
  │          │                                                                                              │ types                       │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Create a singleton pg Pool at module init (OnModuleInit) and reuse it, or use the existing   │ general-agents.ts           │
  │          │ Prisma connection                                                                            │                             │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Cache discoverSkills() result at module startup; re-scan only on config reload               │ general-agents.ts           │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Restrict bashTool to an allowlist pattern: ^node\s+scripts/[\w-]+\.js\s+                     │ general-agents.ts:200       │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ High     │ Replace regex SELECT check with a read-only DB role or BEGIN READ ONLY                       │ general-agents.ts:234       │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Medium   │ Cache getAIConfig() result in PerformanceCacheService with a 30s TTL (already injected)      │ ai.service.ts:240           │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Medium   │ Add try/catch in generateStream and write an SSE error frame before closing                  │ ai.service.ts:408           │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Medium   │ Add AbortSignal.timeout(60_000) to agent.stream() call                                       │ general-agents.ts:472       │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Medium   │ Promise.all() file extraction in extractTextFromTokens                                       │ chat-file.service.ts:136    │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Low      │ Replace dynamic require('pdf-parse') / require('mammoth') with top-level imports             │ chat-file.service.ts:178    │
  ├──────────┼──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Low      │ Remove hardcoded claude-cli/2.1.71 UA or make it an env var                                  │ util.ts:95                  │
  └──────────┴──────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────────┘

  The most impactful fix for usability is #4 (conversation history) — without it the chat interface can't provide contextual multi-turn
  responses. The most urgent for stability is #3 (pool leak) and #8 (streaming error handling).