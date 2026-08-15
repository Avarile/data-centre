/* eslint-disable @typescript-eslint/naming-convention */
import type {
  IKnowledgeGraphLink,
  IKnowledgeGraphNode,
  IKnowledgeGraphStats,
} from '@teable/openapi';
import {
  KNOWLEDGE_CORE_NODE_ID,
  KNOWLEDGE_NODE_PREFIX,
  TYPE_NODE_PREFIX,
  UNCLASSIFIED_TYPE_NODE_ID,
} from '@teable/openapi';
import type { IHierarchyRow } from './knowledge-type-tree';
import { breakCycles, resolveHierarchy, orderDepthFirst } from './knowledge-type-tree';

/**
 * Rest length per tier. Core→type is long and type→knowledge short, so the
 * hierarchy reads as distinct shells rather than one undifferentiated cloud.
 */
const CORE_TYPE_DISTANCE = 260;
const TYPE_KNOWLEDGE_DISTANCE = 70;
/** Between the core→type and type→knowledge lengths: a nested type is closer
 *  to its parent than a root is to core, but still farther than a leaf. */
const TYPE_PARENT_DISTANCE = 90;
const KNOWLEDGE_KNOWLEDGE_DISTANCE = 140;
/** Shorter than type→knowledge: a nested knowledge should read as part of its
 *  parent's lobe rather than as another leaf of the type. */
const KNOWLEDGE_PARENT_DISTANCE = 50;

/** Canonical key for an unordered pair. related_knowledge is two-way, so every
 *  association arrives twice — once from each end — and would otherwise render
 *  as two coincident edges and double-count in degree. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Deterministic [source, target] for an unordered pair: smaller id first.
 *  Split out of buildRelations purely to keep its cognitive complexity in
 *  check — no behaviour differs from the inline ternary. */
const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** `parentRecordId` is the `parent_type` link: the parent type, or null at a
 *  root. Structurally identical to IHierarchyRow, and deliberately the same
 *  type rather than a copy — both hierarchies run through the same engine. */
export type IKnowledgeTypeRow = IHierarchyRow;

/**
 * Extends IHierarchyRow because a knowledge now genuinely has a parent of its
 * own kind (`knowledge_parent`), which is a different edge from its type. The
 * two are not modelled twice: `parentRecordId` is the parent KNOWLEDGE and
 * `typeRecordId` is the type, and only one of them is ever drawn — see
 * buildKnowledgeLinks.
 */
export interface IKnowledgeRow extends IHierarchyRow {
  /** recordId of the linked knowledge_type, or null when unlinked/unresolvable */
  typeRecordId: string | null;
  /** recordIds from the two-way related_knowledge cell. */
  relatedRecordIds: string[];
}

export interface IAssembleOptions {
  maxKnowledgeNodes: number;
  maxLinks: number;
  coreLabel: string;
  unclassifiedLabel: string;
}

export interface IAssembledGraph {
  nodes: IKnowledgeGraphNode[];
  links: IKnowledgeGraphLink[];
  stats: IKnowledgeGraphStats;
}

/**
 * Sort order that must be applied before `breakCycles` — the cycle-breaking
 * algorithm's outcome depends on visitation order, so any caller that wants
 * to agree with another caller on which edge gets cut (see
 * knowledge-type-tree.ts) must sort with this exact comparator first.
 */
export const byTitleThenId = (
  a: { title: string; recordId: string },
  b: { title: string; recordId: string }
) => a.title.localeCompare(b.title) || a.recordId.localeCompare(b.recordId);

/**
 * Core-type for roots, type-parent for nested types, plus the synthetic
 * bucket's tether. Split out of assembleKnowledgeGraph purely to keep that
 * function's cognitive complexity in check — no behaviour differs.
 */
