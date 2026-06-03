import { teableList } from './teable-client.js';

const TABLE_ID = 'tblLAv8Qwl7SMXqYCPD';

interface SystemInfoFields {
  public_domain: string;
  selected_space_id: string;
  selected_base_id: string;
}

export interface SystemInfo {
  publicDomain: string;
  spaceId: string;
  baseId: string;
}

let cached: SystemInfo | null = null;

export async function getSystemInfo(): Promise<SystemInfo> {
  if (cached) return cached;

  const result = await teableList<SystemInfoFields>(TABLE_ID, { take: 1 });
  const fields = result.records[0]?.fields;
  if (!fields) throw new Error('system_info table has no records');

  cached = {
    publicDomain: fields.public_domain,
    spaceId: fields.selected_space_id,
    baseId: fields.selected_base_id,
  };

  return cached;
}
