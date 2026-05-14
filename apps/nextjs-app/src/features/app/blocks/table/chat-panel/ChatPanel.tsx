import { useQuery } from '@tanstack/react-query';
import { Maximize2, MessageSquare, Minimize2, X } from '@teable/icons';
import { aiGenerateStream } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk';
import { Button } from '@teable/ui-lib/shadcn';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { Resizable } from 're-resizable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../../../../../components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '../../../../../components/ai-elements/message';
import type { PromptInputMessage } from '../../../../../components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '../../../../../components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../../../../../components/ai-elements/reasoning';
import { Shimmer } from '../../../../../components/ai-elements/shimmer';
import { useChatPanelStore } from '../../../components/sidebar/useChatPanelStore';
import { useGridSearchStore } from '../../view/grid/useGridSearchStore';

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

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [hasText, setHasText] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const abortRef = useRef<AbortController | null>(null);

  const { data: gridSelection } = useQuery<IGridSelection | null>({
    queryKey: ReactQueryKeys.gridSelection(baseId),
    queryFn: () => Promise.resolve(null),
    staleTime: Infinity,
    initialData: null,
  });

  const recordMap = useGridSearchStore((state) => state.recordMap);
  const fields = useGridSearchStore((state) => state.fields);

  const selectedRowCount =
    gridSelection?.addToChat && !contextDismissed && gridSelection.rows
      ? gridSelection.rows.reduce((sum, [start, end]) => sum + (end - start + 1), 0)
      : 0;

  const selectedRecordsContext = useMemo(() => {
    if (!gridSelection?.addToChat || contextDismissed || !gridSelection.rows) return '';
    if (!recordMap || !fields || fields.length === 0) return '';

    const header = fields.map((f) => f.name).join(' | ');
    const rows = gridSelection.rows
      .flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, (_, i) => {
          const record = recordMap[start + i];
          if (!record) return null;
          return fields.map((f) => f.cellValue2String(record.fields[f.id])).join(' | ');
        })
      )
      .filter(Boolean);

    if (rows.length === 0) return '';
    return `${header}\n${rows.join('\n')}`;
  }, [gridSelection, contextDismissed, recordMap, fields]);

  useEffect(() => {
    if (gridSelection?.addToChat) {
      setContextDismissed(false);
    }
  }, [gridSelection?.timestamp, gridSelection?.addToChat]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const streamAssistantReply = useCallback(
    async (userText: string, history: IMessage[]) => {
      const preamble = selectedRecordsContext
        ? `You are a helpful data assistant. The user has selected these records from the table:\n\n${selectedRecordsContext}\n\n`
        : 'You are a helpful data assistant.\n\n';

      const historyStr = history
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const prompt = `${preamble}${historyStr ? historyStr + '\n' : ''}User: ${userText}\nAssistant:`;

      const controller = new AbortController();
      abortRef.current = controller;

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      const appendChunk = (chunk: string) => {
        setIsThinking(false);
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
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        reader = res.body.getReader();
        await readStream(reader, appendChunk);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
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
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [selectedRecordsContext, baseId, t]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (!text || isStreaming) return;

      const userMsg: IMessage = { role: 'user', content: text };
      const assistantPlaceholder: IMessage = { role: 'assistant', content: '' };

      setMessages((prev) => {
        const next = [...prev, userMsg, assistantPlaceholder];
        setIsStreaming(true);
        setIsThinking(true);
        streamAssistantReply(text, [...prev, userMsg]);
        return next;
      });
    },
    [isStreaming, streamAssistantReply]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHasText(e.target.value.trim().length > 0);
  }, []);

  if (status === 'close') return null;

  const isFullscreen = status === 'expanded';

  return (
    <Resizable
      className="ml-1 flex flex-col bg-background"
      size={{ width: isFullscreen ? '100%' : panelWidth, height: '100%' }}
      maxWidth={isFullscreen ? '100%' : '60%'}
      minWidth="280px"
      enable={{ left: !isFullscreen }}
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
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('ai.chat.title', 'AI Chat')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleExpanded}
            title={status === 'expanded' ? t('ai.chat.exitFullscreen') : t('ai.chat.fullscreen')}
          >
            {status === 'expanded' ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          <Button variant="ghost" size="xs" onClick={close} title={t('actions.close')}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Context bar */}
      {selectedRowCount > 0 && (
        <div className="flex shrink-0 items-center justify-between bg-accent/50 px-3 py-1.5 text-xs">
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
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState className="absolute inset-0">
              <Sparkles className="size-8 text-muted-foreground/40" />
              <Shimmer className="text-base font-medium" duration={3}>
                {t('ai.chat.emptyStateHeadline', 'How can I help you today?')}
              </Shimmer>
              <p className="text-sm text-muted-foreground">
                {t('ai.chat.emptyState', 'Ask anything about your data.')}
              </p>
            </ConversationEmptyState>
          )}

          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
            const showThinking = isLastAssistant && isThinking;

            return (
              <Message key={i} from={msg.role}>
                <MessageContent>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <>
                      {showThinking && (
                        <Reasoning isStreaming={isThinking}>
                          <ReasoningTrigger />
                          <ReasoningContent>{''}</ReasoningContent>
                        </Reasoning>
                      )}
                      {msg.content && (
                        <MessageResponse isAnimating={isLastAssistant && isStreaming}>
                          {msg.content}
                        </MessageResponse>
                      )}
                    </>
                  )}
                </MessageContent>
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <div className={isFullscreen ? 'flex shrink-0 justify-center p-3' : 'shrink-0 p-3'}>
        <PromptInput className={isFullscreen ? 'w-1/3' : undefined} onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              onChange={handleTextChange}
              placeholder={t('ai.chat.inputPlaceholder', 'Ask a question… (Enter to send)')}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputTools />
            <PromptInputSubmit
              disabled={!hasText && !isStreaming}
              onStop={handleStop}
              status={isStreaming ? 'streaming' : 'ready'}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </Resizable>
  );
};
