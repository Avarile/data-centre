import { X } from '@teable/icons';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { useKnowledgeGraphNode } from './hooks/useKnowledgeGraphNode';

interface IKnowledgeNodeDetailPanelProps {
  nodeId: string;
  /** Computed client-side from the cached graph — never fetched. */
  siblingCount: number;
  onClose: () => void;
}

const formatTime = (value: string | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

export const KnowledgeNodeDetailPanel = (props: IKnowledgeNodeDetailPanelProps) => {
  const { nodeId, siblingCount, onClose } = props;
  const { t } = useTranslation(['knowledgeGraph']);
  const { data, isLoading, isError } = useKnowledgeGraphNode(nodeId);

  const updated = formatTime(data?.lastModifiedTime ?? null);
  const created = formatTime(data?.createdTime ?? null);

  return (
    // 28rem puts the context prose at roughly 70 characters per line at
    // text-xs, the top of the comfortable measure for reading — w-80 gave about
    // 49, which cost vertical space in a panel that already scrolls. max-w caps
    // it against the canvas so a narrow viewport shrinks the panel instead of
    // letting it crowd the search box in the opposite corner.
    <div className="pointer-events-auto flex max-h-full w-[28rem] max-w-[45%] flex-col rounded-md border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <h2 className="truncate text-sm font-semibold">{data?.label ?? nodeId}</h2>
          )}
          {data?.parentLabel && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {t('knowledgeGraph:detail.type')}: {data.parentLabel}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t('knowledgeGraph:detail.close')}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {isError && <p className="text-xs text-destructive">{t('knowledgeGraph:error.title')}</p>}

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        )}

        {data?.context && (
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              {t('knowledgeGraph:detail.context')}
            </h3>
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
              {data.context}
            </p>
          </section>
        )}

        {data && (
          <section className="space-y-0.5 text-[11px] text-muted-foreground">
            <p>{t('knowledgeGraph:detail.siblings', { count: siblingCount })}</p>
            {created && <p>{t('knowledgeGraph:detail.created', { time: created })}</p>}
            {updated && <p>{t('knowledgeGraph:detail.updated', { time: updated })}</p>}
          </section>
        )}
      </div>
    </div>
  );
};
