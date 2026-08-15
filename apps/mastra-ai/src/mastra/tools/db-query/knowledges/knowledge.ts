import {
  teableList,
  teableCreate,
  teableUpdate,
  teableDelete,
  teableGetByIds,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';
import type { LinkCell } from './link-cell.js';

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
  /** Link cell after the v2 migration, a bare title before it. Read with linkTitle(). */
  knowledge_type?: LinkCell;
  /** Two-way self-link, v2. Read with linkIds(). */
  related_knowledge?: LinkCell[];
  /**
   * Self-link to the parent knowledge, v3. Empty means this is top-level.
   * Single-valued (ManyOne), so read with linkId(), not linkIds().
   *
   * Read-only here, exactly as `parent_type` is on KnowledgeTypeFields: the
   * symmetric `knowledges` children cell is deliberately not modelled, since
   * children are derived by inverting this pointer rather than stored twice.
   */
  knowledge_parent?: LinkCell;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type KnowledgeRecord = TeableRecord<KnowledgeFields>;

type CreateInput = Pick<KnowledgeFields, 'title'> &
  Partial<Pick<KnowledgeFields, 'context' | 'is_active' | 'deleted_at'>> & {
    /** A title; typecast turns it into a link. */
    knowledge_type?: string;
  };

type UpdateInput = Partial<
  Pick<KnowledgeFields, 'title' | 'context' | 'is_active' | 'deleted_at'>
> & {
  knowledge_type?: string;
};

export function listKnowledges(params?: ListParams): Promise<{ records: KnowledgeRecord[] }> {
  return teableList<KnowledgeFields>(TABLE_ID, params);
}

export async function searchKnowledgesByTitle(
  keyword: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: KnowledgeRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'contains', value: keyword }],
  });
  return teableList<KnowledgeFields>(TABLE_ID, { ...params, filter });
}

export function getKnowledgesByIds(recordIds: string[]): Promise<KnowledgeRecord[]> {
  return teableGetByIds<KnowledgeFields>(TABLE_ID, recordIds);
}

export async function getKnowledgeByTitle(title: string): Promise<KnowledgeRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<KnowledgeFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

/**
 * Filters by the knowledge_type record ID, not its title. Once knowledge_type is a
 * Link field, Teable's `is` filter on it compares `jsonb_extract_path_text(cell,'id')`
 * — a title value never matches, so the caller must resolve the title to a record ID
 * first (see `getKnowledgeTypeByTitle` / `knowledge-service.ts#getKnowledgesByType`).
 */
export async function listKnowledgesByType(
  typeId: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: KnowledgeRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.knowledge_type, operator: 'is', value: typeId }],
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
