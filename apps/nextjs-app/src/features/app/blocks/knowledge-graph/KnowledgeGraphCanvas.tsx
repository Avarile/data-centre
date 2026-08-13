import type { IKnowledgeGraphLink } from '@teable/openapi';
import { forceRadial } from 'd3-force-3d';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import ForceGraph3D from 'react-force-graph-3d';
import type { Camera } from 'three';
import SpriteText from 'three-spritetext';
import type { ISimulationGraph, ISimulationNode } from './utils/buildSimulationGraph';
import { isLinkVisible, isNodeVisible } from './utils/buildSimulationGraph';
import {
  chargeFor,
  CHARGE_DISTANCE_MAX,
  colorForNode,
  focusDistanceFor,
  linkDistanceFor,
  linkStrengthFor,
  nodeValFor,
  radialStrengthFor,
  SPHERE_RADIUS,
  standoffPosition,
} from './utils/graphTheme';

/**
 * Time-based, not per-frame. A fixed radians-per-frame step is tied to the
 * display: the previous 0.0016 rad/frame ran at 5.5°/s on a 60Hz panel but
 * 11°/s on a 120Hz one. Expressed per second, the speed is what it says.
 *
 * 2.5°/s is roughly one revolution every 2.5 minutes — a drift you notice
 * without it pulling your eye.
 */
const ROTATE_DEG_PER_SEC = 2.5;
const ROTATE_RAD_PER_MS = (ROTATE_DEG_PER_SEC * Math.PI) / 180 / 1000;

/**
 * Caps the step when frames are far apart, so coming back to a backgrounded tab
 * resumes the drift instead of snapping the camera through a large angle.
 */
const MAX_FRAME_MS = 100;

const LABEL_HEIGHT = 6;
const FOCUS_TRANSITION_MS = 900;

/**
 * Link paint, kept as two constants with one owner for transparency.
 * three-forcegraph multiplies the two channels — `linkOpacity * colorAlpha(color)`
 * — so the previous `rgba(148, 163, 184, 0.35)` alongside `linkOpacity={0.35}`
 * resolved to 0.1225, measuring 1.09:1 against CANVAS_BACKGROUND: in the scene
 * graph, invisible on screen. The colour is therefore opaque and LINK_OPACITY
 * alone owns the alpha.
 *
 * slate-600 at 0.7 measures 3.34:1. That clears the 3:1 floor for non-text
 * graphics and lands on the leaf nodes' own 3.37:1, so a branch is traceable
 * without the edges out-shouting what they connect. The old slate-400 could not
 * reach 3:1 at any alpha (1.73:1 even fully applied) — its lightness was the
 * ceiling, not the double multiply.
 *
 * Weight is left alone: `linkWidth` stays unset, because any truthy value swaps
 * every link for a CylinderGeometry mesh — one per link, ~2000 at the node
 * budget — and a cylinder thins with distance, where an unset width renders a
 * dimensionless line that holds 1px at every zoom level.
 */
const LINK_COLOR = '#475569';
const LINK_OPACITY = 0.14;

interface ITrackballControls {
  target: { x: number; y: number; z: number };
  update: () => void;
}

export interface IKnowledgeGraphCanvasHandle {
  /**
   * Ease the camera back onto the core — the hub every type branch hangs from,
   * and so the scene's centre. Imperative rather than a piece of view state: it
   * is a one-shot command, and modelling it as state would need a nonce to make
   * a second press do anything at all.
   */
  recenterOnCore: () => void;
}

interface IKnowledgeGraphCanvasProps {
  graph: ISimulationGraph;
  width: number;
  height: number;
  backgroundColor: string;
  focusedNodeId: string | null;
  autoRotate: boolean;
  onNodeClick: (nodeId: string | null) => void;
  /** Called when the user grabs the scene, so auto-rotate can yield. */
  onUserInteract: () => void;
}

const LABELLED_TIERS = new Set(['core', 'type']);

/**
 * Always-on labels for `core` and `type` only. Each SpriteText allocates a
 * canvas-backed texture plus a material and adds a draw call, so labelling every
 * node at the 2000-node budget means 2000 textures and 2000 extra draw calls.
 * Core + types is bounded at roughly 1 + 50, which is free — and it is also the
 * right information design: the taxonomy is what is worth reading at rest.
 *
 * Gated on visibility so a hidden tier never allocates a texture it cannot
 * show, and so the two policies cannot drift apart.
 */
