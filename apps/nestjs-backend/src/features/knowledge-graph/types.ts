/* eslint-disable @typescript-eslint/naming-convention */
import { FieldType } from '@teable/core';

/**
 * Field names resolved by name at request time. Nothing hardcodes a `fld…` id:
 * only `title` and `knowledge_type` ids are recorded anywhere in this repo, so
 * the service resolves all of them per request and asserts their types.
 *
 * `is_active` is deliberately absent — the graph never reads it.
 */
export const KNOWLEDGE_FIELD = {
  title: 'title',
  context: 'context',
  deletedAt: 'deleted_at',
  knowledgeType: 'knowledge_type',
  parentType: 'parent_type',
  relatedKnowledge: 'related_knowledge',
} as const;

/** Link only. The plain-text form was accepted before the v2 migration; keeping
 *  it would mean a renamed type silently orphans every child. */
export const KNOWLEDGE_TYPE_FIELD_TYPES = [FieldType.Link] as const;

/** Self-link on knowledge_type. Link only — a text parent could not survive a rename. */
export const PARENT_TYPE_FIELD_TYPES = [FieldType.Link] as const;

export interface IResolvedField {
  id: string;
  name: string;
  type: FieldType;
  isMultipleCellValue: boolean;
}

export interface IFieldSpec {
  name: string;
  types: readonly FieldType[];
  required: boolean;
  /** When true, a multi-valued field is a configuration error. */
  singleValued?: boolean;
}
