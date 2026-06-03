import {
  teableList,
  teableGetById,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tblOMgDiajqa1moRRjE';

const FIELD_IDS = {
  title: 'fldGqUoXO7oyq6ufX2Y',
} as const;

// Note: task progress uses underscores (finished_reviewing), project progress uses hyphens — kept as-is from the API
export type TaskProgress =
  | 'backlog'
  | 'in-progress'
  | 'finished_reviewing'
  | 'finished_validating'
  | 'onhold'
  | 'cancelled';

export type TaskPriority = 'urgent' | 'important' | 'prioritise' | 'normal' | 'can wait';

export interface TaskFields {
  title: string;
  context?: string;
  is_active?: boolean;
  progress?: TaskProgress;
  priority?: TaskPriority;
  started_at?: string;
  finished_at?: string;
  deleted_at?: string;
  /** Link field — array of project record IDs (write) or { id, title } objects (read) */
  belong_project?: Array<string | { id: string; title?: string }>;
  /** Link field — array of user/team record IDs */
  assigned_to?: Array<string | { id: string; title?: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type TaskRecord = TeableRecord<TaskFields>;

type CreateInput = Pick<TaskFields, 'title'> &
  Partial<
    Pick<
      TaskFields,
      | 'context'
      | 'is_active'
      | 'progress'
      | 'priority'
      | 'started_at'
      | 'finished_at'
      | 'deleted_at'
      | 'belong_project'
      | 'assigned_to'
    >
  >;

type UpdateInput = Partial<
  Pick<
    TaskFields,
    | 'title'
    | 'context'
    | 'is_active'
    | 'progress'
    | 'priority'
    | 'started_at'
    | 'finished_at'
    | 'deleted_at'
    | 'belong_project'
    | 'assigned_to'
  >
>;

export function listTasks(params?: ListParams): Promise<{ records: TaskRecord[] }> {
  return teableList<TaskFields>(TABLE_ID, params);
}

export function getTaskById(recordId: string): Promise<TaskRecord | null> {
  return teableGetById<TaskFields>(TABLE_ID, recordId);
}

export async function getTaskByTitle(title: string): Promise<TaskRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<TaskFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createTask(fields: CreateInput): Promise<TaskRecord> {
  const result = await teableCreate<TaskFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateTask(recordId: string, fields: UpdateInput): Promise<{ record: TaskRecord }> {
  return teableUpdate<TaskFields>(TABLE_ID, recordId, fields);
}

export function deleteTask(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
