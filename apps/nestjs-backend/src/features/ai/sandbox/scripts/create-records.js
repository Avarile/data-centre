#!/usr/bin/env node
/**
 * Create one or more records in a Teable table.
 *
 * Usage:
 *   node create-records.js '<json>'
 *
 * JSON fields:
 *   tableId  {string}    required — table ID (e.g. "tblXXX")
 *   records  {array}     required — array of { fields: { ... } } objects (max 1000)
 *
 * Field rules:
 *   - Use display names as keys (fieldKeyType=name is applied automatically).
 *   - Do NOT include READ-ONLY fields: record_id, created_at, update_at, rollup fields.
 *   - Single-link value:  { "id": "recXXX" }
 *   - Multi-link value:   [{ "id": "recXXX" }, { "id": "recYYY" }]
 *   - contacts table requires "internal_contact_type"; call lookup-link-id.js first.
 *
 * Environment:
 *   TEABLE_API_TOKEN  — required
 *   TEABLE_BASE_URL   — default http://localhost:3000
 *
 * Output: JSON { records: [...] } of created records to stdout
 *
 * Example:
 *   node create-records.js '{
 *     "tableId": "tblEtuOcO68wvO2nCoM",
 *     "records": [
 *       { "fields": { "title": "Fix bug", "task_status": "backlog" } }
 *     ]
 *   }'
 */

(async () => {
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      'Usage: node create-records.js \'{"tableId":"tblXXX","records":[{"fields":{...}}]}\''
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

  const { tableId, records } = args;

  if (!tableId) {
    console.error('tableId is required');
    process.exit(1);
  }
  if (!Array.isArray(records) || records.length === 0) {
    console.error('records must be a non-empty array');
    process.exit(1);
  }
  if (records.length > 1000) {
    console.error('records array exceeds maximum batch size of 1000');
    process.exit(1);
  }

  const token = process.env.TEABLE_API_TOKEN;
  if (!token) {
    console.error('TEABLE_API_TOKEN environment variable is not set');
    process.exit(1);
  }

  const baseUrl = process.env.TEABLE_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/table/${tableId}/record`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fieldKeyType: 'name', records }),
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
