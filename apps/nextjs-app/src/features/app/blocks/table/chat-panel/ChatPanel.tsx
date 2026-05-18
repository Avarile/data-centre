import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Maximize2, MessageSquare, Minimize2, Paperclip, Trash2, X } from '@teable/icons';
import {
  aiGenerateStream,
  deleteChatFile,
  getSignature,
  listChatFiles,
  notify,
  saveChatFile,
  UploadType,
} from '@teable/openapi';
import type { IChatFileVo } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk';
import { Button } from '@teable/ui-lib/shadcn';
import axios from 'axios';
import { FileIcon, Files, Sparkles } from 'lucide-react';
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
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger,
} from '../../../../../components/ai-elements/model-selector';
import type { PromptInputMessage } from '../../../../../components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_DEFAULT_WIDTH = 320;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const ALLOWED_EXTENSIONS = '.pdf,.txt,.md,.html,.htm,.csv,.docx,.doc';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IGridSelection {
  rows: [number, number][] | null;
  timestamp: number;
  addToChat?: boolean;
}

interface IUploadingFile {
  id: string;
  name: string;
  uploading: boolean;
  error?: string;
  token?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IChatPanelProps {
  baseId: string;
}

export const ChatPanel = ({ baseId }: IChatPanelProps) => {
  const { status, close, toggleExpanded } = useChatPanelStore();
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  // Chat state
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [messages, setMessages] = useState<IMessage[]>(() => {
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
  });
  const [hasText, setHasText] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const abortRef = useRef<AbortController | null>(null);

  // File upload state (separate from PromptInput's internal file preview)
  const [uploadingFiles, setUploadingFiles] = useState<IUploadingFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistent file selection — files from the library chosen to accompany messages
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  // Grid selection context
  const { data: gridSelection } = useQuery<IGridSelection | null>({
    queryKey: ReactQueryKeys.gridSelection(baseId),
    queryFn: () => Promise.resolve(null),
    staleTime: Infinity,
    initialData: null,
  });

  const recordMap = useGridSearchStore((state) => state.recordMap);
  const fields = useGridSearchStore((state) => state.fields);

  // File list query
  const { data: chatFiles = [], refetch: refetchFiles } = useQuery<IChatFileVo[]>({
    queryKey: ['chatFiles', baseId],
    queryFn: () => listChatFiles(baseId).then((r) => r.data),
    enabled: status !== 'close',
  });

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

  useEffect(() => {
    if (isStreaming) return; // avoid synchronous writes on every streamed token
    try {
      localStorage.setItem(`chat-history:${baseId}`, JSON.stringify(messages));
    } catch {
      // localStorage unavailable or quota exceeded — silently skip
    }
  }, [baseId, messages, isStreaming]);

  // ---------------------------------------------------------------------------
  // File upload logic
  // ---------------------------------------------------------------------------

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setUploadError(`File type not allowed. Supported: PDF, TXT, Markdown, HTML, CSV, Word.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`File "${file.name}" exceeds 10 MB limit.`);
        return;
      }

      const tempId = `${Date.now()}-${file.name}`;
      setUploadingFiles((prev) => [...prev, { id: tempId, name: file.name, uploading: true }]);
      setUploadError(null);

      try {
        // 1. Get presigned URL
        const sigRes = await getSignature({
          type: UploadType.ChatFile,
          contentLength: file.size,
          contentType: file.type,
          baseId,
        });
        const { url, uploadMethod, token, requestHeaders } = sigRes.data;

        // 2. Upload directly to MinIO
        const headers = { ...(requestHeaders as Record<string, string>) };
        delete headers['Content-Length'];
        await axios({ method: uploadMethod, url, data: file, headers });

        // 3. Notify backend upload complete
        const notifyRes = await notify(token, undefined, file.name);
        const { path, size, mimetype } = notifyRes.data;

        // 4. Save chat file reference
        await saveChatFile(baseId, { token, name: file.name, size, mimetype, path });

        // Mark as uploaded with token
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, uploading: false, token } : f))
        );

        // Refresh file list
        void refetchFiles();
      } catch {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === tempId ? { ...f, uploading: false, error: 'Upload failed' } : f
          )
        );
      }
    },
    [baseId, refetchFiles]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.currentTarget.files;
      if (!files) return;
      for (const file of files) {
        void uploadFile(file);
      }
      e.currentTarget.value = '';
    },
    [uploadFile]
  );

  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const selectedFiles = useMemo(
    () => chatFiles.filter((f) => selectedFileIds.has(f.id)),
    [chatFiles, selectedFileIds]
  );

  // ---------------------------------------------------------------------------
  // AI streaming
  // ---------------------------------------------------------------------------

  const streamAssistantReply = useCallback(
    async (_userText: string, history: IMessage[], fileTokens: string[]) => {
      const controller = new AbortController();
      abortRef.current = controller;

      // If records are selected, inject the context into the current (last) user message
      // for the API only — state stores raw text for display.
      const apiMessages = history.map((m, i) => {
        if (i === history.length - 1 && m.role === 'user' && selectedRecordsContext) {
          return {
            role: m.role,
            content: `The user has selected these records from the table:\n\n${selectedRecordsContext}\n\n${m.content}`,
          };
        }
        return { role: m.role, content: m.content };
      });

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
        const res = await aiGenerateStream(
          baseId,
          { messages: apiMessages, fileTokens: fileTokens.length ? fileTokens : undefined },
          controller.signal
        );
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

      // Merge tokens: library selection + just-uploaded queue (deduped)
      const persistedTokens = chatFiles
        .filter((f) => selectedFileIds.has(f.id))
        .map((f) => f.token);
      const uploadingTokens = uploadingFiles
        .filter((f) => !f.uploading && !f.error && f.token)
        .map((f) => f.token as string);
      const fileTokens = [...new Set([...persistedTokens, ...uploadingTokens])];

      const userMsg: IMessage = { role: 'user', content: text };
      const assistantPlaceholder: IMessage = { role: 'assistant', content: '' };

      setMessages((prev) => {
        const next = [...prev, userMsg, assistantPlaceholder];
        setIsStreaming(true);
        setIsThinking(true);
        streamAssistantReply(text, [...prev, userMsg], fileTokens);
        return next;
      });

      // Clear just-uploaded queue; keep library selection across messages
      setUploadingFiles([]);
    },
    [isStreaming, streamAssistantReply, uploadingFiles, chatFiles, selectedFileIds]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHasText(e.target.value.trim().length > 0);
  }, []);

  // ---------------------------------------------------------------------------
  // File management tab — delete
  // ---------------------------------------------------------------------------

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      await deleteChatFile(baseId, fileId);
      void queryClient.invalidateQueries({ queryKey: ['chatFiles', baseId] });
    },
    [baseId, queryClient]
  );

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
      {/* Single hidden file input shared by both tabs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

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

      {/* Tabs */}
      <div className="flex shrink-0 border-b text-sm">
        <button
          className={`px-4 py-1.5 font-medium transition-colors ${
            activeTab === 'chat'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          {t('ai.chat.tabChat', 'Chat')}
        </button>
        <button
          className={`flex items-center gap-1 px-4 py-1.5 font-medium transition-colors ${
            activeTab === 'files'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('files')}
        >
          {t('ai.chat.tabFiles', 'Files')}
          {chatFiles.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{chatFiles.length}</span>
          )}
        </button>
      </div>

      {/* Context bar */}
      {activeTab === 'chat' && selectedRowCount > 0 && (
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

      {/* ---- CHAT TAB ---- */}
      {activeTab === 'chat' && (
        <>
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
              {/* Header: file selector trigger + attachment chips */}

              <PromptInputBody>
                <PromptInputTextarea
                  onChange={handleTextChange}
                  placeholder={t('ai.chat.inputPlaceholder', 'Ask a question… (Enter to send)')}
                />
              </PromptInputBody>
              <PromptInputFooter className="justify-end">
                {(chatFiles.length > 0 || uploadingFiles.length > 0 || uploadError) && (
                  <PromptInputHeader>
                    {/* File selector — always visible when files exist */}
                    {chatFiles.length > 0 && (
                      <ModelSelector>
                        <ModelSelectorTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Files className="size-3.5 shrink-0" />
                            <span>{t('ai.chat.files', 'Files')}</span>
                            {selectedFileIds.size > 0 && (
                              <span className="rounded-full bg-primary/15 px-1.5 text-primary">
                                {selectedFileIds.size}
                              </span>
                            )}
                          </button>
                        </ModelSelectorTrigger>
                        <ModelSelectorContent
                          title={t('ai.chat.selectFilesTitle', 'Select files as context')}
                        >
                          <ModelSelectorInput
                            placeholder={t('ai.chat.searchFiles', 'Search files…')}
                          />
                          <ModelSelectorList>
                            <ModelSelectorEmpty>
                              {t('ai.files.empty', 'No files uploaded yet.')}
                            </ModelSelectorEmpty>
                            <ModelSelectorGroup>
                              {chatFiles.map((file) => (
                                <ModelSelectorItem
                                  key={file.id}
                                  value={file.name}
                                  onSelect={() => toggleFileSelection(file.id)}
                                >
                                  <Check
                                    className={`mr-2 size-4 shrink-0 ${
                                      selectedFileIds.has(file.id) ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  />
                                  <FileIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                  <span className="flex-1 truncate">{file.name}</span>
                                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                    {formatBytes(file.size)}
                                  </span>
                                </ModelSelectorItem>
                              ))}
                            </ModelSelectorGroup>
                          </ModelSelectorList>
                        </ModelSelectorContent>
                      </ModelSelector>
                    )}

