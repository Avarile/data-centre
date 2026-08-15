import type { IGetKnowledgeGraphVo, IKnowledgeGraphNode } from '@teable/openapi';
import { UNCLASSIFIED_TYPE_NODE_ID } from '@teable/openapi';
import {
  buildSimulationGraph,
  hiddenClosure,
  isLinkVisible,
  isNodeVisible,
  linkEndpointId,
} from './buildSimulationGraph';
import type { IVector3 } from './graphTheme';
import {
  chargeFor,
  CHARGE_DISTANCE_MAX,
  colorForNode,
  CORE_COLOR,
  KNOWLEDGE_NODE_VAL,
  linkDistanceFor,
  linkStrengthFor,
  nodeValFor,
  standoffPosition,
  UNCLASSIFIED_COLOR,
} from './graphTheme';

const TYPE_KNOWLEDGE = 'type-knowledge' as const;
const KNOWLEDGE_KNOWLEDGE = 'knowledge-knowledge' as const;
const KNOWLEDGE_PARENT = 'knowledge-parent' as const;
/** Stands in for a tier the code has never heard of — the NaN-position guard. */
const UNKNOWN_TIER = 'not-a-tier';
/** sonarjs/no-duplicate-string: this etag literal is reused across nesting fixtures. */
const TEST_ETAG = '"kg3-test"';

const graph: IGetKnowledgeGraphVo = {
  version: 3,
  etag: TEST_ETAG,
  nodes: [
    {
      id: 'core',
      recordId: null,
      tier: 'core',
      label: 'core',
      parentId: null,
      rootTypeId: null,
      depth: 0,
      degree: 2,
    },
    {
      id: 'type:a',
      recordId: 'recA',
      tier: 'type',
      label: 'Alpha',
      parentId: 'core',
      rootTypeId: 'type:a',
      depth: 0,
      degree: 1,
    },
    {
      id: 'type:b',
      recordId: 'recB',
      tier: 'type',
      label: 'Beta',
      parentId: 'core',
      rootTypeId: 'type:b',
      depth: 0,
      degree: 1,
    },
    {
      id: 'kn:1',
      recordId: 'rec1',
      tier: 'knowledge',
      label: 'one',
      parentId: 'type:a',
      rootTypeId: 'type:a',
      depth: 1,
      degree: 1,
    },
    {
      id: 'kn:2',
      recordId: 'rec2',
      tier: 'knowledge',
      label: 'two',
      parentId: 'type:b',
      rootTypeId: 'type:b',
      depth: 1,
      degree: 1,
    },
  ],
  links: [
    { source: 'core', target: 'type:a', tier: 'core-type', value: 1, distance: 260 },
    { source: 'core', target: 'type:b', tier: 'core-type', value: 1, distance: 260 },
    { source: 'type:a', target: 'kn:1', tier: TYPE_KNOWLEDGE, value: 1, distance: 70 },
    { source: 'type:b', target: 'kn:2', tier: TYPE_KNOWLEDGE, value: 1, distance: 70 },
  ],
  stats: {
    typeCount: 2,
    knowledgeCount: 2,
    orphanCount: 0,
    nodeCount: 5,
    linkCount: 4,
    truncated: { nodes: false, links: false },
    cyclesDropped: 0,
    maxDepth: 0,
    maxKnowledgeDepth: 0,
    knowledgeCyclesDropped: 0,
    relationCount: 0,
    danglingRelations: 0,
  },
};

describe('buildSimulationGraph', () => {
  it('returns an empty graph for undefined data', () => {
    expect(buildSimulationGraph(undefined, [])).toEqual({ nodes: [], links: [] });
  });

  it('passes everything through when nothing is hidden', () => {
    const result = buildSimulationGraph(graph, []);

    expect(result.nodes).toHaveLength(5);
    expect(result.links).toHaveLength(4);
  });

  it('drops a hidden type together with its children and their links', () => {
    const result = buildSimulationGraph(graph, ['type:a']);

    expect(result.nodes.map((n) => n.id)).toEqual(['core', 'type:b', 'kn:2']);
    expect(result.links).toHaveLength(2);
    expect(result.links.every((l) => l.source !== 'type:a' && l.target !== 'type:a')).toBe(true);
  });

  it('keeps the core node even when every type is hidden', () => {
    const result = buildSimulationGraph(graph, ['type:a', 'type:b']);

    expect(result.nodes.map((n) => n.id)).toEqual(['core']);
    expect(result.links).toHaveLength(0);
  });

  it('clones nodes and links so the query cache cannot be mutated', () => {
    const result = buildSimulationGraph(graph, []);

    expect(result.nodes[0]).not.toBe(graph.nodes[0]);
    expect(result.links[0]).not.toBe(graph.links[0]);

    // Simulate what react-force-graph does to what it is handed.
    result.nodes[0].x = 42;
    expect(graph.nodes[0]).not.toHaveProperty('x');
  });
});

