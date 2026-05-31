import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ingestDocument } from '../rag/ingest';
import { listIndexes } from '../db/db-vector.js';

// ─────────────────────────────────────────────
// Tool: ingest-document
// Synchronous — the agent waits for completion so it can report the result.
// ─────────────────────────────────────────────
export const ingestDocumentTool = createTool({
  id: 'ingest-document',
  description:
    'Ingest a text document into a knowledge index. ' +
    'Chunks the content, generates embeddings, and upserts into the specified index. ' +
    'Re-ingesting the same docName into the same index replaces existing content (no duplicates). ' +
    'Use list-indexes to discover valid index names before calling this tool. ' +
    'Returns materialId (a stable identifier for the ingested document) and chunk count.',
  inputSchema: z.object({
    indexName: z.string().describe('Target index name — must be an active index from list-indexes'),
    content: z.string().min(1).describe('Full text content to ingest'),
    docName: z
      .string()
      .min(1)
      .describe(
        'Human-readable document name, e.g. "Q3 2024 Report". ' +
          'Together with indexName this uniquely identifies the document — ' +
          're-ingesting the same docName replaces previous content.'
      ),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Extra metadata stored on every chunk, e.g. { source: "upload", author: "Alice" }. ' +
          'Metadata fields are searchable with the filter parameter in vector-query.'
      ),
    extractEnrichments: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'When true, uses an LLM to extract per-chunk summaries and keywords. ' +
          'Improves retrieval quality but adds latency and cost. Default: false.'
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    materialId: z.string().optional(),
    chunksIngested: z.number().optional(),
    indexName: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ indexName, content, docName, metadata, extractEnrichments }) => {
    try {
      const result = await ingestDocument({
        indexName,
        content,
        docName,
        metadata,
        extractEnrichments,
      });
      return {
        success: true,
        materialId: result.materialId,
        chunksIngested: result.chunksIngested,
        indexName: result.indexName,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ─────────────────────────────────────────────
// Tool: list-active-indexes-for-ingest
// Lightweight helper so the agent can confirm valid targets before ingesting.
// (Reuses db-vector logic; avoids duplicating list-indexes from index-tools.)
// ─────────────────────────────────────────────
export const listActiveIndexesTool = createTool({
  id: 'list-active-indexes-for-ingest',
  description:
    'Return a compact list of active index names and labels. ' +
    'Use this to confirm the target index before calling ingest-document.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    indexes: z.array(z.object({ name: z.string(), label: z.string() })),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const active = await listIndexes(false);
      return { indexes: active.map((ix) => ({ name: ix.name, label: ix.label })) };
    } catch (err) {
      return { indexes: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
});
