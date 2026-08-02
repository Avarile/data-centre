import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/mastra/tools/db-query/knowledges/knowledge-type.js', () => ({
  getKnowledgeTypeByTitle: vi.fn(),
  createKnowledgeType: vi.fn(),
  listKnowledgeTypes: vi.fn(),
}));

vi.mock('../../src/mastra/tools/db-query/knowledges/knowledge.js', () => ({
  createKnowledge: vi.fn(),
  listKnowledges: vi.fn(),
  listKnowledgesByType: vi.fn(),
}));

import {
  getKnowledgeTypeByTitle,
  createKnowledgeType,
  listKnowledgeTypes,
} from '../../src/mastra/tools/db-query/knowledges/knowledge-type.js';
import {
  createKnowledge,
  listKnowledges,
  listKnowledgesByType,
} from '../../src/mastra/tools/db-query/knowledges/knowledge.js';
import {
  ensureKnowledgeType,
  createKnowledgeWithType,
  getKnowledgesWithType,
  getKnowledgesByType,
} from '../../src/mastra/tools/db-query/knowledges/knowledge-service.js';

const mockGetByTitle = vi.mocked(getKnowledgeTypeByTitle);
const mockCreateType = vi.mocked(createKnowledgeType);
const mockListTypes = vi.mocked(listKnowledgeTypes);
const mockCreateKnowledge = vi.mocked(createKnowledge);
const mockListKnowledges = vi.mocked(listKnowledges);
const mockListByType = vi.mocked(listKnowledgesByType);

const existingType = { id: 'typeRec1', fields: { title: 'Technical', is_active: true } };
const newType = { id: 'typeRec2', fields: { title: 'NewType', is_active: true } };
const knowledgeRec = {
  id: 'knRec1',
  fields: { title: 'How to deploy', knowledge_type: 'Technical' },
};

beforeEach(() => {
  mockGetByTitle.mockReset();
  mockCreateType.mockReset();
  mockListTypes.mockReset();
  mockCreateKnowledge.mockReset();
  mockListKnowledges.mockReset();
  mockListByType.mockReset();
});

describe('ensureKnowledgeType', () => {
  it('returns existing type when found', async () => {
    mockGetByTitle.mockResolvedValue(existingType);
    const result = await ensureKnowledgeType('Technical');
    expect(result).toEqual(existingType);
    expect(mockCreateType).not.toHaveBeenCalled();
  });

  it('creates and returns a new type when not found', async () => {
    mockGetByTitle.mockResolvedValue(undefined);
    mockCreateType.mockResolvedValue(newType);
    const result = await ensureKnowledgeType('NewType', 'Some context');
    expect(mockCreateType).toHaveBeenCalledWith({
      title: 'NewType',
      context: 'Some context',
      is_active: true,
    });
    expect(result).toEqual(newType);
  });

  it('creates without context when not provided', async () => {
    mockGetByTitle.mockResolvedValue(undefined);
    mockCreateType.mockResolvedValue(newType);
    await ensureKnowledgeType('NewType');
    expect(mockCreateType).toHaveBeenCalledWith({
      title: 'NewType',
      context: undefined,
      is_active: true,
    });
  });
});

describe('createKnowledgeWithType', () => {
  it('ensures the type exists then creates the knowledge record', async () => {
    mockGetByTitle.mockResolvedValue(existingType);
    mockCreateKnowledge.mockResolvedValue(knowledgeRec);
    const result = await createKnowledgeWithType({ title: 'How to deploy' }, 'Technical');
    expect(mockCreateKnowledge).toHaveBeenCalledWith({
      title: 'How to deploy',
      knowledge_type: 'Technical',
    });
    expect(result.knowledge).toEqual(knowledgeRec);
    expect(result.type).toEqual(existingType);
  });

  it('creates type when it does not exist yet', async () => {
    mockGetByTitle.mockResolvedValue(undefined);
    mockCreateType.mockResolvedValue(newType);
    mockCreateKnowledge.mockResolvedValue(knowledgeRec);
    const result = await createKnowledgeWithType({ title: 'Topic' }, 'NewType', 'ctx');
    expect(mockCreateType).toHaveBeenCalledWith({
      title: 'NewType',
      context: 'ctx',
      is_active: true,
    });
    expect(result.type).toEqual(newType);
  });

  it('passes optional fields to createKnowledge', async () => {
    mockGetByTitle.mockResolvedValue(existingType);
    mockCreateKnowledge.mockResolvedValue(knowledgeRec);
    await createKnowledgeWithType(
      { title: 'Topic', context: 'Detail', is_active: false },
      'Technical'
    );
    expect(mockCreateKnowledge).toHaveBeenCalledWith({
      title: 'Topic',
      context: 'Detail',
      is_active: false,
      knowledge_type: 'Technical',
    });
  });
});

