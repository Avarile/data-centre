import {
  teableList,
  teableGetById,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from './teable-client.js';

const TABLE_ID = 'tbl6oTxXnstZGJNrHpm';

const FIELD_IDS = {
  title: 'fldi05ZCxsEFOEwJDlD',
  type: 'fldX8DlWEqoxTAtFyxj',
} as const;

export type FrameworkType =
  | 'goal-management'
  | 'project-management'
  | 'meeting-strategy'
  | 'conversation-strategy';

export interface FrameworkFields {
  title: string;
  context?: string;
  type?: FrameworkType;
  is_active?: boolean;
  deleted_at?: string;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type FrameworkRecord = TeableRecord<FrameworkFields>;

type CreateInput = Pick<FrameworkFields, 'title'> &
  Partial<Pick<FrameworkFields, 'context' | 'type' | 'is_active' | 'deleted_at'>>;

type UpdateInput = Partial<
  Pick<FrameworkFields, 'title' | 'context' | 'type' | 'is_active' | 'deleted_at'>
>;

export function listFrameworks(params?: ListParams): Promise<{ records: FrameworkRecord[] }> {
  return teableList<FrameworkFields>(TABLE_ID, params);
}

export function getFrameworkById(recordId: string): Promise<FrameworkRecord | null> {
  return teableGetById<FrameworkFields>(TABLE_ID, recordId);
}

export async function getFrameworkByTitle(title: string): Promise<FrameworkRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<FrameworkFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function listFrameworksByType(
  type: FrameworkType,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: FrameworkRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.type, operator: 'is', value: type }],
  });
  return teableList<FrameworkFields>(TABLE_ID, { ...params, filter });
}

export async function createFramework(fields: CreateInput): Promise<FrameworkRecord> {
  const result = await teableCreate<FrameworkFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateFramework(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: FrameworkRecord }> {
  return teableUpdate<FrameworkFields>(TABLE_ID, recordId, fields);
}

export function deleteFramework(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
