"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchHealth, type HealthResponse } from "@/lib/api";

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
      ? "bg-emerald-400/90 shadow-[0_0_6px] shadow-emerald-400/50"
      : state.kind === "unreachable"
        ? "bg-red-400/90"
        : "animate-pulse bg-amber-300/90";

  const label =
    state.kind === "connected" ? "Online" : state.kind === "unreachable" ? "Offline" : "Checking";

  const detail =
    state.kind === "connected"
      ? `${state.data.service} ${state.data.version}`
      : state.kind === "unreachable"
        ? state.message
        : "Checking backend";

  return (
    <div
      className="flex shrink-0 items-center gap-2.5"
      data-testid="backend-health"
      data-state={state.kind}
      title={detail}
    >
      <span className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        Backend
      </span>
      <span className="flex items-center gap-1.5 text-xs text-foreground/85">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        <span>{label}</span>
      </span>
      <span className="sr-only">{detail}</span>
    </div>
  );
}
