import { useQueryClient } from '@tanstack/react-query';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId } from '@teable/sdk/hooks';
import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@teable/ui-lib/shadcn';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useRef } from 'react';
import { useKnowledgeGraph } from './hooks/useKnowledgeGraph';
import { useResizeObserver } from './hooks/useResizeObserver';
import type { IKnowledgeGraphCanvasHandle } from './KnowledgeGraphCanvas';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';
import { KnowledgeGraphLegend } from './KnowledgeGraphLegend';
import { KnowledgeGraphToolbar } from './KnowledgeGraphToolbar';
import { KnowledgeNodeDetailPanel } from './KnowledgeNodeDetailPanel';
import { KnowledgeNodeSearch } from './KnowledgeNodeSearch';
import { useKnowledgeGraphStore } from './useKnowledgeGraphStore';
import {
  buildSimulationGraph,
  hiddenClosure,
  isLinkVisible,
  isNodeVisible,
} from './utils/buildSimulationGraph';

/**
 * The reference implementation's canvas colour
 * (`ai-agent-cluster/frontend/app/data-links-modal/components/ForceGraph.tsx`
 * → `BG_COLOR`). A single fixed value, as there too: this fork is dark-only at
 * the token level — `:root` and `.dark` in global.shadcn.css both set
 * `--background: 0 0% 12%` — so branching the canvas on `resolvedTheme` would
 * send it light while every surrounding chrome element stayed dark.
 */
const CANVAS_BACKGROUND = '#f5f0e8';

