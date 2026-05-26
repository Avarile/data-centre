import { Maximize2, MessageSquare, Minimize2, Trash2, X } from '@teable/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';

interface IChatPanelHeaderProps {
  status: 'open' | 'expanded';
  isTouchDevice: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  onClearSession: () => void;
}

export const ChatPanelHeader = ({
  status,
  isTouchDevice,
  onClose,
  onToggleExpanded,
  onClearSession,
}: IChatPanelHeaderProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex shrink-0 items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('ai.chat.title', 'AI Chat')}</span>
      </div>
      <div className="flex items-center gap-1">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="xs" title={t('ai.chat.clearSession', 'Clear session')}>
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('ai.chat.clearSessionTitle', 'Clear conversation?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'ai.chat.clearSessionDescription',
                  'This will permanently delete all messages in this session. This action cannot be undone.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onClearSession}>
                {t('actions.delete', 'Delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!isTouchDevice && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onToggleExpanded}
            title={status === 'expanded' ? t('ai.chat.exitFullscreen') : t('ai.chat.fullscreen')}
          >
            {status === 'expanded' ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onClose} title={t('actions.close')}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};
