/* eslint-disable @typescript-eslint/naming-convention */
import {
  getKnowledgeGraphVoSchema,
  KNOWLEDGE_CORE_NODE_ID,
  KNOWLEDGE_GRAPH_VERSION,
  UNCLASSIFIED_TYPE_NODE_ID,
} from '@teable/openapi';
import type {
  IAssembleOptions,
  IKnowledgeRow,
  IKnowledgeTypeRow,
} from './knowledge-graph.assembler';
import { assembleKnowledgeGraph } from './knowledge-graph.assembler';

const KNOWLEDGE_KNOWLEDGE = 'knowledge-knowledge' as const;

const OPTS: IAssembleOptions = {
  maxKnowledgeNodes: 100,
  maxLinks: 100,
  coreLabel: 'Knowledge Core',
  unclassifiedLabel: 'Unclassified',
};

const type = (
  recordId: string,
  title: string,
  parentRecordId: string | null = null
): IKnowledgeTypeRow => ({ recordId, title, parentRecordId });

const knowledge = (
  recordId: string,
  title: string,
  typeRecordId: string | null = null,
  relatedRecordIds: string[] = []
): IKnowledgeRow => ({ recordId, title, typeRecordId, relatedRecordIds });

describe('assembleKnowledgeGraph', () => {
  it('emits exactly one core node for empty input', () => {
    const graph = assembleKnowledgeGraph([], [], OPTS);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toEqual({
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: OPTS.coreLabel,
      parentId: null,
      rootTypeId: null,
      depth: 0,
      degree: 0,
    });
    expect(graph.links).toHaveLength(0);
    expect(graph.stats).toEqual({
      typeCount: 0,
      knowledgeCount: 0,
      orphanCount: 0,
      nodeCount: 1,
      linkCount: 0,
      truncated: { nodes: false, links: false },
      cyclesDropped: 0,
      maxDepth: 0,
      relationCount: 0,
      danglingRelations: 0,
    });
  });

  it('emits childless types with degree 0 and no unclassified node', () => {
    const graph = assembleKnowledgeGraph([type('recT1', 'Beta'), type('recT2', 'Alpha')], [], OPTS);

    const typeNodes = graph.nodes.filter((n) => n.tier === 'type');
    expect(typeNodes.map((n) => n.label)).toEqual(['Alpha', 'Beta']);
    expect(typeNodes.every((n) => n.degree === 0)).toBe(true);
    expect(graph.nodes.some((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID)).toBe(false);
    expect(graph.stats.typeCount).toBe(2);
    expect(graph.links).toHaveLength(2);
    expect(graph.links.every((l) => l.tier === 'core-type' && l.value === 0)).toBe(true);
  });

  it('attaches a validly linked knowledge to its type', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [knowledge('recK1', 'Note', 'recT1')],
      OPTS
    );

    const node = graph.nodes.find((n) => n.id === 'kn:recK1');
    expect(node).toMatchObject({ tier: 'knowledge', parentId: 'type:recT1', recordId: 'recK1' });

    const childLinks = graph.links.filter((l) => l.tier === 'type-knowledge');
    expect(childLinks).toEqual([
      { source: 'type:recT1', target: 'kn:recK1', tier: 'type-knowledge', value: 1, distance: 70 },
    ]);
    expect(graph.stats.orphanCount).toBe(0);
  });

  it('buckets unlinked and unresolvable knowledges under a single unclassified node', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [
        knowledge('recK1', 'No link', null),
        knowledge('recK2', 'Dangling', 'recDeleted'),
        knowledge('recK3', 'Also dangling', 'recMissing'),
      ],
      OPTS
    );

    const unclassified = graph.nodes.filter((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID);
    expect(unclassified).toHaveLength(1);
    expect(unclassified[0]).toMatchObject({ tier: 'type', recordId: null, degree: 3 });

    const orphanNodes = graph.nodes.filter((n) => n.parentId === UNCLASSIFIED_TYPE_NODE_ID);
    expect(orphanNodes).toHaveLength(3);
    expect(graph.stats.orphanCount).toBe(3);
  });

  it('omits the unclassified node and its link when there are no orphans', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [knowledge('recK1', 'Note', 'recT1')],
      OPTS
    );

    expect(graph.nodes.some((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID)).toBe(false);
    expect(graph.links.some((l) => l.target === UNCLASSIFIED_TYPE_NODE_ID)).toBe(false);
    expect(graph.stats.typeCount).toBe(1);
  });

  it('keeps node ids unique even when a type and a knowledge share a record id', () => {
    const graph = assembleKnowledgeGraph(
      [type('recSame', 'Alpha')],
      [knowledge('recSame', 'Note', 'recSame'), knowledge('recOther', 'Orphan', null)],
      OPTS
    );

    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('type:recSame');
    expect(ids).toContain('kn:recSame');
  });

  it('is deterministic under input reordering', () => {
    const types = [type('recT2', 'Beta'), type('recT1', 'Alpha'), type('recT3', 'Alpha')];
    const knowledges = [
      knowledge('recK3', 'Gamma', 'recT2'),
      knowledge('recK1', 'Alpha', 'recT1'),
      knowledge('recK2', 'Beta', null),
    ];

    const first = assembleKnowledgeGraph(types, knowledges, OPTS);
    const second = assembleKnowledgeGraph([...types].reverse(), [...knowledges].reverse(), OPTS);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('truncates to the node budget and reports it', () => {
    const knowledges = Array.from({ length: 5 }, (_, i) =>
      knowledge(`recK${i}`, `Note ${i}`, 'recT1')
    );
    const graph = assembleKnowledgeGraph([type('recT1', 'Alpha')], knowledges, {
      ...OPTS,
      maxKnowledgeNodes: 3,
    });

    expect(graph.stats.truncated).toEqual({ nodes: true, links: false });
    expect(graph.stats.knowledgeCount).toBe(3);
    expect(graph.nodes.filter((n) => n.tier === 'knowledge')).toHaveLength(3);
  });

  it('drops the unclassified node when truncation removes every orphan', () => {
    // Orphans sort last by title, so the budget drops exactly them.
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [
        knowledge('recK1', 'aaa typed', 'recT1'),
        knowledge('recK2', 'bbb typed', 'recT1'),
        knowledge('recK3', 'zzz orphan', null),
      ],
      { ...OPTS, maxKnowledgeNodes: 2 }
    );

    expect(graph.stats.truncated).toEqual({ nodes: true, links: false });
    expect(graph.stats.orphanCount).toBe(0);
    expect(graph.nodes.some((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID)).toBe(false);
    expect(graph.links.some((l) => l.target === UNCLASSIFIED_TYPE_NODE_ID)).toBe(false);
  });

  it('never reports more orphans than emitted knowledges', () => {
    const cases: Array<[IKnowledgeTypeRow[], IKnowledgeRow[], number]> = [
      [[], [knowledge('recK1', 'a', null)], 100],
      [[type('recT1', 'Alpha')], [knowledge('recK1', 'a', 'recT1')], 100],
      [[type('recT1', 'Alpha')], [knowledge('recK1', 'a', null), knowledge('recK2', 'b', null)], 1],
      [[], [], 100],
    ];

    for (const [types, knowledges, maxKnowledgeNodes] of cases) {
      const { stats } = assembleKnowledgeGraph(types, knowledges, { ...OPTS, maxKnowledgeNodes });
      expect(stats.orphanCount).toBeLessThanOrEqual(stats.knowledgeCount);
    }
  });

  it('gives every knowledge node a parentId that resolves to an emitted type node', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha'), type('recT2', 'Beta')],
      [
        knowledge('recK1', 'a', 'recT1'),
        knowledge('recK2', 'b', 'recT2'),
        knowledge('recK3', 'c', null),
        knowledge('recK4', 'd', 'recGone'),
      ],
      OPTS
    );

    const typeIds = new Set(graph.nodes.filter((n) => n.tier === 'type').map((n) => n.id));
    const knowledgeNodes = graph.nodes.filter((n) => n.tier === 'knowledge');

    expect(knowledgeNodes).toHaveLength(4);
    for (const node of knowledgeNodes) {
      expect(node.parentId).not.toBeNull();
      expect(typeIds.has(node.parentId as string)).toBe(true);
    }
  });

  describe('v2 node fields', () => {
    it('gives every type a core parent, itself as root, and depth 0', () => {
      const graph = assembleKnowledgeGraph([type('recT1', 'Alpha')], [], OPTS);
      const alpha = graph.nodes.find((n) => n.id === 'type:recT1');

      expect(alpha).toMatchObject({
        parentId: KNOWLEDGE_CORE_NODE_ID,
        rootTypeId: 'type:recT1',
        depth: 0,
      });
    });

    it('parents a knowledge onto its type and puts it one level deeper', () => {
      const graph = assembleKnowledgeGraph(
        [type('recT1', 'Alpha')],
        [knowledge('recK1', 'one', 'recT1')],
        OPTS
      );
      const kn = graph.nodes.find((n) => n.id === 'kn:recK1');

      expect(kn).toMatchObject({
        parentId: 'type:recT1',
        rootTypeId: 'type:recT1',
        depth: 1,
      });
    });

    it('roots an unclassified knowledge on the synthetic bucket', () => {
      const graph = assembleKnowledgeGraph([], [knowledge('recK1', 'one')], OPTS);
      const kn = graph.nodes.find((n) => n.id === 'kn:recK1');

      expect(kn).toMatchObject({
        parentId: UNCLASSIFIED_TYPE_NODE_ID,
        rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
        depth: 1,
      });
    });
  });

  it('emits a payload that satisfies the published contract', () => {
    const graph = assembleKnowledgeGraph(
      [type('recT1', 'Alpha')],
      [knowledge('recK1', 'a', 'recT1'), knowledge('recK2', 'b', null)],
      OPTS
    );

    expect(() =>
      getKnowledgeGraphVoSchema.parse({
        version: KNOWLEDGE_GRAPH_VERSION,
        etag: '"test-etag"',
        ...graph,
      })
    ).not.toThrow();
  });
});

