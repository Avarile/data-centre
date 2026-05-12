Explore(Trace usage of formula ai.ts and paid account gating)
  ⎿  Done (49 tool uses · 76.4k tokens · 2m 16s)
  (ctrl+o to expand)

● Here's the full picture:

  Usage Chain

  packages/openapi/src/formula/ai.ts exports getFormulaPrompt(), which flows like this:

  formula/ai.ts
    → formula/index.ts (barrel)
      → openapi/src/index.ts (line 43, re-export)
        → AiPromptContainer.tsx (line 2) — calls getFormulaPrompt(prompt, fields)
          → FormulaEditor.tsx — renders AI tab only if enableAI prop is true
            → FormulaOptions.tsx — passes enableAI={enableAI} from useAI() hook

  The getFormulaPrompt() function constructs the LLM system prompt; the actual HTTP call goes through a separate path: aiGenerateStream() → POST
  /api/:baseId/ai/generate-stream.

  Gating Mechanism

  There is no subscription/plan check. Access is gated entirely by configuration:

  1. Frontend gate — apps/nextjs-app/src/features/app/hooks/useAI.ts
  Calls GET /api/:baseId/ai/config. Returns enable: Boolean(data) — if no config exists, the AI tab in the formula editor is never shown.
  2. Backend gate — apps/nestjs-backend/src/features/ai/ai.service.ts:237-260 (getAIConfig())
  Before generating, checks the integration table for a space-level AI entry (type: IntegrationType.AI, enable: true) and falls back to instance-level
  settings. Throws 'AI configuration is not set' if neither exists — so the generate-stream endpoint hard-fails.
  3. Permission gate — both endpoints carry @Permissions('base|read'), enforced by PermissionGuard.

  In practice: AI is only available when an admin has configured an LLM provider at the instance or space level. There's no per-plan billing guard in
  code — it's admin-controlled configuration, not a subscription check.