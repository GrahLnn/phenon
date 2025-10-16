import { cn } from "@/lib/utils";
import "@fontsource/maple-mono";
import { memo, useEffect, useMemo, useState } from "react";
import "./App.css";
import reactLogo from "./assets/react.svg";
import crab from "./cmd";
import Input from "./components/Input";
import { Scrollbar } from "./components/scrollbar/scrollbar";
import TopBar from "./topbar";
import { Toaster } from "@/components/ui/sonner";
import { action as updater } from "./state_machine/updater";
import { Provider } from "jotai";
import { appStore } from "./subpub/core";
import { DemoCanvas } from "./components/cv";

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center text-center items-center flex-1 relative overflow-hidden">
      {children}
    </div>
  );
}

// export default function App() {
//   useEffect(() => {
//     crab.appReady();
//     updater.run();
//   }, []);
//   return (
//     <Provider store={appStore}>
//       <div className="h-screen flex flex-col overflow-hidden hide-scrollbar">
//         <TopBar />
//         <main className="flex-1 flex overflow-hidden hide-scrollbar">
//           <Center>
//             <div className="w-7 h-7 border border-black rounded-full"></div>
//             <IconAbs />
//             <Unit />
//           </Center>
//         </main>
//         <Scrollbar />
//         <Toaster />
//       </div>
//     </Provider>
//   );
// }

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
          <Center>
            {/* 关键：把内容交给可缩放画布 */}
            <div className="absolute inset-0">
              <DemoCanvas />
            </div>
          </Center>
        </main>
        <Scrollbar />
        <Toaster />
      </div>
    </Provider>
  );
}
