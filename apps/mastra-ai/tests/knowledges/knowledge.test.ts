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
  listKnowledges,
  getKnowledgeByTitle,
  listKnowledgesByType,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
} from '../../src/mastra/tools/db-query/knowledges/knowledge.js';

const mockList = vi.mocked(teableList);
const mockCreate = vi.mocked(teableCreate);
const mockUpdate = vi.mocked(teableUpdate);
const mockDelete = vi.mocked(teableDelete);

const TABLE_ID = 'tblVTWb1kxXSFPBq4Fq';
const FIELD_ID_TITLE = 'fldROFj15OlD8COVxX0';
const FIELD_ID_KNOWLEDGE_TYPE = 'fldAEK8ULw9urxE0qiF';

const sampleRecord = {
  id: 'rec1',
  fields: {
    title: 'How to deploy',
    context: 'Steps to deploy',
    is_active: true,
    knowledge_type: 'Technical',
  },
};

beforeEach(() => {
  mockList.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('listKnowledges', () => {
  it('delegates to teableList with the correct table ID', async () => {
    mockList.mockResolvedValue({ records: [sampleRecord] });
    const result = await listKnowledges();
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, undefined);
    expect(result.records).toEqual([sampleRecord]);
  });

  it('passes through optional ListParams', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listKnowledges({ take: 10, skip: 20 });
    expect(mockList).toHaveBeenCalledWith(TABLE_ID, { take: 10, skip: 20 });
  });
});

describe('getKnowledgeByTitle', () => {
  it('queries with a title filter and returns first record', async () => {
    mockList.mockResolvedValue({ records: [sampleRecord] });
    const result = await getKnowledgeByTitle('How to deploy');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_TITLE);
    expect(filter.filterSet[0].operator).toBe('is');
    expect(filter.filterSet[0].value).toBe('How to deploy');
    expect(params.take).toBe(1);
    expect(result).toEqual(sampleRecord);
  });

  it('returns undefined when no record matches', async () => {
    mockList.mockResolvedValue({ records: [] });
    const result = await getKnowledgeByTitle('Missing');
    expect(result).toBeUndefined();
  });
});

describe('listKnowledgesByType', () => {
  it('queries with a knowledge_type filter built from the resolved record ID, not a title', async () => {
    mockList.mockResolvedValue({ records: [sampleRecord] });
    const result = await listKnowledgesByType('typeRec1');
    const [, params] = mockList.mock.calls[0] as [string, { filter: string }];
    const filter = JSON.parse(params.filter);
    expect(filter.filterSet[0].fieldId).toBe(FIELD_ID_KNOWLEDGE_TYPE);
    expect(filter.filterSet[0].operator).toBe('is');
    // Link fields filter on `jsonb_extract_path_text(cell,'id')` — a title never matches.
    expect(filter.filterSet[0].value).toBe('typeRec1');
    expect(result.records).toEqual([sampleRecord]);
  });

  it('merges additional params with the filter', async () => {
    mockList.mockResolvedValue({ records: [] });
    await listKnowledgesByType('typeRec1', { take: 5 });
    const [, params] = mockList.mock.calls[0] as [string, { filter: string; take: number }];
    expect(params.take).toBe(5);
    expect(params.filter).toBeDefined();
  });
});

describe('createKnowledge', () => {
  it('calls teableCreate and returns the first record', async () => {
    mockCreate.mockResolvedValue({ records: [sampleRecord] });
    const result = await createKnowledge({ title: 'How to deploy', knowledge_type: 'Technical' });
    expect(mockCreate).toHaveBeenCalledWith(TABLE_ID, [
      { title: 'How to deploy', knowledge_type: 'Technical' },
    ]);
    expect(result).toEqual(sampleRecord);
  });

  it('works with only the required title field', async () => {
    mockCreate.mockResolvedValue({ records: [{ id: 'rec2', fields: { title: 'Minimal' } }] });
    const result = await createKnowledge({ title: 'Minimal' });
    expect(result.fields.title).toBe('Minimal');
  });
});

describe('updateKnowledge', () => {
  it('calls teableUpdate with correct arguments', async () => {
    mockUpdate.mockResolvedValue({ record: sampleRecord });
    const result = await updateKnowledge('rec1', { title: 'Updated title' });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', { title: 'Updated title' });
    expect(result.record).toEqual(sampleRecord);
  });

  it('allows soft-deleting via deleted_at field', async () => {
    mockUpdate.mockResolvedValue({ record: sampleRecord });
    await updateKnowledge('rec1', { deleted_at: '2026-06-03', is_active: false });
    expect(mockUpdate).toHaveBeenCalledWith(TABLE_ID, 'rec1', {
      deleted_at: '2026-06-03',
      is_active: false,
    });
  });
});

describe('deleteKnowledge', () => {
  it('calls teableDelete with correct IDs', async () => {
    mockDelete.mockResolvedValue(undefined);
    await deleteKnowledge('rec1');
    expect(mockDelete).toHaveBeenCalledWith(TABLE_ID, 'rec1');
  });
});
