import {
  teableList,
  teableGetById,
  teableGetByIds,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tblbGSzWdR7KEtPVClg';

const FIELD_IDS = {
  title: 'fld8ipvRLGq7YTgPQkI',
} as const;

export interface GoalFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deadline?: string;
  deleted_at?: string;
  /** Link field — array of project record IDs (write) or { id, title } objects (read) */
  projects?: Array<string | { id: string; title?: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type GoalRecord = TeableRecord<GoalFields>;

type CreateInput = Pick<GoalFields, 'title'> &
  Partial<Pick<GoalFields, 'context' | 'is_active' | 'deadline' | 'deleted_at' | 'projects'>>;

type UpdateInput = Partial<
  Pick<GoalFields, 'title' | 'context' | 'is_active' | 'deadline' | 'deleted_at' | 'projects'>
>;

export function listGoals(params?: ListParams): Promise<{ records: GoalRecord[] }> {
  return teableList<GoalFields>(TABLE_ID, params);
}

export function getGoalById(recordId: string): Promise<GoalRecord | null> {
  return teableGetById<GoalFields>(TABLE_ID, recordId);
}

export async function searchGoalsByTitle(
  keyword: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: GoalRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'contains', value: keyword }],
  });
  return teableList<GoalFields>(TABLE_ID, { ...params, filter });
}

export function getGoalsByIds(recordIds: string[]): Promise<GoalRecord[]> {
  return teableGetByIds<GoalFields>(TABLE_ID, recordIds);
}

export async function getGoalByTitle(title: string): Promise<GoalRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<GoalFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createGoal(fields: CreateInput): Promise<GoalRecord> {
  const result = await teableCreate<GoalFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateGoal(recordId: string, fields: UpdateInput): Promise<{ record: GoalRecord }> {
  return teableUpdate<GoalFields>(TABLE_ID, recordId, fields);
}

export function deleteGoal(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
