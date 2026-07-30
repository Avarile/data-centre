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

/**
 * Leaf size, and the knob most likely to be retuned by eye. It is a volume, not
 * a radius: at the default `nodeRelSize` of 4 (never overridden here) a leaf
 * renders at `cbrt(0.3) * 4` ≈ 2.7 world units, against a `type-knowledge` link
 * length of 70. Halving the on-screen radius means dividing this by 8.
 */
export const KNOWLEDGE_NODE_VAL = 0.3;

/**
 * `nodeVal` is volumetric: three-forcegraph renders a sphere of
 * `cbrt(nodeVal) * nodeRelSize`. Scaling the value by 0.2 therefore shrinks the
 * visible radius by `cbrt(0.2)` ≈ 0.585, i.e. about 41% smaller on screen.
 */
const CORE_TYPE_VAL_SCALE = 0.2;

/**
 * A type node must never render smaller than the knowledge nodes hanging off it
 * — that reads as an inverted hierarchy. The degree formula below carries that
 * on its own at the current leaf size: its minimum, at degree 0, is
 * `8 * 0.2 = 1.6`, over five times the leaf value and so ~75% wider on screen.
 * Real taxonomies here carry only a handful of children each, so most types sit
 * near that minimum; the cap at degree 40 keeps the largest (6.4) under the
 * core (8).
 *
 * A `Math.max(KNOWLEDGE_NODE_VAL * 2, …)` floor used to guard this, and it did
 * bind while the leaf value was 2 — it goes dormant below a leaf of 0.8, so at
 * 0.3 it can never fire. It is removed rather than left dormant because a clamp
 * that silently rescues an inverted hierarchy hides the retuning that caused it.
 * The invariant is asserted across every degree in buildSimulationGraph.spec.ts
 * instead: set KNOWLEDGE_NODE_VAL to 1.6 or beyond and that spec fails, which is
 * the signal you want.
 */
export const NODE_VAL: Record<KnowledgeNodeTier, (degree: number) => number> = {
  core: () => 40 * CORE_TYPE_VAL_SCALE,
  type: (degree) => (8 + Math.min(degree, 40) * 0.6) * CORE_TYPE_VAL_SCALE,
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

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A camera position holding `distance` from `target`, along the direction the
 * camera already views it from. Preserving the direction is the point: framing
 * the core should change where the camera looks, not swing the scene round to
 * one canonical angle underneath the user.
 *
 * This is why the focus path's `position * (1 + distance / |position|)` cannot
 * simply be reused to frame the core. That form scales the node's own position
 * vector, which works only for a node sitting away from the origin; the core is
 * the hub every branch hangs from and sits at roughly (0,0,0), where scaling
 * leaves the camera inside the node.
 */
export const standoffPosition = (
  camera: IVector3,
  target: IVector3,
  distance: number
): IVector3 => {
  const dx = camera.x - target.x;
  const dy = camera.y - target.y;
  const dz = camera.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  // `!(length > 0)` rather than `length === 0`, so a NaN coordinate takes this
  // branch too instead of propagating NaN into the camera — see the note above
  // on how invisible NaN failures are here.
  if (!(length > 0)) {
    return { x: target.x, y: target.y, z: target.z + distance };
  }
  const scale = distance / length;
  return {
    x: target.x + dx * scale,
    y: target.y + dy * scale,
    z: target.z + dz * scale,
  };
};