const buildTypeLinks = (
  orderedTypes: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>,
  typeNodeId: (recordId: string) => string,
  childCount: ReadonlyMap<string, number>,
  orphanCount: number
): IKnowledgeGraphLink[] => {
  const links: IKnowledgeGraphLink[] = [];
  for (const type of orderedTypes) {
    const id = typeNodeId(type.recordId);
    const parent = parentOf.get(type.recordId) ?? null;
    links.push(
      parent === null
        ? {
            source: KNOWLEDGE_CORE_NODE_ID,
            target: id,
            tier: 'core-type',
            value: childCount.get(id) ?? 0,
            distance: CORE_TYPE_DISTANCE,
          }
        : {
            source: typeNodeId(parent),
            target: id,
            tier: 'type-parent',
            value: 1,
            distance: TYPE_PARENT_DISTANCE,
          }
    );
  }
  if (orphanCount > 0) {
    links.push({
      source: KNOWLEDGE_CORE_NODE_ID,
      target: UNCLASSIFIED_TYPE_NODE_ID,
      tier: 'core-type',
      value: orphanCount,
      distance: CORE_TYPE_DISTANCE,
    });
  }
  return links;
};

/**
 * Exactly one structural edge per emitted knowledge: to its parent knowledge
 * when it has one, otherwise to its type bucket. Never both — `parentId` on a
 * node is single-valued, and depth, rootTypeId and the client's hidden-subtree
 * filter all read the graph as a tree.
 *
 * Split out of assembleKnowledgeGraph alongside buildTypeLinks, which it used
 * to be the tail of; keeping both tiers in one function meant seven parameters
 * and two unrelated loops.
 */
const buildKnowledgeLinks = (
  orderedKnowledges: IKnowledgeRow[],
  knowledgeParentOf: ReadonlyMap<string, string | null>,
  bucketOf: (row: IKnowledgeRow) => string
): IKnowledgeGraphLink[] =>
  orderedKnowledges.map((row) => {
    const parent = knowledgeParentOf.get(row.recordId) ?? null;
    const target = `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`;
    return parent === null
      ? {
          source: bucketOf(row),
          target,
          tier: 'type-knowledge',
          value: 1,
          distance: TYPE_KNOWLEDGE_DISTANCE,
        }
      : {
          source: `${KNOWLEDGE_NODE_PREFIX}${parent}`,
          target,
          tier: 'knowledge-parent',
          value: 1,
          distance: KNOWLEDGE_PARENT_DISTANCE,
        };
  });

/**
 * Child tallies for the knowledge tier, in one pass: how many ROOT knowledges
 * each type bucket holds, and how many child knowledges each parent knowledge
 * holds.
 *
 * Only roots count towards a bucket. A nested knowledge hangs off its parent
 * and draws no type edge, so counting it against its type would inflate that
 * type's degree past its real edge count and — when the type is unresolvable —
 * report an orphan that is not one.
 */
const countKnowledgeChildren = (
  emitted: IKnowledgeRow[],
  knowledgeParentOf: ReadonlyMap<string, string | null>,
  bucketOf: (row: IKnowledgeRow) => string
): { bucketCount: Map<string, number>; childKnowledgeCount: Map<string, number> } => {
  const bucketCount = new Map<string, number>();
  const childKnowledgeCount = new Map<string, number>();

  for (const row of emitted) {
    const parent = knowledgeParentOf.get(row.recordId) ?? null;
    if (parent === null) {
      const bucket = bucketOf(row);
      bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1);
      continue;
    }
    childKnowledgeCount.set(parent, (childKnowledgeCount.get(parent) ?? 0) + 1);
  }

  return { bucketCount, childKnowledgeCount };
};

/**
 * Dedupes the two-way `related_knowledge` associations into one canonical
 * pair per relation and tallies how many relations touch each endpoint. Split
 * out of assembleKnowledgeGraph purely to keep that function's cognitive
 * complexity in check — no behaviour differs from the inline version.
 */
const buildRelations = (
  emitted: IKnowledgeRow[],
  emittedIds: ReadonlySet<string>
): {
  pairs: { source: string; target: string }[];
  relationDegree: Map<string, number>;
  danglingRelations: number;
} => {
  const seenPairs = new Set<string>();
  const pairs: { source: string; target: string }[] = [];
  let danglingRelations = 0;

  for (const row of emitted) {
    for (const other of row.relatedRecordIds) {
      if (other === row.recordId || !emittedIds.has(other)) {
        danglingRelations++;
        continue;
      }
      const key = pairKey(row.recordId, other);
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      const [source, target] = orderPair(row.recordId, other);
      pairs.push({ source, target });
    }
  }
  pairs.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  const relationDegree = new Map<string, number>();
  for (const pair of pairs) {
    relationDegree.set(pair.source, (relationDegree.get(pair.source) ?? 0) + 1);
    relationDegree.set(pair.target, (relationDegree.get(pair.target) ?? 0) + 1);
  }

  return { pairs, relationDegree, danglingRelations };
};

