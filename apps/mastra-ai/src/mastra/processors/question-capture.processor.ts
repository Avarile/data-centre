import { BaseProcessor } from '@mastra/core/processors';
import type { ProcessInputArgs } from '@mastra/core/processors';
import { MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { postToBackend } from '../tools/capture-tools.js';
import { questionClassifierAgent } from '../agents/question-classifier-agent.js';

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: 'text'; text: string } => p?.type === 'text')
      .map((p) => p.text)
      .join(' ');
  }
  // MastraMessageContentV2: { format: 2, parts: [...] }
  if (content !== null && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (obj.format === 2 && Array.isArray(obj.parts)) {
      return (obj.parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join(' ');
    }
    if (obj.content !== undefined) return extractText(obj.content);
  }
  return '';
}

export class QuestionCaptureProcessor extends BaseProcessor<'question-capture'> {
  readonly id = 'question-capture' as const;

  processInput({ messages, requestContext }: ProcessInputArgs) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return messages;

    const rawInput = extractText(lastUserMsg.content).trim();
    if (!rawInput) return messages;

    const sessionId = requestContext?.get(MASTRA_THREAD_ID_KEY) ?? undefined;
    const conversationId = requestContext?.get(MASTRA_RESOURCE_ID_KEY) ?? undefined;

    // Fire-and-forget: insert raw record, then classify asynchronously
    void (async () => {
      try {
        const { id } = await postToBackend<{ id: number; createdAt: string }>(
          '/api/agent/questions',
          { rawInput, sessionId, conversationId }
        );
        void questionClassifierAgent
          .generate([{ role: 'user', content: JSON.stringify({ recordId: id, rawInput }) }])
          .catch((err: unknown) =>
            console.warn('[QuestionCapture] classifier failed for record', id, String(err))
          );
      } catch (err) {
        console.warn('[QuestionCapture] raw capture failed:', String(err));
      }
    })();

    return messages;
  }
}

export const questionCaptureProcessor = new QuestionCaptureProcessor();
