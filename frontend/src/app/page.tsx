import { Zap } from "lucide-react";

import { BackendHealth } from "@/components/backend-health";
import { CaliforniaMap } from "@/components/map/california-map";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <CaliforniaMap />

      <aside className="panel absolute top-3 right-3 left-3 flex flex-col gap-4 p-4 sm:top-4 sm:right-auto sm:left-4 sm:w-80">
        <header className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Zap className="size-4.5" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-base leading-tight font-semibold tracking-tight">
              FlashRisk
            </h1>
            <p className="text-xs text-muted-foreground">
              GOES-18 lightning · California ignition surveillance
            </p>
          </div>
        </header>

        <div className="h-px bg-white/8" />

        <BackendHealth />

        <p className="text-xs leading-relaxed text-muted-foreground">
          Flash search and analysis are not connected yet. The map currently shows the California
          study area only.
        </p>
      </aside>
    </main>
  );
}