/**
 * Slices the deduped relation pairs down to whatever budget remains after
 * structural links, and turns the survivors into knowledge-knowledge links.
 * Structural links are never dropped: without the taxonomy the layout loses
 * its skeleton, so only relations are truncated by the link budget — the
 * node budget (see `truncated` in assembleKnowledgeGraph) is a separate
 * dimension the caller reports independently. Split out of
 * assembleKnowledgeGraph purely to keep that function's cognitive complexity
 * in check — no behaviour differs from the inline version.
 */
const buildRelationLinks = (
  pairs: { source: string; target: string }[],
  maxLinks: number,
  structuralLinkCount: number
): {
  relationLinks: IKnowledgeGraphLink[];
  relationCount: number;
  relationsTruncated: boolean;
} => {
  const roomForRelations = Math.max(0, maxLinks - structuralLinkCount);
  const relationsTruncated = pairs.length > roomForRelations;
  const emittedPairs = relationsTruncated ? pairs.slice(0, roomForRelations) : pairs;

  const relationLinks: IKnowledgeGraphLink[] = emittedPairs.map((pair) => ({
    source: `${KNOWLEDGE_NODE_PREFIX}${pair.source}`,
    target: `${KNOWLEDGE_NODE_PREFIX}${pair.target}`,
    tier: 'knowledge-knowledge',
    value: 1,
    distance: KNOWLEDGE_KNOWLEDGE_DISTANCE,
  }));

  return {
    relationLinks,
    relationCount: emittedPairs.length,
    relationsTruncated,
  };
};

interface IKnowledgeNodeContext {
  orderedKnowledges: IKnowledgeRow[];
  emitted: IKnowledgeRow[];
  knowledgeParentOf: ReadonlyMap<string, string | null>;
  knowledgeDepthOf: ReadonlyMap<string, number>;
  knowledgeRootOf: ReadonlyMap<string, string>;
  bucketOf: (row: IKnowledgeRow) => string;
  depthOf: ReadonlyMap<string, number>;
  rootNodeIdOf: (recordId: string) => string;
  relationDegreeOf: (recordId: string) => number;
  childKnowledgeCount: ReadonlyMap<string, number>;
}

/**
 * One node per emitted knowledge, in depth-first order so a parent is always
 * emitted before its children — the same guarantee the type tier gives, and
 * what the client's legend and hidden-subtree closure read the payload
 * expecting.
 *
 * Split out of assembleKnowledgeGraph, along with the three bucket resolvers it
 * owns, purely to keep that function's cognitive complexity in check — no
 * behaviour differs.
 */
const buildKnowledgeNodes = (ctx: IKnowledgeNodeContext): IKnowledgeGraphNode[] => {
  // Knowledge nodes inherit depth and root from their bucket. The unclassified
  // bucket is a root, so it resolves to depth 0 and itself.
  const depthOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID
      ? 0
      : ctx.depthOf.get(bucketId.slice(TYPE_NODE_PREFIX.length)) ?? 0;
  const rootOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID
      ? UNCLASSIFIED_TYPE_NODE_ID
      : ctx.rootNodeIdOf(bucketId.slice(TYPE_NODE_PREFIX.length));

  /**
   * The type bucket a knowledge's whole chain hangs from: its own bucket when
   * it is a root, otherwise the bucket of the root of its chain.
   *
   * This is what keeps `rootTypeId` a TYPE id at every nesting depth. The
   * client hashes that id into a hue, so a `kn:` value there would split a
   * nested subtree away from its own colour family — and a null would grey it
   * out entirely. The cost is deliberate and disclosed: a knowledge filed under
   * one type but nested under a parent rooted in another renders in the
   * parent's family, because nesting is the stronger statement of the two.
   */
  const rowOf = new Map(ctx.emitted.map((row) => [row.recordId, row]));
  const anchorBucketOf = (recordId: string): string => {
    const root = ctx.knowledgeRootOf.get(recordId) ?? recordId;
    const row = rowOf.get(root);
    return row ? ctx.bucketOf(row) : UNCLASSIFIED_TYPE_NODE_ID;
  };

  return ctx.orderedKnowledges.map((row) => {
    const parent = ctx.knowledgeParentOf.get(row.recordId) ?? null;
    const anchor = anchorBucketOf(row.recordId);
    return {
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: 'knowledge',
      label: row.title,
      parentId: parent === null ? ctx.bucketOf(row) : `${KNOWLEDGE_NODE_PREFIX}${parent}`,
      rootTypeId: rootOfBucket(anchor),
      depth: depthOfBucket(anchor) + 1 + (ctx.knowledgeDepthOf.get(row.recordId) ?? 0),
      // 1 for its own structural edge — to a parent knowledge or to a type,
      // never both — plus its child knowledges and every deduped relation
      // touching this record.
      degree:
        1 + ctx.relationDegreeOf(row.recordId) + (ctx.childKnowledgeCount.get(row.recordId) ?? 0),
    };
  });
};

