import type { IKnowledgeGraphNode, KnowledgeLinkTier, KnowledgeNodeTier } from '@teable/openapi';
import { UNCLASSIFIED_TYPE_NODE_ID } from '@teable/openapi';

/**
 * FNV-1a. Stable and data-independent: a type keeps its hue when siblings are
 * added or removed, which an index-based palette could never guarantee.
 */
const hashHue = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
};

export const CORE_COLOR = '#e8e3d9';
export const UNCLASSIFIED_COLOR = '#6b7280';

export const colorForNode = (node: Pick<IKnowledgeGraphNode, 'tier' | 'id' | 'typeId'>): string => {
  if (node.tier === 'core') {
    return CORE_COLOR;
  }
  const key = node.tier === 'type' ? node.id : node.typeId;
  if (!key || key === UNCLASSIFIED_TYPE_NODE_ID) {
    return UNCLASSIFIED_COLOR;
  }
  const hue = hashHue(key);
  // Type nodes read brighter than their children, so the tier is legible by
  // value as well as by position.
  return node.tier === 'type' ? `hsl(${hue} 72% 62%)` : `hsl(${hue} 52% 46%)`;
};

export const KNOWLEDGE_NODE_VAL = 2;

/**
 * `nodeVal` is volumetric: three-forcegraph renders a sphere of
 * `cbrt(nodeVal) * nodeRelSize`. Scaling the value by 0.2 therefore shrinks the
 * visible radius by `cbrt(0.2)` ≈ 0.585, i.e. about 41% smaller on screen.
 */
const CORE_TYPE_VAL_SCALE = 0.2;

/**
 * A type node must never render smaller than the knowledge nodes hanging off it
 * — that reads as an inverted hierarchy. The floor is set well clear of a leaf
 * rather than just above it: real taxonomies here carry only a handful of
 * children each, so `8 + 0.6 * degree` barely varies and almost every type
 * lands on this floor. At 2x the leaf value a floored type renders ~26% wider
 * than a leaf, which keeps the tier readable instead of collapsing into it.
 */
const MIN_TYPE_NODE_VAL = KNOWLEDGE_NODE_VAL * 2;

export const NODE_VAL: Record<KnowledgeNodeTier, (degree: number) => number> = {
  core: () => 40 * CORE_TYPE_VAL_SCALE,
  type: (degree) =>
    Math.max(MIN_TYPE_NODE_VAL, (8 + Math.min(degree, 40) * 0.6) * CORE_TYPE_VAL_SCALE),
  knowledge: () => KNOWLEDGE_NODE_VAL,
};
export const DEFAULT_NODE_VAL = KNOWLEDGE_NODE_VAL;

export const LINK_DISTANCE: Record<KnowledgeLinkTier, number> = {
  'core-type': 260,
  'type-knowledge': 70,
};
export const DEFAULT_LINK_DISTANCE = 120;

export const TIER_CHARGE: Record<KnowledgeNodeTier, number> = {
  core: -600,
  type: -280,
  knowledge: -40,
};
export const DEFAULT_CHARGE = -60;

export const FOCUS_DISTANCE: Record<KnowledgeNodeTier, number> = {
  core: 420,
  type: 180,
  knowledge: 90,
};
export const DEFAULT_FOCUS_DISTANCE = 150;

/**
 * Every tier-keyed lookup below is total on purpose. An unknown tier returning
 * undefined makes d3 compute NaN positions; every node collapses to NaN and the
 * scene renders empty with no error at all — the hardest failure in this design
 * to diagnose. The `??` fallbacks degrade an unknown tier to a neutral node.
 */
export const nodeValFor = (tier: string, degree: number): number =>
  NODE_VAL[tier as KnowledgeNodeTier]?.(degree) ?? DEFAULT_NODE_VAL;

export const linkDistanceFor = (tier: string): number =>
  LINK_DISTANCE[tier as KnowledgeLinkTier] ?? DEFAULT_LINK_DISTANCE;

export const chargeFor = (tier: string): number =>
  TIER_CHARGE[tier as KnowledgeNodeTier] ?? DEFAULT_CHARGE;

export const focusDistanceFor = (tier: string): number =>
  FOCUS_DISTANCE[tier as KnowledgeNodeTier] ?? DEFAULT_FOCUS_DISTANCE;
