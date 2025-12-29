import { Matchable } from "@/lib/matchable";

export type AtLeastOne<T, K extends keyof T = keyof T> = K extends keyof T
  ? Required<Pick<T, K>> & Partial<Omit<T, K>>
  : never;

export type NodeId = string;
export type EdgeId = string;
export type NodeType = Matchable<"Node" | "Port">;
export type Node = {
  id: NodeId;
  ty: NodeType;
  shape: "circle" | "rect";
};

export type EdgeType = Matchable<"AR" | "AT">;

export type EdgeBase = {
  id: EdgeId;
  ty: EdgeType;
  source?: NodeId;
  target?: NodeId;
};

export type Edge = AtLeastOne<EdgeBase, "source" | "target">;

export type Context = {
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, Edge>;
  // 可选索引：邻接表，加速查询
  out: Record<NodeId, EdgeId[]>;
  in: Record<NodeId, EdgeId[]>;
  // 可选：viewport/transform
  transform: { zoom: number; origin: { x: number; y: number } };
  draggingNodeId: NodeId | null;
  // 可选：交互态
  dragging?: { nodeId: NodeId; pointerId: number; dx: number; dy: number };
};
