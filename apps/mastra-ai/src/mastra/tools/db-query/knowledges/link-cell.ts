/**
 * Teable link cells are `{ id, title }` (or an array of them when the field is
 * multi-valued), while the same column was plain text before the v2 migration.
 * These readers accept both, which is what lets the agent keep working across
 * the conversion rather than needing to land in the same commit as it.
 *
 * `String(cell)` on a link object yields "[object Object]" — it does not throw,
 * it feeds nonsense to the model. That is the failure these exist to prevent.
 */
export type LinkCell = string | { id: string; title?: string };

const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

const titleOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (value && typeof value === 'object' && 'title' in value) {
    const title = (value as { title?: unknown }).title;
    return typeof title === 'string' && title !== '' ? title : undefined;
  }
  return undefined;
};

export const linkTitle = (raw: unknown): string | undefined => titleOf(first(raw));

export const linkTitles = (raw: unknown): string[] => {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(titleOf).filter((t): t is string => t !== undefined);
};

export const linkId = (raw: unknown): string | undefined => {
  const value = first(raw);
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

export const linkIds = (raw: unknown): string[] => {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .map((v) => (v && typeof v === 'object' && 'id' in v ? (v as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string');
};
