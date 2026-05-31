import { vectorPool } from './vector-pool.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmbeddingIndex {
  id: number;
  name: string;
  label: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIndexInput {
  name: string;
  label: string;
  description?: string;
}

export interface UpdateIndexInput {
  label?: string;
  description?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** List all active indexes. Pass includeInactive=true to include soft-deleted rows. */
export async function listIndexes(includeInactive = false): Promise<EmbeddingIndex[]> {
  const { rows } = await vectorPool.query<EmbeddingIndex>(
    includeInactive
      ? `SELECT * FROM index_schema.embedding_index ORDER BY name`
      : `SELECT * FROM index_schema.embedding_index WHERE is_active = true ORDER BY name`
  );
  return rows;
}

/** Get a single index by name. Returns null if not found. */
export async function getIndex(name: string): Promise<EmbeddingIndex | null> {
  const { rows } = await vectorPool.query<EmbeddingIndex>(
    `SELECT * FROM index_schema.embedding_index WHERE name = $1 LIMIT 1`,
    [name]
  );
  return rows[0] ?? null;
}

/** Create a new index record. Throws if name already exists. */
export async function createIndex(input: CreateIndexInput): Promise<EmbeddingIndex> {
  const { rows } = await vectorPool.query<EmbeddingIndex>(
    `INSERT INTO index_schema.embedding_index (name, label, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.label, input.description ?? null]
  );
  return rows[0];
}

/** Update label and/or description. Returns null if name not found. */
export async function updateIndex(
  name: string,
  input: UpdateIndexInput
): Promise<EmbeddingIndex | null> {
  const { rows } = await vectorPool.query<EmbeddingIndex>(
    `UPDATE index_schema.embedding_index
     SET label       = COALESCE($2, label),
         description = COALESCE($3, description),
         updated_at  = now()
     WHERE name = $1
     RETURNING *`,
    [name, input.label ?? null, input.description ?? null]
  );
  return rows[0] ?? null;
}

/** Soft-delete an index by setting is_active = false. Returns false if not found. */
export async function deleteIndex(name: string): Promise<boolean> {
  const { rowCount } = await vectorPool.query(
    `UPDATE index_schema.embedding_index
     SET is_active  = false,
         updated_at = now()
     WHERE name = $1 AND is_active = true`,
    [name]
  );
  return (rowCount ?? 0) > 0;
}

/** Restore a soft-deleted index. Returns false if not found or already active. */
export async function restoreIndex(name: string): Promise<boolean> {
  const { rowCount } = await vectorPool.query(
    `UPDATE index_schema.embedding_index
     SET is_active  = true,
         updated_at = now()
     WHERE name = $1 AND is_active = false`,
    [name]
  );
  return (rowCount ?? 0) > 0;
}
