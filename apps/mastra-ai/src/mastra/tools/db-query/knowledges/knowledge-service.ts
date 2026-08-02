import {
  getKnowledgeTypeByTitle,
  createKnowledgeType,
  listKnowledgeTypes,
  type KnowledgeTypeRecord,
} from './knowledge-type.js';
import {
  createKnowledge,
  listKnowledges,
  listKnowledgesByType,
  type KnowledgeRecord,
  type KnowledgeFields,
} from './knowledge.js';
import { linkTitle } from './link-cell.js';
import type { ListParams } from '../teable-client.js';

export interface KnowledgeWithType {
  knowledge: KnowledgeRecord;
  type: KnowledgeTypeRecord | undefined;
}

/**
 * Returns the existing knowledge_type with the given title, or creates it first.
 * Use this before creating a knowledge record to satisfy the creation-order requirement.
 */
export async function ensureKnowledgeType(
  title: string,
  context?: string
): Promise<KnowledgeTypeRecord> {
  const existing = await getKnowledgeTypeByTitle(title);
  if (existing) return existing;
  return createKnowledgeType({ title, context, is_active: true });
}

/**
 * Creates a knowledge record, guaranteeing its knowledge_type exists first.
 * Pass typeContext only when the type may need to be created.
 */
export async function createKnowledgeWithType(
  knowledgeFields: Pick<KnowledgeFields, 'title'> &
    Partial<Pick<KnowledgeFields, 'context' | 'is_active' | 'deleted_at'>>,
  typeName: string,
  typeContext?: string
): Promise<{ knowledge: KnowledgeRecord; type: KnowledgeTypeRecord }> {
  const type = await ensureKnowledgeType(typeName, typeContext);
  const knowledge = await createKnowledge({ ...knowledgeFields, knowledge_type: typeName });
  return { knowledge, type };
}

/**
 * Fetches all knowledges and resolves each one's type record in a single extra request.
 */
export async function getKnowledgesWithType(): Promise<KnowledgeWithType[]> {
  const [knowledgesResult, typesResult] = await Promise.all([
    listKnowledges(),
    listKnowledgeTypes(),
  ]);

  const typeByTitle = new Map(typesResult.records.map((t) => [t.fields.title, t]));

  return knowledgesResult.records.map((knowledge) => {
    const title = linkTitle(knowledge.fields.knowledge_type);
    return { knowledge, type: title ? typeByTitle.get(title) : undefined };
  });
}

/**
 * Fetches knowledges of a specific type, with the type record attached.
 * Resolves the type title to its record ID once — knowledge_type is a Link field,
 * so `listKnowledgesByType` must filter on the record ID, never the title (see
 * knowledge.ts#listKnowledgesByType). An unknown title returns an empty list rather
 * than querying with an unresolved id.
 */
export async function getKnowledgesByType(typeName: string): Promise<KnowledgeWithType[]> {
  const type = await getKnowledgeTypeByTitle(typeName);
  if (!type) return [];

  const { records } = await listKnowledgesByType(type.id);
  return records.map((knowledge) => ({ knowledge, type }));
}

/**
 * Same type-title resolution as `getKnowledgesByType`, but returns bare knowledge
 * records (no joined type) for callers that only need the list, e.g. the
 * `list-knowledges` tool's optional typeName filter.
 */
export async function listKnowledgesByTypeName(
  typeName: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: KnowledgeRecord[] }> {
  const type = await getKnowledgeTypeByTitle(typeName);
  if (!type) return { records: [] };
  return listKnowledgesByType(type.id, params);
}
