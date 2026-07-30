import { z } from '../zod';

/**
 * Payload shape version. Bump when the node/link schema changes in a
 * non-additive way so clients can detect an incompatible server.
 */
export const KNOWLEDGE_GRAPH_VERSION = 1;

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

// Which pair of tiers an edge spans.
export const KnowledgeLinkTierValues = ['core-type', 'type-knowledge'] as const;
export type KnowledgeLinkTier = (typeof KnowledgeLinkTierValues)[number];
export const knowledgeLinkTierSchema = z.enum(KnowledgeLinkTierValues);

// Tiers that map to a real record and therefore have a detail view.
export const KnowledgeDetailTierValues = ['type', 'knowledge'] as const;
export type KnowledgeDetailTier = (typeof KnowledgeDetailTierValues)[number];
export const knowledgeDetailTierSchema = z.enum(KnowledgeDetailTierValues);

export const knowledgeGraphNodeSchema = z.object({
  id: z.string().meta({ description: 'Unique node id: core, type:<recordId> or kn:<recordId>.' }),
  recordId: z.string().nullable().meta({ description: 'Record id; null for synthetic nodes.' }),
  tier: knowledgeNodeTierSchema.meta({ description: 'Depth in the 3-tier star.' }),
  label: z.string().meta({ description: 'Display title.' }),
  typeId: z.string().nullable().meta({ description: 'Parent type node id; null above tier 2.' }),
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
  truncated: z.boolean().meta({ description: 'True when the node budget dropped rows.' }),
});
export type IKnowledgeGraphStats = z.infer<typeof knowledgeGraphStatsSchema>;
