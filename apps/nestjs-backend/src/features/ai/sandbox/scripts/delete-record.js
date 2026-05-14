#!/usr/bin/env node
/**
 * Permanently delete a single record from a Teable table.
 *
 * Usage:
 *   node delete-record.js '<json>'
 *
 * JSON fields:
 *   tableId   {string} required — table ID (e.g. "tblXXX")
 *   recordId  {string} required — record ID to delete (e.g. "recXXX")
 *
 * WARNING: This operation is irreversible. Always confirm the recordId with a
 *          get-records.js call before deleting.
 *
 * Environment:
 *   TEABLE_API_TOKEN  — required
 *   TEABLE_BASE_URL   — default http://localhost:3000
 *
 * Output: JSON { "success": true, "recordId": "recXXX" } to stdout
 *
 * Example:
 *   node delete-record.js '{"tableId":"tblEtuOcO68wvO2nCoM","recordId":"recABC123"}'
 */

(async () => {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: node delete-record.js \'{"tableId":"tblXXX","recordId":"recXXX"}\'');
    process.exit(1);
  }

  let args;
  try {
    args = JSON.parse(raw);
  } catch {
    console.error('Invalid JSON argument');
    process.exit(1);
  }

  const { tableId, recordId } = args;

  if (!tableId) {
    console.error('tableId is required');
    process.exit(1);
  }
  if (!recordId) {
    console.error('recordId is required');
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
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(1);
  }

  if (res.status === 204 || res.status === 200) {
    console.log(JSON.stringify({ success: true, recordId }, null, 2));
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = { status: res.status };
  }

  console.error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  process.exit(1);
})();
