"use client";

import { LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GlmFlash } from "@/lib/api";
import { formatFlashRiskScore } from "@/lib/analysis-display";
import {
  MAX_SELECTED_FLASHES,
  type MultiFlashJob,
  type MultiFlashStatus,
} from "@/lib/multi-flash-selection";

const STATUS_LABEL: Record<MultiFlashStatus, string> = {
  waiting: "Waiting",
  analyzing: "Analyzing",
  completed: "Completed",
  failed: "Failed",
};

type MultiFlashPanelProps = {
  className?: string;
  flashes: GlmFlash[];
  selectedIds: readonly string[];
  jobs: readonly MultiFlashJob[] | null;
  running: boolean;
  limitMessage?: string | null;
  onToggle?: (flash: GlmFlash) => void;
  onSelectAll?: () => void;
  onAnalyze?: () => void;
  onExit?: () => void;
  reportReady?: boolean;
  analyzedCount?: number;
  failedCount?: number;
  onViewReport?: () => void;
};

function flashLabel(flashes: readonly GlmFlash[], globalFlashId: string): string {
  const flash = flashes.find((item) => item.global_flash_id === globalFlashId);
  return flash ? `Flash ${flash.flash_id}` : globalFlashId;
}

export function MultiFlashPanel({
  className,
  flashes,
  selectedIds,
  jobs,
  running,
  limitMessage = null,
  onToggle,
  onSelectAll,
  onAnalyze,
  onExit,
  reportReady = false,
  analyzedCount = 0,
  failedCount = 0,
  onViewReport,
}: MultiFlashPanelProps) {
  const canSelectAll = flashes.length > 0 && flashes.length <= MAX_SELECTED_FLASHES;
  const finished =
    jobs !== null &&
    jobs.length > 0 &&
    jobs.every((job) => job.status === "completed" || job.status === "failed");

  return (
    <aside aria-label="Multi-flash selection" className={className}>
      <div className="panel px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {reportReady ? "Multi-flash report" : "Multi-select"}
            </h2>
            <p className="mt-1 text-[15px] font-medium text-foreground">
              {reportReady ? "Report ready" : `${selectedIds.length} / ${MAX_SELECTED_FLASHES} selected`}
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="-mt-0.5 -mr-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/6 hover:text-foreground"
            aria-label="Exit multi-select"
            title="Exit multi-select"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
          {reportReady
            ? "Multi-flash report is ready."
            : "Click flash markers to select or deselect them. The lightning search stays in place."}
        </p>

        {limitMessage && !reportReady ? (
          <p className="mt-2 text-[13px] text-amber-100/85" role="status">
            {limitMessage}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {reportReady ? (
            <>
              <p className="text-[13px] text-foreground/85">
                {analyzedCount} analyzed
                {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              </p>
              <Button type="button" size="sm" className="w-full" onClick={onViewReport}>
                View Report
              </Button>
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onExit}>
                Exit multi-select
              </Button>
            </>
          ) : (
            <>
          {canSelectAll ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={running || !onSelectAll}
              onClick={onSelectAll}
            >
              Select all {flashes.length}
            </Button>
          ) : (
            <p className="text-[13px] leading-snug text-muted-foreground">
              This search returned more than {MAX_SELECTED_FLASHES} flashes. Choose up to{" "}
              {MAX_SELECTED_FLASHES}.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={running || selectedIds.length === 0 || !onAnalyze}
            onClick={onAnalyze}
          >
            {running ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Analyzing selected flashes…
              </span>
            ) : (
              "Analyze Selected Flashes"
            )}
          </Button>
          <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onExit}>
            {running ? "Cancel multi-select" : "Exit multi-select"}
          </Button>
            </>
          )}
        </div>

        {selectedIds.length > 0 && !jobs && !reportReady ? (
          <ul className="mt-4 space-y-1.5 text-[13px] text-foreground/90">
            {selectedIds.map((id) => {
              const flash = flashes.find((item) => item.global_flash_id === id);
              return (
                <li key={id} className="flex items-center justify-between gap-3">
                  <span>{flashLabel(flashes, id)}</span>
                  {flash && onToggle ? (
                    <button
                      type="button"
                      className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => onToggle(flash)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {jobs && jobs.length > 0 && !reportReady ? (
          <div className="mt-4 min-h-0">
            <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {finished ? "Analysis summary" : "Analysis status"}
            </p>
            <ul className="mt-2 space-y-2">
              {jobs.map((job) => (
                <li
                  key={job.globalFlashId}
                  className="rounded-md border border-white/8 bg-black/20 px-2.5 py-2 text-[13px]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-foreground/95">
                      {flashLabel(flashes, job.globalFlashId)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {job.status === "analyzing" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                          Analyzing
                        </span>
                      ) : (
                        STATUS_LABEL[job.status]
                      )}
                    </span>
                  </div>
                  {job.status === "completed" && job.modelScore !== null ? (
                    <p className="mt-1 tabular-nums text-foreground/90">
                      FlashRisk score {formatFlashRiskScore(job.modelScore)}
                      <span className="text-muted-foreground"> / 100</span>
                    </p>
                  ) : null}
                  {job.status === "failed" && job.error ? (
                    <p className="mt-1 leading-snug text-amber-100/85">{job.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
