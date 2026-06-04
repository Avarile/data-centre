import {
  teableList,
  teableGetById,
  teableCreate,
  teableUpdate,
  teableDelete,
  toLinkIds,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tblU0Z5v0KsrhJRG8Gy';

const FIELD_IDS = {
  title: 'fldnkaU2joaulzvD7Zx',
} as const;

export interface CompanyFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Reverse link — record IDs of contacts belonging to this company */
  contacts?: Array<string | { id: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type CompanyRecord = TeableRecord<CompanyFields>;

type CreateInput = Pick<CompanyFields, 'title'> &
  Partial<Pick<CompanyFields, 'context' | 'is_active' | 'deleted_at'>>;

type UpdateInput = Partial<Pick<CompanyFields, 'title' | 'context' | 'is_active' | 'deleted_at'>>;

export function listCompanies(params?: ListParams): Promise<{ records: CompanyRecord[] }> {
  return teableList<CompanyFields>(TABLE_ID, params);
}

export function getCompanyById(recordId: string): Promise<CompanyRecord | null> {
  return teableGetById<CompanyFields>(TABLE_ID, recordId);
}

export async function getCompanyByTitle(title: string): Promise<CompanyRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<CompanyFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function searchCompanies(
  keyword: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: CompanyRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'contains', value: keyword }],
  });
  return teableList<CompanyFields>(TABLE_ID, { ...params, filter });
}

export async function createCompany(fields: CreateInput): Promise<CompanyRecord> {
  const result = await teableCreate<CompanyFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateCompany(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: CompanyRecord }> {
  return teableUpdate<CompanyFields>(TABLE_ID, recordId, fields);
}

export function deleteCompany(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}

/** Returns the record IDs of all contacts linked to this company. */
export function getContactIdsForCompany(record: CompanyRecord): string[] {
  return toLinkIds(record.fields.contacts);
}
