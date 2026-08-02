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
| charge `distanceMax` | ∞ (unset) | `110` | New. Repulsion becomes local — the change that produces islands. |
| `LINK_STRENGTH['core-type']` | default | `0.005` | New, tier-keyed. Loose tether: prevents drift, does not place. This, not the link distance, is what was pinning types to a shell. |
| `LINK_STRENGTH['type-knowledge']` | default | `0.7` | Stiff, so a cluster reads as one object. |
| `LINK_DISTANCE['type-knowledge']` | `70` | `32` | Cluster size, set by eye at the user's request. |
| `TIER_CHARGE.type` | `-280` | `-480` | Separates neighbouring clusters now that the range is capped. |
| `cooldownTicks` | `120` | `220` | Weaker forces need more ticks to settle; still bounded. |
| `FOCUS_DISTANCE.type` | `180` | `120` | Tracks the leaf distance — it frames one cluster, so it follows the cluster's size. |

`LINK_DISTANCE['core-type']` and `FOCUS_DISTANCE.core` stay where they were. The
first because the near-slack tether makes its length nearly irrelevant; the
second because the new layout's extent brackets the old one rather than shrinking.

With type placement no longer decided by the core→type link, it falls to
type↔type repulsion, which is capped at `distanceMax`. Types push apart until
they are past that range and then stop interacting, so they settle spread
through the volume instead of on a common radius.

`distanceMax` and `LINK_DISTANCE['type-knowledge']` are coupled: the leaf
distance sets the cluster radius, and the cap has to stay above it or
neighbouring clusters interpenetrate instead of shouldering each other apart.
Retuning either one means re-checking the pair.

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
sprites and labels, link paint, legend, search, detail panel, and camera
behaviour apart from the single-cluster standoff distance.

## Testing

- `buildSimulationGraph.spec.ts` covers the tier hierarchy, visibility, and
  camera standoff and must keep passing unchanged — none of its assertions
  depend on the retuned values.
- New assertions for `linkStrengthFor` and `chargeFor`: the strength ordering
  the layout rests on, the zero core charge surviving the `??` fallback, and the
  unknown-tier fallback that guards the NaN failure mode.

### Verifying the shape

Force layouts have no meaningful unit test, but they do not have to be judged
only by eye either. The values above were chosen by replaying the layout
headlessly against the same solver `three-forcegraph` uses (`d3-force-3d`, 3
dimensions, the same link/charge/center force set, the same `alphaDecay` and
tick budget) on synthetic graphs at 116, 410 and 1006 nodes, and measuring two
things:

- **outward bias** — the mean cosine of the angle between a leaf's offset from
  its type and that type's direction from the scene centre. `1` is every leaf
  pointing straight out from the middle, which is the star; `0` is a
  direction-agnostic cloud.
- **min type gap vs cluster radius** — the closest pair of type nodes against
  the mean leaf offset, to catch clusters merging into mush.

| | outward bias | min type gap | cluster radius |
|---|---|---|---|
| before | 0.81 | — | — |
| after, 116 nodes | 0.057 | 129 | 51 |
| after, 410 nodes | 0.030 | 120 | 53 |
| after, 1006 nodes | 0.070 | 111 | 53 |

`cooldownTicks = 220` was checked the same way: running 180 further ticks moves
nodes a mean of 1.1–2.5 units, so the layout is settled when the simulation
stops.

## Risks

A residual outward bias remains (0.030–0.070, no clear trend with graph size).
This is boundary asymmetry and is inherent to any bounded blob: clusters on the
outside are pushed by inner neighbours with nothing pushing back. It is an order
of magnitude below the star it replaces and is not expected to read as radial,
but a graph much larger than the current 2000-node budget would erode it.

`CHARGE_DISTANCE_MAX` and `LINK_DISTANCE['type-knowledge']` were retuned together
four times while settling the cluster size by eye (42, 95, 63, then 32). Any
further change to the leaf distance means re-running the sweep: at 32 the cap
sits at 110 and the closest types are ~111 apart against a 53 cluster radius, so
there is roughly one cluster-radius of slack before clusters begin to merge.

The leaf distance is also not the cluster radius. Leaves carry their own charge
and push each other off the sphere the link defines, so a rest length of 32
renders at ~53. Halving the link shrank the visible cluster by about a third;
`TIER_CHARGE.knowledge` is the knob for the remainder.
