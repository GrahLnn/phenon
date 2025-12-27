import { setup, assign, enqueueActions } from "xstate";
import { eventHandler } from "../kit";
import { Context, EdgeId, NodeId, Node, Edge } from "./core";
import { payloads, ss, machines, invoker, Events } from "./events";
import { I, K } from "@/lib/comb";
import { udf, vec } from "@/lib/e";
import { hideCenterTool, viewCenterTool } from "../centertool";
import { station } from "@/src/subpub/buses";
import crab from "@/src/cmd";
import { convertFileSrc } from "@tauri-apps/api/core";
import { me } from "@/lib/matchable";

export const EH = eventHandler<Context, Events>();
export const src = setup({
  actors: { ...invoker.as_act(), ...machines.as_act() },
  types: {
    context: {} as Context,
    events: {} as Events,
  },
  actions: {
    add_node: assign({
      nodes: EH.take(payloads.new_node.evt)((ty, c) => {
        const id = crypto.randomUUID();
        return {
          ...c.nodes,
          [id]: {
            id,
            ty,
            shape: "circle",
          },
        };
      }),
    }),
    add_edge: assign({
      edges: EH.take(payloads.new_edge.evt)((load, c) => {
        const id = crypto.randomUUID();
        return {
          ...c.edges,
          [id]: {
            id,
            ...load,
          },
        };
      }),
    }),
    out_node: enqueueActions(({ context, enqueue }) => {
      const i_node_id = crypto.randomUUID();
      const o_node_id = crypto.randomUUID();
      const edge_id = crypto.randomUUID();
      const nodes = {
        ...context.nodes,
        [i_node_id]: {
          id: i_node_id,
          ty: me("Node"),
          shape: "circle",
        },
        [o_node_id]: {
          id: o_node_id,
          ty: me("Node"),
          shape: "circle",
        },
      } as Record<NodeId, Node>;
      const edges = {
        ...context.edges,
        [edge_id]: {
          id: edge_id,
          ty: me("AR"),
          source: i_node_id,
          target: o_node_id,
        },
      } as Record<EdgeId, Edge>;
      enqueue.assign({
        nodes,
        edges,
      });
    }),
    link_node: assign({
      edges: EH.take(payloads.link.evt)(({ edge, source }, c) => {
        const edges = { ...c.edges };
        const cur = edges[edge];
        if (!cur) return edges;
        edges[edge] = { ...cur, source };
        return edges;
      }),
    }),
    unlink_node: assign({
      edges: EH.take(payloads.unlink.evt)((edge, c) => {
        const edges = { ...c.edges };
        const cur = edges[edge];
        if (!cur) return edges;
        edges[edge] = { ...cur, source: undefined } as Edge;
        return edges;
      }),
    }),
  },
  guards: {},
});
