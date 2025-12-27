import type { CSSProperties, RefObject } from "react";
import { useMemo, useState } from "react";
import { WorldItem } from "./pannel";

import { Vec2, MutRef, Transform, getOrCreateRef } from "./graph_utils";
import { cn } from "@/lib/utils";
import { hook } from "@/src/state_machine/graph";

function getPortVariant(args: {
  id: string;
  edges: Record<string, any> | null | undefined;
}) {
  const { id, edges } = args;
  let isIn = false;
  let isOut = false;

  for (const eid of Object.keys(edges ?? {})) {
    const e = (edges as any)[eid];
    const isArrow = e?.ty?.is?.("AR") ?? false;
    if (!isArrow) continue;
    const src = e?.source as string | undefined;
    const tgt = e?.target as string | undefined;
    if (src === id) isIn = true;
    if (tgt === id) isOut = true;
  }

  if (isIn && isOut) return "io" as const;
  if (isIn) return "i" as const;
  if (isOut) return "o" as const;
  return null;
}

function nodeVisualCls(args: {
  nodeBaseCls: string;
  portVariant: "i" | "o" | "io" | null;
}) {
  const { nodeBaseCls, portVariant } = args;
  const inPortCls = "dark:border-[#e5e5e5] border-[#525252] bg-background";
  const outPortCls =
    "bg-[#525252] dark:bg-[#e5e5e5] border-[#525252] dark:border-[#e5e5e5]";

  // in 端口沿用原 ghost 外观；其它默认按 out 端口走
  const fill = portVariant === "i" ? inPortCls : outPortCls;
  return cn(nodeBaseCls, fill);
}

function shouldShowDragHintRing(args: {
  isDragMode: boolean;
  id: string;
  nodeType: string;
  draggingNodeId: string | null;
  draggingNodeType: string;
  excludedByArrowOtherEnd: Set<string>;
}) {
  const {
    isDragMode,
    id,
    nodeType,
    draggingNodeId,
    draggingNodeType,
    excludedByArrowOtherEnd,
  } = args;

  if (!isDragMode) return false;
  if (!draggingNodeId) return false;
  if (id === draggingNodeId) return false;
  if (excludedByArrowOtherEnd.has(id)) return false;
  if (nodeType !== draggingNodeType) return false;
  return true;
}

interface NodeLayerProps {
  nodes: Record<string, any>;
  posRefMap: RefObject<Map<string, MutRef<Vec2>>>;
  transformRef: RefObject<Transform>;
  nodeElMapRef: RefObject<Map<string, HTMLDivElement | null>>;
  nodeVisualMapRef: RefObject<Map<string, HTMLElement | null>>;
  onDirty?: () => void;
  onNodeDragStart?: (id: string) => void;
  onNodeDrag?: (id: string, pos: Vec2) => void;
  onNodeDragEnd?: (id: string) => void;
}

export function NodeLayer({
  nodes,
  posRefMap,
  transformRef,
  nodeElMapRef,
  nodeVisualMapRef,
  onDirty,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragEnd,
}: NodeLayerProps) {
  const ids = Object.keys(nodes);
  const posMap = posRefMap.current;
  const elMap = nodeElMapRef.current;
  const visualMap = nodeVisualMapRef.current;
  const state = hook.useState();
  const is_drag = state.is("drag");
  const edges = hook.useEdges();
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const draggingNodeType =
    (draggingNodeId
      ? (nodes?.[draggingNodeId]?.type as string | undefined)
      : undefined) ?? "unit";

  const excludedByArrowOtherEnd = useMemo(() => {
    const set = new Set<string>();
    if (!is_drag || !draggingNodeId) return set;

    for (const eid of Object.keys(edges ?? {})) {
      const e = (edges as any)[eid];
      const isArrow = e?.ty?.is?.("AR") ?? false;
      if (!isArrow) continue;
      const src = e?.source as string | undefined;
      const tgt = e?.target as string | undefined;
      if (!src || !tgt) continue;
      if (src === draggingNodeId) set.add(tgt);
      else if (tgt === draggingNodeId) set.add(src);
    }

    return set;
  }, [edges, is_drag, draggingNodeId]);

  return (
    <>
      {ids.map((id) => {
        if (!posMap || !elMap || !visualMap) return null;
        const posRef = getOrCreateRef(posMap, id, () => ({
          x: 0,
          y: 0,
        }));

        const portVariant = getPortVariant({ id, edges: edges as any });
        const nodeType = (nodes?.[id]?.type as string | undefined) ?? "unit";

        const showDragHintRing = shouldShowDragHintRing({
          isDragMode: is_drag,
          id,
          nodeType,
          draggingNodeId,
          draggingNodeType,
          excludedByArrowOtherEnd,
        });

        const hitAreaStyle = {
          width: 16,
          height: 16,
          borderRadius: 9999,
          clipPath: "circle(50% at 50% 50%)",
        } satisfies CSSProperties;

        const nodeCenterCls =
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
        const nodeBaseCls = cn(
          nodeCenterCls,
          "w-[10px] h-[10px] rounded-full border"
        );

        const hoverRingStroke = 1;
        const hoverRingR = 7;
        const hoverRingViewBox = 16;
        const hoverRingC = hoverRingViewBox / 2;
        const hoverRingSegments = 4;
        const hoverRingDash = 6;
        const hoverRingGap =
          (2 * Math.PI * hoverRingR) / hoverRingSegments - hoverRingDash;

        const hoverRingBoxCls = cn(
          nodeCenterCls,
          showDragHintRing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        );
        const hoverRingBoxStyle = {
          width: hoverRingViewBox,
          height: hoverRingViewBox,
        } satisfies CSSProperties;

        return (
          <WorldItem
            key={id}
            x={posRef.current.x}
            y={posRef.current.y}
            className={cn("group")}
            style={hitAreaStyle}
            ref={(el: HTMLDivElement | null) => {
              if (!el) return;
              elMap.set(id, el);
              visualMap.set(
                id,
                (el?.firstElementChild as HTMLElement | null) ?? el
              );
              return () => {
                elMap.delete(id);
                visualMap.delete(id);
              };
            }}
            blockPan
            draggable
            dragMode="dom"
            positionRef={posRef}
            getZoom={() => transformRef.current?.zoom ?? 1}
            onDragStart={() => {
              setDraggingNodeId(id);
              onNodeDragStart?.(id);
            }}
            onDrag={(pos) => {
              onNodeDrag?.(id, pos);
              onDirty?.();
            }}
            onDragEnd={() => {
              setDraggingNodeId(null);
              onNodeDragEnd?.(id);
            }}
          >
            <div className={nodeVisualCls({ nodeBaseCls, portVariant })} />
            <div className={hoverRingBoxCls} style={hoverRingBoxStyle}>
              <svg
                className={cn(
                  "w-full h-full",
                  showDragHintRing
                    ? "text-emerald-700 dark:text-emerald-600"
                    : "text-[#737373] dark:text-[#a3a3a3]"
                )}
                viewBox={`0 0 ${hoverRingViewBox} ${hoverRingViewBox}`}
                fill="none"
              >
                <circle
                  cx={hoverRingC}
                  cy={hoverRingC}
                  r={hoverRingR}
                  stroke="currentColor"
                  strokeWidth={hoverRingStroke}
                  strokeDasharray={`${hoverRingDash.toFixed(
                    3
                  )} ${hoverRingGap.toFixed(3)}`}
                />
              </svg>
            </div>
          </WorldItem>
        );
      })}
    </>
  );
}
