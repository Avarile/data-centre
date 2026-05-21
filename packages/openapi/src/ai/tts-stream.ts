import { urlBuilder } from '../utils';

export const AI_TTS = '/api/{baseId}/ai/tts';

export const aiTtsStream = (
  baseId: string,
  text: string,
  signal?: AbortSignal
): Promise<Response> => {
  return fetch(urlBuilder(AI_TTS, { baseId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
};
