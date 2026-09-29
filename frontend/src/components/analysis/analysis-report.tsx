"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Clock3, MapPin } from "lucide-react";

import type { AnalyzeFlashResponse, GlmFlash } from "@/lib/api";
import {
  analysisFeatureRows,
  featuresBySection,
  formatAnalysisRuntime,
  formatFeatureValue,
  formatFlashRiskScore,
  scoreMarkerPercent,
} from "@/lib/analysis-display";
import { cn } from "cn";

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

type AnalysisReportProps = {
  result: AnalyzeFlashResponse;
  flash: GlmFlash;
};

export function AnalysisReport({ result, flash }: AnalysisReportProps) {
  const scoreId = useId();
  const [inputsOpen, setInputsOpen] = useState(false);
  const displayScore = formatFlashRiskScore(result.model_score);
  const markerPct = scoreMarkerPercent(result.model_score);
  const sections = featuresBySection(result.feature_names, result.feature_values);
  const rawRows = analysisFeatureRows(result.feature_names, result.feature_values);
  const timestamp = result.flash_timestamp_utc || flash.flash_start_time;

  return (
    <section
      aria-label="FlashRisk Analysis Report"
      className="overflow-hidden rounded-lg border border-white/10 bg-[oklch(0.14_0.016_258/0.55)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
    >
      <header className="border-b border-white/8 px-3.5 pt-3.5 pb-3">
        <p className="text-[10px] font-medium tracking-[0.2em] text-primary/85 uppercase">
          FlashRisk Analysis Report
        </p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Surveillance prioritization score for the selected GLM flash
        </p>
      </header>

      <div className="space-y-4 px-3.5 py-4">
        {/* Score hero */}
        <div
          className="relative overflow-hidden rounded-md border border-primary/20 bg-[linear-gradient(165deg,oklch(0.22_0.03_50/0.35),oklch(0.16_0.02_258/0.9)_55%)] px-3.5 py-4"
          aria-labelledby={scoreId}
        >
          <div
            className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-primary/12 blur-2xl"
            aria-hidden
          />
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            FlashRisk Score
          </p>
          <div className="mt-1.5 flex items-end gap-2">
            <p
              id={scoreId}
              className="font-mono text-[2.65rem] leading-none font-semibold tracking-tight text-foreground tabular-nums"
            >
              {displayScore}
            </p>
            <span className="mb-1 text-[12px] text-muted-foreground">/ 100</span>
          </div>
          <p className="mt-2 max-w-[18rem] text-[11px] leading-snug text-muted-foreground/90">
            Ranking aid for follow-up review — not a calibrated likelihood of ignition.
          </p>

          <div className="mt-4">
            <ScoreScale markerPercent={markerPct} scoreLabel={displayScore} />
          </div>
        </div>

        {/* Compact context */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ContextChip
            icon={<MapPin className="size-3" aria-hidden />}
            label="Flash"
            value={`#${flash.flash_id}`}
            detail={formatCoord(result.flash_lat, result.flash_lon)}
          />
          <ContextChip
            icon={<Clock3 className="size-3" aria-hidden />}
            label="Analyzed"
            value={formatUtc(timestamp)}
            detail={`Runtime ${formatAnalysisRuntime(result.analysis_seconds)}`}
          />
        </div>

        {/* Grouped model inputs */}
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Model inputs
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground/85">
              Environmental and lightning variables used by the frozen model
            </p>
          </div>

          {sections.map(({ section, rows }) => (
            <div
              key={section.id}
              className="rounded-md border border-white/8 bg-black/20 px-3 py-2.5"
            >
              <div className="mb-2">
                <p className="text-[11px] font-medium text-foreground/95">{section.title}</p>
                <p className="text-[10px] leading-snug text-muted-foreground/80">{section.blurb}</p>
              </div>
              <dl className="space-y-1.5">
                {rows.map((row) => (
                  <div
                    key={row.name}
                    className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)] items-baseline gap-x-3"
                  >
                    <dt className="truncate text-[11.5px] text-muted-foreground">{row.label}</dt>
                    <dd className="text-right text-[12px] tabular-nums text-foreground/92">
                      <span>{row.displayText}</span>
                      {row.unit ? (
                        <span className="ml-1 text-[10px] text-muted-foreground/75">{row.unit}</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        {/* Expandable raw vector */}
        <div className="rounded-md border border-white/8 bg-black/15">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            aria-expanded={inputsOpen}
            onClick={() => setInputsOpen((open) => !open)}
          >
            <span>
              <span className="block text-[11px] font-medium text-foreground/90">
                All 21 model inputs
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
                Exact feature names and values in model order
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                inputsOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {inputsOpen ? (
            <dl className="max-h-52 space-y-1.5 overflow-y-auto border-t border-white/8 px-3 py-2.5 text-[11px]">
              {rawRows.map((row, index) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[1.15rem_minmax(0,1fr)_auto] items-baseline gap-x-2"
                >
                  <span className="text-muted-foreground/55 tabular-nums">{index}</span>
                  <dt className="truncate font-mono text-[10.5px] text-muted-foreground">
                    {row.name}
                  </dt>
                  <dd className="font-mono text-right tabular-nums text-foreground/88">
                    {formatFeatureValue(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScoreScale({
  markerPercent,
  scoreLabel,
}: {
  markerPercent: number;
  scoreLabel: string;
}) {
  return (
    <div className="space-y-1.5" aria-hidden={false}>
      <div
        className="relative h-2.5 rounded-full"
        role="img"
        aria-label={`FlashRisk Score ${scoreLabel} on a scale from 0 to 100`}
        style={{
          background:
            "linear-gradient(90deg, oklch(0.45 0.04 230) 0%, oklch(0.62 0.1 95) 38%, oklch(0.72 0.17 50) 68%, oklch(0.62 0.2 30) 100%)",
          boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 12%)",
        }}
      >
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[oklch(0.98_0.01_95)] bg-[oklch(0.2_0.02_258)] shadow-[0_0_0_3px_oklch(0.72_0.17_50/0.35),0_2px_8px_oklch(0_0_0/0.45)]"
          style={{ left: `${markerPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/75">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ContextChip({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-black/20 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[12.5px] font-medium text-foreground/95">{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/85">{detail}</p>
    </div>
  );
}
