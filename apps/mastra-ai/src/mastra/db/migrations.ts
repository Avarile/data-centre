import { lookupPool } from './vector-pool.js';

export async function runLookupMigrations(): Promise<void> {
  await lookupPool.query(`CREATE SCHEMA IF NOT EXISTS lookup_schema`);

  await lookupPool.query(`
    CREATE TABLE IF NOT EXISTS lookup_schema.knowledge_acronyms (
      id          TEXT PRIMARY KEY,
      acronym     TEXT NOT NULL,
      expansion   TEXT NOT NULL,
      source_file TEXT
    )
  `);

  await lookupPool.query(`
    CREATE TABLE IF NOT EXISTS lookup_schema.knowledge_industry_multiples (
      id          TEXT PRIMARY KEY,
      industry    TEXT NOT NULL,
      multiple    NUMERIC(10, 2),
      year_range  TEXT
    )
  `);
}
