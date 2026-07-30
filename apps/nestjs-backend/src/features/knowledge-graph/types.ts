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
} as const;

/** `knowledge_type` is accepted as either a Link or a plain-text title column. */
export const KNOWLEDGE_TYPE_FIELD_TYPES = [FieldType.Link, FieldType.SingleLineText] as const;

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
}
