import crypto from 'crypto';
import type { ChunkParams } from './vector-db';
import { chunkDocument, embedTexts, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from './vector-db';
import { getIndex } from '../db/db-vector.js';
import { postgresVector } from '../memory/index';
import type { VectorFilter } from '@mastra/core/vector';

export interface IngestParams {
  indexName: string;
  content: string;
  docName: string;
  metadata?: Record<string, unknown>;
  chunkParams?: ChunkParams;
  extractEnrichments?: boolean;
}

export interface IngestResult {
  materialId: string;
  chunksIngested: number;
  indexName: string;
}

/** Deterministic ID derived from indexName + docName. Re-ingesting the same document
 *  produces the same materialId, enabling atomic replace via deleteFilter. */
export function generateMaterialId(indexName: string, docName: string): string {
  return crypto.createHash('sha256').update(`${indexName}:${docName}`).digest('hex').slice(0, 32);
}

/**
 * Chunk → embed → upsert a document into a PgVector index.
 * Replace semantics: all existing vectors for this materialId are deleted before upsert,
 * so re-ingesting an updated document never leaves stale chunks behind.
 */
export async function ingestDocument(params: IngestParams): Promise<IngestResult> {
  const {
    indexName,
    content,
    docName,
    metadata = {},
    chunkParams,
    extractEnrichments = false,
  } = params;

  const ix = await getIndex(indexName);
  if (!ix) throw new Error(`Index "${indexName}" not found`);
  if (!ix.is_active) throw new Error(`Index "${indexName}" is inactive`);

  const materialId = generateMaterialId(indexName, docName);

  const effectiveParams: ChunkParams =
    chunkParams ??
    (extractEnrichments
      ? {
          extract: { summary: true, keywords: true },
          strategy: 'recursive',
          maxSize: DEFAULT_CHUNK_SIZE,
          overlap: DEFAULT_CHUNK_OVERLAP,
        }
      : { strategy: 'recursive', maxSize: DEFAULT_CHUNK_SIZE, overlap: DEFAULT_CHUNK_OVERLAP });

  const chunks = await chunkDocument(content, docName, effectiveParams, metadata);

  const embeddings = await embedTexts(chunks.map((c) => c.text));

  const ids = chunks.map((_, i) => `${materialId}_${i}`);
  const metas = chunks.map((chunk) => ({
    ...metadata,
    materialId,
    docName: chunk.docName,
    chunkIndex: chunk.chunkIndex,
    content: chunk.text,
    source: (metadata.source as string | undefined) ?? docName,
    indexName,
    ...(chunk.sectionSummary ? { sectionSummary: chunk.sectionSummary } : {}),
    ...(chunk.excerptKeywords ? { excerptKeywords: chunk.excerptKeywords } : {}),
  }));

  await postgresVector.upsert({
    indexName,
    vectors: embeddings,
    metadata: metas,
    ids,
    deleteFilter: { materialId } as VectorFilter,
  });

  return { materialId, chunksIngested: chunks.length, indexName };
}