describe('nested types', () => {
  it('reports depth and root ancestor down a three-level chain', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    const at = (id: string) => graph.nodes.find((n) => n.id === `type:${id}`);

    expect(at('a')).toMatchObject({ parentId: 'core', rootTypeId: 'type:a', depth: 0 });
    expect(at('b')).toMatchObject({ parentId: 'type:a', rootTypeId: 'type:a', depth: 1 });
    expect(at('c')).toMatchObject({ parentId: 'type:b', rootTypeId: 'type:a', depth: 2 });
    expect(graph.stats.maxDepth).toBe(2);
  });

  it('links core to roots only, and parents to children', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha'), type('b', 'Beta', 'a')], [], OPTS);

    expect(graph.links.filter((l) => l.tier === 'core-type').map((l) => l.target)).toEqual([
      'type:a',
    ]);
    expect(graph.links.filter((l) => l.tier === 'type-parent')).toEqual([
      {
        source: 'type:a',
        target: 'type:b',
        tier: 'type-parent',
        value: 1,
        distance: expect.any(Number),
      },
    ]);
  });

  it('counts child types and child knowledges in a type degree', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a')],
      [knowledge('k1', 'one', 'a')],
      OPTS
    );

    expect(graph.nodes.find((n) => n.id === 'type:a')?.degree).toBe(2);
  });

  it('gives a knowledge its type depth plus one, and the type root', () => {
    const graph = assembleKnowledgeGraph(
      [type('a', 'Alpha'), type('b', 'Beta', 'a')],
      [knowledge('k1', 'one', 'b')],
      OPTS
    );

    expect(graph.nodes.find((n) => n.id === 'kn:k1')).toMatchObject({
      parentId: 'type:b',
      rootTypeId: 'type:a',
      depth: 2,
    });
  });

  it('treats a self-parent as a root and counts it', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha', 'a')], [], OPTS);

    expect(graph.nodes.find((n) => n.id === 'type:a')).toMatchObject({
      parentId: 'core',
      depth: 0,
    });
    expect(graph.stats.cyclesDropped).toBe(1);
  });

  it('breaks a two-cycle and a three-cycle without hanging', () => {
    const two = assembleKnowledgeGraph([type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')], [], OPTS);
    expect(two.stats.cyclesDropped).toBe(1);
    expect(two.nodes.filter((n) => n.tier === 'type' && n.parentId === 'core')).toHaveLength(1);

    const three = assembleKnowledgeGraph(
      [type('a', 'Alpha', 'c'), type('b', 'Beta', 'a'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    expect(three.stats.cyclesDropped).toBe(1);
  });

  it('drops the SAME edge on every run, because the ETag depends on it', () => {
    const rows = () => [type('a', 'Alpha', 'b'), type('b', 'Beta', 'a')];
    const first = assembleKnowledgeGraph(rows(), [], OPTS);
    const again = assembleKnowledgeGraph(rows(), [], OPTS);

    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it('treats a parent pointing at a missing type as a root, not as a drop', () => {
    const graph = assembleKnowledgeGraph([type('a', 'Alpha', 'ghost')], [], OPTS);

    expect(graph.nodes.find((n) => n.id === 'type:a')).toMatchObject({
      parentId: 'core',
      depth: 0,
    });
    expect(graph.stats.cyclesDropped).toBe(0);
  });

  it('emits parents before their children', () => {
    const graph = assembleKnowledgeGraph(
      [type('b', 'Beta', 'a'), type('a', 'Alpha'), type('c', 'Gamma', 'b')],
      [],
      OPTS
    );
    const order = graph.nodes.filter((n) => n.tier === 'type').map((n) => n.id);

    expect(order).toEqual(['type:a', 'type:b', 'type:c']);
  });
});

describe('relations', () => {
  const OPTS_L = { ...OPTS, maxLinks: 100 };

  it('emits a symmetric relation exactly once', () => {
    const graph = assembleKnowledgeGraph(
      [],
      [knowledge('k1', 'one', null, ['k2']), knowledge('k2', 'two', null, ['k1'])],
      OPTS_L
    );
    const relations = graph.links.filter((l) => l.tier === KNOWLEDGE_KNOWLEDGE);

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ source: 'kn:k1', target: 'kn:k2', value: 1 });
    expect(graph.stats.relationCount).toBe(1);
  });

  it('counts relations in degree on both endpoints', () => {
    const graph = assembleKnowledgeGraph(
      [],
      [
        knowledge('k1', 'one', null, ['k2', 'k3']),
        knowledge('k2', 'two', null, ['k1']),
        knowledge('k3', 'three', null, ['k1']),
      ],
      OPTS_L
    );

    expect(graph.nodes.find((n) => n.id === 'kn:k1')?.degree).toBe(3); // its type + 2 relations
    expect(graph.nodes.find((n) => n.id === 'kn:k2')?.degree).toBe(2);
  });

  it('drops a relation to a record outside the emitted set', () => {
    const graph = assembleKnowledgeGraph([], [knowledge('k1', 'one', null, ['ghost'])], OPTS_L);

    expect(graph.links.filter((l) => l.tier === KNOWLEDGE_KNOWLEDGE)).toHaveLength(0);
    expect(graph.stats.danglingRelations).toBe(1);
  });

  it('drops a self-relation', () => {
    const graph = assembleKnowledgeGraph([], [knowledge('k1', 'one', null, ['k1'])], OPTS_L);

    expect(graph.links.filter((l) => l.tier === KNOWLEDGE_KNOWLEDGE)).toHaveLength(0);
    expect(graph.stats.danglingRelations).toBe(1);
  });

  it('truncates relations but never structural links', () => {
    const types = [type('a', 'Alpha')];
    const rows = [
      knowledge('k1', 'one', 'a', ['k2', 'k3']),
      knowledge('k2', 'two', 'a', ['k1', 'k3']),
      knowledge('k3', 'three', 'a', ['k1', 'k2']),
    ];
    // 1 core-type + 3 type-knowledge = 4 structural, leaving room for 1 relation.
    const graph = assembleKnowledgeGraph(types, rows, { ...OPTS, maxLinks: 5 });

    expect(graph.links.filter((l) => l.tier !== KNOWLEDGE_KNOWLEDGE)).toHaveLength(4);
    expect(graph.links.filter((l) => l.tier === KNOWLEDGE_KNOWLEDGE)).toHaveLength(1);
    expect(graph.stats.truncated).toEqual({ nodes: false, links: true });
  });

  it('orders relations deterministically', () => {
    const rows = () => [
      knowledge('k3', 'three', null, ['k1']),
      knowledge('k1', 'one', null, ['k3', 'k2']),
      knowledge('k2', 'two', null, ['k1']),
    ];
    expect(JSON.stringify(assembleKnowledgeGraph([], rows(), OPTS_L))).toBe(
      JSON.stringify(assembleKnowledgeGraph([], rows(), OPTS_L))
    );
  });
});