export const KnowledgeGraph = () => {
  const { t } = useTranslation(['knowledgeGraph', 'common']);
  const baseId = useBaseId();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useKnowledgeGraph();

  const focusedNodeId = useKnowledgeGraphStore((state) => state.focusedNodeId);
  const hiddenTypeIds = useKnowledgeGraphStore((state) => state.hiddenTypeIds);
  const autoRotate = useKnowledgeGraphStore((state) => state.autoRotate);
  const showLegend = useKnowledgeGraphStore((state) => state.showLegend);
  const setFocusedNode = useKnowledgeGraphStore((state) => state.setFocusedNode);
  const toggleType = useKnowledgeGraphStore((state) => state.toggleType);
  const showAllTypes = useKnowledgeGraphStore((state) => state.showAllTypes);
  const setAutoRotate = useKnowledgeGraphStore((state) => state.setAutoRotate);
  const reset = useKnowledgeGraphStore((state) => state.reset);

  // The same ref is the ResizeObserver target, the canvas host, and the
  // fullscreen element — see the toolbar's note on why they must not differ.
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useResizeObserver(containerRef);

  // Null whenever the canvas is unmounted — an empty, loading or errored graph.
  const canvasRef = useRef<IKnowledgeGraphCanvasHandle>(null);

  // Derived, never stored. Identity stability is the performance contract:
  // react-force-graph diffs graphData by reference, so a new object means a full
  // scene teardown and re-simulation.
  const graph = useMemo(() => buildSimulationGraph(data, hiddenTypeIds), [data, hiddenTypeIds]);

  // Counts what is actually drawn: the core is in the simulation but hidden, so
  // graph.nodes.length would overstate the scene by one node and 25-odd links.
  const visibleCounts = useMemo(
    () => ({
      nodes: graph.nodes.filter(isNodeVisible).length,
      links: graph.links.filter(isLinkVisible).length,
    }),
    [graph]
  );

  const typeNodes = useMemo(
    () => (data?.nodes ?? []).filter((node) => node.tier === 'type'),
    [data]
  );

  // The store holds only the id(s) the user actually clicked — see toggleType
  // in useKnowledgeGraphStore — and buildSimulationGraph expands that to the
  // full hidden subtree (hiddenClosure) before filtering what the canvas
  // draws. The legend must dim that SAME subtree, or a hidden parent's
  // children keep reading as visible rows while their nodes have already
  // disappeared from the scene beside them. Do not push this expanded set
  // back into the store: the store's contract is "ids the user clicked", and
  // storing the closure would double-apply it (hiddenClosure would then
  // expand an already-expanded set) and break showAllTypes/un-hiding.
  const legendHiddenTypeIds = useMemo(
    () => Array.from(hiddenClosure(data?.nodes ?? [], hiddenTypeIds)),
    [data, hiddenTypeIds]
  );
  const searchableNodes = useMemo(
    () => (data?.nodes ?? []).filter((node) => node.tier !== 'core'),
    [data]
  );

  const focusedNode = useMemo(
    () => data?.nodes.find((node) => node.id === focusedNodeId),
    [data, focusedNodeId]
  );
  const siblingCount = useMemo(() => {
    if (!focusedNode?.parentId) {
      return 0;
    }
    return (data?.nodes ?? []).filter((node) => node.parentId === focusedNode.parentId).length;
  }, [data, focusedNode]);

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      // An animated camera move and a rotation loop writing the same property is
      // incoherent, so focusing always stops auto-rotate.
      if (nodeId) {
        setAutoRotate(false);
      }
      setFocusedNode(nodeId);
    },
    [setAutoRotate, setFocusedNode]
  );

  const handleRecenter = useCallback(() => {
    // Clearing the focus is part of re-centring, not a nicety: the canvas's
    // focus effect re-runs on every `graph` identity change, so a node left
    // focused would pull the camera off the core again at the next refetch or
    // legend toggle. Auto-rotate stops for the same reason it does when
    // focusing — a rotation loop and an animated camera move write the same
    // property, and the move is what the user just asked for.
    setFocusedNode(null);
    setAutoRotate(false);
    canvasRef.current?.recenterOnCore();
  }, [setAutoRotate, setFocusedNode]);

  const handleRefresh = useCallback(() => {
    if (!baseId) {
      return;
    }
    // Invalidation, not a bare refetch: it is what updates every observer.
    queryClient.invalidateQueries({ queryKey: ReactQueryKeys.knowledgeGraph(baseId) });
  }, [baseId, queryClient]);

  // Detail is only fetchable for nodes with a backing record.
  const detailNodeId = focusedNode && focusedNode.recordId ? focusedNode.id : null;

  return (
    // overflow-hidden, not overflow-y-auto: a scrollbar around a measured canvas
    // creates a ResizeObserver <-> scrollbar feedback loop.
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Head>
        <title>{t('common:noun.knowledgeGraph')}</title>
      </Head>

      {data && (
        <KnowledgeGraphToolbar
          stats={data.stats}
          visibleNodeCount={visibleCounts.nodes}
          visibleLinkCount={visibleCounts.links}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
          onRecenter={handleRecenter}
          onResetView={reset}
          onRefresh={handleRefresh}
          isRefreshing={isFetching}
          fullscreenTargetRef={containerRef}
        />
      )}

      {data?.stats.truncated.nodes && (
        <div className="shrink-0 border-b bg-amber-50 px-4 py-1 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t('knowledgeGraph:truncated.banner', { count: data.stats.knowledgeCount })}
        </div>
      )}

      <div ref={containerRef} className="relative min-h-0 flex-1">
        {isLoading && <Skeleton className="size-full" />}

        {isError && (
          <div className="flex size-full items-center justify-center p-8">
            <Alert className="max-w-md">
              <AlertTitle>{t('knowledgeGraph:error.title')}</AlertTitle>
              <AlertDescription className="mt-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  {t('knowledgeGraph:error.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {data && graph.nodes.length <= 1 && (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-8 text-center">
            <p className="text-sm font-medium">{t('knowledgeGraph:empty.title')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t('knowledgeGraph:empty.description')}
            </p>
          </div>
        )}

        {/*
          react-force-graph-3d needs explicit numeric width/height and has no
          fitView. Gate the mount on non-zero dimensions, or the first frame
          initialises a 0x0 WebGL context.
        */}
        {data && graph.nodes.length > 1 && width > 0 && height > 0 && (
          <KnowledgeGraphCanvas
            ref={canvasRef}
            graph={graph}
            width={width}
            height={height}
            backgroundColor={CANVAS_BACKGROUND}
            focusedNodeId={focusedNodeId}
            autoRotate={autoRotate}
            onNodeClick={handleSelectNode}
            onUserInteract={() => setAutoRotate(false)}
          />
        )}

        {data && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3">
            <div className="flex max-h-full flex-col gap-3">
              <KnowledgeNodeSearch
                nodes={searchableNodes}
                onSelect={handleSelectNode}
                onClear={() => setFocusedNode(null)}
              />
              {showLegend && typeNodes.length > 0 && (
                <KnowledgeGraphLegend
                  types={typeNodes}
                  hiddenTypeIds={legendHiddenTypeIds}
                  onToggleType={toggleType}
                  onShowAll={showAllTypes}
                />
              )}
            </div>

            {detailNodeId && (
              <KnowledgeNodeDetailPanel
                nodeId={detailNodeId}
                siblingCount={siblingCount}
                onClose={() => setFocusedNode(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
