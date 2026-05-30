import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../env.js';

// BACKEND_API_KEY (agentic env) must equal MASTRA_API_KEY on the NestJS backend —
// both sides use the same shared secret for bearer-token auth via AgentGuard.

export async function postToBackend<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.BACKEND_API_KEY ? { Authorization: `Bearer ${env.BACKEND_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Backend responded ${res.status} ${res.statusText} for POST ${path}`);
  }

  const json = (await res.json()) as { payload: T };
  if (!json?.payload) {
    throw new Error(`Unexpected response shape from ${path}: ${JSON.stringify(json)}`);
  }
  return json.payload;
}

export async function patchToBackend(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(env.BACKEND_API_KEY ? { Authorization: `Bearer ${env.BACKEND_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Backend responded ${res.status} ${res.statusText} for PATCH ${path}`);
  }
}

export const updateUserQuestionTool = createTool({
  id: 'update-user-question',
  description:
    'Store classification results for a captured user input. Call this once after classifying the input.',
  inputSchema: z.object({
    recordId: z.number().describe('The numeric ID returned when the raw input was captured'),
    isQuestion: z.boolean().describe('True if the input is asking a question, false otherwise'),
    questionType: z
      .string()
      .optional()
      .describe('Free-form category, e.g. "valuation", "deal-structure", "general"'),
    questionIntent: z.string().optional().describe('What the user is trying to accomplish'),
    sentiment: z.string().optional().describe('"positive", "neutral", or "frustrated"'),
    answered: z.boolean().optional().describe('Whether the agent could fully answer the question'),
    classificationConfidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Your confidence in this classification, 0.0–1.0'),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ recordId, ...classification }) => {
    await patchToBackend(`/api/agent/questions/${recordId}/classify`, classification);
    return { success: true };
  },
});

export const captureDataGapTool = createTool({
  id: 'capture-data-gap',
  description:
    'Record a knowledge gap when the knowledge base lacks sufficient information to fully answer a user question. ' +
    'Call this after exhausting all relevant tools and confirming no answer is available. ' +
    'Include the original question, your reasoning for why the data is missing, and what data would be needed.',
  inputSchema: z.object({
    sessionId: z.string().optional().describe('Agent session or thread identifier'),
    conversationId: z.string().optional().describe('Logical conversation grouping'),
    originalQuestion: z
      .string()
      .optional()
      .describe('The exact question the user asked that could not be answered'),
    gapDescription: z.string().optional().describe('What specific data or knowledge was missing'),
    agentReasoning: z
      .string()
      .optional()
      .describe(
        'Why you believe the knowledge base lacks this data — be specific about what was searched and what was missing'
      ),
    topic: z
      .string()
      .optional()
      .describe('The subject domain of the gap, e.g. "SaaS valuation", "deal structure"'),
    severity: z
      .enum(['blocking', 'partial', 'minor'])
      .optional()
      .describe(
        '"blocking" = could not answer at all, "partial" = partial answer only, "minor" = minor detail missing'
      ),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Any additional context'),
  }),
  outputSchema: z.object({
    id: z.number(),
    createdAt: z.string(),
  }),
  execute: async (input) => {
    return await postToBackend<{ id: number; createdAt: string }>('/api/agent/data-gaps', input);
  },
});
