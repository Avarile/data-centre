import {
  teableList,
  teableGetById,
  teableGetByIds,
  teableCreate,
  teableUpdate,
  teableDelete,
  toLinkIds,
  type TeableRecord,
  type ListParams,
} from '../teable-client.js';

const TABLE_ID = 'tbl6730ZOe0zToNrcIr';

const FIELD_IDS = {
  title: 'fldlcgf8tb0mWkzv3Rd',
  email: 'fldzbqogNQXHBtVmnEk',
  firstname: 'fldJjAX79KRdKf58tbL',
  lastname: 'flduzs6A7IbVnVAco9v',
} as const;

export interface ContactFields {
  title: string;
  context?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  mobile?: string;
  /** Link field — pass record IDs when creating/updating */
  contact_type?: Array<string | { id: string }>;
  /** Link field — pass record IDs when creating/updating */
  contact_profession?: Array<string | { id: string }>;
  /** Link field — pass record IDs when creating/updating */
  contact_company?: Array<string | { id: string }>;
  /** Link field — read-only in most contexts */
  tasks?: Array<string | { id: string }>;
  auditlog?: Array<string | { id: string }>;
  projects?: Array<string | { id: string }>;
  is_active?: boolean;
  deleted_at?: string;
  // read-only
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export type ContactRecord = TeableRecord<ContactFields>;

type CreateInput = Pick<ContactFields, 'title'> &
  Partial<
    Pick<
      ContactFields,
      | 'context'
      | 'email'
      | 'firstname'
      | 'lastname'
      | 'mobile'
      | 'contact_type'
      | 'contact_profession'
      | 'contact_company'
      | 'is_active'
      | 'deleted_at'
    >
  >;

type UpdateInput = Partial<
  Pick<
    ContactFields,
    | 'title'
    | 'context'
    | 'email'
    | 'firstname'
    | 'lastname'
    | 'mobile'
    | 'contact_type'
    | 'contact_profession'
    | 'contact_company'
    | 'is_active'
    | 'deleted_at'
  >
>;

export function listContacts(params?: ListParams): Promise<{ records: ContactRecord[] }> {
  return teableList<ContactFields>(TABLE_ID, params);
}

export function getContactById(recordId: string): Promise<ContactRecord | null> {
  return teableGetById<ContactFields>(TABLE_ID, recordId);
}

export function getContactsByIds(recordIds: string[]): Promise<ContactRecord[]> {
  return teableGetByIds<ContactFields>(TABLE_ID, recordIds);
}

export async function getContactByTitle(title: string): Promise<ContactRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.title, operator: 'is', value: title }],
  });
  const result = await teableList<ContactFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function getContactByEmail(email: string): Promise<ContactRecord | undefined> {
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: FIELD_IDS.email, operator: 'is', value: email }],
  });
  const result = await teableList<ContactFields>(TABLE_ID, { filter, take: 1 });
  return result.records[0];
}

export async function searchContacts(
  keyword: string,
  params?: Omit<ListParams, 'filter'>
): Promise<{ records: ContactRecord[] }> {
  const filter = JSON.stringify({
    conjunction: 'or',
    filterSet: [
      { fieldId: FIELD_IDS.firstname, operator: 'contains', value: keyword },
      { fieldId: FIELD_IDS.lastname, operator: 'contains', value: keyword },
      { fieldId: FIELD_IDS.email, operator: 'contains', value: keyword },
    ],
  });
  return teableList<ContactFields>(TABLE_ID, { ...params, filter });
}

export async function createContact(fields: CreateInput): Promise<ContactRecord> {
  const result = await teableCreate<ContactFields>(TABLE_ID, [fields]);
  return result.records[0];
}

export function updateContact(
  recordId: string,
  fields: UpdateInput
): Promise<{ record: ContactRecord }> {
  return teableUpdate<ContactFields>(TABLE_ID, recordId, fields);
}

export function deleteContact(recordId: string): Promise<void> {
  return teableDelete(TABLE_ID, recordId);
}

/** Extracts the linked contact_type record IDs from a contact record. */
export function getContactTypeIds(record: ContactRecord): string[] {
  return toLinkIds(record.fields.contact_type);
}

/** Extracts the linked contact_profession record IDs from a contact record. */
export function getContactProfessionIds(record: ContactRecord): string[] {
  return toLinkIds(record.fields.contact_profession);
}

/** Extracts the linked company record IDs from a contact record. */
export function getContactCompanyIds(record: ContactRecord): string[] {
  return toLinkIds(record.fields.contact_company);
}
