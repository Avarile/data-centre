import type { IKnowledgeGraphNode } from '@teable/openapi';
import { Badge, Button, cn } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { colorForNode } from './utils/graphTheme';

/**
 * A base can define far more types than fit alongside the canvas, so the list
 * is sized to this many rows and the remainder is reached by scrolling. Sizing
 * it, rather than letting it grow, is the point: the panel is an overlay on the
 * graph, and a list that grows to fit hides the thing it describes.
 */
const VISIBLE_ROWS = 20;
/**
 * rem. Must stay in step with the `h-6` on each row — the row count above is
 * only exact while rows are a fixed height, which is why they are not left to
 * size themselves from their content.
 */
const ROW_HEIGHT = 1.5;
/** rem. The scroll container's `p-1`, top + bottom, which its max-height includes. */
const LIST_PADDING = 0.5;

interface IKnowledgeGraphLegendProps {
  /** tier === 'type', already sorted by the assembler. */
  types: IKnowledgeGraphNode[];
  /**
   * The CLOSURE-expanded hidden set (KnowledgeGraph.tsx computes this with
   * `hiddenClosure`, the same helper `buildSimulationGraph` uses to filter the
   * canvas), not the store's raw clicked ids. The two differ on purpose: the
   * store only ever holds what the user clicked, so a hidden parent's
   * children must be dimmed here from the expanded set, or a row reads as
   * visible while its node has already vanished from the canvas next to it.
   */
  hiddenTypeIds: readonly string[];
  onToggleType: (typeNodeId: string) => void;
  onShowAll: () => void;
}

export const KnowledgeGraphLegend = (props: IKnowledgeGraphLegendProps) => {
  const { types, hiddenTypeIds, onToggleType, onShowAll } = props;
  const { t } = useTranslation(['knowledgeGraph']);

  // A Set, not `hiddenTypeIds.includes` per row: the lookup runs once per type,
  // so the array form is quadratic in exactly the case this list is sized for.
  const hiddenIds = useMemo(() => new Set(hiddenTypeIds), [hiddenTypeIds]);

  const hiddenCount = hiddenTypeIds.length;
  const allHidden = types.length > 0 && hiddenCount === types.length;

  return (
    // min-h-0 alongside max-h-full: this panel is a flex child of a column that
    // is itself height-capped, and without it the row cap below is the only
    // limit — on a short viewport 20 rows still overflow the canvas.
    <div className="pointer-events-auto flex max-h-full min-h-0 w-56 flex-col rounded-md border bg-background/90 shadow-sm backdrop-blur">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-semibold">{t('knowledgeGraph:legend.title')}</span>
        {hiddenCount > 0 && (
          <Button variant="ghost" size="xs" onClick={onShowAll}>
            {t('knowledgeGraph:legend.showAll')}
          </Button>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-1"
        style={{ maxHeight: `${VISIBLE_ROWS * ROW_HEIGHT + LIST_PADDING}rem` }}
      >
        {types.map((type) => {
          const hidden = hiddenIds.has(type.id);
          return (
            <button
              key={type.id}
              type="button"
              // Always this row's own id, regardless of whether it is dimmed
              // by its own click or by an ancestor's: cascading is applied
              // downstream (hiddenClosure), never here. Clicking a row that
              // is already dimmed because an ancestor is hidden adds this
              // row's own id to the store and visibly changes nothing until
              // that ancestor is shown again — expected, not a bug.
              onClick={() => onToggleType(type.id)}
              aria-pressed={!hidden}
              // paddingLeft, not a nested list: the row height must stay exactly
              // h-6 for the VISIBLE_ROWS cap above to mean what it says.
              style={{ paddingLeft: `${0.5 + type.depth * 0.75}rem` }}
              className={cn(
                'flex h-6 w-full items-center gap-2 rounded pr-2 text-left text-xs hover:bg-accent',
                hidden && 'opacity-40'
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorForNode(type) }}
              />
              <span className="truncate">{type.label}</span>
              <Badge variant="secondary" className="ml-auto shrink-0 px-1 py-0 text-[10px]">
                {type.degree}
              </Badge>
            </button>
          );
        })}
      </div>

      {(hiddenCount > 0 || allHidden) && (
        <div className="shrink-0 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          {allHidden
            ? t('knowledgeGraph:legend.allHidden')
            : t('knowledgeGraph:legend.hidden', { count: hiddenCount })}
        </div>
      )}
    </div>
  );
};
