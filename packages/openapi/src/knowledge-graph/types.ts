import { z } from '../zod';

/**
 * Payload shape version. Bump when the node/link schema changes in a
 * non-additive way so clients can detect an incompatible server.
 */
export const KNOWLEDGE_GRAPH_VERSION = 2;

export const KNOWLEDGE_CORE_NODE_ID = 'core';
export const TYPE_NODE_PREFIX = 'type:';
export const KNOWLEDGE_NODE_PREFIX = 'kn:';

/**
 * Synthetic bucket for knowledges whose `knowledge_type` cell is empty or
 * points at a type that no longer resolves. It carries no record id.
 */
export const UNCLASSIFIED_TYPE_NODE_ID = `${TYPE_NODE_PREFIX}__unclassified__`;

// Depth in the 3-tier star: core -> type -> knowledge.
export const KnowledgeNodeTierValues = ['core', 'type', 'knowledge'] as const;
export type KnowledgeNodeTier = (typeof KnowledgeNodeTierValues)[number];
export const knowledgeNodeTierSchema = z.enum(KnowledgeNodeTierValues);

// core -> type (roots only) -> nested types -> knowledge, plus peer relations.
export const KnowledgeLinkTierValues = [
  'core-type',
  'type-parent',
  'type-knowledge',
  'knowledge-knowledge',
] as const;
export type KnowledgeLinkTier = (typeof KnowledgeLinkTierValues)[number];
export const knowledgeLinkTierSchema = z.enum(KnowledgeLinkTierValues);

// Tiers that map to a real record and therefore have a detail view.
export const KnowledgeDetailTierValues = ['type', 'knowledge'] as const;
export type KnowledgeDetailTier = (typeof KnowledgeDetailTierValues)[number];
export const knowledgeDetailTierSchema = z.enum(KnowledgeDetailTierValues);

export const knowledgeGraphNodeSchema = z.object({
  id: z.string().meta({ description: 'Unique node id: core, type:<recordId> or kn:<recordId>.' }),
  recordId: z.string().nullable().meta({ description: 'Record id; null for synthetic nodes.' }),
  tier: knowledgeNodeTierSchema.meta({ description: 'Which tier this node belongs to.' }),
  label: z.string().meta({ description: 'Display title.' }),
  parentId: z.string().nullable().meta({
    description:
      'Structural parent: a type points at its parent type (or core at a root), a knowledge at its type.',
  }),
  rootTypeId: z.string().nullable().meta({
    description: 'Top ancestor type. The colour key — a whole subtree shares a hue family.',
  }),
  depth: z.number().int().meta({
    description:
      'Nesting depth. 0 at a root type; a knowledge is its type + 1. Not meaningful for core, which reports 0.',
  }),
  degree: z.number().int().meta({ description: 'Adjacent node count, precomputed for sizing.' }),
});
export type IKnowledgeGraphNode = z.infer<typeof knowledgeGraphNodeSchema>;

export const knowledgeGraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  tier: knowledgeLinkTierSchema,
  value: z.number().meta({ description: 'Edge weight; child count for core-type, else 1.' }),
  distance: z.number().meta({ description: 'Force-layout rest length for this tier.' }),
});
export type IKnowledgeGraphLink = z.infer<typeof knowledgeGraphLinkSchema>;

export const knowledgeGraphStatsSchema = z.object({
  typeCount: z.number().int(),
  knowledgeCount: z.number().int(),
  orphanCount: z
    .number()
    .int()
    .meta({ description: 'Emitted knowledges with no resolvable type.' }),
  nodeCount: z.number().int(),
  linkCount: z.number().int(),
  truncated: z
    .object({
      nodes: z.boolean().meta({ description: 'The node budget dropped knowledges.' }),
      links: z.boolean().meta({ description: 'The link budget dropped relations.' }),
    })
    .meta({ description: 'Per-dimension truncation; structural links are never dropped.' }),
  cyclesDropped: z
    .number()
    .int()
    .meta({ description: 'Parent edges cut to keep the type taxonomy acyclic.' }),
  maxDepth: z.number().int().meta({ description: 'Deepest type nesting level reached.' }),
  relationCount: z
    .number()
    .int()
    .meta({ description: 'Emitted knowledge-knowledge relation links, after dedupe and budget.' }),
  danglingRelations: z.number().int().meta({
    description:
      'related_knowledge entries dropped: self-relations or targets outside the emitted set.',
  }),
});
export type IKnowledgeGraphStats = z.infer<typeof knowledgeGraphStatsSchema>;
