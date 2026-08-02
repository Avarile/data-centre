# Knowledge graph: organic clusters instead of a radial star

Date: 2026-08-02
Area: `apps/nextjs-app/src/features/app/blocks/knowledge-graph`

## Problem

Every node in the 3D knowledge graph reads as radiating outward from one central
point — a dandelion or firework, with each type branch a spike pointing away
from the origin. It is legible but it looks bad, and it hides the thing the
graph is for: which knowledge nodes belong together.

The radial shape is produced by the layout forces, not by the rendering. Three
things conspire:

1. `TIER_CHARGE.core = -600` sits on a node at the origin and repels with
   **unbounded range**. Every node in the scene therefore feels a strong push
   directed straight away from the centre. This is the dominant radial driver.
2. `LINK_DISTANCE['core-type'] = 260` at full (default) link strength pins every
   type node onto a single sphere shell of radius 260.
3. Knowledge leaves sit 70 from their type, so they fan out on the far side of
   that shell — the spikes.

## Goal

Clusters that float as separate islands. Each type is a rounded cloud of its own
knowledge nodes; the clusters are distributed through the volume rather than
projected onto a shell; no node path points conspicuously away from a centre.

## Approach

Retune the forces. Nothing about the node or link *paint* changes — colours,
sizes, sprites, labels, opacity, and the visibility rules all stay as they are.

The two mechanisms that do the work:

- **Kill the radial engine.** `TIER_CHARGE.core` goes to `0`. The core node stays
  in the simulation graph — it still holds the type branches into one connected
  component, and it is still the `recenterOnCore` target — but it stops pushing.
- **Make repulsion local.** A `distanceMax` on the charge force means a node
  separates from its neighbours but stops shoving distant clusters outward.
  Local-only repulsion fills a volume; global repulsion projects onto a shell.
  This is the change that turns a star into islands.

Supporting it: the core→type link becomes a loose tether (low strength) that
only prevents unbounded drift rather than imposing a radius, and the
type→knowledge link becomes stiff and short so each cluster reads as one object.

### Knobs

| Knob | From | To | Why |
|---|---|---|---|
| `TIER_CHARGE.core` | `-600` | `0` | Removes the radial engine. |
| charge `distanceMax` | ∞ (unset) | `160` | New. Repulsion becomes local — the change that produces islands. |
| `LINK_DISTANCE['core-type']` | `260` | `190` | Shorter tether; with the strength below it no longer sets a shell radius. |
| `LINK_DISTANCE['type-knowledge']` | `70` | `42` | Compact blobs — leaves hug their type instead of trailing off it. |
| `LINK_STRENGTH['core-type']` | default | `0.04` | New, tier-keyed. Loose tether: prevents drift, does not place. |
| `LINK_STRENGTH['type-knowledge']` | default | `0.7` | Stiff, so a cluster reads as one object. |
| `TIER_CHARGE.type` | `-280` | `-200` | Rebalanced against the now-capped range. |
| `cooldownTicks` | `120` | `220` | Weaker forces need more ticks to settle; still bounded. |
| `FOCUS_DISTANCE.core` | `420` | `340` | Scene extent shrinks, so the recenter framing follows. |

With type placement no longer decided by the core→type link, it falls to
type↔type repulsion, which is capped at `distanceMax`. Types push apart until
they are past that range and then stop interacting, so they settle spread
through the volume instead of on a common radius.

## Design decisions

**No new dependency.** `distanceMax` and `strength` are configured on the force
objects `react-force-graph-3d` already registers, through the existing
`fg.d3Force(...)` effect in `KnowledgeGraphCanvas`. `d3-force-3d` resolves only
inside the pnpm store and is not importable from the app, so reaching for
`forceCollide` would mean adding a package to `apps/nextjs-app/package.json`.
The charge and link tuning reaches the same look without it. If clusters later
turn out to need true non-overlap, adding that dependency is the follow-up —
not a reason to add it now.

**A new `linkStrengthFor` helper, not an inline lookup.** It sits beside the
existing `nodeValFor` / `linkDistanceFor` / `chargeFor` / `focusDistanceFor`
helpers and follows the same rule they all follow: the lookup is total, with a
`??` fallback, because an unknown tier returning `undefined` makes d3 compute
NaN positions and the scene renders empty with no error at all.

**`TIER_CHARGE.core = 0` rather than deleting the entry.** `chargeFor` uses `??`,
so `0` passes through as a real strength; a deleted entry would fall through to
`DEFAULT_CHARGE = -60` and quietly restore a weaker version of the same problem.

## Scope

Changed:

- `utils/graphTheme.ts` — the constants above, plus `LINK_STRENGTH`,
  `DEFAULT_LINK_STRENGTH`, `linkStrengthFor`, and `CHARGE_DISTANCE_MAX`.
- `KnowledgeGraphCanvas.tsx` — the force effect also sets link strength and the
  charge `distanceMax`; `cooldownTicks` raised.

Unchanged: `buildSimulationGraph.ts` and its invariants (the core stays in the
simulation graph while hidden from the render digest), node colour and size,
sprites and labels, link paint, legend, search, detail panel, camera behaviour
apart from the core standoff distance.

## Testing

- `buildSimulationGraph.spec.ts` covers the tier hierarchy, visibility, and
  camera standoff and must keep passing unchanged — none of its assertions
  depend on the retuned values.
- New assertions for `linkStrengthFor`: known tiers, and the unknown-tier
  fallback that guards the NaN failure mode.
- The layout itself is judged by eye: forces have no meaningful unit test.

## Risks

With the core charge at `0` and repulsion capped, a very large type — one with
many leaves — could pack tighter than intended, since nothing pushes its leaves
apart beyond `distanceMax`. `LINK_DISTANCE['type-knowledge']` is the knob to
raise if that shows up. Verified by eye against real data.
