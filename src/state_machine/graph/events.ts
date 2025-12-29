import {
  collect,
  defineSS,
  ns,
  sst,
  event,
  machine,
  createActors,
  InvokeEvt,
  MachineEvt,
  PayloadEvt,
  SignalEvt,
  UniqueEvts,
  allSignal,
  allState,
  allTransfer,
} from "../kit";
import { resultx } from "../state";
import { EdgeType, NodeId, NodeType, AtLeastOne, EdgeId } from "./core";
import { sub_mc } from "./submachine/example";

type EdgeLoadBase = {
  ty: EdgeType;
  source?: NodeId;
  target?: NodeId;
};

type EdgeLoad = AtLeastOne<EdgeLoadBase, "source" | "target">;

type IdPair = { edge: EdgeId; source: NodeId };
type MergeNodesLoad = { from: NodeId; into: NodeId };

export const ss = defineSS(
  ns("resultx", resultx),
  ns("mainx", sst(["idle", "drag"], ["new_out_node"]))
);
export const state = allState(ss);
export const sig = allSignal(ss);
export const transfer = allTransfer(ss);
export const invoker = createActors({});
export const payloads = collect(
  event<NodeType>()("new_node"),
  event<EdgeLoad>()("new_edge"),
  event<NodeId>()("drag_start"),
  event<null>()("drag_end"),
  event<MergeNodesLoad>()("merge_nodes"),
  event<IdPair>()("link"),
  event<EdgeId>()("unlink")
);
export const machines = collect(machine<string>(sub_mc)("exampleb"));

export type MainStateT = keyof typeof ss.mainx.State;
export type ResultStateT = keyof typeof resultx.State;
export type Events = UniqueEvts<
  | SignalEvt<typeof ss>
  | InvokeEvt<typeof invoker>
  | PayloadEvt<typeof payloads.infer>
  | MachineEvt<typeof machines.infer>
>;
