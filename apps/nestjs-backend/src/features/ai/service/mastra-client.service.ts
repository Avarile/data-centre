import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface IMastraThread {
  id: string;
  resourceId: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MastraClientService {
  private readonly logger = new Logger(MastraClientService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MASTRA_URL') ?? 'http://localhost:4111';
  }

  async createThread(resourceId: string, agentId: string, title?: string): Promise<IMastraThread> {
    const { data } = await axios.post<IMastraThread>(
      `${this.baseUrl}/api/memory/threads`,
      { resourceId, ...(title ? { title } : {}) },
      { params: { agentId }, timeout: 10_000 }
    );
    return data;
  }

  async getThread(threadId: string): Promise<IMastraThread | null> {
    try {
      const { data } = await axios.get<IMastraThread>(
        `${this.baseUrl}/api/memory/threads/${threadId}`,
        { timeout: 10_000 }
      );
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/api/memory/threads/${threadId}`, { timeout: 10_000 });
  }

  async listThreads(resourceId: string): Promise<IMastraThread[]> {
    const { data } = await axios.get<IMastraThread[] | { threads: IMastraThread[] }>(
      `${this.baseUrl}/api/memory/threads`,
      { params: { resourceId }, timeout: 10_000 }
    );
    return Array.isArray(data) ? data : data.threads ?? [];
  }

  /**
   * Stream text from a Mastra agent, yielding text chunks.
   *
   * Handles two wire formats:
   * - Vercel AI SDK data stream: `0:"text chunk"\n`
   * - JSON-body SSE: `data: {"type":"text-delta","textDelta":"..."}\n\n`
   */
  async *streamAgent(
    agentId: string,
    body: { messages?: { role: 'user' | 'assistant'; content: string }[]; prompt?: string },
    threadId: string,
    resourceId: string
  ): AsyncGenerator<string, void, unknown> {
    const response = await axios.post<NodeJS.ReadableStream>(
      `${this.baseUrl}/api/agents/${agentId}/stream`,
      { ...body, memory: { thread: threadId, resource: resourceId } },
      { responseType: 'stream', timeout: 120_000 }
    );

    const stream = response.data;
    let buffer = '';

    for await (const raw of stream) {
      buffer += Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw);

      // Split on newlines; keep the last incomplete line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const text = this.extractTextFromLine(line);
        if (text) yield text;
      }
    }

    // Flush any remaining buffer content
    if (buffer) {
      const text = this.extractTextFromLine(buffer);
      if (text) yield text;
    }
  }

  private extractTextFromLine(line: string): string | null {
    let content = line.trim();
    if (!content) return null;

    // Strip SSE "data:" prefix
    if (content.startsWith('data:')) {
      content = content.slice(5).trim();
    }
    if (!content || content === '[DONE]') return null;

    // Vercel AI SDK data stream format: 0:"text chunk"
    if (content.startsWith('0:')) {
      try {
        const text = JSON.parse(content.slice(2)) as string;
        return text || null;
      } catch {
        return null;
      }
    }

    // JSON object (Mastra SSE format)
    if (content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed['type'] === 'text-delta') {
          // Mastra format: { type: 'text-delta', payload: { text: '...' } }
          const payload = parsed['payload'] as Record<string, unknown> | undefined;
          if (typeof payload?.['text'] === 'string') return payload['text'] || null;
          // Legacy fallback: { type: 'text-delta', textDelta: '...' }
          if (typeof parsed['textDelta'] === 'string') return parsed['textDelta'] || null;
        }
      } catch {
        /* ignore */
      }
    }

    return null;
  }
}
