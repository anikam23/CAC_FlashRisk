"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import type { AnalyzeFlashResponse, GlmFlash } from "@/lib/api";
import {
  formatAnalysisRuntime,
  formatFlashRiskScore,
  primaryEnvironmentSections,
  scoreMarkerPercent,
  secondaryFeatureSections,
  toFlashRiskScore,
  type SectionFeatureRow,
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
  const displayScore = formatFlashRiskScore(result.model_score);
  const flashRiskScore = toFlashRiskScore(result.model_score);
  const elevatedPriority = Number.isFinite(flashRiskScore) && flashRiskScore >= 50;
  const markerPct = scoreMarkerPercent(result.model_score);
  const primary = primaryEnvironmentSections(result.feature_names, result.feature_values);
  const secondary = secondaryFeatureSections(result.feature_names, result.feature_values);
  const timestamp = result.flash_timestamp_utc || flash.flash_start_time;

  return (
    <section aria-label="FlashRisk Analysis Report" className="flex flex-col gap-4">
      <div
        className="relative overflow-hidden rounded-lg border border-primary/20 bg-[linear-gradient(120deg,oklch(0.22_0.035_50/0.4),oklch(0.15_0.018_258/0.92)_52%)] px-4 py-4"
        aria-labelledby={scoreId}
      >
        <div
          className="pointer-events-none absolute -top-12 right-0 size-36 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10px] font-medium tracking-[0.2em] text-primary/90 uppercase">
                FlashRisk Score
              </p>
              <span className="rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-emerald-200/90 uppercase">
                Analysis complete
              </span>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <p
                id={scoreId}
                className="font-mono text-[3rem] leading-none font-semibold tracking-tight text-foreground tabular-nums sm:text-[3.35rem]"
              >
                {displayScore}
              </p>
              <span className="mb-1.5 text-[13px] text-muted-foreground">/ 100</span>
            </div>
            {elevatedPriority ? (
              <span className="mt-2 inline-flex rounded-sm border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-200/90">
                Elevated Surveillance Priority
              </span>
            ) : null}
            <p className="mt-2 max-w-md text-[12.5px] leading-snug text-muted-foreground/90">
              Model-generated ignition surveillance priority. Higher scores indicate flashes the
              model identifies for greater ignition surveillance priority.
            </p>
            <div className="mt-3.5 max-w-sm">
              <ScoreScale markerPercent={markerPct} scoreLabel={displayScore} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/8 pt-3 text-[13px] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <MetaCell label="Flash" value={`#${flash.flash_id}`} />
            <MetaCell
              label="Runtime"
              value={formatAnalysisRuntime(result.analysis_seconds)}
            />
            <MetaCell
              label="Location"
              value={formatCoord(result.flash_lat, result.flash_lon)}
              className="col-span-2"
            />
            <MetaCell
              label="Flash time (UTC)"
              value={formatUtc(timestamp)}
              className="col-span-2"
            />
          </dl>
        </div>
      </div>

      <div>
        <div className="mb-2.5">
          <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Environmental conditions
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground/80">
            Environmental conditions at the time of the flash
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {primary.map(({ section, rows }) => (
            <ConditionGroup
              key={section.id}
              emoji={section.emoji}
              title={section.title}
              blurb={section.blurb}
              rows={rows}
              sectionId={section.id}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {secondary.map(({ section, rows }) => (
          <CollapsibleBlock
            key={section.id}
            title={`${section.emoji} ${section.title}`}
            subtitle={section.blurb}
          >
            {section.id === "seasonality" ? (
              <div className="space-y-2.5">
                <p className="text-[13px] leading-snug text-muted-foreground/85">
                  These sine and cosine values encode the flash’s time of year as a continuous
                  annual cycle so the model can use seasonality without calendar discontinuities.
                  They are technical model variables, not direct environmental measurements.
                </p>
                <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {rows.map((row) => (
                    <ValueRow key={row.name} row={row} technical />
                  ))}
                </dl>
              </div>
            ) : (
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {rows.map((row) => (
                  <ValueRow key={row.name} row={row} />
                ))}
              </dl>
            )}
          </CollapsibleBlock>
        ))}
      </div>
    </section>
  );
}

function ConditionGroup({
  emoji,
  title,
  blurb,
  rows,
  sectionId,
}: {
  emoji: string;
  title: string;
  blurb: string;
  rows: SectionFeatureRow[];
  sectionId: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-black/22 px-3 py-2.5">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 text-[14px] leading-none" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground/95">{title}</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground/75">{blurb}</p>
        </div>
      </div>
      {sectionId === "vegetation" ? (
        <p className="mb-2 text-[11.5px] leading-snug text-muted-foreground/70">
          NDVI and NDWI each range from −1 to +1. Higher NDVI generally corresponds to greener
          vegetation; higher NDWI generally corresponds to a stronger vegetation moisture signal.
        </p>
      ) : null}
      <dl className="space-y-1.5 border-t border-white/6 pt-2">
        {rows.map((row) => (
          <ValueRow key={row.name} row={row} showHint />
        ))}
      </dl>
    </div>
  );
}

function ValueRow({
  row,
  showHint = false,
  technical = false,
}: {
  row: SectionFeatureRow;
  showHint?: boolean;
  technical?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] items-baseline gap-x-3">
      <dt className="min-w-0">
        <span
          className={cn(
            "block truncate text-[12.5px]",
            technical ? "font-mono text-[12px] text-muted-foreground/80" : "text-muted-foreground",
          )}
        >
          {row.label}
        </span>
        {showHint && row.hint ? (
          <span className="block truncate text-[11px] text-muted-foreground/65">{row.hint}</span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "text-right tabular-nums text-foreground/92",
          technical ? "font-mono text-[13px]" : "text-[13.5px]",
        )}
      >
        <span>{row.displayText}</span>
        {row.unit ? (
          <span className="ml-1 text-[11px] text-muted-foreground/70">{row.unit}</span>
        ) : null}
      </dd>
    </div>
  );
}

function CollapsibleBlock({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-white/8 bg-black/15">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground/90">{title}</span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground/75">{subtitle}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-white/8 px-3 py-2.5">{children}</div> : null}
    </div>
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
    <div className="space-y-1.5">
      <div
        className="relative h-2 rounded-full"
        role="img"
        aria-label={`FlashRisk Score ${scoreLabel} on a scale from 0 to 100`}
        style={{
          background:
            "linear-gradient(90deg, oklch(0.45 0.04 230) 0%, oklch(0.62 0.1 95) 38%, oklch(0.72 0.17 50) 68%, oklch(0.62 0.2 30) 100%)",
          boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 12%)",
        }}
      >
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[oklch(0.98_0.01_95)] bg-[oklch(0.2_0.02_258)] shadow-[0_0_0_3px_oklch(0.72_0.17_50/0.35),0_2px_8px_oklch(0_0_0/0.45)]"
          style={{ left: `${markerPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function MetaCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground/80 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13.5px] text-foreground/92">{value}</dd>
    </div>
  );
}
