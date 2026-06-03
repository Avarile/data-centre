import {
  teableList,
  teableGetById,
  teableCreate,
  teableUpdate,
  teableDelete,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tbliD8gcOTRk9RZ9SmR';

const FIELD_IDS = {
  title: 'fldiDksJhyT8mDAhCBP',
} as const;

export type ProjectProgress =
  | 'backlog'
  | 'preparing'
  | 'initiated'
  | 'in-progress'
  | 'finished-reviewing'
  | 'finished-validating'
  | 'finished-testing'
  | 'finalized'
  | 'onhold'
  | 'cancelled';

export interface ProjectFields {
  title: string;
  context?: string;
  is_active?: boolean;
  progress?: ProjectProgress;
  deleted_at?: string;
  /** Link field — array of task record IDs (write) or { id, title } objects (read) */
  tasks?: Array<string | { id: string; title?: string }>;
  /** Link field — array of goal record IDs (write) or { id, title } objects (read) */
  belong_goals?: Array<string | { id: string; title?: string }>;
  /** Link field — array of user/team record IDs */
  lead_by?: Array<string | { id: string; title?: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type ProjectRecord = TeableRecord<ProjectFields>;

type CreateInput = Pick<ProjectFields, 'title'> &
  Partial<
    Pick<
      ProjectFields,
      'context' | 'is_active' | 'progress' | 'deleted_at' | 'tasks' | 'belong_goals' | 'lead_by'
    >
  >;

type UpdateInput = Partial<
  Pick<
    ProjectFields,
    | 'title'
    | 'context'
    | 'is_active'
    | 'progress'
    | 'deleted_at'
    | 'tasks'
    | 'belong_goals'
    | 'lead_by'
  >
>;

export function listProjects(params?: ListParams): Promise<{ records: ProjectRecord[] }> {
  return teableList<ProjectFields>(TABLE_ID, params);
}

export function getProjectById(recordId: string): Promise<ProjectRecord | null> {
  return teableGetById<ProjectFields>(TABLE_ID, recordId);
}

export async function getProjectByTitle(title: string): Promise<ProjectRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<ProjectFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createProject(fields: CreateInput): Promise<ProjectRecord> {
  const result = await teableCreate<ProjectFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateProject(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: ProjectRecord }> {
  return teableUpdate<ProjectFields>(TABLE_ID, recordId, fields);
}

export function deleteProject(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}
