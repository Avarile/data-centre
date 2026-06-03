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
  listGoals,
  getGoalById,
  getGoalByTitle,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../../src/mastra/tools/db-query/project-management/goals.js';

const mockList = vi.mocked(teableList);
const mockGetById = vi.mocked(teableGetById);
const mockCreate = vi.mocked(teableCreate);
const mockUpdate = vi.mocked(teableUpdate);
const mockDelete = vi.mocked(teableDelete);

const TABLE_ID = 'tblbGSzWdR7KEtPVClg';
const FIELD_ID_TITLE = 'fld8ipvRLGq7YTgPQkI';

const sampleGoal = {
  id: 'rec1',
  fields: { title: 'Ship v2', deadline: '2026-12-31', is_active: true },
};

beforeEach(() => {
  mockList.mockReset();
  mockGetById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('listGoals', () => {
  it('delegates to teableList with the correct table ID', async () => {
    mockList.mockResolvedValue({ records: [sampleGoal] });
    const result = await listGoals();
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, undefined);
    expect(result.records).toEqual([sampleGoal]);
  });

  it('passes through optional params', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listGoals({ take: 5, skip: 10 });
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, { take: 5, skip: 10 });
  });
});

describe('getGoalById', () => {
  it('delegates to teableGetById with the correct table ID', async () => {
    mockGetById.mockResolvedValue(sampleGoal);
    const result = await getGoalById('rec1');
    expect(mockGetById).toHaveBeenCalledWith(TABLE_ID, 'rec1');
    expect(result).toEqual(sampleGoal);
  });

  it('returns null when goal not found', async () => {
    mockGetById.mockResolvedValue(null);
    const result = await getGoalById('rec_missing');
    expect(result).toBeNull();
  });
});

describe('getGoalByTitle', () => {
  it('queries with a title filter and returns first record', async () => {
    mockList.mockResolvedValue({ records: [sampleGoal] });
    const result = await getGoalByTitle('Ship v2');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_TITLE);
    expect(filter.filterSet[0].operator).toBe('is');
    expect(filter.filterSet[0].value).toBe('Ship v2');
    expect(params.take).toBe(1);
    expect(result).toEqual(sampleGoal);
  });

  it('returns undefined when not found', async () => {
    mockList.mockResolvedValue({ records: [] });
    expect(await getGoalByTitle('Unknown')).toBeUndefined();
  });
});

describe('createGoal', () => {
  it('creates with required title field', async () => {
    mockCreate.mockResolvedValue({ records: [sampleGoal] });
    const result = await createGoal({ title: 'Ship v2' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [{ title: 'Ship v2' }]);
    expect(result).toEqual(sampleGoal);
  });

  it('passes all optional fields', async () => {
    mockCreate.mockResolvedValue({ records: [sampleGoal] });
    await createGoal({ title: 'Ship v2', deadline: '2026-12-31', is_active: true, context: 'ctx' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [
      { title: 'Ship v2', deadline: '2026-12-31', is_active: true, context: 'ctx' },
    ]);
  });

  it('accepts projects link IDs', async () => {
    mockCreate.mockResolvedValue({ records: [sampleGoal] });
    await createGoal({ title: 'Ship v2', projects: ['projRec1'] });
    const [, fields] = mockCreate.mock.calls[0] as [string, Array<{ projects?: string[] }>];
    expect(fields[0].projects).toEqual(['projRec1']);
  });
});

describe('updateGoal', () => {
  it('calls teableUpdate with correct arguments', async () => {
    mockUpdate.mockResolvedValue({ record: sampleGoal });
    const result = await updateGoal('rec1', { deadline: '2027-01-01' });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { deadline: '2027-01-01' });
    expect(result.record).toEqual(sampleGoal);
  });

  it('allows marking a goal as deleted', async () => {
    mockUpdate.mockResolvedValue({ record: sampleGoal });
    await updateGoal('rec1', { deleted_at: '2026-06-03', is_active: false });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', {
      deleted_at: '2026-06-03',
      is_active: false,
    });
  });
});

describe('deleteGoal', () => {
  it('calls teableDelete with correct IDs', async () => {
    mockDelete.mockResolvedValue(undefined);
    await deleteGoal('rec1');
    expect(mockDelete).toHaveBeenCalledWith(TABLE_ID, 'rec1');
  });
});
