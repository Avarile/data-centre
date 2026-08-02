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
 * length of 32. Halving the on-screen radius means dividing this by 8.
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

/**
 * Note that `type-knowledge` sets the rest length of the spring, not the radius
 * you see. Leaves carry their own charge, so they push each other off that
 * sphere until repulsion balances the link: at a rest length of 32 the clusters
 * measure ~53, held there by TIER_CHARGE.knowledge. Halving this shrinks a
 * cluster by roughly a third, not by half; that charge is the knob for the rest.
 */
export const LINK_DISTANCE: Record<KnowledgeLinkTier, number> = {
  'core-type': 260,
  'type-knowledge': 32,
};
export const DEFAULT_LINK_DISTANCE = 120;

/**
 * Link stiffness, and half of what stops the layout collapsing into a star.
 *
 * `core-type` is deliberately near-slack: it is a tether that keeps the branches
 * from drifting apart, not a placement force. At the default strength every type
 * is dragged onto one sphere of radius LINK_DISTANCE['core-type'], which is a
 * shell — and a shell viewed from inside reads as spokes radiating from the
 * middle. Note that it is the strength that does this, not the distance: at
 * 0.005 the tether only asserts itself once a type has wandered far, so type
 * placement is decided by type↔type repulsion instead, which fills a volume,
 * and LINK_DISTANCE['core-type'] is free to stay where it always was.
 *
 * `type-knowledge` goes the other way. Stiff, so a type and its leaves move as
 * one object, which is what makes a cluster read as a cluster rather than as a
 * hub with trailing threads.
 */
export const LINK_STRENGTH: Record<KnowledgeLinkTier, number> = {
  'core-type': 0.005,
  'type-knowledge': 0.7,
};
export const DEFAULT_LINK_STRENGTH = 0.3;

/**
 * The core is the hub every branch hangs from, so a charge on it is a force
 * pointing away from the scene's centre applied to every node at once — the
 * exact shape we do not want. It is 0 rather than absent because `chargeFor`
 * falls back with `??`: deleting the entry would quietly restore DEFAULT_CHARGE
 * and with it a weaker version of the same radial push.
 *
 * The core still earns its place in the simulation — it holds the type branches
 * into one connected component and is the recenter target — it just no longer
 * pushes.
 */
export const TIER_CHARGE: Record<KnowledgeNodeTier, number> = {
  core: 0,
  type: -480,
  knowledge: -40,
};
export const DEFAULT_CHARGE = -60;

/**
 * The other half of the anti-star fix, and the more important one.
 *
 * d3's many-body force is unbounded by default: every node repels every other
 * node at any separation. Summed over a scene, those long-range terms cancel
 * tangentially and reinforce radially, so the net force on any node points away
 * from the centre of mass — the layout is a star before a single link is
 * considered.
 *
 * Capping the range makes repulsion a local, cluster-scale effect: nodes
 * separate from their neighbours and are indifferent to clusters further off.
 * Local repulsion fills a volume; global repulsion projects onto a shell.
 *
 * 110 is the balance point, and it is a real trade-off in both directions.
 * Lower and neighbouring clusters stop shouldering each other apart and
 * interpenetrate into mush; higher and clusters separate cleanly while the star
 * creeps back. Measured over a sweep at the 1000-node budget, 110 holds the lean
 * at ~0.07 (against ~0.81 for the original unbounded charge, where 0 is a
 * direction-agnostic cloud and 1 is every leaf pointing straight outward) with
 * the closest pair of types ~111 apart against a cluster radius of ~53.
 *
 * It is therefore coupled to LINK_DISTANCE['type-knowledge']: raising the leaf
 * distance grows the clusters, and this has to grow with it or they merge.
 */
export const CHARGE_DISTANCE_MAX = 110;

export const FOCUS_DISTANCE: Record<KnowledgeNodeTier, number> = {
  // Unchanged: the cluster layout's extent runs ~352 at a dozen types to ~515
  // at the node budget, bracketing the ~503 this was framing before, so there is
  // nothing to compensate for.
  core: 420,
  // Tracks the cluster's rendered radius (~53), not the link distance — see the
  // note on LINK_DISTANCE['type-knowledge'] for why the two differ. This frames
  // a single cluster, so it has to follow what the cluster actually measures.
  type: 120,
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

export const linkStrengthFor = (tier: string): number =>
  LINK_STRENGTH[tier as KnowledgeLinkTier] ?? DEFAULT_LINK_STRENGTH;

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