/**
 * Turns two flat row sets into the 3-tier star, with both tiers free to nest
 * within themselves. Pure: the only place graph shape is decided, and the only
 * place worth unit-testing on the backend.
 */
export const assembleKnowledgeGraph = (
  types: IKnowledgeTypeRow[],
  knowledges: IKnowledgeRow[],
  options: IAssembleOptions
): IAssembledGraph => {
  const { maxKnowledgeNodes, maxLinks, coreLabel, unclassifiedLabel } = options;

  const sortedTypes = [...types].sort(byTitleThenId);

  const { parentOf, cyclesDropped } = breakCycles(sortedTypes);
  const { depthOf, rootOf } = resolveHierarchy(parentOf);
  const orderedTypes = orderDepthFirst(sortedTypes, parentOf);
  const maxDepth = orderedTypes.reduce((max, t) => Math.max(max, depthOf.get(t.recordId) ?? 0), 0);

  const typeNodeId = (recordId: string) => `${TYPE_NODE_PREFIX}${recordId}`;
  const rootNodeIdOf = (recordId: string) => typeNodeId(rootOf.get(recordId) ?? recordId);
  const parentNodeIdOf = (recordId: string) => {
    const parent = parentOf.get(recordId) ?? null;
    return parent === null ? KNOWLEDGE_CORE_NODE_ID : typeNodeId(parent);
  };

  const knownTypeIds = new Set(sortedTypes.map((t) => t.recordId));

  // Sort BEFORE truncating so the same dataset always yields the same subset
  // when the budget bites, keeping the payload (and its ETag) stable.
  const sorted = [...knowledges].sort(byTitleThenId);
  const truncated = sorted.length > maxKnowledgeNodes;
  const emitted = truncated ? sorted.slice(0, maxKnowledgeNodes) : sorted;

  // The same engine as the type pass above, over knowledge_parent. `emitted` is
  // already sorted with byTitleThenId — the precondition breakCycles documents
  // — and passing the POST-truncation set is deliberate: breakCycles builds its
  // `known` set from the rows it is handed, so a parent dropped by the node
  // budget resolves to null and its child falls back to a type bucket instead
  // of pointing at a node that was never emitted.
  const { parentOf: knowledgeParentOf, cyclesDropped: knowledgeCyclesDropped } =
    breakCycles(emitted);
  const { depthOf: knowledgeDepthOf, rootOf: knowledgeRootOf } =
    resolveHierarchy(knowledgeParentOf);
  const orderedKnowledges = orderDepthFirst(emitted, knowledgeParentOf);
  const maxKnowledgeDepth = orderedKnowledges.reduce(
    (max, row) => Math.max(max, knowledgeDepthOf.get(row.recordId) ?? 0),
    0
  );

  // Relations are computed before the node loop below: node `degree` counts
  // them, so degree cannot be assigned until relationDegree exists.
  const emittedIds = new Set(emitted.map((row) => row.recordId));
  const { pairs, relationDegree, danglingRelations } = buildRelations(emitted, emittedIds);
  // relationDegree is computed over ALL pairs while only the budgeted pairs
  // are drawn below, so a truncated graph reports a degree higher than its
  // visible edges. That is deliberate: degree drives node sizing, and a
  // well-connected hub must not visually shrink just because a link budget
  // hid some of its edges.
  const relationDegreeOf = (recordId: string) => relationDegree.get(recordId) ?? 0;

  const bucketOf = (row: IKnowledgeRow): string =>
    row.typeRecordId && knownTypeIds.has(row.typeRecordId)
      ? `${TYPE_NODE_PREFIX}${row.typeRecordId}`
      : UNCLASSIFIED_TYPE_NODE_ID;

  // Child counts are computed over the EMITTED set only, so orphanCount can never
  // exceed knowledgeCount and no synthetic bucket outlives its children.
  const { bucketCount: childCount, childKnowledgeCount } = countKnowledgeChildren(
    emitted,
    knowledgeParentOf,
    bucketOf
  );
  const orphanCount = childCount.get(UNCLASSIFIED_TYPE_NODE_ID) ?? 0;

  // Every real type is emitted even with zero children — an empty branch is a
  // meaningful statement about the taxonomy. The synthetic bucket is not.
  const typeNodeIds = sortedTypes.map((t) => `${TYPE_NODE_PREFIX}${t.recordId}`);
  if (orphanCount > 0) {
    typeNodeIds.push(UNCLASSIFIED_TYPE_NODE_ID);
  }

  // Type degree counts child types as well as child knowledges.
  const childTypeCount = new Map<string, number>();
  for (const type of orderedTypes) {
    const parent = parentOf.get(type.recordId) ?? null;
    if (parent !== null) {
      const id = typeNodeId(parent);
      childTypeCount.set(id, (childTypeCount.get(id) ?? 0) + 1);
    }
  }

  // Core degree counts roots, not every type.
  const rootCount =
    orderedTypes.filter((t) => (parentOf.get(t.recordId) ?? null) === null).length +
    (orphanCount > 0 ? 1 : 0);

  const nodes: IKnowledgeGraphNode[] = [
    {
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: coreLabel,
      parentId: null,
      rootTypeId: null,
      // Depth is undefined for a node outside the taxonomy; 0 is the neutral
      // report, and `tier` is what distinguishes core from a root type.
      depth: 0,
      degree: rootCount,
    },
  ];

  for (const type of orderedTypes) {
    const id = typeNodeId(type.recordId);
    nodes.push({
      id,
      recordId: type.recordId,
      tier: 'type',
      label: type.title,
      parentId: parentNodeIdOf(type.recordId),
      rootTypeId: rootNodeIdOf(type.recordId),
      depth: depthOf.get(type.recordId) ?? 0,
      degree: (childCount.get(id) ?? 0) + (childTypeCount.get(id) ?? 0),
    });
  }

  if (orphanCount > 0) {
    nodes.push({
      id: UNCLASSIFIED_TYPE_NODE_ID,
      recordId: null,
      tier: 'type',
      label: unclassifiedLabel,
      parentId: KNOWLEDGE_CORE_NODE_ID,
      rootTypeId: UNCLASSIFIED_TYPE_NODE_ID,
      depth: 0,
      degree: orphanCount,
    });
  }

  nodes.push(
    ...buildKnowledgeNodes({
      orderedKnowledges,
      emitted,
      knowledgeParentOf,
      knowledgeDepthOf,
      knowledgeRootOf,
      bucketOf,
      depthOf,
      rootNodeIdOf,
      relationDegreeOf,
      childKnowledgeCount,
    })
  );

  // Links: core-type for roots only, type-parent for the rest, then exactly one
  // structural edge per knowledge.
  const links = buildTypeLinks(orderedTypes, parentOf, typeNodeId, childCount, orphanCount);
  links.push(...buildKnowledgeLinks(orderedKnowledges, knowledgeParentOf, bucketOf));

  // Relations share the same `maxLinks` budget as the structural links above,
  // but never displace them — see buildRelationLinks.
  const { relationLinks, relationCount, relationsTruncated } = buildRelationLinks(
    pairs,
    maxLinks,
    links.length
  );
  links.push(...relationLinks);

  return {
    nodes,
    links,
    stats: {
      typeCount: typeNodeIds.length,
      knowledgeCount: emitted.length,
      orphanCount,
      nodeCount: nodes.length,
      linkCount: links.length,
      truncated: { nodes: truncated, links: relationsTruncated },
      cyclesDropped,
      maxDepth,
      maxKnowledgeDepth,
      knowledgeCyclesDropped,
      relationCount,
      danglingRelations,
    },
  };
};
