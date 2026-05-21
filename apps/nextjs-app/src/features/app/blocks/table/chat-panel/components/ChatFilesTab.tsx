import { Paperclip, Trash2 } from '@teable/icons';
import type { IChatFileVo } from '@teable/openapi';
import { Button } from '@teable/ui-lib/shadcn';
import { FileIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { formatBytes } from '../helpers';

interface IChatFilesTabProps {
  files: IChatFileVo[];
  onDelete: (fileId: string) => Promise<void>;
  onUploadClick: () => void;
}

export const ChatFilesTab = ({ files, onDelete, onUploadClick }: IChatFilesTabProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t('ai.files.description', 'Files uploaded here are available as AI context.')}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onUploadClick}
          title={t('ai.files.upload', 'Upload file')}
        >
          <Paperclip className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {files.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <FileIcon className="size-8 opacity-40" />
            <p className="text-sm">{t('ai.files.empty', 'No files uploaded yet.')}</p>
            <Button variant="outline" size="sm" onClick={onUploadClick}>
              {t('ai.files.uploadFirst', 'Upload a file')}
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {files.map((file) => (
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
                  onClick={() => void onDelete(file.id)}
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
  );
};
