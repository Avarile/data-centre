import {
  getContactTypeByTitle,
  createContactType,
  type ContactTypeRecord,
} from './contact-type.js';
import {
  getContactProfessionByTitle,
  createContactProfession,
  type ContactProfessionRecord,
} from './contact-profession.js';
import { getCompanyByTitle, createCompany, type CompanyRecord } from './companies.js';
import {
  createContact,
  getContactById,
  getContactsByIds,
  type ContactRecord,
  type ContactFields,
} from './contacts.js';
import { getContactIdsForType } from './contact-type.js';
import { getContactIdsForProfession } from './contact-profession.js';
import { getContactIdsForCompany } from './companies.js';

export interface ContactWithRelations {
  contact: ContactRecord;
  type: ContactTypeRecord | undefined;
  profession: ContactProfessionRecord | undefined;
  company: CompanyRecord | undefined;
}

export interface CreateContactInput {
  title: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  mobile?: string;
  context?: string;
  is_active?: boolean;
}

export interface CreateContactDependencies {
  /** Title of an existing or new contact_type record */
  typeName?: string;
  typeContext?: string;
  /** Title of an existing or new contact_profession record */
  professionName?: string;
  professionContext?: string;
  /** Title of an existing or new company record */
  companyName?: string;
  companyContext?: string;
}

/**
 * Returns the existing contact_type with the given title, or creates it first.
 */
export async function ensureContactType(
  title: string,
  context?: string
): Promise<ContactTypeRecord> {
  const existing = await getContactTypeByTitle(title);
  if (existing) return existing;
  return createContactType({ title, context, is_active: true });
}

/**
 * Returns the existing contact_profession with the given title, or creates it first.
 */
export async function ensureContactProfession(
  title: string,
  context?: string
): Promise<ContactProfessionRecord> {
  const existing = await getContactProfessionByTitle(title);
  if (existing) return existing;
  return createContactProfession({ title, context, is_active: true });
}

/**
 * Returns the existing company with the given title, or creates it first.
 */
export async function ensureCompany(title: string, context?: string): Promise<CompanyRecord> {
  const existing = await getCompanyByTitle(title);
  if (existing) return existing;
  return createCompany({ title, context, is_active: true });
}

/**
 * Creates a contact with strict sequential dependency resolution.
 * Order: contact_type → contact_profession → company → contact.
 * Each step is checked (and created if missing) before the next begins.
 * Throws with a step-specific message on failure so the caller knows exactly where it stopped.
 */
export async function createContactWithDependencies(
  contactInput: CreateContactInput,
  deps: CreateContactDependencies = {}
): Promise<{
  contact: ContactRecord;
  type: ContactTypeRecord | undefined;
  profession: ContactProfessionRecord | undefined;
  company: CompanyRecord | undefined;
}> {
  // Step 1 — resolve contact_type
  let type: ContactTypeRecord | undefined;
  if (deps.typeName) {
    try {
      type = await ensureContactType(deps.typeName, deps.typeContext);
    } catch (err) {
      throw new Error(
        `Step 1 failed — could not resolve contact_type "${deps.typeName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 2 — resolve contact_profession
  let profession: ContactProfessionRecord | undefined;
  if (deps.professionName) {
    try {
      profession = await ensureContactProfession(deps.professionName, deps.professionContext);
    } catch (err) {
      throw new Error(
        `Step 2 failed — could not resolve contact_profession "${deps.professionName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 3 — resolve company
  let company: CompanyRecord | undefined;
  if (deps.companyName) {
    try {
      company = await ensureCompany(deps.companyName, deps.companyContext);
    } catch (err) {
      throw new Error(
        `Step 3 failed — could not resolve company "${deps.companyName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 4 — create the contact with all resolved link IDs
  let contact: ContactRecord;
  try {
    contact = await createContact({
      ...contactInput,
      ...(type ? { contact_type: [type.id] } : {}),
      ...(profession ? { contact_profession: [profession.id] } : {}),
      ...(company ? { contact_company: [company.id] } : {}),
    });
  } catch (err) {
    throw new Error(
      `Step 4 failed — could not create contact "${contactInput.title}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { contact, type, profession, company };
}

/**
 * Fetches a contact and resolves all linked type, profession, and company records.
 */
export async function getContactWithRelations(
  recordId: string
): Promise<ContactWithRelations | null> {
  const contact = await getContactById(recordId);
  if (!contact) return null;

  const typeIds = contact.fields.contact_type
    ? (contact.fields.contact_type as Array<string | { id: string }>).map((v) =>
        typeof v === 'string' ? v : v.id
      )
    : [];
  const professionIds = contact.fields.contact_profession
    ? (contact.fields.contact_profession as Array<string | { id: string }>).map((v) =>
        typeof v === 'string' ? v : v.id
      )
    : [];
  const companyIds = contact.fields.contact_company
    ? (contact.fields.contact_company as Array<string | { id: string }>).map((v) =>
        typeof v === 'string' ? v : v.id
      )
    : [];

  const [typeRecord, professionRecord, companyRecord] = await Promise.all([
    typeIds[0]
      ? import('./contact-type.js').then((m) => m.getContactTypeById(typeIds[0]))
      : Promise.resolve(undefined),
    professionIds[0]
      ? import('./contact-profession.js').then((m) => m.getContactProfessionById(professionIds[0]))
      : Promise.resolve(undefined),
    companyIds[0]
      ? import('./companies.js').then((m) => m.getCompanyById(companyIds[0]))
      : Promise.resolve(undefined),
  ]);

  return {
    contact,
    type: typeRecord ?? undefined,
    profession: professionRecord ?? undefined,
    company: companyRecord ?? undefined,
  };
}

/**
 * Returns all contacts linked to a given contact_type title.
 * Uses the reverse link on the contact_type record.
 */
export async function getContactsByType(typeName: string): Promise<ContactRecord[]> {
  const type = await getContactTypeByTitle(typeName);
  if (!type) return [];
  const ids = getContactIdsForType(type);
  return getContactsByIds(ids);
}

/**
 * Returns all contacts linked to a given contact_profession title.
 * Uses the reverse link on the contact_profession record.
 */
export async function getContactsByProfession(professionName: string): Promise<ContactRecord[]> {
  const profession = await getContactProfessionByTitle(professionName);
  if (!profession) return [];
  const ids = getContactIdsForProfession(profession);
  return getContactsByIds(ids);
}

/**
 * Returns all contacts linked to a given company title.
 * Uses the reverse link on the company record.
 */
export async function getContactsByCompany(companyName: string): Promise<ContactRecord[]> {
  const company = await getCompanyByTitle(companyName);
  if (!company) return [];
  const ids = getContactIdsForCompany(company);
  return getContactsByIds(ids);
}
