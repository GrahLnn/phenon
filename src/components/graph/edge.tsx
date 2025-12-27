import {
  useCallback,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type { RefObject } from "react";

import {
  Vec2,
  MutRef,
  Transform,
  NODE_RADIUS,
  EDGE_ARROW_HEIGHT,
  DEFAULT_EDGE_LEN,
  EDGE_TAIL_OVERLAP_PX,
} from "./graph_utils";

const unitVector = (a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 1, y: 0 };
  return { x: dx / d, y: dy / d };
};

const getHalfSizeWorld = (
  el: HTMLElement | null,
  zoom: number
): Vec2 | null => {
  if (!el) return null;
  const z = zoom || 1;
  const r = el.getBoundingClientRect();
  return { x: r.width / (2 * z), y: r.height / (2 * z) };
};

const isCircleLike = (el: HTMLElement | null, zoom: number): boolean => {
  if (!el) return false;
  const cs = window.getComputedStyle(el);
  const br = cs.borderTopLeftRadius;
  const n = parseFloat(br);
  if (!Number.isFinite(n)) return false;
  const half = getHalfSizeWorld(el, zoom);
  if (!half) return false;
  const minHalf = Math.min(half.x, half.y);
  return n >= minHalf - 0.5;
};

const rectangleRegion = (
  width: number,
  height: number,
  u: Vec2
): "left" | "right" | "top" | "bottom" => {
  const w2 = width / 2;
  const h2 = height / 2;
  const x = u.x;
  const y = u.y;
  if (Math.abs(x) * h2 > Math.abs(y) * w2) {
    return x > 0 ? "right" : "left";
  }
  return y > 0 ? "bottom" : "top";
};

const pointInCircle = (
  center: Vec2,
  r: number,
  toward: Vec2,
  padding: number = 0
): Vec2 => {
  const u = unitVector(center, toward);
  const safePadding = Math.min(Math.max(0, padding), Math.max(0, r - 0.001));
  return {
    x: center.x + u.x * (r - safePadding),
    y: center.y + u.y * (r - safePadding),
  };
};

const pointInRectangle = (
  center: Vec2,
  width: number,
  height: number,
  toward: Vec2,
  padding: number = 0
): Vec2 => {
  const u = unitVector(center, toward);
  const region = rectangleRegion(width, height, u);
  const tan = u.x / u.y;
  const a = Math.atan2(u.y, u.x);

  if (region === "left" || region === "right") {
    const sx = Math.sign(u.x);
    return {
      x: center.x + sx * (width / 2) - padding * Math.cos(a),
      y: center.y + sx * (width / 2 / tan) - padding * Math.sin(a),
    };
  }

  const sy = Math.sign(u.y);
  return {
    x: center.x + sy * ((height / 2) * tan) - padding * Math.cos(a),
    y: center.y + sy * (height / 2) - padding * Math.sin(a),
  };
};

const pointInNode = (
  center: Vec2,
  toward: Vec2,
  el: HTMLElement | null,
  zoom: number,
  padding: number
): Vec2 => {
  const half = getHalfSizeWorld(el, zoom) ?? { x: NODE_RADIUS, y: NODE_RADIUS };
  if (!el) {
    const r = Math.min(half.x, half.y);
    return pointInCircle(center, r, toward, padding);
  }
  if (isCircleLike(el, zoom)) {
    const r = Math.min(half.x, half.y);
    return pointInCircle(center, r, toward, padding);
  }
  return pointInRectangle(center, half.x * 2, half.y * 2, toward, padding);
};

type EdgeFrameCtx = {
  posMap: Map<string, MutRef<Vec2>>;
  zoom: number;
  visualMap: Map<string, HTMLElement | null>;
};

