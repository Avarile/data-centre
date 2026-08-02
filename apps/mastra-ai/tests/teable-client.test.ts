import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  teableList,
  teableCreate,
  teableUpdate,
  teableDelete,
  teableGetById,
  teableGetByIds,
  toLinkIds,
} from '../src/mastra/tools/db-query/teable-client.js';

vi.mock('../src/mastra/env.js', () => ({
  env: { CYBERNETICS_APP_TOKEN: 'test-token' },
  isDev: false,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  });
}

function errorResponse(status: number, statusText: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  });
}

describe('toLinkIds', () => {
  it('returns [] for undefined', () => {
    expect(toLinkIds(undefined)).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(toLinkIds([])).toEqual([]);
  });

  it('returns string IDs unchanged', () => {
    expect(toLinkIds(['rec1', 'rec2'])).toEqual(['rec1', 'rec2']);
  });

  it('extracts id from object entries', () => {
    expect(toLinkIds([{ id: 'rec1', title: 'T1' }, { id: 'rec2' }])).toEqual(['rec1', 'rec2']);
  });

  it('handles mixed string and object values', () => {
    expect(toLinkIds(['rec1', { id: 'rec2' }])).toEqual(['rec1', 'rec2']);
  });
});

describe('teableList', () => {
  beforeEach(() => mockFetch.mockReset());

  it('calls fetch with table URL and fieldKeyType=name', async () => {
    mockFetch.mockReturnValue(okResponse({ records: [] }));
    await teableList('tbl123');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/table/tbl123/record');
    expect(url).toContain('fieldKeyType=name');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('appends take, skip, search params', async () => {
    mockFetch.mockReturnValue(okResponse({ records: [] }));
    await teableList('tbl123', { take: 10, skip: 5, search: 'hello' });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('take=10');
    expect(url).toContain('skip=5');
    expect(url).toContain('search=hello');
  });

  it('appends filter and orderBy params when provided', async () => {
    mockFetch.mockReturnValue(okResponse({ records: [] }));
    const filter = JSON.stringify({ conjunction: 'and', filterSet: [] });
    const orderBy = JSON.stringify([{ fieldId: 'fld1', order: 'asc' }]);
    await teableList('tbl123', { filter, orderBy });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('filter=');
    expect(url).toContain('orderBy=');
  });

  it('omits optional params when not provided', async () => {
    mockFetch.mockReturnValue(okResponse({ records: [] }));
    await teableList('tbl123');
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).not.toContain('take=');
    expect(url).not.toContain('skip=');
    expect(url).not.toContain('filter=');
  });

  it('returns parsed records from response', async () => {
    const records = [{ id: 'rec1', fields: { title: 'Test' } }];
    mockFetch.mockReturnValue(okResponse({ records }));
    const result = await teableList('tbl123');
    expect(result.records).toEqual(records);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(errorResponse(401, 'Unauthorized'));
    await expect(teableList('tbl123')).rejects.toThrow('GET table/tbl123: 401 Unauthorized');
  });
});

describe('teableCreate', () => {
  beforeEach(() => mockFetch.mockReset());

  it('sends POST with fieldKeyType and records body', async () => {
    const records = [{ id: 'rec1', fields: { title: 'New' } }];
    mockFetch.mockReturnValue(okResponse({ records }));
    await teableCreate('tbl123', [{ title: 'New' }]);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/table/tbl123/record');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.fieldKeyType).toBe('name');
    expect(body.typecast).toBe(true);
    expect(body.records[0].fields).toEqual({ title: 'New' });
  });

  it('sends multiple records in one request', async () => {
    mockFetch.mockReturnValue(okResponse({ records: [] }));
    await teableCreate('tbl123', [{ title: 'A' }, { title: 'B' }]);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.records).toHaveLength(2);
  });

  it('returns the created records', async () => {
    const records = [{ id: 'rec1', fields: { title: 'New' } }];
    mockFetch.mockReturnValue(okResponse({ records }));
    const result = await teableCreate('tbl123', [{ title: 'New' }]);
    expect(result.records).toEqual(records);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(errorResponse(422, 'Unprocessable'));
    await expect(teableCreate('tbl123', [{}])).rejects.toThrow(
      'POST table/tbl123: 422 Unprocessable'
    );
  });
});

