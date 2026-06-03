import {
  teableList,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tblVTWb1kxXSFPBq4Fq';

// Must use field IDs (not names) in filter/orderBy parameters
const FIELD_IDS = {
  title: 'fldROFj15OlD8COVxX0',
  knowledge_type: 'fldAEK8ULw9urxE0qiF',
} as const;

export interface KnowledgeFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Stores the title of the linked knowledge_type record */
  knowledge_type?: string;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type KnowledgeRecord = TeableRecord<KnowledgeFields>;

type CreateInput = Pick<KnowledgeFields, 'title'> &
  Partial<Pick<KnowledgeFields, 'context' | 'is_active' | 'deleted_at' | 'knowledge_type'>>;

type UpdateInput = Partial<
  Pick<KnowledgeFields, 'title' | 'context' | 'is_active' | 'deleted_at' | 'knowledge_type'>
>;

export function listKnowledges(params?: ListParams): Promise<{ records: KnowledgeRecord[] }> {
  return teableList<KnowledgeFields>(TABLE_ID, params);
}

export async function getKnowledgeByTitle(title: string): Promise<KnowledgeRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<KnowledgeFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function listKnowledgesByType(
  typeName: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: KnowledgeRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.knowledge_type, operator: 'is', value: typeName }],
  });
  return teableList<KnowledgeFields>(TABLE_ID, { ...params, filter });
}

export async function createKnowledge(fields: CreateInput): Promise<KnowledgeRecord> {
  const result = await teableCreate<KnowledgeFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateKnowledge(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: KnowledgeRecord }> {
  return teableUpdate<KnowledgeFields>(TABLE_ID, recordId, fields);
}

export function deleteKnowledge(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
