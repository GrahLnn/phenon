import type { CSSProperties, RefObject } from "react";
import { useMemo } from "react";
import { WorldItem } from "./pannel";

import { Vec2, MutRef, Transform, getOrCreateRef } from "./graph_utils";
import { cn } from "@/lib/utils";
import { action, hook } from "@/src/state_machine/graph";
import {
  getExcludedByArrowOtherEnd,
  getDraggingNodeType,
  getNodeConnectType,
  getPortVariant as getPortVariantSel,
  nodeVisualCls as nodeVisualClsSel,
  shouldShowDragHintRing,
} from "@/src/state_machine/graph/selectors";

function nodeVisualCls(args: {
  nodeBaseCls: string;
  portVariant: "i" | "o" | "io" | null;
}) {
  const { nodeBaseCls, portVariant } = args;
  // in 端口沿用原 ghost 外观；其它默认按 out 端口走
  if (portVariant === "io") {
    return cn(
      nodeBaseCls,
      "relative",
      "bg-background",
      "border-[#525252] dark:border-[#e5e5e5]",
      "after:content-['']",
      "after:block",
      "after:absolute after:inset-0 after:m-auto",
      "after:w-[6px] after:h-[6px]",
      "after:rounded-full",
      "after:bg-[#525252] dark:after:bg-[#e5e5e5]"
    );
  }
  return nodeVisualClsSel({ nodeBaseCls, portVariant });
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
  const draggingNodeId = hook.useContext().draggingNodeId ?? null;

  const draggingNodeType =
    getDraggingNodeType({ draggingNodeId, nodes: nodes as any }) ?? "unit";

  const excludedByArrowOtherEnd = useMemo(() => {
    return getExcludedByArrowOtherEnd({
      isDragMode: is_drag,
      draggingNodeId,
      edges: edges as any,
    }) as Set<string>;
  }, [edges, is_drag, draggingNodeId]);

  return (
    <>
      {ids.map((id) => {
        if (!posMap || !elMap || !visualMap) return null;
        const posRef = getOrCreateRef(posMap, id, () => ({
          x: 0,
          y: 0,
        }));

        const portVariant = getPortVariantSel({ id, edges: edges as any });
        const nodeType = getNodeConnectType({ id, nodes: nodes as any });

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
              action.drag_start(id);
              onNodeDragStart?.(id);
            }}
            onDrag={(pos) => {
              onNodeDrag?.(id, pos);
              onDirty?.();
            }}
            onDragEnd={() => {
              action.drag_end();
              onNodeDragEnd?.(id);
            }}
          >
            <div className={nodeVisualCls({ nodeBaseCls, portVariant })} />
            <div className={hoverRingBoxCls} style={hoverRingBoxStyle}>
              <svg
                className={cn(
                  "w-full h-full",
                  showDragHintRing
                    ? "text-emerald-500 dark:text-emerald-600"
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
