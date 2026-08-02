/* eslint-disable no-console */
/**
 * Read-only audit, run BEFORE converting knowledge.knowledge_type from text to
 * a Link. Teable matches on title during that conversion and silently empties
 * any cell whose title matches no knowledge_type record — and the original
 * string is gone afterwards, so this cannot be checked retrospectively.
 */
const BASE_URL = process.env.TEABLE_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.TEABLE_API_KEY ?? '';
const KNOWLEDGE_TABLE_ID = process.env.KNOWLEDGE_TABLE_ID ?? 'tblVTWb1kxXSFPBq4Fq';
const KNOWLEDGE_TYPE_TABLE_ID = process.env.KNOWLEDGE_TYPE_TABLE_ID ?? 'tblWcq6Kof1AFHvbC5e';

const fetchAll = async (tableId: string): Promise<{ id: string; fields: Record<string, unknown> }[]> => {
  const out: { id: string; fields: Record<string, unknown> }[] = [];
  for (let skip = 0; ; skip += 1000) {
    const url = new URL(`${BASE_URL}/api/table/${tableId}/record`);
    url.searchParams.set('fieldKeyType', 'name');
    url.searchParams.set('take', '1000');
    url.searchParams.set('skip', String(skip));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) throw new Error(`GET ${tableId}: ${res.status} ${res.statusText}`);
    const { records } = (await res.json()) as { records: typeof out };
    out.push(...records);
    if (records.length < 1000) return out;
  }
};

const main = async () => {
  const [types, knowledges] = await Promise.all([
    fetchAll(KNOWLEDGE_TYPE_TABLE_ID),
    fetchAll(KNOWLEDGE_TABLE_ID),
  ]);

  const titles = new Set(types.map((t) => String(t.fields.title ?? '')));
  const unmatched = new Map<string, number>();
  let empty = 0;

  for (const row of knowledges) {
    const raw = row.fields.knowledge_type;
    if (raw == null || raw === '') {
      empty++;
      continue;
    }
    if (typeof raw !== 'string') {
      throw new Error(`knowledge_type is already not text on ${row.id}: ${JSON.stringify(raw)}`);
    }
    if (!titles.has(raw)) unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
  }

  console.log(`types:            ${types.length}`);
  console.log(`knowledges:       ${knowledges.length}`);
  console.log(`already empty:    ${empty}`);
  console.log(`distinct titles that will NOT match: ${unmatched.size}`);
  for (const [title, count] of [...unmatched].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${JSON.stringify(title)}`);
  }
  const lost = [...unmatched.values()].reduce((a, b) => a + b, 0);
  console.log(`\nrecords that would lose their type: ${lost}`);
  process.exitCode = lost > 0 ? 1 : 0;
};

void main();
