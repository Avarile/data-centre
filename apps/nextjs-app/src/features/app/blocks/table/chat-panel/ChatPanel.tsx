import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useIsTouchDevice } from '@teable/sdk/hooks';
import { cn } from '@teable/ui-lib/shadcn';
import axios from 'axios';
import { useTranslation } from 'next-i18next';
import { Resizable } from 're-resizable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PromptInputMessage } from '../../../../../components/ai-elements/prompt-input';
import { useChatPanelStore } from '../../../components/sidebar/useChatPanelStore';
import { useGridSearchStore } from '../../view/grid/useGridSearchStore';
import {
  ChatConversation,
  ChatFilesTab,
  ChatInputArea,
  ChatPanelHeader,
  ChatPanelTabs,
  ContextBar,
} from './components';
import { countSelectedRows, loadStoredMessages, readStream } from './helpers';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  PANEL_DEFAULT_WIDTH,
} from './types';
import type { IGridSelection, IMessage, IUploadingFile } from './types';

interface IChatPanelProps {
  baseId: string;
}

export const ChatPanel = ({ baseId }: IChatPanelProps) => {
  const { status, close, toggleExpanded } = useChatPanelStore();
  const { t } = useTranslation('common');
  const isTouchDevice = useIsTouchDevice();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [messages, setMessages] = useState<IMessage[]>(() => loadStoredMessages(baseId));
  const [hasText, setHasText] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const abortRef = useRef<AbortController | null>(null);

  const [uploadingFiles, setUploadingFiles] = useState<IUploadingFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const { data: gridSelection } = useQuery<IGridSelection | null>({
    queryKey: ReactQueryKeys.gridSelection(baseId),
    queryFn: () => Promise.resolve(null),
    staleTime: Infinity,
    initialData: null,
  });

  const recordMap = useGridSearchStore((state) => state.recordMap);
  const fields = useGridSearchStore((state) => state.fields);

  const { data: chatFiles = [], refetch: refetchFiles } = useQuery<IChatFileVo[]>({
    queryKey: ['chatFiles', baseId],
    queryFn: () => listChatFiles(baseId).then((r) => r.data),
    enabled: status !== 'close',
  });

  const selectedRowCount = countSelectedRows(gridSelection, contextDismissed);

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
    if (isStreaming) return;
    try {
      localStorage.setItem(`chat-history:${baseId}`, JSON.stringify(messages));
    } catch {
      // localStorage unavailable or quota exceeded
    }
  }, [baseId, messages, isStreaming]);

  // ---------------------------------------------------------------------------
  // File upload
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
        const sigRes = await getSignature({
          type: UploadType.ChatFile,
          contentLength: file.size,
          contentType: file.type,
          baseId,
        });
        const { url, uploadMethod, token, requestHeaders } = sigRes.data;

        const headers = { ...(requestHeaders as Record<string, string>) };
        delete headers['Content-Length'];
        await axios({ method: uploadMethod, url, data: file, headers });

        const notifyRes = await notify(token, undefined, file.name);
        const { path, size, mimetype } = notifyRes.data;

        await saveChatFile(baseId, { token, name: file.name, size, mimetype, path });

        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, uploading: false, token } : f))
        );

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

      const persistedTokens = chatFiles
        .filter((f) => selectedFileIds.has(f.id))
        .map((f) => f.token);
      const uploadingTokens = uploadingFiles
        .filter((f) => !f.uploading && !f.error && f.token)
        .map((f) => f.token as string);
      const fileTokens = [...new Set([...persistedTokens, ...uploadingTokens])];

      const userMsg: IMessage = { role: 'user', content: text };
      const assistantPlaceholder: IMessage = { role: 'assistant', content: '' };
      const nextHistory = [...messages, userMsg];

      setMessages([...nextHistory, assistantPlaceholder]);
      setIsStreaming(true);
      setIsThinking(true);
      streamAssistantReply(text, nextHistory, fileTokens);
      setUploadingFiles([]);
    },
    [isStreaming, messages, streamAssistantReply, uploadingFiles, chatFiles, selectedFileIds]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHasText(e.target.value.trim().length > 0);
  }, []);

  // ---------------------------------------------------------------------------
  // File delete
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

  const panelContent = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <ChatPanelHeader
        status={status as 'open' | 'expanded'}
        isTouchDevice={isTouchDevice}
        onClose={close}
        onToggleExpanded={toggleExpanded}
      />

      <ChatPanelTabs
        activeTab={activeTab}
        fileCount={chatFiles.length}
        onTabChange={setActiveTab}
      />

      {activeTab === 'chat' && (
        <ContextBar rowCount={selectedRowCount} onDismiss={() => setContextDismissed(true)} />
      )}

      {activeTab === 'chat' && (
        <>
          <ChatConversation messages={messages} isStreaming={isStreaming} isThinking={isThinking} />
          <ChatInputArea
            isFullscreen={isFullscreen}
            isStreaming={isStreaming}
            hasText={hasText}
            chatFiles={chatFiles}
            selectedFileIds={selectedFileIds}
            selectedFiles={selectedFiles}
            uploadingFiles={uploadingFiles}
            uploadError={uploadError}
            onSubmit={handleSubmit}
            onStop={handleStop}
            onTextChange={handleTextChange}
            onAttachClick={() => fileInputRef.current?.click()}
            onToggleFileSelection={toggleFileSelection}
            onRemoveUploadingFile={removeUploadingFile}
          />
        </>
      )}

      {activeTab === 'files' && (
        <ChatFilesTab
          files={chatFiles}
          onDelete={handleDeleteFile}
          onUploadClick={() => fileInputRef.current?.click()}
        />
      )}
    </>
  );

  if (isTouchDevice) {
    return (
      <div className={cn('fixed inset-0 z-50 flex flex-col bg-background')}>{panelContent}</div>
    );
  }

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
      {panelContent}
    </Resizable>
  );
};
