import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';
import { z } from 'zod';
import { env } from '../env';
import { gateway } from '../provider';

export const postgresStore = new PostgresStore({
  id: 'postgres-store',
  connectionString: env.DATABASE_VECTOR_URL,
  schemaName: 'store_schema',
  max: 20,
  idleTimeoutMillis: 60000,
});

export const postgresVector = new PgVector({
  id: 'postgres-vector',
  connectionString: env.DATABASE_VECTOR_URL,
  schemaName: 'vector_schema',
  max: 20,
  idleTimeoutMillis: 60000,
  pgPoolOptions: {
    connectionTimeoutMillis: 5000,
  },
});

// Working memory schema — tracks user context and preferences across turns.
// Merge semantics: only changed fields need to be provided on update.
const knowledgeAgentSchema = z.object({
  context: z
    .object({
      currentTopic: z.string().optional().describe('The topic or domain currently being discussed'),
      recentSources: z.array(z.string()).optional().describe('Sources referenced in recent turns'),
      lastIngestedMaterialId: z
        .string()
        .optional()
        .describe('materialId of the most recently ingested document'),
    })
    .optional(),
  preferences: z
    .object({
      responseStyle: z
        .enum(['detailed', 'concise', 'bullet-points'])
        .optional()
        .describe('How the user prefers answers to be formatted'),
      citeSources: z
        .boolean()
        .optional()
        .describe('Whether to always cite source metadata in answers'),
      defaultSearchTopK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Default number of knowledge chunks to retrieve per search'),
    })
    .optional(),
});

export const knowledgeAgentMemory = new Memory({
  storage: postgresStore,
  vector: postgresVector,
  embedder: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
  options: {
    lastMessages: 30,
    semanticRecall: {
      topK: 8,
      messageRange: { before: 3, after: 1 },
      scope: 'resource',
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',
      schema: knowledgeAgentSchema,
    },
    observationalMemory: {
      observation: { model: gateway('anthropic/claude-haiku-4.5') },
      reflection: { model: gateway('anthropic/claude-haiku-4.5') },
    },
    generateTitle: {
      model: gateway('anthropic/claude-haiku-4.5'),
      instructions: `Generate a concise title (3-5 words) that captures the main topic of the following conversation snippet. Focus on key themes or subjects mentioned. Do not include any emojis or special characters in the title.`,
    },
  },
});

// Initialize the knowledge_base vector index at startup.
// Idempotent — skips creation when the index already exists.
export async function initKnowledgeIndex(): Promise<void> {
  const existing = await postgresVector.listIndexes();
  if (!existing.includes('knowledge_base')) {
    await postgresVector.createIndex({
      indexName: 'knowledge_base',
      dimension: 1536, // text-embedding-3-small
      metric: 'cosine',
    });
  }
}

export async function initDealMasteryIndex(): Promise<void> {
  const existing = await postgresVector.listIndexes();
  if (!existing.includes('deal_mastery')) {
    await postgresVector.createIndex({
      indexName: 'deal_mastery',
      dimension: 1536,
      metric: 'cosine',
    });
  }
}

export async function initDDWorksheetIndex(): Promise<void> {
  const existing = await postgresVector.listIndexes();
  if (!existing.includes('dd_worksheet')) {
    await postgresVector.createIndex({
      indexName: 'dd_worksheet',
      dimension: 1536,
      metric: 'cosine',
    });
  }
}
