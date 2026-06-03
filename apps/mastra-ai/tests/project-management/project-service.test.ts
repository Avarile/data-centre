import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/mastra/tools/db-query/teable-client.js', () => ({
  toLinkIds: vi.fn(),
  teableGetByIds: vi.fn(),
}));

vi.mock('../../src/mastra/tools/db-query/project-management/goals.js', () => ({
  getGoalById: vi.fn(),
  createGoal: vi.fn(),
}));

vi.mock('../../src/mastra/tools/db-query/project-management/projects.js', () => ({
  getProjectById: vi.fn(),
  createProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock('../../src/mastra/tools/db-query/project-management/tasks.js', () => ({
  createTask: vi.fn(),
}));

import { toLinkIds, teableGetByIds } from '../../src/mastra/tools/db-query/teable-client.js';
import {
  getGoalById,
  createGoal,
} from '../../src/mastra/tools/db-query/project-management/goals.js';
import {
  getProjectById,
  createProject,
  listProjects,
} from '../../src/mastra/tools/db-query/project-management/projects.js';
import { createTask } from '../../src/mastra/tools/db-query/project-management/tasks.js';
import {
  createProjectUnderGoal,
  createTaskUnderProject,
  createFullChain,
  getGoalWithProjects,
  getProjectWithTasks,
  getFullHierarchy,
  getAllProjectsWithTasks,
} from '../../src/mastra/tools/db-query/project-management/project-service.js';

const mockToLinkIds = vi.mocked(toLinkIds);
const mockGetByIds = vi.mocked(teableGetByIds);
const mockGetGoalById = vi.mocked(getGoalById);
const mockCreateGoal = vi.mocked(createGoal);
const mockGetProjectById = vi.mocked(getProjectById);
const mockCreateProject = vi.mocked(createProject);
const mockListProjects = vi.mocked(listProjects);
const mockCreateTask = vi.mocked(createTask);

const goalRec = { id: 'goalRec1', fields: { title: 'Ship v2', projects: ['projRec1'] } };
const projectRec = {
  id: 'projRec1',
  fields: { title: 'Alpha', tasks: ['taskRec1'], belong_goals: ['goalRec1'] },
};
const taskRec = {
  id: 'taskRec1',
  fields: { title: 'Implement login', belong_project: ['projRec1'] },
};

beforeEach(() => {
  mockToLinkIds.mockReset();
  mockGetByIds.mockReset();
  mockGetGoalById.mockReset();
  mockCreateGoal.mockReset();
  mockGetProjectById.mockReset();
  mockCreateProject.mockReset();
  mockListProjects.mockReset();
  mockCreateTask.mockReset();
});

describe('createProjectUnderGoal', () => {
  it('creates project with goal link and fetches the goal in parallel', async () => {
    mockCreateProject.mockResolvedValue(projectRec);
    mockGetGoalById.mockResolvedValue(goalRec);
    const result = await createProjectUnderGoal({ title: 'Alpha' }, 'goalRec1');
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ belong_goals: ['goalRec1'] })
    );
    expect(mockGetGoalById).toHaveBeenCalledWith('goalRec1');
    expect(result.project).toEqual(projectRec);
    expect(result.goal).toEqual(goalRec);
  });

  it('returns null goal when goal not found', async () => {
    mockCreateProject.mockResolvedValue(projectRec);
    mockGetGoalById.mockResolvedValue(null);
    const result = await createProjectUnderGoal({ title: 'Alpha' }, 'goalRec_missing');
    expect(result.goal).toBeNull();
  });

  it('passes optional project fields through', async () => {
    mockCreateProject.mockResolvedValue(projectRec);
    mockGetGoalById.mockResolvedValue(goalRec);
    await createProjectUnderGoal(
      { title: 'Alpha', progress: 'backlog', context: 'ctx' },
      'goalRec1'
    );
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alpha', progress: 'backlog', context: 'ctx' })
    );
  });
});

describe('createTaskUnderProject', () => {
  it('creates task with project link and fetches the project in parallel', async () => {
    mockCreateTask.mockResolvedValue(taskRec);
    mockGetProjectById.mockResolvedValue(projectRec);
    const result = await createTaskUnderProject({ title: 'Implement login' }, 'projRec1');
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ belong_project: ['projRec1'] })
    );
    expect(mockGetProjectById).toHaveBeenCalledWith('projRec1');
    expect(result.task).toEqual(taskRec);
    expect(result.project).toEqual(projectRec);
  });

  it('returns null project when project not found', async () => {
    mockCreateTask.mockResolvedValue(taskRec);
    mockGetProjectById.mockResolvedValue(null);
    const result = await createTaskUnderProject({ title: 'T' }, 'projRec_missing');
    expect(result.project).toBeNull();
  });
});

