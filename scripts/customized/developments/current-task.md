Goal: 
1. Create an agent to ingest a given file(or files), and target table:
   1. First understand the table schema(if there are cascadin creation, understand the related table is required as well).
   2. Then ingest the files, try to piece the info together, for those data cannot fit in the given table, record them.
   3. Then create those records accordingly. 
   4. After creation, let the user know there are records that cannot be created, and list those related info.
2. This agent is in apps/nestjs-backend/src/features/ai/agents/ingestion-agent.ts



What the agent does

  A conversational agent for managing and querying the knowledge base. It handles two distinct layers:

  1. Index layer (via index-tools.ts) — CRUD on index registrations (list, get, create, update, soft-delete, restore)
  2. Knowledge layer (via query-tools.ts) — Semantic search against active indexes, either single-index or fan-out across all

  On the "skill" question

  My recommendation: no separate skill needed. Here's why:

  - A Mastra "skill" would add a layer of abstraction over tools the agent already calls directly. The tools themselves are already
  well-scoped with clear descriptions and typed inputs/outputs.
  - Skills shine when you want to expose a reusable capability to other agents or compose complex multi-step logic as a single callable unit
  (e.g. "ingest + chunk + embed" as one skill). Since this agent is the knowledge manager, wrapping its own tools in a skill would just be
  redundant indirection.
  - If in the future you add an ingestion pipeline (chunking + embedding + upsert), that would be a natural skill — but that's not in scope
  here.

  Verdict: skip the skill for now. The tools are the atomic units; the agent's prompt is the behavioral layer.

  Prompt design (outline)

  The system prompt will cover:
  1. Role — "You are the Knowledge Manager. You own all knowledge indexes and their content."
  2. Workflow for queries — Always call list-indexes first if the target index is unknown; prefer vector-query for known domains,
  all-knowledge-query for cross-domain questions.
  3. Workflow for index management — Confirm destructive operations (delete) before executing; use soft-delete, never permanent.
  4. Memory use — Track currentTopic, recentSources, and lastIngestedMaterialId in working memory; surface citeSources and responseStyle
  preferences.
  5. Response format — Cite source metadata when citeSources=true; respect responseStyle preference.
  6. Guard rails — Never make up index names; always verify with get-index before acting on a name provided by the user.

  What I'll implement

  knowledge-agent.ts
    - Agent definition with:
      - model: claude-sonnet-4-6
      - tools: all 7 (listIndexes, getIndex, createIndex, updateIndex, deleteIndex, restoreIndex, vectorQuery, allKnowledgeQuery)
      - memory: knowledgeAgentMemory
      - comprehensive system prompt
    - Register in src/mastra/index.ts

  ---
  One thing to confirm before I write it: The query-tools.ts only has retrieval — there is no document ingestion tool (chunk → embed →
  upsert). Should the knowledge agent be read+manage only (current tools cover this fully), or do you want ingestion capability too? If yes,
  that's where a skill or new tool would live.
  
  Otherwise, shall I proceed with the read+manage-only design above?