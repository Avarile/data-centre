import crypto from 'crypto';
import type { IngestParams, IngestResult } from './ingest';
import { ingestDocument } from './ingest';
import { vectorPool } from '../db/vector-pool.js';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IngestJob {
  id: string;
  status: JobStatus;
  params: IngestParams;
  createdAt: Date;
  completedAt?: Date;
  result?: IngestResult;
  error?: string;
}

interface JobRow {
  id: string;
  status: string;
  params: unknown;
  created_at: Date;
  completed_at: Date | null;
  result: unknown;
  error: string | null;
}

function rowToJob(row: JobRow): IngestJob {
  return {
    id: row.id,
    status: row.status as JobStatus,
    params: row.params as IngestParams,
    createdAt: row.created_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.result ? { result: row.result as IngestResult } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

export async function createJob(params: IngestParams): Promise<IngestJob> {
  const id = crypto.randomUUID();
  const { rows } = await vectorPool.query<JobRow>(
    `INSERT INTO job_schema.ingest_job (id, status, params)
     VALUES ($1, 'pending', $2)
     RETURNING *`,
    [id, JSON.stringify(params)]
  );
  return rowToJob(rows[0]);
}

export async function getJob(id: string): Promise<IngestJob | undefined> {
  const { rows } = await vectorPool.query<JobRow>(
    `SELECT * FROM job_schema.ingest_job WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

/** Starts the ingestion pipeline in the background. Returns immediately. */
export function startJob(job: IngestJob): void {
  (async () => {
    await vectorPool.query(`UPDATE job_schema.ingest_job SET status = 'processing' WHERE id = $1`, [
      job.id,
    ]);
    try {
      const result = await ingestDocument(job.params);
      await vectorPool.query(
        `UPDATE job_schema.ingest_job
         SET status = 'completed', completed_at = now(), result = $2
         WHERE id = $1`,
        [job.id, JSON.stringify(result)]
      );
    } catch (err) {
      await vectorPool.query(
        `UPDATE job_schema.ingest_job
         SET status = 'failed', completed_at = now(), error = $2
         WHERE id = $1`,
        [job.id, err instanceof Error ? err.message : String(err)]
      );
    }
  })().catch((err) => {
    console.error(`[ingest-jobs] unhandled error for job ${job.id}:`, err);
  });
}
