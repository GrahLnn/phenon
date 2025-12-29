import type { NodeId } from "./core";

export type PortVariant = "i" | "o" | "io" | null;

export function getPortVariant(args: {
  id: NodeId;
  edges: Record<string, any> | null | undefined;
}): PortVariant {
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

  if (isIn && isOut) return "io";
  if (isIn) return "i";
  if (isOut) return "o";
  return null;
}

export function getNodeConnectType(args: {
  id: NodeId;
  nodes: Record<string, any> | null | undefined;
}): string {
  const { id, nodes } = args;
  return (nodes?.[id]?.type as string | undefined) ?? "unit";
}

export function getDraggingNodeType(args: {
  draggingNodeId: NodeId | null;
  nodes: Record<string, any> | null | undefined;
}): string {
  const { draggingNodeId, nodes } = args;
  if (!draggingNodeId) return "unit";
  return (nodes?.[draggingNodeId]?.type as string | undefined) ?? "unit";
}

export function getExcludedByArrowOtherEnd(args: {
  isDragMode: boolean;
  draggingNodeId: NodeId | null;
  edges: Record<string, any> | null | undefined;
}): Set<NodeId> {
  const { isDragMode, draggingNodeId, edges } = args;
  const set = new Set<NodeId>();
  if (!isDragMode || !draggingNodeId) return set;

  for (const eid of Object.keys(edges ?? {})) {
    const e = (edges as any)[eid];
    const isArrow = e?.ty?.is?.("AR") ?? false;
    if (!isArrow) continue;

    const src = e?.source as NodeId | undefined;
    const tgt = e?.target as NodeId | undefined;
    if (!src || !tgt) continue;

    if (src === draggingNodeId) set.add(tgt);
    else if (tgt === draggingNodeId) set.add(src);
  }

  return set;
}

export function shouldShowDragHintRing(args: {
  isDragMode: boolean;
  id: NodeId;
  nodeType: string;
  draggingNodeId: NodeId | null;
  draggingNodeType: string;
  excludedByArrowOtherEnd: Set<NodeId>;
}): boolean {
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

export function nodeVisualCls(args: {
  nodeBaseCls: string;
  portVariant: PortVariant;
}): string {
  const { nodeBaseCls, portVariant } = args;
  const inPortCls = "dark:border-[#e5e5e5] border-[#525252] bg-background";
  const outPortCls =
    "bg-[#525252] dark:bg-[#e5e5e5] border-[#525252] dark:border-[#e5e5e5]";

  // in 端口沿用原 ghost 外观；其它默认按 out 端口走
  const fill = portVariant === "i" ? inPortCls : outPortCls;
  return `${nodeBaseCls} ${fill}`;
}
