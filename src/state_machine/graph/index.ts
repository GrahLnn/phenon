import { actor } from "./api";
import { to_string } from "../kit";

actor.start();
actor.subscribe((snapshot) => {
  const state =
    typeof snapshot.value === "string"
      ? snapshot.value
      : to_string(snapshot.value);

  console.log(`[templete] ${state}`, snapshot.context);
});
export * from "./api";
export * from "./events";
