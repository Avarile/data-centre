import { RotateCw } from '@teable/icons';
import type { IKnowledgeGraphStats } from '@teable/openapi';
import { Button, Separator } from '@teable/ui-lib/shadcn';
import { Maximize2, Minimize2, Crosshair, Pause, Play, Target } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import type { RefObject } from 'react';
import { useFullscreen } from './hooks/useFullscreen';

interface IKnowledgeGraphToolbarProps {
  stats: IKnowledgeGraphStats;
  visibleNodeCount: number;
  visibleLinkCount: number;
  autoRotate: boolean;
  onAutoRotateChange: (on: boolean) => void;
  /** Frames the core again, without touching the type filters. */
  onRecenter: () => void;
  onResetView: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  /**
   * The same element the canvas attaches its interaction listeners to. If they
   * differ, entering fullscreen re-parents one and not the other, and
   * auto-rotate stops yielding to the user exactly where it is most visible.
   */
  fullscreenTargetRef: RefObject<HTMLElement>;
}

export const KnowledgeGraphToolbar = (props: IKnowledgeGraphToolbarProps) => {
  const {
    stats,
    visibleNodeCount,
    visibleLinkCount,
    autoRotate,
    onAutoRotateChange,
    onRecenter,
    onResetView,
    onRefresh,
    isRefreshing,
    fullscreenTargetRef,
  } = props;
  const { t } = useTranslation(['knowledgeGraph', 'common']);
  const { isFullscreen, toggle } = useFullscreen(fullscreenTargetRef);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-background/95 px-4 py-1.5 backdrop-blur">
      <h1 className="text-sm font-semibold">{t('common:noun.knowledgeGraph')}</h1>

      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{t('knowledgeGraph:stats.types', { count: stats.typeCount })}</span>
        <span>{t('knowledgeGraph:stats.nodes', { count: visibleNodeCount })}</span>
        <span>{t('knowledgeGraph:stats.links', { count: visibleLinkCount })}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/*
          A button rather than a switch: it sits with the other canvas controls,
          and `secondary` while running makes the state readable at a glance.
        */}
        <Button
          variant={autoRotate ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() => onAutoRotateChange(!autoRotate)}
          aria-pressed={autoRotate}
          title={
            autoRotate
              ? t('knowledgeGraph:toolbar.stopRotate')
              : t('knowledgeGraph:toolbar.startRotate')
          }
        >
          {autoRotate ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {t('knowledgeGraph:toolbar.autoRotate')}
        </Button>

        {/*
          Labelled rather than icon-only, unlike its neighbours to the right:
          this moves the camera while the Crosshair beside it clears the type
          filters, and two adjacent reticle glyphs separated only by a tooltip
          would be a coin toss for the user.
        */}
        <Button variant="ghost" size="xs" onClick={onRecenter}>
          <Target className="size-3.5" />
          {t('knowledgeGraph:toolbar.recenter')}
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={onResetView}
          title={t('knowledgeGraph:toolbar.resetView')}
        >
          <Crosshair className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={t('knowledgeGraph:toolbar.refresh')}
        >
          <RotateCw className={isRefreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={toggle}
          title={
            isFullscreen
              ? t('knowledgeGraph:toolbar.exitFullscreen')
              : t('knowledgeGraph:toolbar.fullscreen')
          }
        >
          {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
};
