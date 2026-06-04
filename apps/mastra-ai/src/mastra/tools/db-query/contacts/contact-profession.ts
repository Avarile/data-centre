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

const TABLE_ID = 'tblq4hkjd22A2DrjPOu';

const FIELD_IDS = {
  title: 'fldMu6BJhAkCw9JrAnm',
} as const;

export interface ContactProfessionFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Reverse link — record IDs of contacts with this profession */
  contacts?: Array<string | { id: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type ContactProfessionRecord = TeableRecord<ContactProfessionFields>;

type CreateInput = Pick<ContactProfessionFields, 'title'> &
  Partial<Pick<ContactProfessionFields, 'context' | 'is_active' | 'deleted_at'>>;

type UpdateInput = Partial<
  Pick<ContactProfessionFields, 'title' | 'context' | 'is_active' | 'deleted_at'>
>;

export function listContactProfessions(
  params?: ListParams
): Promise<{ records: ContactProfessionRecord[] }> {
  return teableList<ContactProfessionFields>(TABLE_ID, params);
}

export function getContactProfessionById(
  recordId: string
): Promise<ContactProfessionRecord | null> {
  return teableGetById<ContactProfessionFields>(TABLE_ID, recordId);
}

export async function getContactProfessionByTitle(
  title: string
): Promise<ContactProfessionRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<ContactProfessionFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createContactProfession(
  fields: CreateInput
): Promise<ContactProfessionRecord> {
  const result = await teableCreate<ContactProfessionFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateContactProfession(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: ContactProfessionRecord }> {
  return teableUpdate<ContactProfessionFields>(TABLE_ID, recordId, fields);
}

export function deleteContactProfession(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}

/** Returns the record IDs of all contacts linked to this profession. */
export function getContactIdsForProfession(record: ContactProfessionRecord): string[] {
  return toLinkIds(record.fields.contacts);
}
