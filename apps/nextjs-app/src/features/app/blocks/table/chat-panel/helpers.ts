import type { IGridSelection, IMessage } from './types';

export async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (text: string) => void
) {
  const decoder = new TextDecoder();
  let result = await reader.read();
  while (!result.done) {
    const chunk = decoder.decode(result.value, { stream: true });
    if (chunk) onChunk(chunk);
    result = await reader.read();
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countSelectedRows(
  selection: IGridSelection | null,
  contextDismissed: boolean
): number {
  if (!selection?.addToChat || contextDismissed || !selection.rows) return 0;
  return selection.rows.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
}

export function loadStoredMessages(baseId: string): IMessage[] {
  try {
    const stored = localStorage.getItem(`chat-history:${baseId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      )
    ) {
      return parsed as IMessage[];
    }
    return [];
  } catch {
    return [];
  }
}
