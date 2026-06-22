import { urlBuilder } from '../utils';

export const AI_THREADS = '/api/{baseId}/ai/threads';
export const AI_THREAD = '/api/{baseId}/ai/threads/{threadId}';
export const AI_THREAD_MESSAGES = '/api/{baseId}/ai/threads/{threadId}/messages';

export interface IAiThread {
  id: string;
  resourceId: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export const listAiThreads = (baseId: string): Promise<Response> =>
  fetch(urlBuilder(AI_THREADS, { baseId }), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

export const deleteAiThread = (
  baseId: string,
  threadId: string,
  agentId?: string
): Promise<Response> =>
  fetch(
    `${urlBuilder(AI_THREAD, { baseId, threadId })}${
      agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''
    }`,
    {
      method: 'DELETE',
    }
  );

export interface IAiThreadMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const getAiThreadMessages = (
  baseId: string,
  threadId: string,
  agentId: string
): Promise<Response> =>
  fetch(
    `${urlBuilder(AI_THREAD_MESSAGES, { baseId, threadId })}?agentId=${encodeURIComponent(agentId)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );
