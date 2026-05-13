import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MessageSquare, X } from '@teable/icons';
import { aiGenerateStream } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk';
import { Button, Textarea } from '@teable/ui-lib/shadcn';
import { Send } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { Resizable } from 're-resizable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatPanelStore } from '../../../components/sidebar/useChatPanelStore';

interface IMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IGridSelection {
  rows: [number, number][] | null;
  timestamp: number;
  addToChat?: boolean;
}

const PANEL_DEFAULT_WIDTH = 320;
const PANEL_EXPANDED_WIDTH = 560;

async function readStream(
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

interface IChatPanelProps {
  baseId: string;
}

export const ChatPanel = ({ baseId }: IChatPanelProps) => {
  const { status, close, toggleExpanded } = useChatPanelStore();
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(
    status === 'expanded' ? PANEL_EXPANDED_WIDTH : PANEL_DEFAULT_WIDTH
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const gridSelection = queryClient.getQueryData<IGridSelection>(
    ReactQueryKeys.gridSelection(baseId)
  );

  const selectedRowCount =
    gridSelection?.addToChat && !contextDismissed && gridSelection.rows
      ? gridSelection.rows.reduce((sum, [start, end]) => sum + (end - start + 1), 0)
      : 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset context dismissed state when a new selection comes in
  useEffect(() => {
    if (gridSelection?.addToChat) {
      setContextDismissed(false);
    }
  }, [gridSelection?.timestamp, gridSelection?.addToChat]);

  // Sync panel width when expand/collapse is toggled from the store
  useEffect(() => {
    setPanelWidth(status === 'expanded' ? PANEL_EXPANDED_WIDTH : PANEL_DEFAULT_WIDTH);
  }, [status]);

  // Abort any in-flight stream when the panel unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: IMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Build a single prompt from context + conversation history + new message.
    // The backend uses pipeTextStreamToResponse which streams raw text (not SSE).
    const preamble =
      selectedRowCount > 0
        ? `You are a helpful data assistant. The user has ${selectedRowCount} row(s) selected from a table.\n\n`
        : 'You are a helpful data assistant.\n\n';

    const history = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `${preamble}${history ? history + '\n' : ''}User: ${text}\nAssistant:`;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const appendChunk = (chunk: string) => {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + chunk,
        };
        return updated;
      });
    };

    try {
      const res = await aiGenerateStream(baseId, { prompt }, controller.signal);

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      reader = res.body.getReader();
      await readStream(reader, appendChunk);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Remove the placeholder bubble if nothing was streamed yet
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: t('ai.chat.errorMessage', 'Something went wrong. Please try again.'),
          };
          return updated;
        });
      }
    } finally {
      reader?.cancel();
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, selectedRowCount, baseId, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (status === 'close') return null;

  return (
    <Resizable
      className="ml-1 flex flex-col border-l bg-background"
      size={{ width: panelWidth, height: '100%' }}
      maxWidth="60%"
      minWidth="280px"
      enable={{ left: true }}
      handleClasses={{ left: 'group' }}
      handleStyles={{ left: { width: '4px', left: '0' } }}
      handleComponent={{
        left: (
          <div className="h-full w-px bg-border group-hover:px-[1.5px] group-active:px-[1.5px]" />
        ),
      }}
      onResizeStop={(_e, _dir, _ref, d) => {
        setPanelWidth((prev) => prev + d.width);
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('ai.chat.title', 'AI Chat')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleExpanded}
            title={status === 'expanded' ? t('ai.chat.collapse') : t('ai.chat.expand')}
          >
            {status === 'expanded' ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
          <Button variant="ghost" size="xs" onClick={close} title={t('actions.close')}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Context bar */}
      {selectedRowCount > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b bg-accent/50 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {t('ai.chat.rowsSelected', '{{count}} rows selected as context', {
              count: selectedRowCount,
            })}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="size-5 p-0"
            onClick={() => setContextDismissed(true)}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-8 opacity-30" />
            <p>{t('ai.chat.emptyState', 'Ask anything about your data.')}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === 'user'
                ? 'ml-6 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                : 'mr-6 self-start rounded-lg bg-muted px-3 py-2 text-sm'
            }
          >
            {msg.content ||
              (isStreaming && i === messages.length - 1 ? (
                <span className="animate-pulse">▍</span>
              ) : (
                ''
              ))}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <Textarea
            className="min-h-[60px] resize-none text-sm"
            placeholder={t('ai.chat.inputPlaceholder', 'Ask a question… (Enter to send)')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <Button
            size="sm"
            className="shrink-0 self-end"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </Resizable>
  );
};
