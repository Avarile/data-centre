import type { IGetKnowledgeGraphVo } from '@teable/openapi';
import { KNOWLEDGE_CORE_NODE_ID } from '@teable/openapi';
import { vi } from 'vitest';
import { cleanup, render, screen, userEvent } from '@/test-utils';

// react-force-graph-3d/three need a real WebGL context, so KnowledgeGraphCanvas
// is never mounted here: it is gated on `width > 0 && height > 0`, and
// happy-dom's ResizeObserver never reports a non-zero rect. That gate is what
// makes this a cheap render — only useKnowledgeGraph needs mocking, since it
// reads useBaseId/AnchorContext (absent from AppTestProviders) and would
// otherwise never resolve `enabled`.
vi.mock('./hooks/useKnowledgeGraph', () => ({
  useKnowledgeGraph: vi.fn(),
}));

// eslint-disable-next-line import/order
import { useKnowledgeGraph } from './hooks/useKnowledgeGraph';
// eslint-disable-next-line import/order
import { KnowledgeGraph } from './KnowledgeGraph';
// eslint-disable-next-line import/order
import { useKnowledgeGraphStore } from './useKnowledgeGraphStore';

const mockedUseKnowledgeGraph = vi.mocked(useKnowledgeGraph);

const GRAPH: IGetKnowledgeGraphVo = {
  version: 2,
  etag: 'w/"test"',
  nodes: [
    {
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: 'knowledge_core',
      parentId: null,
      rootTypeId: null,
      depth: 0,
      degree: 1,
    },
    {
      id: 'type:root',
      recordId: 'root',
      tier: 'type',
      label: 'Root',
      parentId: null,
      rootTypeId: 'type:root',
      depth: 0,
      degree: 1,
    },
    {
      id: 'type:child',
      recordId: 'child',
      tier: 'type',
      label: 'Child',
      parentId: 'type:root',
      rootTypeId: 'type:root',
      depth: 1,
      degree: 1,
    },
  ],
  links: [],
  stats: {
    typeCount: 2,
    knowledgeCount: 0,
    orphanCount: 0,
    nodeCount: 3,
    linkCount: 0,
    truncated: { nodes: false, links: false },
    cyclesDropped: 0,
    maxDepth: 1,
    relationCount: 0,
    danglingRelations: 0,
  },
};

describe('KnowledgeGraph legend cascade', () => {
  afterEach(() => {
    // The store is a module-level Zustand singleton, so a hidden id set by
    // one test would otherwise leak into the next.
    useKnowledgeGraphStore.getState().reset();
    // This suite's render (unlike the rest of this folder's specs) mounts a
    // live ResizeObserver via useResizeObserver. This repo's customRender
    // doesn't auto-cleanup between tests (see test-utils.tsx), so without an
    // explicit unmount that observer keeps firing after the test body
    // returns and logs a spurious "not wrapped in act" warning.
    cleanup();
  });

  it('dims a child row when only its parent id is in the hidden set', async () => {
    mockedUseKnowledgeGraph.mockReturnValue({
      data: GRAPH,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<KnowledgeGraph />);

    // findBy* (not getBy*) so the initial render — including
    // useResizeObserver's effect, which observes asynchronously — settles
    // inside `act` before we start asserting and clicking.
    const rootRow = await screen.findByRole('button', { name: /Root/ });
    const childRow = await screen.findByRole('button', { name: /Child/ });

    // Before hiding anything, neither row is dimmed.
    expect(rootRow.className).not.toContain('opacity-40');
    expect(childRow.className).not.toContain('opacity-40');

    // The store only ever records the id the user clicked (see
    // useKnowledgeGraphStore.toggleType) — clicking the parent puts only
    // 'type:root' in hiddenTypeIds. The regression this guards against: the
    // legend must still dim the child, because buildSimulationGraph already
    // removes the child's nodes from the canvas via hiddenClosure.
    await userEvent.click(rootRow);
    expect(useKnowledgeGraphStore.getState().hiddenTypeIds).toEqual(['type:root']);

    expect(screen.getByRole('button', { name: /Root/ }).className).toContain('opacity-40');
    expect(screen.getByRole('button', { name: /Child/ }).className).toContain('opacity-40');
  });
});
