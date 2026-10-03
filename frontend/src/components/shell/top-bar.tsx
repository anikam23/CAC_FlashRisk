import { Zap } from "lucide-react";

import { BackendHealth } from "@/components/backend-health";

type TopBarProps = {
  onHome?: () => void;
};

export function TopBar({ onHome }: TopBarProps) {
  const brand = (
    <>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
        <Zap className="size-3.5" aria-hidden />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="text-[15px] leading-none font-semibold tracking-tight">FlashRisk</h1>
        <span className="hidden h-3.5 w-px shrink-0 bg-white/15 sm:block" aria-hidden />
        <p className="hidden truncate text-[13px] text-muted-foreground sm:block">
          Lightning Ignition Surveillance
        </p>
      </div>
    </>
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/8 bg-[oklch(0.145_0.018_258)] px-4 sm:px-5">
      {onHome ? (
        <button
          type="button"
          onClick={onHome}
          className="flex min-w-0 items-center gap-3 rounded-md text-left transition-colors hover:text-primary"
          aria-label="Return to FlashRisk home"
        >
          {brand}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-3">{brand}</div>
      )}
      <BackendHealth />
    </header>
  );
}
