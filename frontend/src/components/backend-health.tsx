"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { fetchHealth, type HealthResponse } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

type HealthState =
  | { kind: "checking" }
  | { kind: "connected"; data: HealthResponse }
  | { kind: "unreachable"; message: string };

const POLL_INTERVAL_MS = 15_000;

export function BackendHealth() {
  const [state, setState] = useState<HealthState>({ kind: "checking" });

  const check = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await fetchHealth(signal);
      setState({ kind: "connected", data });
    } catch (err) {
      if (signal?.aborted) return;
      setState({
        kind: "unreachable",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling an external service
    check(controller.signal);
    const id = setInterval(() => check(controller.signal), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [check]);

  const dot =
    state.kind === "connected"
      ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/70"
      : state.kind === "unreachable"
        ? "bg-red-500 shadow-[0_0_8px] shadow-red-500/70"
        : "bg-amber-400 animate-pulse";

  const label =
    state.kind === "connected"
      ? "Backend connected"
      : state.kind === "unreachable"
        ? "Backend unreachable"
        : "Checking backend…";

  return (
    <div className="flex flex-col gap-1.5" data-testid="backend-health" data-state={state.kind}>
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        <span className="text-sm font-medium">{label}</span>
        {state.kind === "connected" && (
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            v{state.data.version}
          </Badge>
        )}
      </div>
      <p className="truncate font-mono text-[11px] text-muted-foreground">
        {state.kind === "unreachable" ? state.message : `${API_BASE_URL}/api/health`}
      </p>
    </div>
  );
}
