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

  return knowledgesResult.records.map((knowledge) => ({
    knowledge,
    type: knowledge.fields.knowledge_type
      ? typeByTitle.get(knowledge.fields.knowledge_type)
      : undefined,
  }));
}

/**
 * Fetches knowledges of a specific type, with the type record attached.
 */
export async function getKnowledgesByType(typeName: string): Promise<KnowledgeWithType[]> {
  const [knowledgesResult, type] = await Promise.all([
    listKnowledgesByType(typeName),
    getKnowledgeTypeByTitle(typeName),
  ]);

  return knowledgesResult.records.map((knowledge) => ({ knowledge, type }));
}
