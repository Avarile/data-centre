import { aiIngestStream } from '@teable/openapi';
import { useTables } from '@teable/sdk/hooks';
import { Button } from '@teable/ui-lib/shadcn';
import { X, Upload, Loader2 } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useCallback, useRef, useState } from 'react';
import { readStream } from '../helpers';
import { INGEST_ALLOWED_EXTENSIONS, INGEST_ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../types';

interface IIngestionTabProps {
  baseId: string;
}

type IPhase = 'form' | 'streaming' | 'done';

export const IngestionTab = ({ baseId }: IIngestionTabProps) => {
  const { t } = useTranslation('common');
  const tables = useTables();

  const [files, setFiles] = useState<File[]>([]);
  const [targetTableId, setTargetTableId] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<IPhase>('form');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetTableName = tables.find((t) => t.id === targetTableId)?.name ?? '';

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const next: File[] = [];
      for (const f of incoming) {
        if (!INGEST_ALLOWED_MIME_TYPES.includes(f.type)) {
          setError(
            t(
              'ai.ingest.unsupportedType',
              `"${f.name}" is not supported. Use PDF, DOCX, TXT, or Markdown.`
            )
          );
          return;
        }
        if (f.size > MAX_FILE_SIZE) {
          setError(t('ai.ingest.fileTooLarge', `"${f.name}" exceeds the 10 MB limit.`));
          return;
        }
        next.push(f);
      }
      setError(null);
      setFiles((prev) => {
        const names = new Set(prev.map((p) => p.name));
        return [...prev, ...next.filter((f) => !names.has(f.name))];
      });
    },
    [t]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.currentTarget.files) addFiles(e.currentTarget.files);
      e.currentTarget.value = '';
    },
    [addFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!files.length || !targetTableId) return;
    setPhase('streaming');
    setResult('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await aiIngestStream(
        baseId,
        { files, targetTable: targetTableName, description: description.trim() || undefined },
        controller.signal
      );

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      await readStream(reader, (chunk) => {
        setResult((prev) => prev + chunk);
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(t('ai.ingest.streamError', 'Ingestion failed. Please try again.'));
    } finally {
      abortRef.current = null;
      setPhase('done');
    }
  }, [baseId, description, files, t, targetTableId, targetTableName]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setFiles([]);
    setTargetTableId('');
    setDescription('');
    setResult('');
    setError(null);
    setPhase('form');
  }, []);

  if (phase === 'streaming' || phase === 'done') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('ai.ingest.resultTitle', 'Ingestion Report')} — {targetTableName}
          </span>
          {phase === 'streaming' && (
            <Button variant="ghost" size="xs" onClick={handleStop}>
              {t('actions.stop', 'Stop')}
            </Button>
          )}
          {phase === 'done' && (
            <Button variant="ghost" size="xs" onClick={handleReset}>
              {t('ai.ingest.runAgain', 'Start over')}
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {phase === 'streaming' && !result && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t('ai.ingest.analyzing', 'Analyzing files…')}</span>
            </div>
          )}
          {result && <pre className="whitespace-pre-wrap text-sm leading-relaxed">{result}</pre>}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={INGEST_ALLOWED_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* File drop zone */}
      <div
        className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:bg-accent"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {t('ai.ingest.dropZone', 'Drop files here or click to upload')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('ai.ingest.supportedFormats', 'PDF, DOCX, TXT, Markdown · Max 10 MB each')}
        </p>
      </div>

      {/* Selected files list */}
      {files.length > 0 && (
        <ul className="mb-3 space-y-1">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5 text-sm"
            >
              <span className="flex-1 truncate">{f.name}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => removeFile(f.name)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {/* Table selector */}
      <label className="mb-1 text-xs font-medium text-muted-foreground">
        {t('ai.ingest.targetTable', 'Target table')}
      </label>
      <select
        className="mb-3 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        value={targetTableId}
        onChange={(e) => setTargetTableId(e.target.value)}
      >
        <option value="">{t('ai.ingest.selectTable', 'Select a table…')}</option>
        {tables.map((table) => (
          <option key={table.id} value={table.id}>
            {table.name}
          </option>
        ))}
      </select>

      {/* Optional description */}
      <label className="mb-1 text-xs font-medium text-muted-foreground">
        {t('ai.ingest.description', 'Additional instructions (optional)')}
      </label>
      <textarea
        className="mb-4 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t(
          'ai.ingest.descriptionPlaceholder',
          'e.g. "Skip rows where the name is empty" or "Map the Email column to the contact email field"'
        )}
      />

      <Button
        className="w-full"
        disabled={!files.length || !targetTableId}
        onClick={() => void handleSubmit()}
      >
        {t('ai.ingest.submit', 'Start Ingestion')}
      </Button>
    </div>
  );
};
