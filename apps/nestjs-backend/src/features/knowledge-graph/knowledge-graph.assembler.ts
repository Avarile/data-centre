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

/**
 * Rest length per tier. Core→type is long and type→knowledge short, so the
 * hierarchy reads as distinct shells rather than one undifferentiated cloud.
 */
const CORE_TYPE_DISTANCE = 260;
const TYPE_KNOWLEDGE_DISTANCE = 70;
/** Between the core→type and type→knowledge lengths: a nested type is closer
 *  to its parent than a root is to core, but still farther than a leaf. */
const TYPE_PARENT_DISTANCE = 90;

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
}

export interface IAssembleOptions {
  maxKnowledgeNodes: number;
  coreLabel: string;
  unclassifiedLabel: string;
}

export interface IAssembledGraph {
  nodes: IKnowledgeGraphNode[];
  links: IKnowledgeGraphLink[];
  stats: IKnowledgeGraphStats;
}

const byTitleThenId = (
  a: { title: string; recordId: string },
  b: { title: string; recordId: string }
) => a.title.localeCompare(b.title) || a.recordId.localeCompare(b.recordId);

/**
 * `parent_type` is user data, so A->B->A and A->A are both reachable, and a
 * naive walk up the chain would loop forever.
 *
 * Types are visited in the caller's sorted order and the edge that CLOSES a
 * cycle is cut, which makes the outcome deterministic: the same edge goes on
 * every run. That matters beyond tidiness — getGraph hashes the whole payload
 * into the ETag, so a nondeterministic break would churn the ETag between two
 * identical requests.
 */
const breakCycles = (sortedTypes: IKnowledgeTypeRow[]) => {
  const known = new Set(sortedTypes.map((t) => t.recordId));
  const parentOf = new Map<string, string | null>();
  let cyclesDropped = 0;

  for (const type of sortedTypes) {
    const parent = type.parentRecordId;
    if (parent === type.recordId) {
      // Self-parent: a cycle of length one.
      parentOf.set(type.recordId, null);
      cyclesDropped++;
      continue;
    }
    // A parent that no longer resolves is a root, not a dropped cycle — the
    // same treatment an unresolvable knowledge_type already gets.
    parentOf.set(type.recordId, parent && known.has(parent) ? parent : null);
  }

  for (const type of sortedTypes) {
    const seen = new Set<string>([type.recordId]);
    let current = parentOf.get(type.recordId) ?? null;
    while (current) {
      if (seen.has(current)) {
        parentOf.set(current, null);
        cyclesDropped++;
        break;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  }

  return { parentOf, cyclesDropped };
};

/** One memoised walk up the now-acyclic parent map. Safe to recurse: the depth
 *  is the tree's, and breakCycles guarantees termination. */
const resolveHierarchy = (parentOf: ReadonlyMap<string, string | null>) => {
  const depthOf = new Map<string, number>();
  const rootOf = new Map<string, string>();

  const resolve = (recordId: string): { depth: number; root: string } => {
    const cached = depthOf.get(recordId);
    if (cached !== undefined) {
      return { depth: cached, root: rootOf.get(recordId) as string };
    }
    const parent = parentOf.get(recordId) ?? null;
    const result =
      parent === null
        ? { depth: 0, root: recordId }
        : (() => {
            const up = resolve(parent);
            return { depth: up.depth + 1, root: up.root };
          })();
    depthOf.set(recordId, result.depth);
    rootOf.set(recordId, result.root);
    return result;
  };

  for (const recordId of parentOf.keys()) {
    resolve(recordId);
  }
  return { depthOf, rootOf };
};

/** Depth-first over the parent map: roots by title, then each subtree. The
 *  legend indents by depth and needs parents to precede their children. */
const orderDepthFirst = (
  sortedTypes: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>
): IKnowledgeTypeRow[] => {
  const childrenOf = new Map<string | null, IKnowledgeTypeRow[]>();
  for (const type of sortedTypes) {
    const parent = parentOf.get(type.recordId) ?? null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(type);
    else childrenOf.set(parent, [type]);
  }
  const out: IKnowledgeTypeRow[] = [];
  const walk = (parent: string | null) => {
    for (const child of childrenOf.get(parent) ?? []) {
      out.push(child);
      walk(child.recordId);
    }
  };
  walk(null);
  return out;
};

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
 * Turns two flat row sets into the 3-tier star. Pure: the only place graph
 * shape is decided, and the only place worth unit-testing on the backend.
 */
export const assembleKnowledgeGraph = (
  types: IKnowledgeTypeRow[],
  knowledges: IKnowledgeRow[],
  options: IAssembleOptions
): IAssembledGraph => {
  const { maxKnowledgeNodes, coreLabel, unclassifiedLabel } = options;

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
      typeId: null,
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
      typeId: null,
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
      typeId: null,
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
      typeId: bucket,
      parentId: bucket,
      rootTypeId: rootOfBucket(bucket),
      depth: depthOfBucket(bucket) + 1,
      degree: 1,
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

  return {
    nodes,
    links,
    stats: {
      typeCount: typeNodeIds.length,
      knowledgeCount: emitted.length,
      orphanCount,
      nodeCount: nodes.length,
      linkCount: links.length,
      truncated,
      cyclesDropped,
      maxDepth,
    },
  };
};
