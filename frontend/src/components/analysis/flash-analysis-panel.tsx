"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp, LoaderCircle, Pause, Play, RotateCcw, X, Zap } from "lucide-react";

import { AnalysisReport } from "@/components/analysis/analysis-report";
import { SaveReportButton } from "@/components/analysis/save-report-button";
import { SurveillanceView } from "@/components/analysis/surveillance-view";
import { Button } from "@/components/ui/button";
import type { AnalyzeFlashResponse, GlmFlash, GlmFlashReconstruction } from "@/lib/api";
import { GLM_PLAYBACK_SLOWDOWN } from "@/lib/flash-playback";
import { formatObservedSpanKm, observedEventSpanKm } from "@/lib/geo-distance";
import { cn } from "cn";

const OVERLAP_HINT =
  "Multiple GLM events can occur at the same or nearby locations and may overlap on the map.";

function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function formatEnergy(value: number): string {
  return value.toExponential(3);
}

function formatArea(value: number): string {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}×10⁶ m²`;
  return `${value.toLocaleString()} m²`;
}

/** Count events whose real animation time has been reached (includes coincident coords). */
function countObservedEvents(
  reconstruction: GlmFlashReconstruction,
  playbackGlmMs: number,
): number {
  return reconstruction.events.reduce(
    (count, event) => count + (event.animation_offset_ms <= playbackGlmMs + 0.05 ? 1 : 0),
    0,
  );
}

type ReconstructionState = "idle" | "loading" | "ready" | "error";
export type AnalysisState = "idle" | "loading" | "ready" | "error";

type FlashAnalysisPanelProps = {
  className?: string;
  flash?: GlmFlash | null;
  reconstruction?: GlmFlashReconstruction | null;
  reconstructionState?: ReconstructionState;
  reconstructionError?: string | null;
  analysisState?: AnalysisState;
  analysisResult?: AnalyzeFlashResponse | null;
  analysisError?: string | null;
  playbackGlmMs?: number;
  playing?: boolean;
  reconstructionActive?: boolean;
  onClearSelection?: () => void;
  onAnalyze?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReplay?: () => void;
  onReset?: () => void;
  onSeekGlmMs?: (ms: number) => void;
  onReturnToReport?: () => void;
};

export function FlashAnalysisPanel({
  className,
  flash = null,
  reconstruction = null,
  reconstructionState = "idle",
  reconstructionError = null,
  analysisState = "idle",
  analysisResult = null,
  analysisError = null,
  playbackGlmMs = 0,
  playing = false,
  reconstructionActive = false,
  onClearSelection,
  onAnalyze,
  onPlay,
  onPause,
  onReplay,
  onReset,
  onSeekGlmMs,
  onReturnToReport,
}: FlashAnalysisPanelProps) {
  const analysisReady = analysisState === "ready" && analysisResult !== null;
  const animationEnd = reconstruction?.animation_end_ms ?? 0;
  const progress = animationEnd > 0 ? Math.min(1, playbackGlmMs / animationEnd) : 0;

  return (
    <aside
      aria-label={analysisReady ? "FlashRisk investigation workspace" : "Selected flash"}
      className={cn("panel px-4 py-4 sm:px-5", className)}
    >
      {onReturnToReport ? (
        <button
          type="button"
          onClick={onReturnToReport}
          className="mb-3 inline-flex h-8 items-center rounded-md border border-white/10 bg-white/5 px-2.5 text-[13px] text-foreground/90 transition-colors hover:bg-white/8"
        >
          Back to report
        </button>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {analysisReady ? "Investigation" : "Selected flash"}
          </h2>
          {analysisReady && flash ? (
            <p className="mt-1 truncate text-[13px] text-foreground/85">Flash {flash.flash_id}</p>
          ) : null}
        </div>
        {flash && (onReturnToReport || onClearSelection) ? (
          <button
            type="button"
            onClick={onReturnToReport ?? onClearSelection}
            className="-mt-0.5 -mr-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/6 hover:text-foreground"
            aria-label={onReturnToReport ? "Back to report" : analysisReady ? "Close analysis" : "Clear selected flash"}
            title={onReturnToReport ? "Back to report" : analysisReady ? "Close analysis" : "Clear selection"}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {!flash ? (
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted-foreground">
            <Zap className="size-3.5" aria-hidden />
          </span>
          <p className="text-[14px] leading-relaxed text-foreground/80">
            Select a lightning flash to inspect and analyze
          </p>
        </div>
      ) : analysisReady && analysisResult ? (
        <AnalyzedWorkspace
          key={analysisResult.global_flash_id}
          flash={flash}
          result={analysisResult}
          reconstruction={reconstruction}
          reconstructionState={reconstructionState}
          reconstructionError={reconstructionError}
          playbackGlmMs={playbackGlmMs}
          progress={progress}
          playing={playing}
          reconstructionActive={reconstructionActive}
          onPlay={onPlay}
          onPause={onPause}
          onReplay={onReplay}
          onReset={onReset}
          onSeekGlmMs={onSeekGlmMs}
        />
      ) : (
        <SelectedFlashBody
          flash={flash}
          reconstruction={reconstruction}
          reconstructionState={reconstructionState}
          reconstructionError={reconstructionError}
          analysisState={analysisState}
          analysisResult={analysisResult}
          analysisError={analysisError}
          playbackGlmMs={playbackGlmMs}
          progress={progress}
          playing={playing}
          reconstructionActive={reconstructionActive}
          onAnalyze={onAnalyze}
          onPlay={onPlay}
          onPause={onPause}
          onReplay={onReplay}
          onReset={onReset}
          onSeekGlmMs={onSeekGlmMs}
        />
      )}
    </aside>
  );
}

function AnalyzedWorkspace({
  flash,
  result,
  reconstruction,
  reconstructionState,
  reconstructionError,
  playbackGlmMs,
  progress,
  playing,
  reconstructionActive,
  onPlay,
  onPause,
  onReplay,
  onReset,
  onSeekGlmMs,
}: {
  flash: GlmFlash;
  result: AnalyzeFlashResponse;
  reconstruction: GlmFlashReconstruction | null;
  reconstructionState: ReconstructionState;
  reconstructionError: string | null;
  playbackGlmMs: number;
  progress: number;
  playing: boolean;
  reconstructionActive: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onReplay?: () => void;
  onReset?: () => void;
  onSeekGlmMs?: (ms: number) => void;
}) {
  const [workspaceView, setWorkspaceView] = useState<"analysis" | "surveillance" | "lightning">("analysis");

  return (
    <div className="mt-3 flex flex-col gap-4">
      <SaveReportButton result={result} flash={flash} />
      <div
        className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/25 p-1"
        role="tablist"
        aria-label="Investigation views"
      >
        <WorkspaceTab
          selected={workspaceView === "analysis"}
          onClick={() => setWorkspaceView("analysis")}
        >
          Analysis
        </WorkspaceTab>
        <WorkspaceTab
          selected={workspaceView === "surveillance"}
          onClick={() => setWorkspaceView("surveillance")}
        >
          Surveillance
        </WorkspaceTab>
        <WorkspaceTab
          selected={workspaceView === "lightning"}
          onClick={() => setWorkspaceView("lightning")}
        >
          Lightning
        </WorkspaceTab>
      </div>

      {workspaceView === "analysis" ? (
        <AnalysisReport result={result} flash={flash} />
      ) : workspaceView === "surveillance" ? (
        <SurveillanceView
          globalFlashId={result.global_flash_id}
          latitude={result.flash_lat}
          longitude={result.flash_lon}
          flashTimestampUtc={result.flash_timestamp_utc}
        />
      ) : (
        <LightningDetailView
          flash={flash}
          reconstruction={reconstruction}
          reconstructionState={reconstructionState}
          reconstructionError={reconstructionError}
          playbackGlmMs={playbackGlmMs}
          progress={progress}
          playing={playing}
          reconstructionActive={reconstructionActive}
          onPlay={onPlay}
          onPause={onPause}
          onReplay={onReplay}
          onReset={onReset}
          onSeekGlmMs={onSeekGlmMs}
        />
      )}
    </div>
  );
}

function WorkspaceTab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "h-8 rounded-[5px] text-[13px] font-medium transition-colors duration-150",
        selected
          ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(0.72_0.17_50/0.4)]"
          : "text-muted-foreground hover:bg-white/4 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LightningDetailView({
  flash,
  reconstruction,
  reconstructionState,
  reconstructionError,
  playbackGlmMs,
  progress,
  playing,
  reconstructionActive,
  onPlay,
  onPause,
  onReplay,
  onReset,
  onSeekGlmMs,
}: {
  flash: GlmFlash;
  reconstruction: GlmFlashReconstruction | null;
  reconstructionState: ReconstructionState;
  reconstructionError: string | null;
  playbackGlmMs: number;
  progress: number;
  playing: boolean;
  reconstructionActive: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onReplay?: () => void;
  onReset?: () => void;
  onSeekGlmMs?: (ms: number) => void;
}) {
  const features = reconstruction ?? flash;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-snug text-muted-foreground">
        GLM flash details and event reconstruction. Switch to Analysis anytime to return to the
        completed report.
      </p>

      <section
        aria-label="Selected flash"
        className="rounded-md border border-white/8 bg-black/22 px-3 py-2.5"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
            <Zap className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Selected flash
            </p>
            <p className="mt-1 text-[15px] font-medium leading-snug text-foreground">
              Flash {flash.flash_id}
            </p>
          </div>
        </div>

        {/* Wide workspace: tight label/value pairs, not full-card stretch */}
        <dl className="mt-3 flex flex-col gap-2.5 border-t border-white/6 pt-2.5 text-[13.5px]">
          <MetaRow
            label="UTC time"
            value={formatUtc(flash.flash_start_time)}
            nowrap
            pair
          />
          <div className="flex flex-wrap gap-x-10 gap-y-2.5">
            <MetaRow
              label="Distance"
              value={`${flash.distance_km.toFixed(2)} km`}
              pair
            />
            <MetaRow
              label="Coordinates"
              value={formatCoord(flash.flash_lat, flash.flash_lon)}
              nowrap
              pair
            />
          </div>
        </dl>
        <details className="mt-2.5 border-t border-white/6 pt-2">
          <summary className="cursor-pointer text-[13px] text-muted-foreground/80 transition-colors hover:text-muted-foreground">
            Source granule
          </summary>
          <p className="mt-1.5 break-all font-mono text-[11px] leading-snug text-muted-foreground/70">
            {flash.source_file}
          </p>
        </details>
      </section>

      <section
        aria-label="GLM characteristics"
        className="rounded-md border border-white/8 bg-black/22 px-3 py-2.5"
      >
        <SectionLabel>GLM characteristics</SectionLabel>
        <dl className="mt-2.5 grid gap-x-10 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
          <MetaRow label="Energy" value={formatEnergy(features.flash_energy)} pair />
          <MetaRow label="Area" value={formatArea(features.flash_area)} pair />
          <MetaRow label="Duration" value={`${features.flash_duration_ms.toFixed(1)} ms`} pair />
          <MetaRow label="Groups" value={String(features.group_count)} pair />
          <MetaRow label="Max Group Area" value={formatArea(features.max_group_area)} pair />
          <MetaRow label="Max Group Energy" value={formatEnergy(features.max_group_energy)} pair />
          <MetaRow
            label="Max Events / Group"
            value={String(features.max_events_per_group)}
            pair
          />
          <MetaRow label="Total Events" value={String(features.total_events)} pair />
        </dl>
      </section>

      <section
        aria-label="Reconstruction"
        className="rounded-md border border-white/8 bg-black/22 px-3 py-2.5"
      >
        <ReconstructionControls
          state={reconstructionState}
          error={reconstructionError}
          reconstruction={reconstruction}
          playbackGlmMs={playbackGlmMs}
          progress={progress}
          playing={playing}
          reconstructionActive={reconstructionActive}
          onPlay={onPlay}
          onPause={onPause}
          onReplay={onReplay}
          onReset={onReset}
          onSeekGlmMs={onSeekGlmMs}
          layout="wide"
        />
      </section>
    </div>
  );
}

function SelectedFlashBody({
  flash,
  reconstruction,
  reconstructionState,
  reconstructionError,
  analysisState,
  analysisResult,
  analysisError,
  playbackGlmMs,
  progress,
  playing,
  reconstructionActive,
  onAnalyze,
  onPlay,
  onPause,
  onReplay,
  onReset,
  onSeekGlmMs,
}: {
  flash: GlmFlash;
  reconstruction: GlmFlashReconstruction | null;
  reconstructionState: ReconstructionState;
  reconstructionError: string | null;
  analysisState: AnalysisState;
  analysisResult: AnalyzeFlashResponse | null;
  analysisError: string | null;
  playbackGlmMs: number;
  progress: number;
  playing: boolean;
  reconstructionActive: boolean;
  onAnalyze?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReplay?: () => void;
  onReset?: () => void;
  onSeekGlmMs?: (ms: number) => void;
}) {
  const features = reconstruction ?? flash;
  const analyzing = analysisState === "loading";

  return (
    <div className="mt-3 flex flex-col gap-5">
      <section aria-label="Flash identity">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
            <Zap className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-snug text-foreground">
              Flash {flash.flash_id}
            </p>
            <p
              className="mt-0.5 truncate text-[13px] text-muted-foreground"
              title={flash.source_file}
            >
              {flash.source_file}
            </p>
          </div>
        </div>

        <dl className="mt-3.5 space-y-2 text-[13.5px]">
          <MetaRow label="UTC time" value={formatUtc(flash.flash_start_time)} nowrap />
          <MetaRow label="Coordinates" value={formatCoord(flash.flash_lat, flash.flash_lon)} nowrap />
          <MetaRow label="Distance" value={`${flash.distance_km.toFixed(2)} km`} />
        </dl>
      </section>

      <section aria-label="GLM characteristics">
        <SectionLabel>GLM characteristics</SectionLabel>
        <dl className="mt-2.5 space-y-2 text-[13.5px]">
          <MetaRow label="Energy" value={formatEnergy(features.flash_energy)} />
          <MetaRow label="Area" value={formatArea(features.flash_area)} />
          <MetaRow label="Duration" value={`${features.flash_duration_ms.toFixed(1)} ms`} />
          <MetaRow label="Groups" value={String(features.group_count)} />
          <MetaRow label="Max Group Area" value={formatArea(features.max_group_area)} />
          <MetaRow label="Max Group Energy" value={formatEnergy(features.max_group_energy)} />
          <MetaRow label="Max Events / Group" value={String(features.max_events_per_group)} />
          <MetaRow label="Total Events" value={String(features.total_events)} />
        </dl>
      </section>

      <ReconstructionControls
        state={reconstructionState}
        error={reconstructionError}
        reconstruction={reconstruction}
        playbackGlmMs={playbackGlmMs}
        progress={progress}
        playing={playing}
        reconstructionActive={reconstructionActive}
        onPlay={onPlay}
        onPause={onPause}
        onReplay={onReplay}
        onReset={onReset}
        onSeekGlmMs={onSeekGlmMs}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={!onAnalyze || analyzing}
        onClick={onAnalyze}
      >
        {analyzing ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Analyzing…
          </span>
        ) : (
          "Analyze"
        )}
      </Button>

      <AnalysisStatus
        flash={flash}
        state={analysisState}
        result={analysisResult}
        error={analysisError}
      />
    </div>
  );
}

function AnalysisStatus({
  flash,
  state,
  result,
  error,
}: {
  flash: GlmFlash;
  state: AnalysisState;
  result: AnalyzeFlashResponse | null;
  error: string | null;
}) {
  if (state === "idle") return null;

  if (state === "loading") {
    return (
      <section aria-label="Analysis" aria-busy="true">
        <SectionLabel>Analysis</SectionLabel>
        <div className="mt-2.5 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
          <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary/80" aria-hidden />
          <span>
            Running environmental retrieval and model scoring. This can take several minutes…
          </span>
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section aria-label="Analysis">
        <SectionLabel>Analysis</SectionLabel>
        <p className="mt-2.5 text-[13px] leading-snug text-amber-100/85">
          {error ?? "Analyze failed. Try again after checking backend connectivity."}
        </p>
      </section>
    );
  }

  if (!result) return null;

  return <AnalysisReport result={result} flash={flash} />;
}

function ReconstructionControls({
  state,
  error,
  reconstruction,
  playbackGlmMs,
  progress,
  playing,
  reconstructionActive,
  onPlay,
  onPause,
  onReplay,
  onReset,
  onSeekGlmMs,
  layout = "compact",
}: {
  state: ReconstructionState;
  error: string | null;
  reconstruction: GlmFlashReconstruction | null;
  playbackGlmMs: number;
  progress: number;
  playing: boolean;
  reconstructionActive: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onReplay?: () => void;
  onReset?: () => void;
  onSeekGlmMs?: (ms: number) => void;
  /** Wide post-analysis workspace vs compact pre-analysis panel. */
  layout?: "compact" | "wide";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const wide = layout === "wide";

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      if (!trackRef.current || !reconstruction || !onSeekGlmMs) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      onSeekGlmMs(ratio * reconstruction.animation_end_ms);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, reconstruction, onSeekGlmMs]);

  if (state === "loading") {
    return (
      <div>
        <SectionLabel>Reconstruction</SectionLabel>
        <div className="mt-2.5 flex items-center gap-2 text-[13px] text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin text-primary/80" aria-hidden />
          Loading flash reconstruction…
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div>
        <SectionLabel>Reconstruction</SectionLabel>
        <p className="mt-2.5 text-[13px] leading-snug text-amber-100/85">
          {error ?? "Could not load flash reconstruction."}
        </p>
      </div>
    );
  }

  if (!reconstruction) return null;

  const durationMs = reconstruction.animation_end_ms;
  const atEnd = playbackGlmMs >= durationMs - 0.05;
  const atStart = playbackGlmMs <= 0.05;
  const durationLabel = `${Math.round(durationMs)}`;
  const showReset = reconstructionActive;
  const totalEvents = reconstruction.total_events;
  const observedEvents = countObservedEvents(reconstruction, playbackGlmMs);
  const groupCount = reconstruction.group_count;
  const observedSpanLabel = formatObservedSpanKm(observedEventSpanKm(reconstruction.events));
  const spanDisplay =
    observedSpanLabel?.replace(/^Observed span\s*[·:]\s*/i, "") ?? "—";

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Reconstruction</SectionLabel>
        <p className="text-[10px] tabular-nums text-muted-foreground/80">
          {playbackGlmMs.toFixed(0)} / {durationLabel} ms
        </p>
      </div>

      {wide ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-4">
          <ReconstructionMetric
            label="Events observed"
            value={`${observedEvents} / ${totalEvents}`}
            accessory={<OverlapHint />}
          />
          <ReconstructionMetric label="Groups" value={String(groupCount)} />
          <ReconstructionMetric label="Observed span" value={spanDisplay} />
          <ReconstructionMetric label="GLM duration" value={`0–${durationLabel} ms`} />
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-1.5">
            <p className="text-[14px] tabular-nums text-foreground/95">
              <span className="text-muted-foreground">Events observed</span>{" "}
              <span className="font-medium text-foreground">
                {observedEvents} / {totalEvents}
              </span>
            </p>
            <OverlapHint />
          </div>

          <p className="mt-1 text-[13px] tabular-nums text-muted-foreground/90">
            {totalEvents} events · {groupCount} groups
          </p>

          {observedSpanLabel ? (
            <p className="mt-1.5 text-[13px] text-muted-foreground/90">{observedSpanLabel}</p>
          ) : null}

          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground/80">
            0–{durationLabel} ms GLM duration · slowed {GLM_PLAYBACK_SLOWDOWN}× for visibility
          </p>
        </>
      )}

      {wide ? (
        <p className="mt-2.5 text-[13px] leading-snug text-muted-foreground/80">
          Playback slowed {GLM_PLAYBACK_SLOWDOWN}× for visibility
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground",
          wide ? "mt-3" : "mt-3",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex size-3.5 items-center justify-center text-[15px] font-medium leading-none text-[rgb(255,196,110)]"
            aria-hidden
          >
            +
          </span>
          GLM event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3.5 border border-dashed border-[rgba(232,168,74,0.55)] bg-[rgba(232,168,74,0.06)]"
            aria-hidden
          />
          Observed extent
        </span>
      </div>

      <div
        ref={trackRef}
        className="mt-3.5 h-1.5 cursor-pointer rounded-full bg-white/10"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={playbackGlmMs}
        aria-label="Flash animation timeline"
        onPointerDown={(event) => {
          if (!onSeekGlmMs) return;
          setDragging(true);
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          onSeekGlmMs(ratio * durationMs);
        }}
      >
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {playing ? (
          <button
            type="button"
            onClick={onPause}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-[13px] text-foreground/90 transition-colors hover:bg-white/8"
          >
            <Pause className="size-3" aria-hidden />
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={atEnd ? onReplay : onPlay}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 text-[13px] text-primary transition-colors hover:bg-primary/15"
          >
            {atEnd ? (
              <>
                <RotateCcw className="size-3" aria-hidden />
                Replay
              </>
            ) : (
              <>
                <Play className="size-3" aria-hidden />
                {atStart ? "Play Reconstruction" : "Resume"}
              </>
            )}
          </button>
        )}
        {atEnd ? null : !playing && !atStart ? (
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-2 text-[13px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <RotateCcw className="size-3" aria-hidden />
            Replay
          </button>
        ) : null}
        {showReset && onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-7 items-center rounded-md px-2 text-[13px] text-muted-foreground/75 transition-colors hover:bg-white/4 hover:text-muted-foreground"
            title="Clear reconstruction visualization"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReconstructionMetric({
  label,
  value,
  accessory,
}: {
  label: string;
  value: string;
  accessory?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/6 bg-black/15 px-2.5 py-2">
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        {accessory}
      </div>
      <p className="mt-1 truncate text-[13.5px] font-medium tabular-nums text-foreground/95">
        {value}
      </p>
    </div>
  );
}

function OverlapHint() {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/55 transition-colors hover:text-muted-foreground"
        aria-label="About overlapping GLM events"
        aria-expanded={open}
        aria-controls={tipId}
        title={OVERLAP_HINT}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          id={tipId}
          role="tooltip"
          className="absolute top-full left-1/2 z-20 mt-1.5 w-[13.5rem] -translate-x-1/2 rounded-md border border-white/10 bg-[oklch(0.18_0.02_258)] px-2.5 py-2 text-[11px] leading-snug text-muted-foreground shadow-lg"
        >
          {OVERLAP_HINT}
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function MetaRow({
  label,
  value,
  nowrap = false,
  pair = false,
  className,
}: {
  label: string;
  value: string;
  nowrap?: boolean;
  /** Tight label/value association (wide workspace). Compact panels keep stretch layout. */
  pair?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline",
        pair ? "w-fit max-w-full gap-2" : "justify-between gap-2.5",
        className,
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 tabular-nums text-foreground/90",
          pair ? "text-left" : "text-right",
          nowrap ? "overflow-hidden text-ellipsis whitespace-nowrap" : "break-words",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
