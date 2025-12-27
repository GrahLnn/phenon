import { ActorRefFromLogic } from "xstate";

export interface Context {
  variant: "i" | "o" | "io" | null;
}
