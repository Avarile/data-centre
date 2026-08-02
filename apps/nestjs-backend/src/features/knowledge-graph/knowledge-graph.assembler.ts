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

/** Canonical key for an unordered pair. related_knowledge is two-way, so every
 *  association arrives twice — once from each end — and would otherwise render
 *  as two coincident edges and double-count in degree. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Deterministic [source, target] for an unordered pair: smaller id first.
 *  Split out of buildRelations purely to keep its cognitive complexity in
 *  check — no behaviour differs from the inline ternary. */
const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export interface IKnowledgeTypeRow {
  recordId: string;
  title: string;
  /** recordId of the parent type, or null when this type is a root. */
  parentRecordId: string | null;
}

/** Standalone, NOT extending IKnowledgeTypeRow: a knowledge has no parent type
 *  of its own, it has a type. Inheriting parentRecordId here would model the
 *  taxonomy edge twice. */
export interface IKnowledgeRow {
  recordId: string;
  title: string;
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
 * Core-type for roots, type-parent for nested types, then type-knowledge for
 * every emitted knowledge. Split out of assembleKnowledgeGraph purely to keep
 * that function's cognitive complexity in check — no behaviour differs.
 */
const buildLinks = (
  orderedTypes: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>,
  typeNodeId: (recordId: string) => string,
  childCount: ReadonlyMap<string, number>,
  orphanCount: number,
  emitted: IKnowledgeRow[],
  bucketOf: (row: IKnowledgeRow) => string
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

  for (const row of emitted) {
    links.push({
      source: bucketOf(row),
      target: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      tier: 'type-knowledge',
      value: 1,
      distance: TYPE_KNOWLEDGE_DISTANCE,
    });
  }
  return links;
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

/**
 * Turns two flat row sets into the 3-tier star. Pure: the only place graph
 * shape is decided, and the only place worth unit-testing on the backend.
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
  const childCount = new Map<string, number>();
  for (const row of emitted) {
    const bucket = bucketOf(row);
    childCount.set(bucket, (childCount.get(bucket) ?? 0) + 1);
  }
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

  // Knowledge nodes inherit depth and root from their bucket. The unclassified
  // bucket is a root, so it resolves to depth 0 and itself.
  const depthOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID
      ? 0
      : depthOf.get(bucketId.slice(TYPE_NODE_PREFIX.length)) ?? 0;
  const rootOfBucket = (bucketId: string) =>
    bucketId === UNCLASSIFIED_TYPE_NODE_ID
      ? UNCLASSIFIED_TYPE_NODE_ID
      : rootNodeIdOf(bucketId.slice(TYPE_NODE_PREFIX.length));

  for (const row of emitted) {
    const bucket = bucketOf(row);
    nodes.push({
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: 'knowledge',
      label: row.title,
      parentId: bucket,
      rootTypeId: rootOfBucket(bucket),
      depth: depthOfBucket(bucket) + 1,
      // 1 for the type link, plus every deduped relation touching this record.
      degree: 1 + relationDegreeOf(row.recordId),
    });
  }

  // Links: core-type for roots only, type-parent for the rest.
  const links = buildLinks(
    orderedTypes,
    parentOf,
    typeNodeId,
    childCount,
    orphanCount,
    emitted,
    bucketOf
  );

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
      relationCount,
      danglingRelations,
    },
  };
};