const resolveArrowEndpoints = (edge: any, ctx: EdgeFrameCtx) => {
  const sourceId = edge?.source as string | undefined;
  const targetId = edge?.target as string | undefined;

  const src = sourceId ? ctx.posMap.get(sourceId)?.current : undefined;
  const tgt = targetId ? ctx.posMap.get(targetId)?.current : undefined;

  const make = (
    a: Vec2,
    b: Vec2,
    aEl: HTMLElement | null,
    bEl: HTMLElement | null
  ) => {
    const uAB = unitVector(a, b);
    const overlapWorld = EDGE_TAIL_OVERLAP_PX / (ctx.zoom || 1);
    const p0Tip = pointInNode(a, b, aEl, ctx.zoom, 0);
    const p0 = {
      x: p0Tip.x + uAB.x * overlapWorld,
      y: p0Tip.y + uAB.y * overlapWorld,
    };
    const p1Tip = pointInNode(b, a, bEl, ctx.zoom, 0);
    const back = EDGE_ARROW_HEIGHT / 2;
    const uBA = unitVector(b, a);
    return {
      p0,
      p1: { x: p1Tip.x + uBA.x * back, y: p1Tip.y + uBA.y * back },
    };
  };

  if (src && tgt) {
    return make(
      src,
      tgt,
      ctx.visualMap.get(sourceId!) ?? null,
      ctx.visualMap.get(targetId!) ?? null
    );
  }
  if (tgt && !src) {
    const a = { x: tgt.x - DEFAULT_EDGE_LEN, y: tgt.y };
    return make(a, tgt, null, ctx.visualMap.get(targetId!) ?? null);
  }
  if (src && !tgt) {
    const b = { x: src.x + DEFAULT_EDGE_LEN, y: src.y };
    return make(src, b, ctx.visualMap.get(sourceId!) ?? null, null);
  }
  return null;
};

const resolveScopeEndpoints = (edge: any, ctx: EdgeFrameCtx) => {
  const sourceId = edge?.source as string | undefined;
  const targetId = edge?.target as string | undefined;

  const src = sourceId ? ctx.posMap.get(sourceId)?.current : undefined;
  const tgt = targetId ? ctx.posMap.get(targetId)?.current : undefined;

  const make = (
    a: Vec2,
    b: Vec2,
    aEl: HTMLElement | null,
    bEl: HTMLElement | null
  ) => {
    const p0 = pointInNode(a, b, aEl, ctx.zoom, 0);
    const p1 = pointInNode(b, a, bEl, ctx.zoom, 0);
    return { p0, p1 };
  };

  if (src && tgt) {
    return make(
      src,
      tgt,
      ctx.visualMap.get(sourceId!) ?? null,
      ctx.visualMap.get(targetId!) ?? null
    );
  }
  if (tgt && !src) {
    const a = { x: tgt.x - (DEFAULT_EDGE_LEN * 2) / 3, y: tgt.y };
    return make(a, tgt, null, ctx.visualMap.get(targetId!) ?? null);
  }
  if (src && !tgt) {
    const b = { x: src.x + (DEFAULT_EDGE_LEN * 2) / 3, y: src.y };
    return make(src, b, ctx.visualMap.get(sourceId!) ?? null, null);
  }
  return null;
};

const useRafDirtyLoop = (
  dirtyRef: RefObject<{ current: boolean }>,
  onFrame: () => void
) => {
  const onFrameEvent = useEffectEvent(() => {
    onFrame();
  });

  useLayoutEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirtyRef.current?.current) return;
      dirtyRef.current.current = false;
      onFrameEvent();
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, [dirtyRef]);
};

export const useArrowLayer = (markerId: string) => {
  const gRef = useRef<SVGGElement | null>(null);
  const lineMapRef = useRef<Map<string, SVGLineElement>>(new Map());

  const reconcile = useCallback(
    (edges: Record<string, any>) => {
      const g = gRef.current;
      if (!g) return;

      const nextIds = new Set(Object.keys(edges));

      for (const [id, line] of Array.from(lineMapRef.current.entries())) {
        if (nextIds.has(id)) continue;
        line.remove();
        lineMapRef.current.delete(id);
      }

      for (const id of nextIds) {
        if (lineMapRef.current.has(id)) continue;

        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        ) as SVGLineElement;
        line.setAttribute("x1", "0");
        line.setAttribute("y1", "0");
        line.setAttribute("x2", "0");
        line.setAttribute("y2", "0");
        line.setAttribute("stroke", "#737373");
        line.setAttribute("stroke-width", "3");
        line.setAttribute("stroke-linecap", "butt");
        line.setAttribute("marker-end", `url(#${markerId})`);
        g.appendChild(line);
        lineMapRef.current.set(id, line);
      }
    },
    [markerId]
  );

  const update = useCallback(
    (ctx: EdgeFrameCtx, edges: Record<string, any>) => {
      for (const id of Object.keys(edges)) {
        const line = lineMapRef.current.get(id);
        if (!line) continue;

        const ep = resolveArrowEndpoints(edges[id], ctx);
        if (!ep) {
          line.setAttribute("visibility", "hidden");
          continue;
        }
        line.setAttribute("visibility", "visible");
        line.setAttribute("x1", String(ep.p0.x));
        line.setAttribute("y1", String(ep.p0.y));
        line.setAttribute("x2", String(ep.p1.x));
        line.setAttribute("y2", String(ep.p1.y));
      }
    },
    []
  );

  return { gRef, reconcile, update };
};

