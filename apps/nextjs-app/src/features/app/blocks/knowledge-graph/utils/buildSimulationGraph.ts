import type {
  IGetKnowledgeGraphVo,
  IKnowledgeGraphLink,
  IKnowledgeGraphNode,
} from '@teable/openapi';

export interface ISimulationNode extends IKnowledgeGraphNode {
  // Written by the force simulation, not by us.
  x?: number;
  y?: number;
  z?: number;
}

export interface ISimulationGraph {
  nodes: ISimulationNode[];
  links: IKnowledgeGraphLink[];
}

export const EMPTY_SIMULATION_GRAPH: ISimulationGraph = { nodes: [], links: [] };

/**
 * Expands the user's hidden type ids to include every descendant type.
 *
 * Iterates to a fixpoint rather than assuming an ordering: the assembler does
 * emit parents before children, but relying on that here would couple the
 * client's filter to the server's emission order, and the coupling would be
 * invisible until someone reordered the assembler.
 */
export const hiddenClosure = (
  nodes: readonly IKnowledgeGraphNode[],
  hiddenTypeIds: readonly string[]
): Set<string> => {
  const hidden = new Set(hiddenTypeIds);
  const typeNodes = nodes.filter((node) => node.tier === 'type');
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of typeNodes) {
      if (!hidden.has(node.id) && node.parentId && hidden.has(node.parentId)) {
        hidden.add(node.id);
        changed = true;
      }
    }
  }
  return hidden;
};

/**
 * Derives the renderable graph from (server data × view state). Never stored:
 * storing it would need an effect to keep it in sync, and would split "filter
 * changed" and "data refetched" into two update paths that can disagree.
 *
 * `hiddenTypeIds` holds exclusions, so an empty list correctly means "show
 * everything" both before and after the graph loads.
 */
export const buildSimulationGraph = (
  graph: IGetKnowledgeGraphVo | undefined,
  hiddenTypeIds: readonly string[]
): ISimulationGraph => {
  if (!graph) {
    return EMPTY_SIMULATION_GRAPH;
  }

  const hidden = hiddenClosure(graph.nodes, hiddenTypeIds);
  const keep = (node: IKnowledgeGraphNode): boolean => {
    if (node.tier === 'core') {
      return true;
    }
    if (node.tier === 'type') {
      return !hidden.has(node.id);
    }
    return !hidden.has(node.parentId ?? '');
  };

  // Clone every node. react-force-graph MUTATES what it is given — it writes
  // x/y/z/vx/vy/vz onto nodes and replaces link.source/target with node object
  // references. Handing it the react-query cached objects would corrupt the
  // cache and break structural sharing on the next refetch.
  const nodes = graph.nodes.filter(keep).map((node) => ({ ...node }));
  const keptIds = new Set(nodes.map((node) => node.id));
  const links = graph.links
    .filter((link) => keptIds.has(link.source) && keptIds.has(link.target))
    .map((link) => ({ ...link }));

  return { nodes, links };
};

/**
 * The synthetic core is kept in the simulation but never drawn.
 *
 * three-forcegraph filters only its render digest by visibility
 * (`graphData.nodes.filter(visibilityAccessor)`) while still feeding
 * `.nodes(graphData.nodes)` — every node — to the force simulation. So an
 * invisible core goes on holding the type branches into one connected graph
 * from off screen. Dropping it from graphData instead would leave one
 * disconnected component per type with no force relating them, and the branch
 * arrangement would reshuffle on every reload.
 */
export const isNodeVisible = (node: Pick<IKnowledgeGraphNode, 'tier'>): boolean =>
  node.tier !== 'core';

export const isLinkVisible = (link: Pick<IKnowledgeGraphLink, 'tier'>): boolean =>
  link.tier !== 'core-type';

/**
 * After the first simulation tick `link.source`/`link.target` are node objects
 * rather than strings. Any callback reading them must handle both forms.
 */
export const linkEndpointId = (endpoint: string | { id?: string } | undefined): string => {
  if (typeof endpoint === 'string') {
    return endpoint;
  }
  return endpoint?.id ?? '';
};
