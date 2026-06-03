import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/mastra/tools/db-query/teable-client.js', () => ({
  teableList: vi.fn(),
  teableCreate: vi.fn(),
  teableUpdate: vi.fn(),
  teableDelete: vi.fn(),
}));

import {
  teableList,
  teableCreate,
  teableUpdate,
  teableDelete,
} from '../../src/mastra/tools/db-query/teable-client.js';
import {
  listKnowledgeTypes,
  getKnowledgeTypeByTitle,
  createKnowledgeType,
  updateKnowledgeType,
  deleteKnowledgeType,
} from '../../src/mastra/tools/db-query/knowledges/knowledge-type.js';

const mockList = vi.mocked(teableList);
const mockCreate = vi.mocked(teableCreate);
const mockUpdate = vi.mocked(teableUpdate);
const mockDelete = vi.mocked(teableDelete);

const TABLE_ID = 'tblWcq6Kof1AFHvbC5e';
const FIELD_ID_TITLE = 'fldvL1LqKmEAfNKVBCO';

const sampleRecord = {
  id: 'rec1',
  fields: { title: 'Technical', context: 'Tech stuff', is_active: true },
};

beforeEach(() => {
  mockList.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('listKnowledgeTypes', () => {
  it('delegates to teableList with the correct table ID', async () => {
    mockList.mockResolvedValue({ records: [sampleRecord] });
    const result = await listKnowledgeTypes();
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, undefined);
    expect(result.records).toEqual([sampleRecord]);
  });

  it('passes through optional ListParams', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listKnowledgeTypes({ take: 5, skip: 0 });
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, { take: 5, skip: 0 });
  });
});

describe('getKnowledgeTypeByTitle', () => {
  it('queries with a title filter and returns the first record', async () => {
    mockList.mockResolvedValue({ records: [sampleRecord] });
    const result = await getKnowledgeTypeByTitle('Technical');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_TITLE);
    expect(filter.filterSet[0].operator).toBe('is');
    expect(filter.filterSet[0].value).toBe('Technical');
    expect(params.take).toBe(1);
    expect(result).toEqual(sampleRecord);
  });

  it('returns undefined when no record matches', async () => {
    mockList.mockResolvedValue({ records: [] });
    const result = await getKnowledgeTypeByTitle('Unknown');
    expect(result).toBeUndefined();
  });
});

describe('createKnowledgeType', () => {
  it('calls teableCreate and returns the first record', async () => {
    mockCreate.mockResolvedValue({ records: [sampleRecord] });
    const result = await createKnowledgeType({
      title: 'Technical',
      context: 'Tech stuff',
      is_active: true,
    });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [
      { title: 'Technical', context: 'Tech stuff', is_active: true },
    ]);
    expect(result).toEqual(sampleRecord);
  });

  it('works with only the required title field', async () => {
    mockCreate.mockResolvedValue({ records: [{ id: 'rec2', fields: { title: 'Minimal' } }] });
    const result = await createKnowledgeType({ title: 'Minimal' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [{ title: 'Minimal' }]);
    expect(result.fields.title).toBe('Minimal');
  });
});

describe('updateKnowledgeType', () => {
  it('calls teableUpdate and returns the result', async () => {
    mockUpdate.mockResolvedValue({ record: sampleRecord });
    const result = await updateKnowledgeType('rec1', { title: 'Updated' });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { title: 'Updated' });
    expect(result.record).toEqual(sampleRecord);
  });

  it('allows partial field updates', async () => {
    mockUpdate.mockResolvedValue({ record: sampleRecord });
    await updateKnowledgeType('rec1', { is_active: false });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { is_active: false });
  });
});

describe('deleteKnowledgeType', () => {
  it('calls teableDelete with correct IDs', async () => {
    mockDelete.mockResolvedValue(undefined);
    await deleteKnowledgeType('rec1');
    expect(mockDelete).toHaveBeenCalledWith(TABLE_ID, 'rec1');
  });
});
