import "@fontsource/maple-mono";
import { useEffect } from "react";
import "./App.css";
import crab from "./cmd";
import { Scrollbar } from "./components/scrollbar/scrollbar";
import TopBar from "./topbar";
import { Toaster } from "@/components/ui/sonner";
import { action as updater } from "./state_machine/updater";
import { Provider } from "jotai";
import { appStore } from "./subpub/core";
import { Graph } from "./components/graph/graph";

export default function App() {
  useEffect(() => {
    crab.appReady();
    updater.run();
  }, []);

  return (
    <Provider store={appStore}>
      <div className="h-screen flex flex-col overflow-hidden hide-scrollbar">
        <TopBar />
        <main className="flex-1 flex overflow-hidden hide-scrollbar">
          <Graph />
        </main>
        <Scrollbar />
        <Toaster />
      </div>
    </Provider>
  );
}
