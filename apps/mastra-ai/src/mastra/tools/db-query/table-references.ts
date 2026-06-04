import { teableList, teableGetById, type TeableRecord, type ListParams } from './teable-client.js';

const TABLE_ID = 'tbldqfviyb3Fx1YgJlg';

const FIELD_IDS = {
  title: 'fld6gdWmaSgU5jzlGhx',
  context: 'flds1Nf6jea49ovG7CG',
} as const;

export interface TableReferenceFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type TableReferenceRecord = TeableRecord<TableReferenceFields>;

export function listTableReferences(
  params?: ListParams
): Promise<{ records: TableReferenceRecord[] }> {
  return teableList<TableReferenceFields>(TABLE_ID, params);
}

export function getTableReferenceById(recordId: string): Promise<TableReferenceRecord | null> {
  return teableGetById<TableReferenceFields>(TABLE_ID, recordId);
}

export async function getTableReferenceByTitle(
  tableName: string
): Promise<TableReferenceRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: tableName }],
  });
  const result = await teableList<TableReferenceFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function searchTableReferences(
  keyword: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: TableReferenceRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'contains', value: keyword }],
  });
  return teableList<TableReferenceFields>(TABLE_ID, { ...params, filter });
}

export async function getTableMetadata(tableName: string): Promise<string | undefined> {
  const record = await getTableReferenceByTitle(tableName);
  return record?.fields.context;
}

export async function getAllTableNames(): Promise<string[]> {
  const result = await teableList<TableReferenceFields>(TABLE_ID);
  return result.records.map((r) => r.fields.title);
}