                    {/* Chips for selected library files */}
                    {selectedFiles.map((f) => (
                      <div
                        key={`sel-${f.id}`}
                        className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                      >
                        <FileIcon className="size-3 shrink-0" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleFileSelection(f.id)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}

                    {/* Chips for in-flight uploads */}
                    {uploadingFiles.map((f) => (
                      <div
                        key={f.id}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                          f.error
                            ? 'border-destructive/50 bg-destructive/10 text-destructive'
                            : 'bg-muted'
                        }`}
                      >
                        <FileIcon className="size-3 shrink-0" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                        {f.uploading && <span className="text-muted-foreground">…</span>}
                        {f.error && <span>{f.error}</span>}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => removeUploadingFile(f.id)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}

                    {uploadError && (
                      <p className="w-full text-xs text-destructive">{uploadError}</p>
                    )}
                  </PromptInputHeader>
                )}

                <PromptInputTools>
                  <PromptInputButton
                    tooltip={t('ai.chat.attachFile', 'Attach file')}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={!hasText && !isStreaming}
                  onStop={handleStop}
                  status={isStreaming ? 'streaming' : 'ready'}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </>
      )}

      {/* ---- FILES TAB ---- */}
      {activeTab === 'files' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {t('ai.files.description', 'Files uploaded here are available as AI context.')}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              title={t('ai.files.upload', 'Upload file')}
            >
              <Paperclip className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {chatFiles.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <FileIcon className="size-8 opacity-40" />
                <p className="text-sm">{t('ai.files.empty', 'No files uploaded yet.')}</p>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  {t('ai.files.uploadFirst', 'Upload a file')}
                </Button>
              </div>
            ) : (
              <ul className="space-y-1">
                {chatFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
                  >
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size)} · {file.mimetype.split('/').pop()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteFile(file.id)}
                      title={t('actions.delete')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Resizable>
  );
};
