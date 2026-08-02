import type { IKnowledgeGraphNode } from '@teable/openapi';
import { vi } from 'vitest';
import { render, screen } from '@/test-utils';
import { KnowledgeGraphLegend } from './KnowledgeGraphLegend';

const typeNode = (id: string, label: string, depth: number): IKnowledgeGraphNode => ({
  id,
  recordId: id.replace('type:', ''),
  tier: 'type',
  label,
  typeId: null,
  parentId: depth === 0 ? null : 'type:root',
  rootTypeId: 'type:root',
  depth,
  degree: 1,
});

// Parents-before-children, as the assembler guarantees; the legend must not re-sort.
const TYPES = [typeNode('type:root', 'Root', 0), typeNode('type:child', 'Child', 1)];

describe('KnowledgeGraphLegend', () => {
  it('indents a row by its depth via paddingLeft, not nesting', () => {
    render(
      <KnowledgeGraphLegend
        types={TYPES}
        hiddenTypeIds={[]}
        onToggleType={vi.fn()}
        onShowAll={vi.fn()}
      />
    );

    const root = screen.getByRole('button', { name: /Root/ });
    const child = screen.getByRole('button', { name: /Child/ });

    expect(root.style.paddingLeft).toBe('0.5rem');
    expect(child.style.paddingLeft).toBe('1.25rem');
    // Every row is a sibling button, never a nested list — the fixed h-6
    // height (and therefore VISIBLE_ROWS' sizing math) depends on that.
    expect(child.parentElement).toBe(root.parentElement);
  });

  it('reports the id the user clicked, not its subtree', () => {
    const onToggleType = vi.fn();
    render(
      <KnowledgeGraphLegend
        types={TYPES}
        hiddenTypeIds={[]}
        onToggleType={onToggleType}
        onShowAll={vi.fn()}
      />
    );

    screen.getByRole('button', { name: /Root/ }).click();

    expect(onToggleType).toHaveBeenCalledWith('type:root');
    expect(onToggleType).toHaveBeenCalledTimes(1);
  });
});
