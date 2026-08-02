/* eslint-disable @typescript-eslint/naming-convention */
import { TYPE_NODE_PREFIX } from '@teable/openapi';
import type { IKnowledgeTypeRow } from './knowledge-graph.assembler';
import { assembleKnowledgeGraph, byTitleThenId } from './knowledge-graph.assembler';
import { breakCycles, resolveHierarchy, orderDepthFirst } from './knowledge-type-tree';

const type = (
  recordId: string,
  title: string,
  parentRecordId: string | null = null
): IKnowledgeTypeRow => ({ recordId, title, parentRecordId });

const OPTS = { maxKnowledgeNodes: 100, maxLinks: 100, coreLabel: 'core', unclassifiedLabel: 'un' };

describe('breakCycles', () => {
  it('treats a self-parent as a root', () => {
    const { parentOf, cyclesDropped } = breakCycles([type('a', 'Alpha', 'a')]);
    expect(parentOf.get('a')).toBeNull();
    expect(cyclesDropped).toBe(1);
  });

  it('cuts the edge deterministically for a two-cycle, based on sorted order', () => {
    const sorted = [type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')].sort(byTitleThenId);
    const { parentOf, cyclesDropped } = breakCycles(sorted);
    // Alpha sorts first, so its own back-edge is the one found closing the
    // cycle and 'a' becomes the root; 'b' keeps pointing at 'a'.
    expect(parentOf.get('a')).toBeNull();
    expect(parentOf.get('b')).toBe('a');
    expect(cyclesDropped).toBe(1);
  });

  it('leaves an acyclic chain untouched', () => {
    const sorted = [type('a', 'Alpha'), type('b', 'Beta', 'a')].sort(byTitleThenId);
    const { parentOf, cyclesDropped } = breakCycles(sorted);
    expect(parentOf.get('a')).toBeNull();
    expect(parentOf.get('b')).toBe('a');
    expect(cyclesDropped).toBe(0);
  });
});

describe('resolveHierarchy', () => {
  it('gives a root depth 0 and a child depth 1 rooted at its parent', () => {
    const parentOf = new Map([
      ['a', null],
      ['b', 'a'],
    ]);
    const { depthOf, rootOf } = resolveHierarchy(parentOf);
    expect(depthOf.get('a')).toBe(0);
    expect(depthOf.get('b')).toBe(1);
    expect(rootOf.get('b')).toBe('a');
  });
});

describe('orderDepthFirst', () => {
  it('emits a parent before its children', () => {
    const sortedTypes = [type('b', 'Beta', 'a'), type('a', 'Alpha')].sort(byTitleThenId);
    const parentOf = new Map([
      ['a', null],
      ['b', 'a'],
    ]);
    const ordered = orderDepthFirst(sortedTypes, parentOf);
    expect(ordered.map((t) => t.recordId)).toEqual(['a', 'b']);
  });
});

/**
 * Regression test for the bug this file's extraction fixed: the graph
 * endpoint (assembleKnowledgeGraph) and the detail endpoint
 * (KnowledgeGraphService#getNode) used to disagree on a cyclic type's parent,
 * because getNode walked the raw `parentRecordId` field with only a `seen`
 * loop-guard instead of consuming breakCycles like the assembler does.
 *
 * This replicates getNode's `chainFrom` walk exactly (same sort, same
 * breakCycles call, same "start from the resolved parentOf, not the raw
 * field" rule added alongside this fix) and asserts it now agrees with the
 * assembler for a two-node cycle — the scenario the bug report was filed
 * against.
 */
const chainFromLikeGetNode = (
  types: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>,
  recordId: string
): string | null => {
  const byRecordId = new Map(types.map((t) => [t.recordId, t]));
  const seen = new Set<string>();
  const chain: string[] = [];
  let current = parentOf.get(recordId) ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byRecordId.get(current);
    if (!node) break;
    chain.push(`${TYPE_NODE_PREFIX}${node.recordId}`);
    current = parentOf.get(current) ?? null;
  }
  return chain[0] ?? null;
};

describe('graph/detail parent agreement (F3 regression)', () => {
  it('reports the same parent for both types in a two-node cycle', () => {
    const types = [type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')];

    const graph = assembleKnowledgeGraph(types, [], OPTS);
    // Normalise to the same "no parent" convention: the graph layer reports
    // the synthetic core node, chainFromLikeGetNode (like getNode) reports
    // null. Only the representation differs — both mean "this is a root".
    const graphParentOf = (recordId: string) => {
      const parentId = graph.nodes.find((n) => n.id === `${TYPE_NODE_PREFIX}${recordId}`)?.parentId;
      return parentId === 'core' ? null : parentId ?? null;
    };

    const sortedTypes = [...types].sort(byTitleThenId);
    const { parentOf } = breakCycles(sortedTypes);

    for (const recordId of ['a', 'b']) {
      const detailParent = chainFromLikeGetNode(types, parentOf, recordId);
      expect(detailParent).toBe(graphParentOf(recordId));
    }

    // Pin the concrete values too, so this test fails loudly (not just
    // vacuously "equal") if breakCycles' tie-break ever changes.
    expect(graphParentOf('a')).toBeNull();
    expect(graphParentOf('b')).toBe('type:a');
  });

  it('reports no parent, not itself, for the root of a self-parented type', () => {
    const types = [type('a', 'Alpha', 'a')];

    const graph = assembleKnowledgeGraph(types, [], OPTS);
    const sortedTypes = [...types].sort(byTitleThenId);
    const { parentOf } = breakCycles(sortedTypes);

    const detailParent = chainFromLikeGetNode(types, parentOf, 'a');
    const graphParent = graph.nodes.find((n) => n.id === 'type:a')?.parentId ?? null;

    // Both mean "root" — 'core' is the graph layer's synthetic node id for
    // it, null is the detail layer's "no parent" — never itself ('type:a').
    expect(detailParent).toBeNull();
    expect(graphParent).toBe('core');
    expect(graphParent).not.toBe('type:a');
  });
});
