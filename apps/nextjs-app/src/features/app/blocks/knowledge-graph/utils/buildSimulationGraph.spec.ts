import type { IGetKnowledgeGraphVo } from '@teable/openapi';
import { UNCLASSIFIED_TYPE_NODE_ID } from '@teable/openapi';
import {
  buildSimulationGraph,
  isLinkVisible,
  isNodeVisible,
  linkEndpointId,
} from './buildSimulationGraph';
import type { IVector3 } from './graphTheme';
import {
  chargeFor,
  colorForNode,
  CORE_COLOR,
  linkStrengthFor,
  nodeValFor,
  standoffPosition,
  UNCLASSIFIED_COLOR,
} from './graphTheme';

const TYPE_KNOWLEDGE = 'type-knowledge' as const;
/** Stands in for a tier the code has never heard of — the NaN-position guard. */
const UNKNOWN_TIER = 'not-a-tier';

const graph: IGetKnowledgeGraphVo = {
  version: 1,
  etag: '"kg1-test"',
  nodes: [
    { id: 'core', recordId: null, tier: 'core', label: 'core', typeId: null, degree: 2 },
    { id: 'type:a', recordId: 'recA', tier: 'type', label: 'Alpha', typeId: null, degree: 1 },
    { id: 'type:b', recordId: 'recB', tier: 'type', label: 'Beta', typeId: null, degree: 1 },
    { id: 'kn:1', recordId: 'rec1', tier: 'knowledge', label: 'one', typeId: 'type:a', degree: 1 },
    { id: 'kn:2', recordId: 'rec2', tier: 'knowledge', label: 'two', typeId: 'type:b', degree: 1 },
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
    truncated: false,
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
    const knowledge = radius(nodeValFor('knowledge', 1));
    const core = radius(nodeValFor('core', 25));

    for (const degree of [0, 1, 5, 6, 7, 25, 40, 500]) {
      const type = radius(nodeValFor('type', degree));
      expect(type).toBeGreaterThan(knowledge);
      expect(type).toBeLessThan(core);
    }
  });

  it('grows type nodes monotonically with degree and caps them', () => {
    expect(nodeValFor('type', 40)).toBeGreaterThan(nodeValFor('type', 10));
    expect(nodeValFor('type', 500)).toBe(nodeValFor('type', 40));
  });

  it('falls back to the leaf size for an unknown tier', () => {
    // An unknown tier returning undefined would make d3 produce NaN positions
    // and render an empty scene with no error at all.
    expect(nodeValFor(UNKNOWN_TIER, 3)).toBe(nodeValFor('knowledge', 3));
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
    expect(colorForNode({ tier: 'core', id: 'core', typeId: null })).toBe(CORE_COLOR);
  });

  it('uses the neutral colour for the unclassified bucket and its children', () => {
    expect(colorForNode({ tier: 'type', id: UNCLASSIFIED_TYPE_NODE_ID, typeId: null })).toBe(
      UNCLASSIFIED_COLOR
    );
    expect(colorForNode({ tier: 'knowledge', id: 'kn:9', typeId: UNCLASSIFIED_TYPE_NODE_ID })).toBe(
      UNCLASSIFIED_COLOR
    );
  });

  it('is stable per type and independent of sibling types', () => {
    const first = colorForNode({ tier: 'type', id: 'type:a', typeId: null });
    const again = colorForNode({ tier: 'type', id: 'type:a', typeId: null });

    expect(again).toBe(first);
    expect(colorForNode({ tier: 'type', id: 'type:b', typeId: null })).not.toBe(first);
  });

  it('gives a knowledge node its parent type hue at a lower value', () => {
    const typeColor = colorForNode({ tier: 'type', id: 'type:a', typeId: null });
    const childColor = colorForNode({ tier: 'knowledge', id: 'kn:1', typeId: 'type:a' });

    const hueOf = (c: string) => c.match(/hsl\((\d+)/)?.[1];
    expect(hueOf(childColor)).toBe(hueOf(typeColor));
    expect(childColor).not.toBe(typeColor);
  });
});
