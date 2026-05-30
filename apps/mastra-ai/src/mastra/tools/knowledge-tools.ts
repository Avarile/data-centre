import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { gateway } from '../provider';
import { postgresVector } from '../memory/index';
import { vectorPool } from '../db/vector-pool';

// Embed a batch of texts via the Vercel AI Gateway (routes to OpenAI text-embedding-3-small).
// Batches at ≤100 inputs to stay within the model's per-call limit.
async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = gateway.embeddingModel('openai/text-embedding-3-small');
  const BATCH = 100;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const { embeddings } = await model.doEmbed({ values: texts.slice(i, i + BATCH) });
    results.push(...embeddings);
  }
  return results;
}

async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

// Sentence-aware sliding window chunker.
// Tries to break at sentence/paragraph boundaries within the target size.
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  const normalized = text.replace(/\r\n/g, '\n').trim();

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const paraBreak = normalized.lastIndexOf('\n\n', end);
      const sentBreak = normalized.lastIndexOf('. ', end);
      const candidate = Math.max(paraBreak, sentBreak);
      if (candidate > start + Math.floor(chunkSize * 0.5)) {
        end = candidate + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    if (end >= normalized.length) break;
    start = end - overlap;
    if (start <= 0 || start >= normalized.length) break;
  }

  return chunks;
}

// ─────────────────────────────────────────────
// Tool: knowledge-ingest
// ─────────────────────────────────────────────
export const knowledgeIngestTool = createTool({
  id: 'knowledge-ingest',
  description:
    'Add a document or text passage to the knowledge base. ' +
    'The content is chunked, embedded via Vercel AI Gateway, and stored for future semantic retrieval. ' +
    'Returns a materialId that can be used later to delete all chunks from this document.',
  inputSchema: z.object({
    title: z.string().describe('Short title identifying this piece of knowledge'),
    content: z.string().min(10).describe('The full text content to ingest'),
    source: z.string().optional().describe('Origin of the content (URL, file name, author, etc.)'),
    tags: z.array(z.string()).optional().describe('Topic tags for categorisation'),
  }),
  outputSchema: z.object({
    materialId: z.string(),
    chunksCreated: z.number(),
    title: z.string(),
  }),
  execute: async ({ title, content, source, tags }) => {
    const materialId = randomUUID();
    const chunks = chunkText(content);
    const embeddings = await embedTexts(chunks);

    await postgresVector.upsert({
      indexName: 'knowledge_base',
      vectors: chunks.map((chunk, i) => ({
        id: `${materialId}__${String(i).padStart(5, '0')}`,
        vector: embeddings[i],
        metadata: {
          materialId,
          chunkIndex: i,
          title,
          content: chunk,
          source: source ?? null,
          tags: tags ?? [],
        },
      })),
    });

    return { materialId, chunksCreated: chunks.length, title };
  },
});

// ─────────────────────────────────────────────
// Tool: knowledge-search
// ─────────────────────────────────────────────
export const knowledgeSearchTool = createTool({
  id: 'knowledge-search',
  description:
    'Semantically search the knowledge base using a natural language query. ' +
    'Returns the most relevant text chunks along with their source metadata. ' +
    'Use this to answer questions that may be covered by ingested documents.',
  inputSchema: z.object({
    query: z.string().describe('Natural language question or search phrase'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe('Number of chunks to return (default 5)'),
    filterSource: z.string().optional().describe('Restrict results to a specific source value'),
    filterTags: z
      .array(z.string())
      .optional()
      .describe('Restrict results to chunks tagged with ALL of these tags'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        score: z.number(),
        content: z.string(),
        title: z.string(),
        source: z.string().nullable(),
        materialId: z.string(),
        chunkIndex: z.number(),
        tags: z.array(z.string()),
      })
    ),
    totalFound: z.number(),
  }),
  execute: async ({ query, topK, filterSource, filterTags }) => {
    const queryVector = await embedText(query);

    const filter: Record<string, unknown> = {};
    if (filterSource) filter['source'] = filterSource;
    if (filterTags?.length) filter['tags'] = filterTags;

    const raw = await postgresVector.query({
      indexName: 'knowledge_base',
      queryVector,
      topK: topK ?? 5,
      filter: Object.keys(filter).length ? filter : undefined,
      includeVector: false,
    });

    const results = raw.map((r) => ({
      id: r.id,
      score: r.score,
      content: (r.metadata?.content as string) ?? '',
      title: (r.metadata?.title as string) ?? '',
      source: (r.metadata?.source as string | null) ?? null,
      materialId: (r.metadata?.materialId as string) ?? '',
      chunkIndex: (r.metadata?.chunkIndex as number) ?? 0,
      tags: (r.metadata?.tags as string[]) ?? [],
    }));

    return { results, totalFound: results.length };
  },
});

// ─────────────────────────────────────────────
// Tool: knowledge-delete
// ─────────────────────────────────────────────
export const knowledgeDeleteTool = createTool({
  id: 'knowledge-delete',
  description:
    'Remove all chunks belonging to a document from the knowledge base using its materialId. ' +
    'The materialId is returned when the document is ingested. ' +
    'Always confirm with the user before calling this tool.',
  inputSchema: z.object({
    materialId: z.string().uuid().describe('The materialId returned by knowledge-ingest'),
  }),
  outputSchema: z.object({
    deletedChunks: z.number(),
    materialId: z.string(),
  }),
  execute: async ({ materialId }) => {
    // Use a direct SQL query rather than ANN search — HNSW index traversal does
    // not guarantee returning every record for a metadata filter, and the 10k topK
    // cap silently truncates large documents. A full-table SQL scan is the only
    // reliable way to find all chunks belonging to a materialId.
    const { rows } = await vectorPool.query<{ id: string }>(
      `SELECT id FROM vector_schema.knowledge_base
       WHERE metadata->>'materialId' = $1`,
      [materialId]
    );

    if (rows.length === 0) {
      return { deletedChunks: 0, materialId };
    }

    await postgresVector.delete({
      indexName: 'knowledge_base',
      ids: rows.map((r) => r.id),
    });

    return { deletedChunks: rows.length, materialId };
  },
});