const useScopeLayer = (markerId: string) => {
  const gRef = useRef<SVGGElement | null>(null);
  const lineMapRef = useRef<Map<string, SVGLineElement>>(new Map());

  const reconcile = useCallback(
    (edges: Record<string, any>) => {
      const g = gRef.current;
      if (!g) return;

      const nextIds = new Set(Object.keys(edges));

      for (const [id, line] of Array.from(lineMapRef.current.entries())) {
        if (nextIds.has(id)) continue;
        line.remove();
        lineMapRef.current.delete(id);
      }

      for (const id of nextIds) {
        if (lineMapRef.current.has(id)) continue;

        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        ) as SVGLineElement;
        line.setAttribute("x1", "0");
        line.setAttribute("y1", "0");
        line.setAttribute("x2", "0");
        line.setAttribute("y2", "0");
        line.setAttribute("stroke", "#737373");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-linecap", "butt");
        line.setAttribute("marker-start", `url(#${markerId})`);
        g.appendChild(line);
        lineMapRef.current.set(id, line);
      }
    },
    [markerId]
  );

  const update = useCallback(
    (ctx: EdgeFrameCtx, edges: Record<string, any>) => {
      for (const id of Object.keys(edges)) {
        const line = lineMapRef.current.get(id);
        if (!line) continue;

        const ep = resolveScopeEndpoints(edges[id], ctx);
        if (!ep) {
          line.setAttribute("visibility", "hidden");
          continue;
        }
        line.setAttribute("visibility", "visible");
        line.setAttribute("x1", String(ep.p0.x));
        line.setAttribute("y1", String(ep.p0.y));
        line.setAttribute("x2", String(ep.p1.x));
        line.setAttribute("y2", String(ep.p1.y));
      }
    },
    []
  );

  return { gRef, reconcile, update };
};

export function EdgeLayer({
  edges,
  posRefMap,
  nodeVisualMapRef,
  transformRef,
  dirtyRef,
}: {
  edges: Record<string, any>;
  posRefMap: RefObject<Map<string, MutRef<Vec2>>>;
  nodeVisualMapRef: RefObject<Map<string, HTMLElement | null>>;
  transformRef: RefObject<Transform>;
  dirtyRef: RefObject<{ current: boolean }>;
}) {
  const baseId = useId();
  const arrowMarkerId = `${baseId}-arrow`;
  const scopeMarkerId = `${baseId}-scope`;

  const arrowEdges = Object.fromEntries(
    Object.entries(edges).filter(([, e]) => e?.ty?.not?.("AT") ?? true)
  );
  const scopeEdges = Object.fromEntries(
    Object.entries(edges).filter(([, e]) => e?.ty?.is?.("AT") ?? false)
  );

  const arrow = useArrowLayer(arrowMarkerId);
  const scope = useScopeLayer(scopeMarkerId);

  useLayoutEffect(() => {
    arrow.reconcile(arrowEdges);
    scope.reconcile(scopeEdges);
    if (dirtyRef.current) dirtyRef.current.current = true;
  }, [arrow, scope, arrowEdges, scopeEdges, dirtyRef]);

  useRafDirtyLoop(dirtyRef, () => {
    const posMap = posRefMap.current;
    if (!posMap) return;

    const ctx: EdgeFrameCtx = {
      posMap,
      zoom: transformRef.current?.zoom ?? 1,
      visualMap: nodeVisualMapRef.current,
    };

    arrow.update(ctx, arrowEdges);
    scope.update(ctx, scopeEdges);
  });

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id={arrowMarkerId}
          markerWidth="30"
          markerHeight="30"
          refX="2"
          refY="1"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
          style={{ overflow: "visible", transformOrigin: "0px 0px" }}
        >
          <path d="M 1.5,2.25 L 3.75,1 L 1.5,-0.25" fill="#737373" />
        </marker>

        <marker
          id={scopeMarkerId}
          markerWidth="30"
          markerHeight="30"
          refX="0"
          refY="1"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
          style={{ overflow: "visible", transformOrigin: "0px 0px" }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M 3.5 -4.4 A 6 6 0 0 0 3.5 6.4"
            style={{
              fill: "none",
              stroke: "#737373",
              strokeWidth: 1,
              opacity: 1,
              transform: "scaleX(1)",
            }}
          />
        </marker>
      </defs>
      <g>
        <g ref={arrow.gRef} />
        <g ref={scope.gRef} />
      </g>
    </svg>
  );
}
