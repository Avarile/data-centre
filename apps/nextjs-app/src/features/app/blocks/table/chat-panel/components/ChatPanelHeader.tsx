import { Maximize2, MessageSquare, Minimize2, X } from '@teable/icons';
import { Button } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';

interface IChatPanelHeaderProps {
  status: 'open' | 'expanded';
  isTouchDevice: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
}

export const ChatPanelHeader = ({
  status,
  isTouchDevice,
  onClose,
  onToggleExpanded,
}: IChatPanelHeaderProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex shrink-0 items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('ai.chat.title', 'AI Chat')}</span>
      </div>
      <div className="flex items-center gap-1">
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
