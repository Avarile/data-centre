import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { PinoLogger } from '@mastra/loggers';
import { z } from 'zod';
import { knowledgeAgent } from './agents/knowledge-agent';
import { createJob, getJob, startJob } from './rag/ingest-jobs';
import { runIndexMigrations, runJobMigrations } from './db/migrations';

await runIndexMigrations();
await runJobMigrations();

const ingestBodySchema = z.object({
  indexName: z.string().min(1),
  content: z.string().min(1),
  docName: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extractEnrichments: z.boolean().optional().default(false),
});

export const mastra = new Mastra({
  workflows: {},
  agents: { knowledgeAgent },
  scorers: {},
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    port: 4111,
    apiRoutes: [
      // POST /ingest — start async ingestion job, returns 202 + jobId
      registerApiRoute('/ingest', {
        method: 'POST',
        handler: async (c) => {
          let body: unknown;
          try {
            body = await c.req.json();
          } catch {
            return c.json({ error: 'Invalid JSON body' }, 400);
          }

          const parsed = ingestBodySchema.safeParse(body);
          if (!parsed.success) {
            return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
          }

          const job = await createJob(parsed.data);
          startJob(job);

          return c.json(
            { jobId: job.id, status: job.status, createdAt: job.createdAt.toISOString() },
            202
          );
        },
      }),

      // GET /ingest/status/:jobId — poll ingestion job status
      registerApiRoute('/ingest/status/:jobId', {
        method: 'GET',
        handler: async (c) => {
          const jobId = c.req.param('jobId');
          const job = await getJob(jobId);
          if (!job) return c.json({ error: `Job "${jobId}" not found` }, 404);

          return c.json({
            jobId: job.id,
            status: job.status,
            createdAt: job.createdAt.toISOString(),
            ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
            ...(job.result ? { result: job.result } : {}),
            ...(job.error ? { error: job.error } : {}),
          });
        },
      }),
    ],
  },
});