const shouldLabel = (node: ISimulationNode) => isNodeVisible(node) && LABELLED_TIERS.has(node.tier);

const disposeSprites = (map: Map<string, SpriteText>) => {
  map.forEach((sprite) => {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
  map.clear();
};

export const KnowledgeGraphCanvas = forwardRef<
  IKnowledgeGraphCanvasHandle,
  IKnowledgeGraphCanvasProps
>((props, ref) => {
  const {
    graph,
    width,
    height,
    backgroundColor,
    focusedNodeId,
    autoRotate,
    onNodeClick,
    onUserInteract,
  } = props;

  const fgRef = useRef<ForceGraphMethods<ISimulationNode, IKnowledgeGraphLink> | undefined>(
    undefined
  );
  const spriteMapRef = useRef(new Map<string, SpriteText>());

  // The core is in the simulation but never drawn, so its coordinates are the
  // only handle on where the scene's centre actually drifted to. Falling back to
  // the origin is right rather than defensive: that is where the hub of the star
  // sits, and where an empty scene is centred.
  useImperativeHandle(
    ref,
    () => ({
      recenterOnCore: () => {
        const fg = fgRef.current;
        if (!fg) {
          return;
        }
        const core = graph.nodes.find((node) => node.tier === 'core');
        const target = { x: core?.x ?? 0, y: core?.y ?? 0, z: core?.z ?? 0 };
        const camera = fg.camera() as Camera;
        fg.cameraPosition(
          standoffPosition(camera.position, target, focusDistanceFor('core')),
          target,
          FOCUS_TRANSITION_MS
        );
      },
    }),
    [graph]
  );

  // Tier-keyed force lookups are total via the `*For` helpers: an unknown tier
  // returning undefined makes d3 compute NaN positions, and the scene renders
  // empty with no error at all.
  //
  // `distanceMax` is what keeps the layout from resolving into a star: an
  // uncapped many-body force has every node repelling every other at any
  // separation, and those long-range terms sum to a push away from the centre of
  // mass. See CHARGE_DISTANCE_MAX for the whole argument. It is set here rather
  // than at construction because three-forcegraph registers the force itself;
  // this effect is the only hook we have on it.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) {
      return;
    }
    const linkForce = fg.d3Force('link');
    linkForce?.distance?.((link: { tier?: string }) => linkDistanceFor(link.tier ?? ''));
    linkForce?.strength?.((link: { tier?: string }) => linkStrengthFor(link.tier ?? ''));
    const charge = fg.d3Force('charge');
    charge?.strength?.((node: ISimulationNode) => chargeFor(node.tier));
    charge?.distanceMax?.(CHARGE_DISTANCE_MAX);
    // Pins type and knowledge nodes onto one sphere shell — see SPHERE_RADIUS
    // for why the core is excluded and both other tiers share a radius.
    fg.d3Force(
      'radial',
      forceRadial<ISimulationNode>(SPHERE_RADIUS, 0, 0, 0).strength((node) =>
        radialStrengthFor(node.tier)
      )
    );
  }, [graph]);

  // Sprites are cached by node id and reused across filter changes, so a legend
  // toggle does not churn the whole label set. Disposal runs on graph change as
  // well as unmount: clearing the map without disposing leaks one GPU texture
  // per sprite per rebuild.
  useEffect(() => {
    const map = spriteMapRef.current;
    const live = new Set(graph.nodes.filter(shouldLabel).map((node) => node.id));
    map.forEach((sprite, id) => {
      if (!live.has(id)) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
        map.delete(id);
      }
    });
  }, [graph]);

  const nodeThreeObject = useCallback((node: ISimulationNode) => {
    const map = spriteMapRef.current;
    if (!shouldLabel(node)) {
      // With nodeThreeObjectExtend, a falsy return leaves the node as the
      // default sphere and adds nothing — no texture, no extra draw call.
      return undefined as unknown as SpriteText;
    }
    const cached = map.get(node.id);
    if (cached) {
      return cached;
    }
    const sprite = new SpriteText(node.label, LABEL_HEIGHT, colorForNode(node));
    sprite.fontWeight = '600';
    sprite.position.set(0, node.tier === 'core' ? 24 : 10, 0);
    map.set(node.id, sprite);
    return sprite;
  }, []);

  // Orbit about the world Y axis through the controls target, and let the
  // controls own lookAt and the up vector. Writing camera.position AND calling
  // camera.lookAt every frame fights TrackballControls, which writes the same
  // properties from its own target, and the up-vector drifts.
  useEffect(() => {
    if (!autoRotate) {
      return;
    }
    let raf = 0;
    let previous = 0;
    const tick = (now: number) => {
      const fg = fgRef.current;
      const controls = fg?.controls() as ITrackballControls | undefined;
      // The first frame has no predecessor, so it only establishes the baseline.
      const elapsed = previous ? Math.min(now - previous, MAX_FRAME_MS) : 0;
      previous = now;

      if (fg && controls && elapsed > 0) {
        const angle = elapsed * ROTATE_RAD_PER_MS;
        const cam = fg.camera() as Camera;
        const { x: tx, z: tz } = controls.target;
        const dx = cam.position.x - tx;
        const dz = cam.position.z - tz;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        cam.position.x = tx + dx * cos + dz * sin;
        cam.position.z = tz + dz * cos - dx * sin;
        // y is the orbit axis and is left untouched.
        controls.update();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  // Listeners go on the renderer's own canvas: that is the element which
  // actually receives the gestures, and it survives the fullscreen re-parent.
  useEffect(() => {
    const el = fgRef.current?.renderer().domElement;
    if (!el) {
      return;
    }
    const stop = () => onUserInteract();
    el.addEventListener('pointerdown', stop, { passive: true });
    el.addEventListener('wheel', stop, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('wheel', stop);
    };
  }, [onUserInteract]);

  // Ease the camera along the vector from the scene centre to the node, holding
  // a tier-dependent standoff. cameraPosition animates and drives the controls
  // target itself, so it composes with auto-rotate rather than fighting it.
  useEffect(() => {
    if (!focusedNodeId) {
      return;
    }
    const node = graph.nodes.find((candidate) => candidate.id === focusedNodeId);
    if (!node) {
      return;
    }
    const distance = focusDistanceFor(node.tier);
    const { x = 0, y = 0, z = 0 } = node;
    const ratio = 1 + distance / Math.hypot(x, y, z || 1);
    fgRef.current?.cameraPosition(
      { x: x * ratio, y: y * ratio, z: z * ratio },
      { x, y, z },
      FOCUS_TRANSITION_MS
    );
  }, [focusedNodeId, graph]);

  // Teardown is required, and doubly so because reactStrictMode runs effects
  // twice in dev — a missing teardown leaks a second WebGL context immediately.
  useEffect(() => {
    const spriteMap = spriteMapRef.current;
    return () => {
      // fgRef.current is read here on purpose rather than captured above: we
      // need the instance that exists at unmount, not one snapshotted earlier.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const fg = fgRef.current as (typeof fgRef)['current'] & { _destructor?: () => void };
      fg?.pauseAnimation();
      disposeSprites(spriteMap);
      fg?._destructor?.();
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      const fg = fgRef.current;
      if (!fg) {
        // Already torn down.
        return;
      }
      if (document.hidden) {
        fg.pauseAnimation();
      } else {
        fg.resumeAnimation();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleNodeClick = useCallback(
    (node: ISimulationNode) => onNodeClick(node.id ?? null),
    [onNodeClick]
  );

  const nodeLabel = useMemo(() => (node: ISimulationNode) => node.label, []);

  return (
    <ForceGraph3D<ISimulationNode, IKnowledgeGraphLink>
      ref={fgRef}
      graphData={graph}
      width={width}
      height={height}
      backgroundColor={backgroundColor}
      nodeId="id"
      nodeLabel={nodeLabel}
      nodeVal={(node) => nodeValFor(node.tier, node.degree)}
      nodeColor={(node) => colorForNode(node)}
      nodeOpacity={0.9}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend
      nodeVisibility={isNodeVisible}
      linkVisibility={isLinkVisible}
      linkColor={() => LINK_COLOR}
      linkOpacity={LINK_OPACITY}
      enableNodeDrag={false}
      onNodeClick={handleNodeClick}
      onBackgroundClick={() => onNodeClick(null)}
      // The tether holding the branches together is near-slack by design, so the
      // layout settles more slowly than a stiff star would. 220 is where the
      // clusters stop visibly moving; the cap is what bounds the CPU cost.
      cooldownTicks={220}
      d3AlphaDecay={0.015}
    />
  );
});

KnowledgeGraphCanvas.displayName = 'KnowledgeGraphCanvas';