describe('teableUpdate', () => {
  beforeEach(() => mockFetch.mockReset());

  it('sends PATCH to record URL with fieldKeyType', async () => {
    const record = { id: 'rec1', fields: { title: 'Updated' } };
    mockFetch.mockReturnValue(okResponse({ record }));
    await teableUpdate('tbl123', 'rec1', { title: 'Updated' });
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/table/tbl123/record/rec1');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body as string);
    expect(body.fieldKeyType).toBe('name');
    expect(body.typecast).toBe(true);
    expect(body.record.fields).toEqual({ title: 'Updated' });
  });

  it('returns the updated record', async () => {
    const record = { id: 'rec1', fields: { title: 'Updated' } };
    mockFetch.mockReturnValue(okResponse({ record }));
    const result = await teableUpdate('tbl123', 'rec1', { title: 'Updated' });
    expect(result.record).toEqual(record);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(errorResponse(404, 'Not Found'));
    await expect(teableUpdate('tbl123', 'rec999', {})).rejects.toThrow(
      'PATCH table/tbl123/rec999: 404 Not Found'
    );
  });
});

describe('teableDelete', () => {
  beforeEach(() => mockFetch.mockReset());

  it('sends DELETE to the record URL', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, status: 204, statusText: 'No Content', json: vi.fn() })
    );
    await teableDelete('tbl123', 'rec1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/table/tbl123/record/rec1');
    expect(opts.method).toBe('DELETE');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(errorResponse(404, 'Not Found'));
    await expect(teableDelete('tbl123', 'rec999')).rejects.toThrow(
      'DELETE table/tbl123/rec999: 404 Not Found'
    );
  });
});

describe('teableGetById', () => {
  beforeEach(() => mockFetch.mockReset());

  it('fetches with fieldKeyType=name in URL', async () => {
    const record = { id: 'rec1', fields: { title: 'Test' } };
    mockFetch.mockReturnValue(okResponse(record));
    await teableGetById('tbl123', 'rec1');
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/api/table/tbl123/record/rec1');
    expect(url).toContain('fieldKeyType=name');
  });

  it('returns null on 404', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: vi.fn() })
    );
    const result = await teableGetById('tbl123', 'rec_missing');
    expect(result).toBeNull();
  });

  it('unwraps { record: {...} } response shape', async () => {
    const inner = { id: 'rec1', fields: { title: 'Test' } };
    mockFetch.mockReturnValue(okResponse({ record: inner }));
    const result = await teableGetById('tbl123', 'rec1');
    expect(result).toEqual(inner);
  });

  it('returns direct object when response is not wrapped', async () => {
    const record = { id: 'rec1', fields: { title: 'Test' } };
    mockFetch.mockReturnValue(okResponse(record));
    const result = await teableGetById('tbl123', 'rec1');
    expect(result).toEqual(record);
  });

  it('throws on non-404 error', async () => {
    mockFetch.mockReturnValue(errorResponse(500, 'Internal Server Error'));
    await expect(teableGetById('tbl123', 'rec1')).rejects.toThrow('GET table/tbl123/rec1');
  });
});

describe('teableGetByIds', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns empty array without calling fetch for empty input', async () => {
    const result = await teableGetByIds('tbl123', []);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches all requested records', async () => {
    const rec1 = { id: 'rec1', fields: { title: 'A' } };
    const rec2 = { id: 'rec2', fields: { title: 'B' } };
    mockFetch.mockReturnValueOnce(okResponse(rec1)).mockReturnValueOnce(okResponse(rec2));
    const result = await teableGetByIds('tbl123', ['rec1', 'rec2']);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(rec1);
    expect(result).toContainEqual(rec2);
  });

  it('filters out null results from 404 responses', async () => {
    const rec1 = { id: 'rec1', fields: { title: 'A' } };
    mockFetch
      .mockReturnValueOnce(okResponse(rec1))
      .mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: vi.fn() })
      );
    const result = await teableGetByIds('tbl123', ['rec1', 'rec_missing']);
    expect(result).toEqual([rec1]);
  });
});
