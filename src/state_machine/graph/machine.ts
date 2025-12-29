import { src } from "./src";
import { payloads, state, sig } from "./events";

export const machine = src.createMachine({
  initial: state.mainx.idle,
  context: {
    nodes: {},
    edges: {},
    out: {},
    in: {},
    transform: { zoom: 1, origin: { x: 0, y: 0 } },
    draggingNodeId: null,
  },
  on: {
    [payloads.drag_start.evt]: { actions: "drag_start" },
    [payloads.drag_end.evt]: { actions: "drag_end" },
    [payloads.merge_nodes.evt]: { actions: "merge_nodes" },
  },
  states: {
    [state.mainx.idle]: {
      on: {
        to_drag: state.mainx.drag,
        [payloads.new_node.evt]: { actions: "add_node" },
        [payloads.new_edge.evt]: { actions: "add_edge" },
        [sig.mainx.new_out_node.evt]: { actions: "out_node" },
      },
    },
    [state.mainx.drag]: {
      on: {
        to_idle: state.mainx.idle,
        [payloads.link.evt]: { actions: "link_node" },
        [payloads.unlink.evt]: { actions: "unlink_node" },
      },
    },
  },
});
