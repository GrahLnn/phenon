import { and, fromCallback, raise } from "xstate";
import { goto, godown, invokeState } from "../kit";
import { src } from "./src";
import { payloads, machines, invoker, state, sig } from "./events";
import { resultx } from "../state";
import { B, call0 } from "@/lib/comb";
import crab from "@/src/cmd";
import { tap } from "@/lib/result";
import { lievt } from "@/src/cmd/commandAdapter";

export const machine = src.createMachine({
  initial: state.mainx.idle,
  context: {
    nodes: {},
    edges: {},
    out: {},
    in: {},
    transform: { zoom: 1, origin: { x: 0, y: 0 } },
  },
  on: {},
  states: {
    [state.mainx.idle]: {
      on: {
        to_drag: state.mainx.drag,
        add_node: { actions: "add_node" },
        [payloads.new_node.evt]: { actions: "add_node" },
        [payloads.new_edge.evt]: { actions: "add_edge" },
        [sig.mainx.new_out_node.evt]: { actions: "out_node" },
        rm_node: {},
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