describe('createFullChain', () => {
  it('creates goal → project → task in order', async () => {
    mockCreateGoal.mockResolvedValue(goalRec);
    mockCreateProject.mockResolvedValue(projectRec);
    mockCreateTask.mockResolvedValue(taskRec);
    const result = await createFullChain(
      { title: 'Ship v2' },
      { title: 'Alpha' },
      { title: 'Implement login' }
    );
    expect(mockCreateGoal).toHaveBeenCalledWith({ title: 'Ship v2' });
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ belong_goals: [goalRec.id] })
    );
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ belong_project: [projectRec.id] })
    );
    expect(result).toEqual({ goal: goalRec, project: projectRec, task: taskRec });
  });
});

describe('getGoalWithProjects', () => {
  it('returns null when goal not found', async () => {
    mockGetGoalById.mockResolvedValue(null);
    const result = await getGoalWithProjects('goalRec_missing');
    expect(result).toBeNull();
  });

  it('fetches linked project records and returns them with the goal', async () => {
    mockGetGoalById.mockResolvedValue(goalRec);
    mockToLinkIds.mockReturnValue(['projRec1']);
    mockGetByIds.mockResolvedValue([projectRec]);
    const result = await getGoalWithProjects('goalRec1');
    expect(mockToLinkIds).toHaveBeenCalledWith(goalRec.fields.projects);
    expect(mockGetByIds).toHaveBeenCalledWith(expect.any(String), ['projRec1']);
    expect(result?.goal).toEqual(goalRec);
    expect(result?.projects).toEqual([projectRec]);
  });

  it('returns empty projects when goal has no linked projects', async () => {
    const goalNoProjects = { id: 'g2', fields: { title: 'Empty' } };
    mockGetGoalById.mockResolvedValue(goalNoProjects);
    mockToLinkIds.mockReturnValue([]);
    mockGetByIds.mockResolvedValue([]);
    const result = await getGoalWithProjects('g2');
    expect(result?.projects).toEqual([]);
  });
});

describe('getProjectWithTasks', () => {
  it('returns null when project not found', async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await getProjectWithTasks('projRec_missing');
    expect(result).toBeNull();
  });

  it('fetches linked tasks and returns them with the project', async () => {
    mockGetProjectById.mockResolvedValue(projectRec);
    mockToLinkIds.mockReturnValue(['taskRec1']);
    mockGetByIds.mockResolvedValue([taskRec]);
    const result = await getProjectWithTasks('projRec1');
    expect(mockToLinkIds).toHaveBeenCalledWith(projectRec.fields.tasks);
    expect(result?.project).toEqual(projectRec);
    expect(result?.tasks).toEqual([taskRec]);
  });

  it('returns empty tasks when project has no linked tasks', async () => {
    const projNoTasks = { id: 'p2', fields: { title: 'No tasks' } };
    mockGetProjectById.mockResolvedValue(projNoTasks);
    mockToLinkIds.mockReturnValue([]);
    mockGetByIds.mockResolvedValue([]);
    const result = await getProjectWithTasks('p2');
    expect(result?.tasks).toEqual([]);
  });
});

describe('getFullHierarchy', () => {
  it('returns null when goal not found', async () => {
    mockGetGoalById.mockResolvedValue(null);
    const result = await getFullHierarchy('goalRec_missing');
    expect(result).toBeNull();
  });

  it('builds full goal → projects → tasks hierarchy', async () => {
    mockGetGoalById.mockResolvedValue(goalRec);
    mockToLinkIds
      .mockReturnValueOnce(['projRec1']) // for goal.projects
      .mockReturnValueOnce(['taskRec1']); // for project.tasks
    mockGetByIds
      .mockResolvedValueOnce([projectRec]) // projects fetch
      .mockResolvedValueOnce([taskRec]); // tasks fetch
    const result = await getFullHierarchy('goalRec1');
    expect(result?.goal).toEqual(goalRec);
    expect(result?.projects).toHaveLength(1);
    expect(result?.projects[0].project).toEqual(projectRec);
    expect(result?.projects[0].tasks).toEqual([taskRec]);
  });
});

describe('getAllProjectsWithTasks', () => {
  it('fetches all projects and resolves tasks for each', async () => {
    mockListProjects.mockResolvedValue({ records: [projectRec] });
    mockToLinkIds.mockReturnValue(['taskRec1']);
    mockGetByIds.mockResolvedValue([taskRec]);
    const result = await getAllProjectsWithTasks();
    expect(mockListProjects).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].project).toEqual(projectRec);
    expect(result[0].tasks).toEqual([taskRec]);
  });

  it('returns empty array when there are no projects', async () => {
    mockListProjects.mockResolvedValue({ records: [] });
    const result = await getAllProjectsWithTasks();
    expect(result).toEqual([]);
  });
});
