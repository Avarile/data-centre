import { vectorPool } from './vector-pool.js';

// Arbitrary but fixed key so every instance contends for the same advisory lock.
const MIGRATION_LOCK_KEY = 0x4111_a1;

/**
 * Run all startup migrations under a Postgres advisory lock so that concurrent
 * instances migrate one-at-a-time rather than racing. Throws on failure so a
 * mis-migrated instance refuses to start (caller logs the fatal error).
 */
export async function runAllMigrations(): Promise<void> {
  const client = await vectorPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await runIndexMigrations();
    await runJobMigrations();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } catch {
      /* best-effort unlock; the lock is released on connection close anyway */
    }
    client.release();
  }
}

export async function runIndexMigrations(): Promise<void> {
  await vectorPool.query(`CREATE SCHEMA IF NOT EXISTS index_schema`);

  await vectorPool.query(`
    CREATE TABLE IF NOT EXISTS index_schema.embedding_index (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      label       TEXT NOT NULL,
      description TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Seed defaults — skipped if the row already exists.
  await vectorPool.query(`
    INSERT INTO index_schema.embedding_index (name, label, description) VALUES
      ('knowledge',  'Knowledge Base', 'General documents and reference material'),
      ('personal',   'Personal',       'Personal notes and private files'),
      ('work',       'Work',           'Work-related documents and records'),
      ('finance',    'Finance',        'Financial records and data'),
      ('family',     'Family',         'Family-related documents'),
      ('tech',       'Tech',           'Technical documentation and code references'),
      ('credential', 'Credentials',    'Licenses, certs, and access credentials')
    ON CONFLICT (name) DO NOTHING
  `);
}

export async function runLookupMigrations(): Promise<void> {
  await vectorPool.query(`CREATE SCHEMA IF NOT EXISTS lookup_schema`);

  await vectorPool.query(`
    CREATE TABLE IF NOT EXISTS lookup_schema.knowledge_acronyms (
      id          TEXT PRIMARY KEY,
      acronym     TEXT NOT NULL,
      expansion   TEXT NOT NULL,
      source_file TEXT
    )
  `);

  await vectorPool.query(`
    CREATE TABLE IF NOT EXISTS lookup_schema.knowledge_industry_multiples (
      id          TEXT PRIMARY KEY,
      industry    TEXT NOT NULL,
      multiple    NUMERIC(10, 2),
      year_range  TEXT
    )
  `);
}

export async function runJobMigrations(): Promise<void> {
  await vectorPool.query(`CREATE SCHEMA IF NOT EXISTS job_schema`);

  await vectorPool.query(`
    CREATE TABLE IF NOT EXISTS job_schema.ingest_job (
      id           TEXT PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'pending',
      params       JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      result       JSONB,
      error        TEXT
    )
  `);

  await vectorPool.query(`
    CREATE INDEX IF NOT EXISTS ingest_job_status_idx
    ON job_schema.ingest_job (status)
  `);

  await vectorPool.query(`
    CREATE INDEX IF NOT EXISTS ingest_job_created_at_idx
    ON job_schema.ingest_job (created_at DESC)
  `);

  // Reset jobs that were mid-flight when the process last crashed (B1 strategy).
  await vectorPool.query(`
    UPDATE job_schema.ingest_job
    SET status       = 'failed',
        completed_at = now(),
        error        = 'Server restarted while job was processing'
    WHERE status = 'processing'
  `);
}
