import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/mastra/tools/db-query/teable-client.js', () => ({
  teableList: vi.fn(),
}));

import { teableList } from '../src/mastra/tools/db-query/teable-client.js';

const mockTeableList = vi.mocked(teableList);

describe('getSystemInfo', () => {
  beforeEach(() => {
    mockTeableList.mockReset();
    vi.resetModules();
  });

  it('fetches and returns system info from the table', async () => {
    mockTeableList.mockResolvedValue({
      records: [
        {
          id: 'rec1',
          fields: {
            public_domain: 'https://example.com',
            selected_space_id: 'space1',
            selected_base_id: 'base1',
          },
        },
      ],
    });
    const { getSystemInfo } = await import('../src/mastra/tools/db-query/system-info.js');
    const result = await getSystemInfo();
    expect(result).toEqual({
      publicDomain: 'https://example.com',
      spaceId: 'space1',
      baseId: 'base1',
    });
  });

  it('calls teableList with take=1', async () => {
    mockTeableList.mockResolvedValue({
      records: [
        {
          id: 'rec1',
          fields: {
            public_domain: 'https://example.com',
            selected_space_id: 'space1',
            selected_base_id: 'base1',
          },
        },
      ],
    });
    const { getSystemInfo } = await import('../src/mastra/tools/db-query/system-info.js');
    await getSystemInfo();
    expect(mockTeableList).toHaveBeenCalledWith(expect.any(String), { take: 1 });
  });

  it('caches the result — only calls teableList once for repeated calls', async () => {
    mockTeableList.mockResolvedValue({
      records: [
        {
          id: 'rec1',
          fields: {
            public_domain: 'https://example.com',
            selected_space_id: 'space1',
            selected_base_id: 'base1',
          },
        },
      ],
    });
    const { getSystemInfo } = await import('../src/mastra/tools/db-query/system-info.js');
    await getSystemInfo();
    await getSystemInfo();
    expect(mockTeableList).toHaveBeenCalledTimes(1);
  });

  it('throws when the table has no records', async () => {
    mockTeableList.mockResolvedValue({ records: [] });
    const { getSystemInfo } = await import('../src/mastra/tools/db-query/system-info.js');
    await expect(getSystemInfo()).rejects.toThrow('system_info table has no records');
  });
});
