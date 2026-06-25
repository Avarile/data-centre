import { BASE_URL, authHeaders } from './teable-client.js';
import { getSystemInfo } from './system-info.js';

/** Minimal shape of a table as returned by GET /api/base/{baseId}/table. */
export interface BaseTableSummary {
  id: string;
  name: string;
  description?: string;
}

/** Minimal shape of a field as returned by GET /api/table/{tableId}/field. */
export interface TableFieldSummary {
  id: string;
  name: string;
  type: string;
  isPrimary?: boolean;
  isComputed?: boolean;
}

// Teable returns richer objects; we hand-roll the subset we consume to avoid
// coupling this app to @teable/openapi (consistent with the per-table modules).
interface RawTableVo {
  id: string;
  name: string;
  description?: string | null;
}

interface RawFieldVo {
  id: string;
  name: string;
  type: string;
  isPrimary?: boolean;
  isComputed?: boolean;
}

/**
 * List every table in the active base.
 * The base ID is resolved at runtime from the system_info table.
 */
export async function listBaseTables(): Promise<BaseTableSummary[]> {
  const { baseId } = await getSystemInfo();
  const res = await fetch(`${BASE_URL}/api/base/${baseId}/table`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET base/${baseId}/table: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as RawTableVo[];
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? undefined,
  }));
}

/** List the fields of a table, mapped down to what the agent needs for filters/writes. */
export async function listTableFields(tableId: string): Promise<TableFieldSummary[]> {
  const res = await fetch(`${BASE_URL}/api/table/${tableId}/field`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET table/${tableId}/field: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as RawFieldVo[];
  return data.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    isPrimary: f.isPrimary,
    isComputed: f.isComputed,
  }));
}