describe('getKnowledgesWithType', () => {
  it('fetches knowledges and types in parallel and joins them', async () => {
    const typeRec = { id: 'typeRec1', fields: { title: 'Technical' } };
    const kRec = { id: 'knRec1', fields: { title: 'Deploy steps', knowledge_type: 'Technical' } };
    mockListKnowledges.mockResolvedValue({ records: [kRec] });
    mockListTypes.mockResolvedValue({ records: [typeRec] });
    const result = await getKnowledgesWithType();
    expect(result).toHaveLength(1);
    expect(result[0].knowledge).toEqual(kRec);
    expect(result[0].type).toEqual(typeRec);
  });

  it('attaches undefined for type when knowledge_type is absent', async () => {
    const kRec = { id: 'knRec2', fields: { title: 'Orphan knowledge' } };
    mockListKnowledges.mockResolvedValue({ records: [kRec] });
    mockListTypes.mockResolvedValue({ records: [] });
    const result = await getKnowledgesWithType();
    expect(result[0].type).toBeUndefined();
  });

  it('attaches undefined when type title does not match any type', async () => {
    const kRec = { id: 'knRec3', fields: { title: 'K', knowledge_type: 'Nonexistent' } };
    const typeRec = { id: 't1', fields: { title: 'Other' } };
    mockListKnowledges.mockResolvedValue({ records: [kRec] });
    mockListTypes.mockResolvedValue({ records: [typeRec] });
    const result = await getKnowledgesWithType();
    expect(result[0].type).toBeUndefined();
  });

  it('resolves the type from a link cell', async () => {
    const tRec = { id: 'tRec1', fields: { title: 'Technical' } };
    const kRec = {
      id: 'knRec1',
      fields: { title: 'Deploy', knowledge_type: { id: 'tRec1', title: 'Technical' } },
    };
    mockListKnowledges.mockResolvedValue({ records: [kRec] });
    mockListTypes.mockResolvedValue({ records: [tRec] });

    const [result] = await getKnowledgesWithType();

    expect(result.type?.fields.title).toBe('Technical');
  });
});

describe('getKnowledgesByType', () => {
  it('fetches knowledges by type and attaches the type record', async () => {
    const typeRec = { id: 'typeRec1', fields: { title: 'Technical' } };
    const kRec = { id: 'knRec1', fields: { title: 'Deploy', knowledge_type: 'Technical' } };
    mockListByType.mockResolvedValue({ records: [kRec] });
    mockGetByTitle.mockResolvedValue(typeRec);
    const result = await getKnowledgesByType('Technical');
    expect(mockListByType).toHaveBeenCalledWith('Technical');
    expect(mockGetByTitle).toHaveBeenCalledWith('Technical');
    expect(result[0].knowledge).toEqual(kRec);
    expect(result[0].type).toEqual(typeRec);
  });

  it('returns empty array when no knowledges match', async () => {
    mockListByType.mockResolvedValue({ records: [] });
    mockGetByTitle.mockResolvedValue(existingType);
    const result = await getKnowledgesByType('Technical');
    expect(result).toEqual([]);
  });

  it('attaches undefined type when the type does not exist', async () => {
    const kRec = { id: 'knRec1', fields: { title: 'Deploy', knowledge_type: 'Ghost' } };
    mockListByType.mockResolvedValue({ records: [kRec] });
    mockGetByTitle.mockResolvedValue(undefined);
    const result = await getKnowledgesByType('Ghost');
    expect(result[0].type).toBeUndefined();
  });
});
