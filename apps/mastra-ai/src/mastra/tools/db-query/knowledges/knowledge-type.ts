import {
  teableList,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';
import type { LinkCell } from './link-cell.js';

const TABLE_ID = 'tblWcq6Kof1AFHvbC5e';

// Must use field IDs (not names) in filter/orderBy parameters
const FIELD_IDS = {
  title: 'fldvL1LqKmEAfNKVBCO',
} as const;

export interface KnowledgeTypeFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Self-link to the parent type, v2. Empty means this type is a root. */
  parent_type?: LinkCell;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type KnowledgeTypeRecord = TeableRecord<KnowledgeTypeFields>;

type CreateInput = Pick<KnowledgeTypeFields, 'title'> &
  Partial<Pick<KnowledgeTypeFields, 'context' | 'is_active' | 'deleted_at'>>;

type UpdateInput = Partial<
  Pick<KnowledgeTypeFields, 'title' | 'context' | 'is_active' | 'deleted_at'>
>;

export function listKnowledgeTypes(
  params?: ListParams
): Promise<{ records: KnowledgeTypeRecord[] }> {
  return teableList<KnowledgeTypeFields>(TABLE_ID, params);
}

export async function getKnowledgeTypeByTitle(
  title: string
): Promise<KnowledgeTypeRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<KnowledgeTypeFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createKnowledgeType(fields: CreateInput): Promise<KnowledgeTypeRecord> {
  const result = await teableCreate<KnowledgeTypeFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateKnowledgeType(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: KnowledgeTypeRecord }> {
  return teableUpdate<KnowledgeTypeFields>(TABLE_ID, recordId, fields);
}

export function deleteKnowledgeType(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