describe('visibility', () => {
  it('hides the core node and its spokes, and nothing else', () => {
    const result = buildSimulationGraph(graph, []);

    expect(result.nodes.filter((n) => !isNodeVisible(n)).map((n) => n.id)).toEqual(['core']);
    expect(result.links.filter((l) => !isLinkVisible(l)).map((l) => l.target)).toEqual([
      'type:a',
      'type:b',
    ]);
    expect(result.nodes.filter(isNodeVisible)).toHaveLength(4);
    expect(result.links.filter(isLinkVisible)).toHaveLength(2);
  });

  it('keeps the core in the simulation graph so the branches stay connected', () => {
    // Load-bearing: three-forcegraph filters only its render digest by
    // visibility, so the hidden core still anchors every type branch. If it were
    // filtered out of graphData instead, each type would become its own
    // disconnected component.
    const result = buildSimulationGraph(graph, []);

    expect(result.nodes.some((n) => n.id === 'core')).toBe(true);
    expect(result.links.some((l) => l.source === 'core')).toBe(true);
  });
});

describe('hidden subtree closure', () => {
  const nodes = [
    { id: 'core', tier: 'core', parentId: null, rootTypeId: null, depth: 0 },
    { id: 'type:a', tier: 'type', parentId: 'core', rootTypeId: 'type:a', depth: 0 },
    { id: 'type:b', tier: 'type', parentId: 'type:a', rootTypeId: 'type:a', depth: 1 },
    { id: 'type:c', tier: 'type', parentId: 'type:b', rootTypeId: 'type:a', depth: 2 },
    { id: 'type:z', tier: 'type', parentId: 'core', rootTypeId: 'type:z', depth: 0 },
  ] as unknown as IKnowledgeGraphNode[];

  it('hides grandchildren when a root is hidden', () => {
    expect(hiddenClosure(nodes, ['type:a'])).toEqual(new Set(['type:a', 'type:b', 'type:c']));
  });

  it('leaves siblings alone when a leaf type is hidden', () => {
    expect(hiddenClosure(nodes, ['type:c'])).toEqual(new Set(['type:c']));
  });

  it('is empty when nothing is hidden', () => {
    expect(hiddenClosure(nodes, [])).toEqual(new Set());
  });

  it('cascades through nested knowledge, not just types', () => {
    // The v2 closure gated on tier === 'type', so kn:2 — whose parent is a
    // KNOWLEDGE, not a type — survived hiding type:a and rendered as an
    // edgeless node floating in the scene.
    const nested = [
      { id: 'core', tier: 'core', parentId: null },
      { id: 'type:a', tier: 'type', parentId: 'core' },
      { id: 'kn:1', tier: 'knowledge', parentId: 'type:a' },
      { id: 'kn:2', tier: 'knowledge', parentId: 'kn:1' },
      { id: 'kn:3', tier: 'knowledge', parentId: 'kn:2' },
      { id: 'type:z', tier: 'type', parentId: 'core' },
      { id: 'kn:9', tier: 'knowledge', parentId: 'type:z' },
    ] as unknown as IKnowledgeGraphNode[];

    expect(hiddenClosure(nested, ['type:a'])).toEqual(new Set(['type:a', 'kn:1', 'kn:2', 'kn:3']));
  });

  it('hides a knowledge subtree without touching its type', () => {
    const nested = [
      { id: 'core', tier: 'core', parentId: null },
      { id: 'type:a', tier: 'type', parentId: 'core' },
      { id: 'kn:1', tier: 'knowledge', parentId: 'type:a' },
      { id: 'kn:2', tier: 'knowledge', parentId: 'kn:1' },
    ] as unknown as IKnowledgeGraphNode[];

    expect(hiddenClosure(nested, ['kn:1'])).toEqual(new Set(['kn:1', 'kn:2']));
  });
});

