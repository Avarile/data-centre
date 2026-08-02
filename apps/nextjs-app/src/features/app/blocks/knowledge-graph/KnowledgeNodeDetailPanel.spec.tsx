import type { IGetKnowledgeGraphNodeVo } from '@teable/openapi';
import { vi } from 'vitest';
import { render, screen } from '@/test-utils';
import { useKnowledgeGraphNode } from './hooks/useKnowledgeGraphNode';
import { KnowledgeNodeDetailPanel } from './KnowledgeNodeDetailPanel';

// The hook itself is exercised by its own fetch/react-query wiring; here we
// only need the panel's rendering of whatever it returns, so the network hook
// is mocked at the module boundary rather than through useBaseId + axios.
vi.mock('./hooks/useKnowledgeGraphNode', () => ({
  useKnowledgeGraphNode: vi.fn(),
}));

const mockedUseNode = vi.mocked(useKnowledgeGraphNode);

const detail = (overrides: Partial<IGetKnowledgeGraphNodeVo> = {}): IGetKnowledgeGraphNodeVo => ({
  id: 'kn:1',
  recordId: '1',
  tier: 'knowledge',
  label: 'Leaf',
  context: null,
  parentId: 'type:child',
  parentLabel: 'Child',
  ancestors: [
    { id: 'type:root', label: 'Root' },
    { id: 'type:child', label: 'Child' },
  ],
  relatedCount: 0,
  createdTime: null,
  lastModifiedTime: null,
  ...overrides,
});

// The test i18n stub (config/tests/I18nextTestStubProvider.tsx) ships no
// resources on purpose, "so you can test on translation keys rather than
// translated strings" — t() echoes the key back uninterpolated. So these
// assertions check the key is emitted alongside the *dynamic* data (the
// ancestor labels), and that both blocks are gated on the right condition,
// rather than asserting on interpolated English prose.
describe('KnowledgeNodeDetailPanel', () => {
  it('renders the ancestor chain as a breadcrumb', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedUseNode.mockReturnValue({ data: detail(), isLoading: false, isError: false } as any);

    render(<KnowledgeNodeDetailPanel nodeId="kn:1" siblingCount={0} onClose={vi.fn()} />);

    expect(screen.getByText('knowledgeGraph:detail.path: Root / Child')).toBeInTheDocument();
  });

  it('shows the related-knowledge row only when the count is non-zero', () => {
    mockedUseNode.mockReturnValue({
      data: detail({ relatedCount: 3 }),
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<KnowledgeNodeDetailPanel nodeId="kn:1" siblingCount={0} onClose={vi.fn()} />);

    expect(screen.getByText('knowledgeGraph:detail.related')).toBeInTheDocument();
  });

  it('omits both the breadcrumb and the related row for a root type node', () => {
    mockedUseNode.mockReturnValue({
      data: detail({ ancestors: [], relatedCount: 0 }),
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<KnowledgeNodeDetailPanel nodeId="type:root" siblingCount={0} onClose={vi.fn()} />);

    expect(screen.queryByText(/^knowledgeGraph:detail\.path/)).not.toBeInTheDocument();
    expect(screen.queryByText('knowledgeGraph:detail.related')).not.toBeInTheDocument();
  });
});
