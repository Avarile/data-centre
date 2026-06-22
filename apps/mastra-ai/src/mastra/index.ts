import { timingSafeEqual } from 'node:crypto';
import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import type { MastraAuthConfig } from '@mastra/core/server';
import { PinoLogger } from '@mastra/loggers';
import { z } from 'zod';
import { knowledgeRAGAgent } from './agents/knowledge-agent-rag';
import { knowledgeNONRAGAgent } from './agents/knowledge-agent-non-rag';
import { createJob, getJob, startJob } from './rag/ingest-jobs';
import { runAllMigrations } from './db/migrations';
import { env, isDev } from './env';

try {
  await runAllMigrations();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[mastra] FATAL: database migrations failed — refusing to start.', err);
  throw err;
}

// ── Server auth ────────────────────────────────────────────────────────────
// Only the trusted NestJS backend calls this service. It authenticates with a
// shared bearer token (MASTRA_API_KEY). When the key is unset (local dev) auth
// is disabled so Mastra Studio keeps working; env.ts enforces the key in prod.
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const apiKey = env.MASTRA_API_KEY;

if (!apiKey && !isDev) {
  // eslint-disable-next-line no-console
  console.warn(
    '[mastra] WARNING: MASTRA_API_KEY is not set — the Mastra server is UNAUTHENTICATED. ' +
      'Set MASTRA_API_KEY here and in the NestJS backend to enable server-to-server auth.'
  );
}

const auth: MastraAuthConfig | undefined = apiKey
  ? {
      authenticateToken: async (token: string) =>
        token && constantTimeEqual(token, apiKey) ? { id: 'nestjs-backend' } : null,
      // Protect the agent/memory API surface and the custom ingest routes.
      protected: [/^\/api\//, '/ingest', /^\/ingest\//],
    }
  : undefined;

const ingestBodySchema = z.object({
  indexName: z.string().min(1),
  content: z.string().min(1),
  docName: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extractEnrichments: z.boolean().optional().default(false),
});

const serverConfig = {
  port: 4111,
  // CORS is defence-in-depth (the primary caller is server-to-server). Lock the
  // origin in production; keep permissive only in local dev.
  cors: { origin: isDev ? '*' : env.MASTRA_CORS_ORIGIN, credentials: false },
  ...(auth ? { auth } : {}),
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
};

export const mastra = new Mastra({
  workflows: {},
  agents: { knowledgeRAGAgent, knowledgeNONRAGAgent },
  scorers: {},
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: serverConfig,
});
