import type { IKnowledgeGraphNode } from '@teable/openapi';
import { vi } from 'vitest';
import { render, screen, userEvent } from '@/test-utils';
import { KnowledgeNodeSearch } from './KnowledgeNodeSearch';

const node = (id: string, label: string): IKnowledgeGraphNode => ({
  id,
  recordId: id.replace('kn:', ''),
  tier: 'knowledge',
  label,
  typeId: 'type:t1',
  parentId: 'type:t1',
  rootTypeId: 'type:t1',
  depth: 1,
  degree: 1,
});

const NODES = [node('kn:1', 'Alpha'), node('kn:2', 'Beta')];

describe('KnowledgeNodeSearch', () => {
  /**
   * Emptying the box is the regression: cmdk 1.0.0 schedules selectFirstItem()
   * into a layout effect whenever `search` changes, and its getValidItems()
   * reads `listInnerRef.current.querySelectorAll(...)` with no fallback. Tearing
   * the list out of the tree in the same interaction nulls that ref first, so
   * the effect threw "undefined is not iterable".
   */
  it('empties the query without throwing', async () => {
    render(<KnowledgeNodeSearch nodes={NODES} onSelect={vi.fn()} onClear={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'Alp');
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    await userEvent.clear(input);

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('empties the query without throwing when the clear button is used', async () => {
    const onClear = vi.fn();
    render(<KnowledgeNodeSearch nodes={NODES} onSelect={vi.fn()} onClear={onClear} />);

    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'Alp');

    await userEvent.click(screen.getByRole('button'));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('keeps matching on the typed query', async () => {
    const onSelect = vi.fn();
    render(<KnowledgeNodeSearch nodes={NODES} onSelect={onSelect} onClear={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'bet');

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});
