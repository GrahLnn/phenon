import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Panel } from "./pannel";
import { action, hook } from "../../state_machine/graph";
import {
  getExcludedByArrowOtherEnd,
  getDraggingNodeType,
  getNodeConnectType,
  shouldShowDragHintRing,
} from "../../state_machine/graph/selectors";
import {
  Simulation,
  type SimNode,
  applyMinigraphForce,
} from "../../graph_physics";
import {
  Vec2,
  MutRef,
  Transform,
  getOrCreateRef,
  DEFAULT_EDGE_LEN,
  NODE_DIAMETER,
  NODE_RADIUS,
  SIM_ALPHA_DECAY_DEFAULT,
} from "./graph_utils";
import { NodeLayer } from "./node";
import { EdgeLayer } from "./edge";

const syncNodeDom = (
  ids: readonly string[],
  elMap: Map<string, HTMLDivElement | null>,
  posMap: Map<string, MutRef<Vec2>>
) => {
  for (const id of ids) {
    const el = elMap.get(id);
    const p = posMap.get(id)?.current;
    if (!el || !p) continue;
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
  }
};

const DROP_CONNECT_RADIUS_PX = 60;

export function Graph() {
  const nodes = hook.useNodes();
  const edges = hook.useEdges();
  const ctx = hook.useContext();
  const st = hook.useState();
  const isDragMode = st.is("drag");
  const draggingNodeId = ctx.draggingNodeId;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<Transform>({ zoom: 1, origin: { x: 0, y: 0 } });

  const simRef = useRef<Simulation<{ id: string }> | null>(null);
  const simNodesRef = useRef<Record<string, SimNode<{ id: string }>>>({});
  const simLinksRef = useRef<
    Array<{ source_id: string; target_id: string; centerDistance?: number }>
  >([]);
  const dragCountRef = useRef(0);
  const pinnedRef = useRef<Set<string>>(new Set());

  const posRefMap = useRef<Map<string, MutRef<Vec2>>>(new Map());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const nodeElMapRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const nodeVisualMapRef = useRef<Map<string, HTMLElement | null>>(new Map());
  const edgeDirtyRef = useRef({ current: true });
  const [initial, setInitial] = useState<Transform>({
    zoom: 1,
    origin: { x: 0, y: 0 },
  });

  const onTransformChange = useCallback((t: Transform) => {
    if (transformRef.current) {
      transformRef.current.zoom = t.zoom;
      transformRef.current.origin = t.origin;
    }
  }, []);

  const { nodesForRender, edgesForRender, ghostSpecById, ghostEdgeLenById } =
    useMemo(() => {
      type GhostStyle = "hollow" | "transparent";
      type GhostSpec = {
        anchorId: string;
        dir: -1 | 1;
        len: number;
        style: GhostStyle;
      };

      const ghostSpecById: Record<string, GhostSpec> = {};
      const ghostEdgeLenById: Record<string, number> = {};
      const ghostNodes: Record<string, any> = {};
      const edgesForRender: Record<string, any> = {};

      for (const eid of Object.keys(edges)) {
        const e = edges[eid];
        const isScope = e?.ty?.is?.("AT") ?? false;
        const len = isScope ? (DEFAULT_EDGE_LEN * 2) / 3 : DEFAULT_EDGE_LEN;
        const style: GhostStyle = isScope ? "transparent" : "hollow";

        const src = e?.source as string | undefined;
        const tgt = e?.target as string | undefined;

        if (src && tgt) {
          edgesForRender[eid] = e;
          continue;
        }

        if (src && !tgt) {
          const gid = `__ghost:${eid}:target`;
          edgesForRender[eid] = { ...e, target: gid };
          ghostNodes[gid] = { ghost: true, ghostStyle: style };
          ghostSpecById[gid] = { anchorId: src, dir: 1, len, style };
          ghostEdgeLenById[eid] = len;
          continue;
        }

        if (!src && tgt) {
          const gid = `__ghost:${eid}:source`;
          edgesForRender[eid] = { ...e, source: gid };
          ghostNodes[gid] = { ghost: true, ghostStyle: style };
          ghostSpecById[gid] = { anchorId: tgt, dir: -1, len, style };
          ghostEdgeLenById[eid] = len;
          continue;
        }
      }

      return {
        nodesForRender: { ...nodes, ...ghostNodes },
        edgesForRender,
        ghostSpecById,
        ghostEdgeLenById,
      };
    }, [nodes, edges]);

  const pinnableIds = useMemo(() => {
    if (!isDragMode) return [] as string[];
    if (!draggingNodeId) return [] as string[];

    const excludedByArrowOtherEnd = getExcludedByArrowOtherEnd({
      isDragMode,
      draggingNodeId,
      edges: edgesForRender as any,
    }) as Set<string>;

    const draggingNodeType =
      getDraggingNodeType({
        draggingNodeId,
        nodes: nodesForRender as any,
      }) ?? "unit";

    const out: string[] = [];
    for (const id of Object.keys(nodesForRender)) {
      const nodeType = getNodeConnectType({ id, nodes: nodesForRender as any });
      if (
        shouldShowDragHintRing({
          isDragMode,
          id,
          nodeType,
          draggingNodeId,
          draggingNodeType,
          excludedByArrowOtherEnd,
        })
      ) {
        out.push(id);
      }
    }
    return out;
  }, [isDragMode, draggingNodeId, edgesForRender, nodesForRender]);

  useLayoutEffect(() => {
    const pinned = pinnedRef.current;
    const simNodes = simNodesRef.current;
    const posMap = posRefMap.current;
    const sim = simRef.current;

    if (!isDragMode || !draggingNodeId) {
      for (const id of Array.from(pinned)) {
        const n = simNodes[id];
        if (n) {
          n.fx = undefined;
          n.fy = undefined;
        }
        pinned.delete(id);
      }
      return;
    }

    const next = new Set(pinnableIds);

    for (const id of Array.from(pinned)) {
      if (!next.has(id) || !simNodes[id]) {
        const n = simNodes[id];
        if (n) {
          n.fx = undefined;
          n.fy = undefined;
        }
        pinned.delete(id);
      }
    }

    for (const id of Array.from(next)) {
      if (pinned.has(id)) continue;
      const n = simNodes[id];
      if (!n) continue;

      const p = posMap?.get(id)?.current;
      const x = p?.x ?? n.x;
      const y = p?.y ?? n.y;
      n.fx = x;
      n.fy = y;
      n.x = x;
      n.y = y;
      n.vx = 0;
      n.vy = 0;
      pinned.add(id);
    }

    if (sim && pinned.size > 0) {
      sim.alphaDecay(0);
      sim.alpha(0.25);
    }
  }, [isDragMode, draggingNodeId, pinnableIds]);

  useLayoutEffect(() => {
    if (simRef.current) return;

    const sim = new Simulation<{ id: string }>({
      alpha: 0.25,
      alphaDecay: SIM_ALPHA_DECAY_DEFAULT,
      alphaTarget: 0,
      n: 6,
      velocityDecay: 0.1,
      force: (alpha) => {
        applyMinigraphForce(simNodesRef.current, simLinksRef.current, alpha, {
          linkDistance: 24,
          maxD: 6 * 24,
          axisLockY: false,
        });
      },
    });

    sim.nodes(simNodesRef.current);
    simRef.current = sim;
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);

      const sim = simRef.current;
      if (!sim) return;
      if (sim.alpha() < sim.alphaMin()) return;

      const ended = sim.step();
      if (ended) return;

      const posMap = posRefMap.current;
      const elMap = nodeElMapRef.current;
      if (!posMap || !elMap) return;

      const simNodes = sim.nodes();
      for (const id of Object.keys(simNodes)) {
        const n = simNodes[id];
        const ref = posMap.get(id);
        if (ref) ref.current = { x: n.x, y: n.y };
        const el = elMap.get(id);
        if (el) {
          el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0) translate(-50%, -50%)`;
        }
      }

      if (edgeDirtyRef.current) edgeDirtyRef.current.current = true;
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  useLayoutEffect(() => {
    const nextLinks: Array<{
      source_id: string;
      target_id: string;
      centerDistance?: number;
    }> = [];

    for (const eid of Object.keys(edgesForRender)) {
      const e = edgesForRender[eid];
      const src = e?.source as string | undefined;
      const tgt = e?.target as string | undefined;
      if (!src || !tgt) continue;

      const hasGhost = src.startsWith("__ghost:") || tgt.startsWith("__ghost:");

      nextLinks.push({
        source_id: src,
        target_id: tgt,
        centerDistance: hasGhost ? ghostEdgeLenById[eid] : undefined,
      });
    }
    simLinksRef.current = nextLinks;

    const sim = simRef.current;
    if (sim) {
      sim.alpha(0.25);
      sim.alphaDecay(dragCountRef.current > 0 ? 0 : SIM_ALPHA_DECAY_DEFAULT);
    }

    edgeDirtyRef.current.current = true;
  }, [edgesForRender, ghostEdgeLenById]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const init = { zoom: 1, origin: { x: r.width / 2, y: r.height / 2 } };
    setInitial(init);
    if (transformRef.current) {
      transformRef.current.zoom = init.zoom;
      transformRef.current.origin = init.origin;
    }
  }, []);

  useLayoutEffect(() => {
    const ids = Object.keys(nodesForRender);
    const idSet = new Set(ids);

    const posMap = posRefMap.current;
    const known = knownIdsRef.current;
    const elMap = nodeElMapRef.current;
    const visualMap = nodeVisualMapRef.current;
    if (!posMap || !known || !elMap || !visualMap) return;

    const host = hostRef.current;
    const t = transformRef.current;
    const rHost = host?.getBoundingClientRect();
    const centerScreen = {
      x: (rHost?.width ?? 0) / 2,
      y: (rHost?.height ?? 0) / 2,
    };
    const zoom = t?.zoom ?? 1;
    const origin = t?.origin ?? { x: 0, y: 0 };
    const centerWorld = {
      x: (centerScreen.x - origin.x) / zoom,
      y: (centerScreen.y - origin.y) / zoom,
    };

    for (const id of Array.from(posMap.keys())) {
      if (idSet.has(id)) continue;
      posMap.delete(id);
      known.delete(id);
      elMap.delete(id);
      visualMap.delete(id);
      delete simNodesRef.current[id];
    }

    const newIds: string[] = [];
    let newRealCount = 0;
    for (const id of ids) {
      getOrCreateRef(posMap, id, () => ({ x: 0, y: 0 }));
      if (known.has(id)) continue;
      known.add(id);

      newIds.push(id);

      const ref = posMap.get(id);
      if (ref) {
        const ghostSpec = ghostSpecById[id];
        if (ghostSpec) {
          const anchor = posMap.get(ghostSpec.anchorId)?.current ?? centerWorld;
          ref.current = {
            x: anchor.x + ghostSpec.dir * ghostSpec.len,
            y: anchor.y,
          };
        } else {
          newRealCount += 1;
          const ang = ((newRealCount + 1) * 997) % 360;
          const rad = (ang * Math.PI) / 180;
          const rr = 24;
          ref.current = {
            x: centerWorld.x + Math.cos(rad) * rr,
            y: centerWorld.y + Math.sin(rad) * rr,
          };
        }
      }
    }

    for (const id of ids) {
      const p = posMap.get(id)?.current ?? { x: 0, y: 0 };
      const existed = simNodesRef.current[id];
      if (existed) {
        if (existed.fx === undefined) {
          existed.x = p.x;
          existed.y = p.y;
        }
        existed._x = existed.x;
        existed._y = existed.y;
        existed.shape = (nodesForRender as any)?.[id]?.shape ?? "circle";
        existed.r = NODE_RADIUS;
        existed.width = NODE_DIAMETER;
        existed.height = NODE_DIAMETER;
        continue;
      }

      simNodesRef.current[id] = {
        id,
        x: p.x,
        y: p.y,
        _x: p.x,
        _y: p.y,
        fx: undefined,
        fy: undefined,
        shape: (nodesForRender as any)?.[id]?.shape ?? "circle",
        r: NODE_RADIUS,
        width: NODE_DIAMETER,
        height: NODE_DIAMETER,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        hx: 0,
        hy: 0,
      };
    }

    const sim = simRef.current;
    if (sim) {
      sim.nodes(simNodesRef.current);
      sim.alpha(0.25);
      sim.alphaDecay(dragCountRef.current > 0 ? 0 : SIM_ALPHA_DECAY_DEFAULT);
    }

    if (newIds.length > 0) {
      syncNodeDom(newIds, elMap, posMap);
    }

    edgeDirtyRef.current.current = true;
  }, [nodesForRender, ghostSpecById]);

  return (
    <div ref={hostRef} className="w-full h-full overflow-hidden">
      <Panel
        className="w-full h-full"
        initial={initial}
        onTransformChange={onTransformChange}
      >
        <EdgeLayer
          edges={edgesForRender}
          posRefMap={posRefMap}
          nodeVisualMapRef={nodeVisualMapRef}
          transformRef={transformRef}
          dirtyRef={edgeDirtyRef}
        />
        <NodeLayer
          nodes={nodesForRender}
          posRefMap={posRefMap}
          transformRef={transformRef}
          nodeElMapRef={nodeElMapRef}
          nodeVisualMapRef={nodeVisualMapRef}
          onDirty={() => {
            edgeDirtyRef.current.current = true;
          }}
          onNodeDragStart={(id) => {
            const sim = simRef.current;
            const n = simNodesRef.current[id];
            const p = posRefMap.current?.get(id)?.current;
            if (n && p) {
              n.fx = p.x;
              n.fy = p.y;
              n.x = p.x;
              n.y = p.y;
              n.vx = 0;
              n.vy = 0;
            }
            dragCountRef.current += 1;
            if (sim) {
              sim.alphaDecay(0);
              sim.alpha(0.25);
            }
          }}
          onNodeDrag={(id, pos) => {
            const n = simNodesRef.current[id];
            if (n) {
              n.fx = pos.x;
              n.fy = pos.y;
              n.x = pos.x;
              n.y = pos.y;
              n.vx = 0;
              n.vy = 0;
            }
          }}
          onNodeDragEnd={(id) => {
            const sim = simRef.current;
            const n = simNodesRef.current[id];
            if (n) {
              n.fx = undefined;
              n.fy = undefined;
            }
            dragCountRef.current = Math.max(0, dragCountRef.current - 1);
            if (sim && dragCountRef.current === 0) {
              sim.alphaDecay(SIM_ALPHA_DECAY_DEFAULT);
              sim.alpha(0.25);
            }

            const draggedPos = posRefMap.current?.get(id)?.current;
            if (!draggedPos) return;

            const z = transformRef.current?.zoom ?? 1;
            const rWorld = DROP_CONNECT_RADIUS_PX / (z || 1);

            const excludedByArrowOtherEnd = getExcludedByArrowOtherEnd({
              isDragMode: true,
              draggingNodeId: id,
              edges: edges as any,
            }) as Set<string>;

            const draggingNodeType =
              getDraggingNodeType({
                draggingNodeId: id,
                nodes: nodes as any,
              }) ?? "unit";

            let bestId: string | null = null;
            let bestD = Infinity;

            for (const candId of Object.keys(nodes)) {
              if (candId === id) continue;

              const nodeType = getNodeConnectType({
                id: candId,
                nodes: nodes as any,
              });

              const ok = shouldShowDragHintRing({
                isDragMode: true,
                id: candId,
                nodeType,
                draggingNodeId: id,
                draggingNodeType,
                excludedByArrowOtherEnd,
              });
              if (!ok) continue;

              const p = posRefMap.current?.get(candId)?.current;
              if (!p) continue;

              const d = Math.hypot(draggedPos.x - p.x, draggedPos.y - p.y);
              if (d <= rWorld && d < bestD) {
                bestD = d;
                bestId = candId;
              }
            }

            if (bestId) {
              action.merge_nodes({ from: id, into: bestId });
            }
          }}
        />
      </Panel>
    </div>
  );
}
