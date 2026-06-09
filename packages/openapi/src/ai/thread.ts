import { urlBuilder } from '../utils';

export const AI_THREADS = '/api/{baseId}/ai/threads';
export const AI_THREAD = '/api/{baseId}/ai/threads/{threadId}';

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

export const deleteAiThread = (baseId: string, threadId: string): Promise<Response> =>
  fetch(urlBuilder(AI_THREAD, { baseId, threadId }), {
    method: 'DELETE',
  });
