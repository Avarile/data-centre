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
  listProjects,
  getProjectById,
  getProjectByTitle,
  createProject,
  updateProject,
  deleteProject,
} from '../../src/mastra/tools/db-query/project-management/projects.js';

const mockList = vi.mocked(teableList);
const mockGetById = vi.mocked(teableGetById);
const mockCreate = vi.mocked(teableCreate);
const mockUpdate = vi.mocked(teableUpdate);
const mockDelete = vi.mocked(teableDelete);

const TABLE_ID = 'tbliD8gcOTRk9RZ9SmR';
const FIELD_ID_TITLE = 'fldiDksJhyT8mDAhCBP';

const sampleProject = {
  id: 'rec1',
  fields: { title: 'Alpha', progress: 'in-progress' as const, is_active: true },
};

beforeEach(() => {
  mockList.mockReset();
  mockGetById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('listProjects', () => {
  it('delegates to teableList with the correct table ID', async () => {
    mockList.mockResolvedValue({ records: [sampleProject] });
    const result = await listProjects();
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, undefined);
    expect(result.records).toEqual([sampleProject]);
  });

  it('passes through optional params', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listProjects({ take: 5 });
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, { take: 5 });
  });
});

describe('getProjectById', () => {
  it('delegates to teableGetById with the correct table ID', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    const result = await getProjectById('rec1');
    expect(mockGetById).toHaveBeenCalledWith(TABLE_ID, 'rec1');
    expect(result).toEqual(sampleProject);
  });

  it('returns null when project not found', async () => {
    mockGetById.mockResolvedValue(null);
    const result = await getProjectById('rec_missing');
    expect(result).toBeNull();
  });
});

describe('getProjectByTitle', () => {
  it('queries with a title filter', async () => {
    mockList.mockResolvedValue({ records: [sampleProject] });
    const result = await getProjectByTitle('Alpha');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_TITLE);
    expect(filter.filterSet[0].operator).toBe('is');
    expect(filter.filterSet[0].value).toBe('Alpha');
    expect(params.take).toBe(1);
    expect(result).toEqual(sampleProject);
  });

  it('returns undefined when not found', async () => {
    mockList.mockResolvedValue({ records: [] });
    expect(await getProjectByTitle('Unknown')).toBeUndefined();
  });
});

describe('createProject', () => {
  it('creates with required title field', async () => {
    mockCreate.mockResolvedValue({ records: [sampleProject] });
    const result = await createProject({ title: 'Alpha' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [{ title: 'Alpha' }]);
    expect(result).toEqual(sampleProject);
  });

  it('passes all optional fields', async () => {
    mockCreate.mockResolvedValue({ records: [sampleProject] });
    await createProject({ title: 'Alpha', progress: 'backlog', is_active: true, context: 'ctx' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [
      { title: 'Alpha', progress: 'backlog', is_active: true, context: 'ctx' },
    ]);
  });

  it('accepts belong_goals link IDs', async () => {
    mockCreate.mockResolvedValue({ records: [sampleProject] });
    await createProject({ title: 'Alpha', belong_goals: ['goalRec1'] });
    const [, fields] = mockCreate.mock.calls[0] as [string, Array<{ belong_goals?: string[] }>];
    expect(fields[0].belong_goals).toEqual(['goalRec1']);
  });
});

describe('updateProject', () => {
  it('calls teableUpdate with correct arguments', async () => {
    mockUpdate.mockResolvedValue({ record: sampleProject });
    const result = await updateProject('rec1', { progress: 'finalized' });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { progress: 'finalized' });
    expect(result.record).toEqual(sampleProject);
  });
});

describe('deleteProject', () => {
  it('calls teableDelete with correct IDs', async () => {
    mockDelete.mockResolvedValue(undefined);
    await deleteProject('rec1');
    expect(mockDelete).toHaveBeenCalledWith(TABLE_ID, 'rec1');
  });
});