describe('buildSimulationGraph with nesting', () => {
  it('drops a knowledge whose ancestor type is hidden', () => {
    const graph = {
      version: 2,
      etag: TEST_ETAG,
      nodes: [
        {
          id: 'core',
          recordId: null,
          tier: 'core',
          label: 'core',
          parentId: null,
          rootTypeId: null,
          depth: 0,
          degree: 1,
        },
        {
          id: 'type:a',
          recordId: 'a',
          tier: 'type',
          label: 'A',
          parentId: 'core',
          rootTypeId: 'type:a',
          depth: 0,
          degree: 1,
        },
        {
          id: 'type:b',
          recordId: 'b',
          tier: 'type',
          label: 'B',
          parentId: 'type:a',
          rootTypeId: 'type:a',
          depth: 1,
          degree: 1,
        },
        {
          id: 'kn:1',
          recordId: '1',
          tier: 'knowledge',
          label: 'k',
          parentId: 'type:b',
          rootTypeId: 'type:a',
          depth: 2,
          degree: 1,
        },
      ],
      links: [],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    const result = buildSimulationGraph(graph, ['type:a']);
    expect(result.nodes.map((n) => n.id)).toEqual(['core']);
  });

  it('drops a relation when either endpoint is hidden', () => {
    const graph = {
      version: 2,
      etag: TEST_ETAG,
      nodes: [
        {
          id: 'core',
          recordId: null,
          tier: 'core',
          label: 'core',
          parentId: null,
          rootTypeId: null,
          depth: 0,
          degree: 2,
        },
        {
          id: 'type:a',
          recordId: 'a',
          tier: 'type',
          label: 'A',
          parentId: 'core',
          rootTypeId: 'type:a',
          depth: 0,
          degree: 1,
        },
        {
          id: 'type:b',
          recordId: 'b',
          tier: 'type',
          label: 'B',
          parentId: 'core',
          rootTypeId: 'type:b',
          depth: 0,
          degree: 1,
        },
        {
          id: 'kn:1',
          recordId: '1',
          tier: 'knowledge',
          label: 'k1',
          parentId: 'type:a',
          rootTypeId: 'type:a',
          depth: 1,
          degree: 2,
        },
        {
          id: 'kn:2',
          recordId: '2',
          tier: 'knowledge',
          label: 'k2',
          parentId: 'type:b',
          rootTypeId: 'type:b',
          depth: 1,
          degree: 2,
        },
      ],
      links: [
        { source: 'kn:1', target: 'kn:2', tier: KNOWLEDGE_KNOWLEDGE, value: 1, distance: 140 },
      ],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    expect(buildSimulationGraph(graph, []).links).toHaveLength(1);
    expect(buildSimulationGraph(graph, ['type:b']).links).toHaveLength(0);
  });

  it('drops a nested knowledge and its edge when its ancestor type is hidden', () => {
    const graph = {
      version: 3,
      etag: TEST_ETAG,
      nodes: [
        { id: 'core', recordId: null, tier: 'core', label: 'core', parentId: null },
        { id: 'type:a', recordId: 'a', tier: 'type', label: 'A', parentId: 'core' },
        { id: 'kn:1', recordId: '1', tier: 'knowledge', label: 'k1', parentId: 'type:a' },
        { id: 'kn:2', recordId: '2', tier: 'knowledge', label: 'k2', parentId: 'kn:1' },
      ],
      links: [
        { source: 'type:a', target: 'kn:1', tier: TYPE_KNOWLEDGE, value: 1, distance: 70 },
        { source: 'kn:1', target: 'kn:2', tier: KNOWLEDGE_PARENT, value: 1, distance: 50 },
      ],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    // The regression this guards: kn:2 used to survive (its parent is a kn: id,
    // which the type-only closure never held), then lose both its edges to the
    // endpoint filter and float in the scene with nothing attached.
    const result = buildSimulationGraph(graph, ['type:a']);
    expect(result.nodes.map((n) => n.id)).toEqual(['core']);
    expect(result.links).toHaveLength(0);
  });

  it('keeps a nested knowledge attached when nothing is hidden', () => {
    const graph = {
      version: 3,
      etag: TEST_ETAG,
      nodes: [
        { id: 'core', recordId: null, tier: 'core', label: 'core', parentId: null },
        { id: 'type:a', recordId: 'a', tier: 'type', label: 'A', parentId: 'core' },
        { id: 'kn:1', recordId: '1', tier: 'knowledge', label: 'k1', parentId: 'type:a' },
        { id: 'kn:2', recordId: '2', tier: 'knowledge', label: 'k2', parentId: 'kn:1' },
      ],
      links: [{ source: 'kn:1', target: 'kn:2', tier: KNOWLEDGE_PARENT, value: 1, distance: 50 }],
      stats: {} as never,
    } as unknown as IGetKnowledgeGraphVo;

    const result = buildSimulationGraph(graph, []);
    expect(result.nodes).toHaveLength(4);
    // A knowledge-parent edge is drawn, unlike core-type which is simulated
    // but never rendered.
    expect(result.links.filter(isLinkVisible)).toHaveLength(1);
  });
});

describe('linkEndpointId', () => {
  it('handles both the pre-tick string and the post-tick node object', () => {
    expect(linkEndpointId('core')).toBe('core');
    expect(linkEndpointId({ id: 'type:a' })).toBe('type:a');
    expect(linkEndpointId(undefined)).toBe('');
  });
});

describe('nodeValFor', () => {
  // Rendered radius is cbrt(nodeVal) * nodeRelSize.
  const radius = (val: number) => Math.cbrt(val);

  it('keeps the tier hierarchy at every degree, including childless types', () => {
    const core = radius(nodeValFor('core', 25));

    // Both tiers swept, not just types: knowledge nodes grow with degree since
    // v3, so the invariant is now "the largest knowledge stays under the
    // smallest type" rather than "a fixed leaf stays under every type".
    for (const typeDegree of [0, 1, 5, 6, 7, 25, 40, 500]) {
      const type = radius(nodeValFor('type', typeDegree));
      for (const knowledgeDegree of [0, 1, 2, 5, 13, 40, 500]) {
        expect(type).toBeGreaterThan(radius(nodeValFor('knowledge', knowledgeDegree)));
      }
      expect(type).toBeLessThan(core);
    }
  });

  it('grows type nodes monotonically with degree and caps them', () => {
    expect(nodeValFor('type', 40)).toBeGreaterThan(nodeValFor('type', 10));
    expect(nodeValFor('type', 500)).toBe(nodeValFor('type', 40));
  });

  it('grows a parent knowledge with its children, leaving leaves untouched', () => {
    // A leaf carries exactly one structural edge, so degree 1 must stay at the
    // pre-v3 constant — otherwise every node in the scene changes size.
    expect(nodeValFor('knowledge', 1)).toBe(KNOWLEDGE_NODE_VAL);
    expect(nodeValFor('knowledge', 0)).toBe(KNOWLEDGE_NODE_VAL);
    expect(nodeValFor('knowledge', 4)).toBeGreaterThan(nodeValFor('knowledge', 1));
    expect(nodeValFor('knowledge', 500)).toBe(nodeValFor('knowledge', 13));
  });

  it('falls back to the leaf size for an unknown tier', () => {
    // An unknown tier returning undefined would make d3 produce NaN positions
    // and render an empty scene with no error at all.
    expect(nodeValFor(UNKNOWN_TIER, 3)).toBe(nodeValFor('knowledge', 1));
  });
});

describe('linkStrengthFor', () => {
  it('keeps the core tether far slacker than a type holds its own leaves', () => {
    // The whole anti-star layout rests on this ordering. Raise the core-type
    // strength towards the type-knowledge one and every type is dragged back
    // onto a single sphere around the core, which is the radial look this
    // replaced.
    expect(linkStrengthFor('core-type')).toBeLessThan(linkStrengthFor(TYPE_KNOWLEDGE));
  });

  it('falls back to a usable strength for an unknown tier', () => {
    // Same NaN failure mode as the other tier lookups: undefined here makes d3
    // compute NaN positions and the scene renders empty with no error at all.
    expect(Number.isFinite(linkStrengthFor(UNKNOWN_TIER))).toBe(true);
    expect(linkStrengthFor(UNKNOWN_TIER)).toBeGreaterThan(0);
  });
});

describe('force tiers for v2 links', () => {
  it('holds a subtree tighter than it holds a peer relation', () => {
    expect(linkStrengthFor('type-parent')).toBeGreaterThan(linkStrengthFor(KNOWLEDGE_KNOWLEDGE));
    expect(linkDistanceFor(KNOWLEDGE_KNOWLEDGE)).toBeGreaterThan(linkDistanceFor('type-parent'));
  });

  it('keeps a relation weaker than the link holding a leaf to its type, so relations bend the layout instead of dominating it', () => {
    expect(linkStrengthFor(KNOWLEDGE_KNOWLEDGE)).toBeLessThan(linkStrengthFor(TYPE_KNOWLEDGE));
  });

  it('still falls back for an unknown tier', () => {
    expect(Number.isFinite(linkStrengthFor(UNKNOWN_TIER))).toBe(true);
    expect(Number.isFinite(linkDistanceFor(UNKNOWN_TIER))).toBe(true);
  });
});

describe('force tiers for nested knowledge', () => {
  it('binds a nested knowledge tighter than a type binds its own leaves', () => {
    // Both halves matter: shorter AND stiffer, so a nested group reads as a
    // sub-lobe inside its cluster rather than as more leaves of the type.
    expect(linkDistanceFor(KNOWLEDGE_PARENT)).toBeLessThan(linkDistanceFor(TYPE_KNOWLEDGE));
    expect(linkStrengthFor(KNOWLEDGE_PARENT)).toBeGreaterThan(linkStrengthFor(TYPE_KNOWLEDGE));
  });

  it('resolves from the table rather than the unknown-tier fallback', () => {
    // The `??` fallbacks are deliberately forgiving, so a tier missing from
    // LINK_DISTANCE/LINK_STRENGTH degrades silently to a neutral edge instead
    // of failing. This is what would catch that.
    expect(linkDistanceFor(KNOWLEDGE_PARENT)).not.toBe(linkDistanceFor(UNKNOWN_TIER));
    expect(linkStrengthFor(KNOWLEDGE_PARENT)).not.toBe(linkStrengthFor(UNKNOWN_TIER));
  });

  it('keeps the nesting edge inside the charge cap that bounds a cluster', () => {
    // CHARGE_DISTANCE_MAX must stay above the cluster radius or neighbouring
    // clusters interpenetrate. Nesting grows that radius, so the two are
    // coupled — see the note on CHARGE_DISTANCE_MAX.
    expect(linkDistanceFor(TYPE_KNOWLEDGE) + linkDistanceFor(KNOWLEDGE_PARENT)).toBeLessThan(
      CHARGE_DISTANCE_MAX
    );
  });
});

describe('chargeFor', () => {
  it('leaves the core with no charge so it cannot push the scene outwards', () => {
    // A charge on the hub every branch hangs from is a force pointing away from
    // the scene centre applied to every node at once. 0 must survive the `??`
    // fallback rather than being read as absent.
    expect(chargeFor('core')).toBe(0);
  });

  it('still repels the visible tiers, and types more than leaves', () => {
    expect(chargeFor('knowledge')).toBeLessThan(0);
    expect(chargeFor('type')).toBeLessThan(chargeFor('knowledge'));
  });
});

describe('standoffPosition', () => {
  const distanceBetween = (a: IVector3, b: IVector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  it('holds the requested distance and keeps the current viewing direction', () => {
    const target = { x: 10, y: 0, z: 0 };
    // 30 units away along +x; pulling back to 60 should stay on that axis.
    const result = standoffPosition({ x: 40, y: 0, z: 0 }, target, 60);

    expect(result).toEqual({ x: 70, y: 0, z: 0 });
    expect(distanceBetween(result, target)).toBeCloseTo(60);
  });

  it('pulls back rather than only pushing out', () => {
    const target = { x: 0, y: 0, z: 0 };
    const result = standoffPosition({ x: 0, y: 900, z: 0 }, target, 60);

    expect(result).toEqual({ x: 0, y: 60, z: 0 });
  });

  it('backs off along +z when the camera already sits on the target', () => {
    // Zero length: the core sits at the hub, so this is reachable rather than
    // theoretical, and dividing by it would put NaN into the camera.
    expect(standoffPosition({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }, 60)).toEqual({
      x: 5,
      y: 5,
      z: 65,
    });
  });

  it('never propagates a NaN coordinate into the camera', () => {
    const result = standoffPosition({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 60);

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });
});

describe('colorForNode', () => {
  it('uses the fixed core colour', () => {
    expect(colorForNode({ tier: 'core', id: 'core', rootTypeId: null, depth: 0 })).toBe(CORE_COLOR);
  });

  it('uses the neutral colour for the unclassified bucket and its children', () => {
    expect(
      colorForNode({
        tier: 'type',
        id: UNCLASSIFIED_TYPE_NODE_ID,
        rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
        depth: 0,
      })
    ).toBe(UNCLASSIFIED_COLOR);
    expect(
      colorForNode({
        tier: 'knowledge',
        id: 'kn:9',
        rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
        depth: 1,
      })
    ).toBe(UNCLASSIFIED_COLOR);
  });

  it('is stable per type and independent of sibling types', () => {
    const first = colorForNode({ tier: 'type', id: 'type:a', rootTypeId: 'type:a', depth: 0 });
    const again = colorForNode({ tier: 'type', id: 'type:a', rootTypeId: 'type:a', depth: 0 });

    expect(again).toBe(first);
    expect(colorForNode({ tier: 'type', id: 'type:b', rootTypeId: 'type:b', depth: 0 })).not.toBe(
      first
    );
  });

  it('gives a knowledge node its parent type hue at a lower value', () => {
    const typeColor = colorForNode({ tier: 'type', id: 'type:a', rootTypeId: 'type:a', depth: 0 });
    const childColor = colorForNode({
      tier: 'knowledge',
      id: 'kn:1',
      rootTypeId: 'type:a',
      depth: 1,
    });

    const hueOf = (c: string) => c.match(/hsl\((\d+)/)?.[1];
    expect(hueOf(childColor)).toBe(hueOf(typeColor));
    expect(childColor).not.toBe(typeColor);
  });
});

describe('colorForNode with nesting', () => {
  it('gives a subtree one hue and darkens with depth', () => {
    const hueOf = (c: string) => c.match(/hsl\((\d+)/)?.[1];
    const lightOf = (c: string) => Number(c.match(/ (\d+(?:\.\d+)?)%\)$/)?.[1]);

    const root = colorForNode({ tier: 'type', id: 'type:a', rootTypeId: 'type:a', depth: 0 });
    const child = colorForNode({ tier: 'type', id: 'type:b', rootTypeId: 'type:a', depth: 1 });

    expect(hueOf(child)).toBe(hueOf(root));
    expect(lightOf(child)).toBeLessThan(lightOf(root));
  });

  it('keeps a type lighter than its own knowledges at every depth', () => {
    const lightOf = (c: string) => Number(c.match(/ (\d+(?:\.\d+)?)%\)$/)?.[1]);
    for (const depth of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const type = colorForNode({ tier: 'type', id: 'type:x', rootTypeId: 'type:a', depth });
      const kn = colorForNode({
        tier: 'knowledge',
        id: 'kn:1',
        rootTypeId: 'type:a',
        depth: depth + 1,
      });
      expect(lightOf(type)).toBeGreaterThan(lightOf(kn));
    }
  });

  it('never repeats a colour between a type and its own deeper descendant', () => {
    // The bug this guards against: a hard Math.max clamp made every depth past
    // the floor produce the identical string, so a type at depth 3 and one at
    // depth 4 in the same subtree were visually indistinguishable.
    for (const depth of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const parent = colorForNode({ tier: 'type', id: 'type:x', rootTypeId: 'type:a', depth });
      const child = colorForNode({
        tier: 'type',
        id: 'type:y',
        rootTypeId: 'type:a',
        depth: depth + 1,
      });
      expect(child).not.toBe(parent);
    }
  });
});
