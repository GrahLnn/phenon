import { createActor } from "xstate";
import { machine } from "./machine";
import { useSelector } from "@xstate/react";
import { me } from "@/lib/matchable";
import { MainStateT, payloads, sig } from "./events";
import { B } from "@/lib/comb";
import { createSender } from "../kit";

export const actor = createActor(machine);
const send = createSender(actor);

export const hook = {
  useState: () => useSelector(actor, (shot) => me(shot.value as MainStateT)),
  useContext: () => useSelector(actor, (shot) => shot.context),
  useNodes: () => useSelector(actor, (s) => s.context.nodes),
  useEdges: () => useSelector(actor, (s) => s.context.edges),
};

export const action = {
  start_drag: () => send(sig.mainx.to_drag),
  end_drag: () => send(sig.mainx.to_idle),
  add_node: B(payloads.new_node.load)(send),
  out_node: () => send(sig.mainx.new_out_node),
  link_node: B(payloads.link.load)(send),
  unlink_node: B(payloads.unlink.load)(send),
};
