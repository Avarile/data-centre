#!/usr/bin/env node
/**
 * Update fields on a single Teable record (partial update — PATCH).
 *
 * Usage:
 *   node update-record.js '<json>'
 *
 * JSON fields:
 *   tableId   {string} required — table ID (e.g. "tblXXX")
 *   recordId  {string} required — record ID (e.g. "recXXX")
 *   fields    {object} required — only the fields to change; use display names as keys
 *
 * Field rules:
 *   - Only include fields you want to change; omitted fields are left unchanged.
 *   - Do NOT include READ-ONLY fields: record_id, created_at, update_at, rollup fields.
 *   - Single-link value:  { "id": "recXXX" }
 *   - Multi-link value:   [{ "id": "recXXX" }, { "id": "recYYY" }]
 *   - To clear a link field, pass an empty array: []
 *
 * Environment:
 *   TEABLE_API_TOKEN  — required
 *   TEABLE_BASE_URL   — default http://localhost:3000
 *
 * Output: JSON of the updated record to stdout
 *
 * Example:
 *   node update-record.js '{
 *     "tableId": "tblEtuOcO68wvO2nCoM",
 *     "recordId": "recABC123",
 *     "fields": { "task_status": "finished", "finished_at": "2024-02-15T17:00:00Z" }
 *   }'
 */

(async () => {
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      'Usage: node update-record.js \'{"tableId":"tblXXX","recordId":"recXXX","fields":{...}}\''
    );
    process.exit(1);
  }

  let args;
  try {
    args = JSON.parse(raw);
  } catch {
    console.error('Invalid JSON argument');
    process.exit(1);
  }

  const { tableId, recordId, fields } = args;

  if (!tableId) {
    console.error('tableId is required');
    process.exit(1);
  }
  if (!recordId) {
    console.error('recordId is required');
    process.exit(1);
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    console.error('fields must be a plain object');
    process.exit(1);
  }

  const token = process.env.TEABLE_API_TOKEN;
  if (!token) {
    console.error('TEABLE_API_TOKEN environment variable is not set');
    process.exit(1);
  }

  const baseUrl = process.env.TEABLE_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/table/${tableId}/record/${recordId}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fieldKeyType: 'name', record: { fields } }),
    });
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(1);
  }

  const data = await res.json();

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
})();
