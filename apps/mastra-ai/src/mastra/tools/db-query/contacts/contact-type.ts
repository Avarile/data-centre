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

const TABLE_ID = 'tblrMiMCmGdGCflTjiR';

const FIELD_IDS = {
  title: 'fldsD3kxMuGElBCxZZF',
} as const;

export interface ContactTypeFields {
  title: string;
  context?: string;
  is_active?: boolean;
  deleted_at?: string;
  /** Reverse link — record IDs of contacts belonging to this type */
  contacts?: Array<string | { id: string }>;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type ContactTypeRecord = TeableRecord<ContactTypeFields>;

type CreateInput = Pick<ContactTypeFields, 'title'> &
  Partial<Pick<ContactTypeFields, 'context' | 'is_active' | 'deleted_at'>>;

type UpdateInput = Partial<
  Pick<ContactTypeFields, 'title' | 'context' | 'is_active' | 'deleted_at'>
>;

export function listContactTypes(params?: ListParams): Promise<{ records: ContactTypeRecord[] }> {
  return teableList<ContactTypeFields>(TABLE_ID, params);
}

export function getContactTypeById(recordId: string): Promise<ContactTypeRecord | null> {
  return teableGetById<ContactTypeFields>(TABLE_ID, recordId);
}

export async function getContactTypeByTitle(title: string): Promise<ContactTypeRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<ContactTypeFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function createContactType(fields: CreateInput): Promise<ContactTypeRecord> {
  const result = await teableCreate<ContactTypeFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateContactType(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: ContactTypeRecord }> {
  return teableUpdate<ContactTypeFields>(TABLE_ID, recordId, fields);
}

export function deleteContactType(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}

/** Returns the record IDs of all contacts linked to this type. */
export function getContactIdsForType(record: ContactTypeRecord): string[] {
  return toLinkIds(record.fields.contacts);
}
