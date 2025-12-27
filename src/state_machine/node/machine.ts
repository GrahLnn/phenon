import { and, fromCallback, raise } from "xstate";
import { goto, godown, invokeState } from "../kit";
import { src } from "./src";
import { payloads, sig, state, machines, invoker } from "./events";
import { resultx } from "../state";
import { B, call0 } from "@/lib/comb";
import crab from "@/src/cmd";
import { tap } from "@/lib/result";
import { lievt } from "@/src/cmd/commandAdapter";

export const machine = src.createMachine({
  initial: state.mainx.idle,
  context: {
    variant: null,
  },
  on: {},
  states: {
    [state.mainx.idle]: {
      on: {
        [sig.mainx.to_hover.evt]: state.mainx.hover,
        [sig.mainx.to_wait.evt]: state.mainx.wait,
      },
    },
    [state.mainx.hover]: {
      on: {
        [sig.mainx.to_idle.evt]: state.mainx.idle,
      },
    },
    [state.mainx.wait]: {
      on: {
        [sig.mainx.to_idle.evt]: state.mainx.idle,
      },
    },
  },
});
