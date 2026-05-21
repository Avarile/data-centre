Goal: 
1. Create an agent to ingest a given file(or files), and target table:
   1. First understand the table schema(if there are cascadin creation, understand the related table is required as well).
   2. Then ingest the files, try to piece the info together, for those data cannot fit in the given table, record them.
   3. Then create those records accordingly. 
   4. After creation, let the user know there are records that cannot be created, and list those related info.
2. This agent is in apps/nestjs-backend/src/features/ai/agents/ingestion-agent.ts