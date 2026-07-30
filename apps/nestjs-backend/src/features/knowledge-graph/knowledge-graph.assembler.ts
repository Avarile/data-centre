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

export interface IKnowledgeTypeRow {
  recordId: string;
  title: string;
}

export interface IKnowledgeRow extends IKnowledgeTypeRow {
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

const byTitleThenId = (a: IKnowledgeTypeRow, b: IKnowledgeTypeRow) =>
  a.title.localeCompare(b.title) || a.recordId.localeCompare(b.recordId);

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

  const nodes: IKnowledgeGraphNode[] = [
    {
      id: KNOWLEDGE_CORE_NODE_ID,
      recordId: null,
      tier: 'core',
      label: coreLabel,
      typeId: null,
      degree: typeNodeIds.length,
    },
  ];

  for (const type of sortedTypes) {
    const id = `${TYPE_NODE_PREFIX}${type.recordId}`;
    nodes.push({
      id,
      recordId: type.recordId,
      tier: 'type',
      label: type.title,
      typeId: null,
      degree: childCount.get(id) ?? 0,
    });
  }

  if (orphanCount > 0) {
    nodes.push({
      id: UNCLASSIFIED_TYPE_NODE_ID,
      recordId: null,
      tier: 'type',
      label: unclassifiedLabel,
      typeId: null,
      degree: orphanCount,
    });
  }

  for (const row of emitted) {
    nodes.push({
      id: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      recordId: row.recordId,
      tier: 'knowledge',
      label: row.title,
      typeId: bucketOf(row),
      degree: 1,
    });
  }

  const links: IKnowledgeGraphLink[] = typeNodeIds.map((typeNodeId) => ({
    source: KNOWLEDGE_CORE_NODE_ID,
    target: typeNodeId,
    tier: 'core-type',
    value: childCount.get(typeNodeId) ?? 0,
    distance: CORE_TYPE_DISTANCE,
  }));

  for (const row of emitted) {
    links.push({
      source: bucketOf(row),
      target: `${KNOWLEDGE_NODE_PREFIX}${row.recordId}`,
      tier: 'type-knowledge',
      value: 1,
      distance: TYPE_KNOWLEDGE_DISTANCE,
    });
  }

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
    },
  };
};
