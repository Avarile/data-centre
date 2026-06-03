import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/mastra/tools/db-query/teable-client.js', () => ({
  teableList: vi.fn(),
  teableGetById: vi.fn(),
  teableCreate: vi.fn(),
  teableUpdate: vi.fn(),
  teableDelete: vi.fn(),
}));

import {
  teableList,
  teableGetById,
  teableCreate,
  teableUpdate,
  teableDelete,
} from '../../src/mastra/tools/db-query/teable-client.js';
import {
  listTasks,
  getTaskById,
  getTaskByTitle,
  createTask,
  updateTask,
  deleteTask,
} from '../../src/mastra/tools/db-query/project-management/tasks.js';

const mockList = vi.mocked(teableList);
const mockGetById = vi.mocked(teableGetById);
const mockCreate = vi.mocked(teableCreate);
const mockUpdate = vi.mocked(teableUpdate);
const mockDelete = vi.mocked(teableDelete);

const TABLE_ID = 'tblOMgDiajqa1moRRjE';
const FIELD_ID_TITLE = 'fldGqUoXO7oyq6ufX2Y';

const sampleTask = {
  id: 'rec1',
  fields: {
    title: 'Implement login',
    progress: 'in-progress' as const,
    priority: 'urgent' as const,
  },
};

beforeEach(() => {
  mockList.mockReset();
  mockGetById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('listTasks', () => {
  it('delegates to teableList with the correct table ID', async () => {
    mockList.mockResolvedValue({ records: [sampleTask] });
    const result = await listTasks();
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, undefined);
    expect(result.records).toEqual([sampleTask]);
  });

  it('passes through optional params', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listTasks({ take: 3 });
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, { take: 3 });
  });
});

describe('getTaskById', () => {
  it('delegates to teableGetById with the correct table ID', async () => {
    mockGetById.mockResolvedValue(sampleTask);
    const result = await getTaskById('rec1');
    expect(mockGetById).toHaveBeenCalledWith(TABLE_ID, 'rec1');
    expect(result).toEqual(sampleTask);
  });

  it('returns null when task not found', async () => {
    mockGetById.mockResolvedValue(null);
    const result = await getTaskById('rec_missing');
    expect(result).toBeNull();
  });
});

describe('getTaskByTitle', () => {
  it('queries with a title filter and returns first record', async () => {
    mockList.mockResolvedValue({ records: [sampleTask] });
    const result = await getTaskByTitle('Implement login');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_TITLE);
    expect(filter.filterSet[0].operator).toBe('is');
    expect(filter.filterSet[0].value).toBe('Implement login');
    expect(params.take).toBe(1);
    expect(result).toEqual(sampleTask);
  });

  it('returns undefined when not found', async () => {
    mockList.mockResolvedValue({ records: [] });
    expect(await getTaskByTitle('Unknown')).toBeUndefined();
  });
});

describe('createTask', () => {
  it('creates with required title field', async () => {
    mockCreate.mockResolvedValue({ records: [sampleTask] });
    const result = await createTask({ title: 'Implement login' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [{ title: 'Implement login' }]);
    expect(result).toEqual(sampleTask);
  });

  it('passes all optional fields', async () => {
    mockCreate.mockResolvedValue({ records: [sampleTask] });
    await createTask({
      title: 'T',
      progress: 'backlog',
      priority: 'normal',
      started_at: '2026-06-01',
      finished_at: '2026-06-10',
    });
    const [, fields] = mockCreate.mock.calls[0] as [string, object[]];
    expect(fields[0]).toMatchObject({ progress: 'backlog', priority: 'normal' });
  });

  it('accepts belong_project link IDs', async () => {
    mockCreate.mockResolvedValue({ records: [sampleTask] });
    await createTask({ title: 'T', belong_project: ['projectRec1'] });
    const [, fields] = mockCreate.mock.calls[0] as [string, Array<{ belong_project?: string[] }>];
    expect(fields[0].belong_project).toEqual(['projectRec1']);
  });
});

describe('updateTask', () => {
  it('calls teableUpdate with correct arguments', async () => {
    mockUpdate.mockResolvedValue({ record: sampleTask });
    const result = await updateTask('rec1', { progress: 'finished_reviewing' });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { progress: 'finished_reviewing' });
    expect(result.record).toEqual(sampleTask);
  });

  it('allows updating assigned_to link', async () => {
    mockUpdate.mockResolvedValue({ record: sampleTask });
    await updateTask('rec1', { assigned_to: ['userRec1'] });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { assigned_to: ['userRec1'] });
  });
});

describe('deleteTask', () => {
  it('calls teableDelete with correct IDs', async () => {
    mockDelete.mockResolvedValue(undefined);
    await deleteTask('rec1');
    expect(mockDelete).toHaveBeenCalledWith(TABLE_ID, 'rec1');
  });
});
