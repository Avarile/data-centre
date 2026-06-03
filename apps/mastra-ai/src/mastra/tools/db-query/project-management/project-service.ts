import { toLinkIds, teableGetByIds } from '../teable-client.js';
import { getGoalById, createGoal, type GoalRecord, type GoalFields } from './goals.js';
import {
  getProjectById,
  createProject,
  listProjects,
  type ProjectRecord,
  type ProjectFields,
} from './projects.js';
import { createTask, type TaskRecord, type TaskFields } from './tasks.js';

export interface ProjectWithTasks {
  project: ProjectRecord;
  tasks: TaskRecord[];
}

export interface GoalWithProjects {
  goal: GoalRecord;
  projects: ProjectRecord[];
}

export interface FullHierarchy {
  goal: GoalRecord;
  projects: ProjectWithTasks[];
}

/**
 * Creates a project linked to an existing goal in one request.
 * Pass goalRecordId (e.g. "recXXX") — the Teable record ID, not the auto-increment id field.
 */
export async function createProjectUnderGoal(
  projectFields: Pick<ProjectFields, 'title'> &
    Partial<Pick<ProjectFields, 'context' | 'is_active' | 'progress' | 'lead_by'>>,
  goalRecordId: string
): Promise<{ project: ProjectRecord; goal: GoalRecord | null }> {
  const [project, goal] = await Promise.all([
    createProject({ ...projectFields, belong_goals: [goalRecordId] }),
    getGoalById(goalRecordId),
  ]);
  return { project, goal };
}

/**
 * Creates a task linked to an existing project in one request.
 * Pass projectRecordId (e.g. "recXXX") — the Teable record ID, not the auto-increment id field.
 */
export async function createTaskUnderProject(
  taskFields: Pick<TaskFields, 'title'> &
    Partial<
      Pick<
        TaskFields,
        | 'context'
        | 'is_active'
        | 'progress'
        | 'priority'
        | 'started_at'
        | 'finished_at'
        | 'assigned_to'
      >
    >,
  projectRecordId: string
): Promise<{ task: TaskRecord; project: ProjectRecord | null }> {
  const [task, project] = await Promise.all([
    createTask({ ...taskFields, belong_project: [projectRecordId] }),
    getProjectById(projectRecordId),
  ]);
  return { task, project };
}

/**
 * Creates a full goal → project → task chain in creation order.
 */
export async function createFullChain(
  goalFields: Pick<GoalFields, 'title'> &
    Partial<Pick<GoalFields, 'context' | 'is_active' | 'deadline'>>,
  projectFields: Pick<ProjectFields, 'title'> &
    Partial<Pick<ProjectFields, 'context' | 'is_active' | 'progress'>>,
  taskFields: Pick<TaskFields, 'title'> &
    Partial<Pick<TaskFields, 'context' | 'is_active' | 'progress' | 'priority'>>
): Promise<{ goal: GoalRecord; project: ProjectRecord; task: TaskRecord }> {
  const goal = await createGoal(goalFields);
  const project = await createProject({ ...projectFields, belong_goals: [goal.id] });
  const task = await createTask({ ...taskFields, belong_project: [project.id] });
  return { goal, project, task };
}

/**
 * Returns a goal with all its linked project records resolved.
 * Uses approach A: fetch goal → extract project IDs → batch-fetch projects.
 */
export async function getGoalWithProjects(goalRecordId: string): Promise<GoalWithProjects | null> {
  const goal = await getGoalById(goalRecordId);
  if (!goal) return null;

  const projectIds = toLinkIds(goal.fields.projects);
  const projects = await teableGetByIds<ProjectRecord['fields']>('tbliD8gcOTRk9RZ9SmR', projectIds);

  return { goal, projects };
}

/**
 * Returns a project with all its linked task records resolved.
 * Uses approach A: fetch project → extract task IDs → batch-fetch tasks.
 */
export async function getProjectWithTasks(
  projectRecordId: string
): Promise<ProjectWithTasks | null> {
  const project = await getProjectById(projectRecordId);
  if (!project) return null;

  const taskIds = toLinkIds(project.fields.tasks);
  const tasks = await teableGetByIds<TaskRecord['fields']>('tblOMgDiajqa1moRRjE', taskIds);

  return { project, tasks };
}

/**
 * Returns the full goal → projects → tasks hierarchy for a single goal.
 */
export async function getFullHierarchy(goalRecordId: string): Promise<FullHierarchy | null> {
  const goalWithProjects = await getGoalWithProjects(goalRecordId);
  if (!goalWithProjects) return null;

  const projectsWithTasks = await Promise.all(
    goalWithProjects.projects.map(async (project) => {
      const taskIds = toLinkIds(project.fields.tasks);
      const tasks = await teableGetByIds<TaskRecord['fields']>('tblOMgDiajqa1moRRjE', taskIds);
      return { project, tasks };
    })
  );

  return { goal: goalWithProjects.goal, projects: projectsWithTasks };
}

/**
 * Returns all active projects with their tasks, across all goals.
 */
export async function getAllProjectsWithTasks(): Promise<ProjectWithTasks[]> {
  const { records: projects } = await listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const taskIds = toLinkIds(project.fields.tasks);
      const tasks = await teableGetByIds<TaskRecord['fields']>('tblOMgDiajqa1moRRjE', taskIds);
      return { project, tasks };
    })
  );
}
