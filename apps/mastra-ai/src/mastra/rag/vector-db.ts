import { MDocument, rerank, rerankWithScorer, MastraAgentRelevanceScorer } from '@mastra/rag';
import type { ChunkParams, RerankResult } from '@mastra/rag';
import type { RerankerFunctionOptions } from '@mastra/rag';
import type { MastraLanguageModel } from '@mastra/core/agent';
import type { QueryResult } from '@mastra/core/vector';
import { gateway } from '../provider';

// @ai-sdk/gateway returns LanguageModelV3 which is structurally compatible with
// Mastra's MastraLanguageModel at runtime, but their types diverge on the internal
// doGenerate return shape. This cast is safe — both implement the same AI SDK spec.
const asLLM = (modelId: string) => gateway(modelId) as unknown as MastraLanguageModel;

// ─── Chunking ────────────────────────────────────────────────────────────────
// MDocument supports 9 strategies: character (default), recursive, token,
// markdown, html, json, latex, sentence, semantic-markdown.

export { MDocument };
export type { ChunkParams };

export const DEFAULT_CHUNK_SIZE = 2000;
export const DEFAULT_CHUNK_OVERLAP = 200;

/** A single chunk produced by chunkDocument(). */
export interface ChunkResult {
  /** The chunk text content. */
  text: string;
  /** Human-readable name of the source document (e.g. "Q3 Report", "The Hobbit"). */
  docName: string;
  /** Zero-based position of this chunk within its source document. */
  chunkIndex: number;
  // Fields below are populated only when extract.summary / extract.keywords are set.
  /** LLM-generated summary of this chunk's section. */
  sectionSummary?: string;
  /** LLM-generated summary of the preceding section (context bridge). */
  prevSectionSummary?: string;
  /** LLM-generated summary of the following section (context bridge). */
  nextSectionSummary?: string;
  /** Comma-separated keywords extracted from this chunk. */
  excerptKeywords?: string;
}

/**
 * Chunk a plain-text string into labelled segments.
 * Each result carries docName and chunkIndex so downstream upsert calls can
 * store provenance metadata without tracking it separately.
 *
 * Defaults to recursive splitting at sentence/paragraph boundaries.
 * For structured input pass an explicit strategy:
 *   chunkDocument(md, 'Annual Report 2024', { strategy: 'markdown', maxSize: 800 })
 */
export async function chunkDocument(
  text: string,
  docName: string,
  params?: ChunkParams,
  metadata?: Record<string, unknown>
): Promise<ChunkResult[]> {
  const doc = MDocument.fromText(text, metadata);
  await doc.chunk(
    params ?? {
      extract: {
        summary: true,
        keywords: true, // Extract keywords with default settings
      },
      strategy: 'recursive',
      maxSize: DEFAULT_CHUNK_SIZE,
      overlap: DEFAULT_CHUNK_OVERLAP,
    }
  );
  // getDocs() is required (not getText()) to access the metadata that extractors write.
  // Note: extract: { summary: true, keywords: true } uses @mastra/rag's baseLLM by default,
  // which calls the provider directly (not via the AI Gateway). To route through the gateway:
  //   extract: { summary: { llm: asLLM('anthropic/claude-haiku-4.5') }, keywords: { llm: asLLM('...') } }
  return doc.getDocs().map((chunk, chunkIndex) => ({
    text: chunk.getText(),
    docName,
    chunkIndex,
    sectionSummary: chunk.metadata?.sectionSummary as string | undefined,
    prevSectionSummary: chunk.metadata?.prevSectionSummary as string | undefined,
    nextSectionSummary: chunk.metadata?.nextSectionSummary as string | undefined,
    excerptKeywords: chunk.metadata?.excerptKeywords as string | undefined,
  }));
}

// ─── Embedding ───────────────────────────────────────────────────────────────
// @mastra/rag does not provide an embedding API.
// Centralised here so all tools share one implementation instead of
// duplicating the batched-gateway pattern.

/** Default model routed via the Vercel AI Gateway. */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
/** Native output dimension — must match the PgVector index dimension. */
export const EMBEDDING_DIMENSION = 1536;

const EMBED_BATCH_SIZE = 100; // text-embedding-3-small per-call limit

/**
 * Embed a batch of texts via the Vercel AI Gateway.
 * Automatically splits into batches of ≤100 to stay within per-call limits.
 */
export async function embedTexts(
  texts: string[],
  modelId = DEFAULT_EMBEDDING_MODEL
): Promise<number[][]> {
  const model = gateway.embeddingModel(modelId);
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const { embeddings } = await model.doEmbed({ values: texts.slice(i, i + EMBED_BATCH_SIZE) });
    results.push(...embeddings);
  }
  return results;
}

/** Embed a single text string. Convenience wrapper around embedTexts. */
export async function embedText(
  text: string,
  modelId = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  const [embedding] = await embedTexts([text], modelId);
  return embedding;
}

// ─── Reranking ───────────────────────────────────────────────────────────────
// Two modes, both backed by MastraAgentRelevanceScorer (uses existing gateway):
//
//   'llm'    — @mastra/rag rerank(): model scores each result, blends
//              semantic / vector / position signals via weights.
//   'scorer' — @mastra/rag rerankWithScorer(): same scorer, slightly different
//              internal scoring path; useful when you need a raw relevance score
//              without the weight blending.

export type { RerankResult };

export type RerankMode = 'llm' | 'scorer';

export interface RerankOptions extends RerankerFunctionOptions {
  /** Scoring strategy (default: 'llm') */
  mode?: RerankMode;
  /** LLM model to use for scoring (default: anthropic/claude-haiku-4.5) */
  model?: string;
}

/**
 * Rerank a list of vector-store query results against a natural-language query.
 *
 *   mode 'llm' (default) — uses @mastra/rag rerank() with configurable
 *     weights for semantic / vector / position signals.
 *
 *   mode 'scorer' — uses @mastra/rag rerankWithScorer() for a pure
 *     relevance-score pass without weight blending.
 *
 * Both modes use MastraAgentRelevanceScorer backed by the existing AI gateway;
 * no additional API keys are required.
 */
export async function rerankResults(
  results: QueryResult[],
  query: string,
  opts?: RerankOptions
): Promise<RerankResult[]> {
  const {
    mode = 'llm',
    model: modelId = 'anthropic/claude-haiku-4.5',
    ...functionOptions
  } = opts ?? {};
  const llm = asLLM(modelId);

  if (mode === 'scorer') {
    const scorer = new MastraAgentRelevanceScorer('reranker', llm);
    return rerankWithScorer({ results, query, scorer, options: functionOptions });
  }

  return rerank(results, query, llm, functionOptions);
}
