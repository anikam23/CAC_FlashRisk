"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ReportFlashMap } from "@/components/analysis/report-flash-map";
import { formatFeatureDisplayValue, formatFlashRiskScore } from "@/lib/analysis-display";
import type { AnalyzeFlashResponse, GlmFlash } from "@/lib/api";
import {
  REPORT_FEATURE_KEYS,
  flashRiskBarPercent,
  numericRange,
  reportScoreSummary,
  reportTimeSpan,
  type RankedReportRow,
  type ReportFeatureKey,
} from "@/lib/multi-flash-report";
import { cn } from "cn";

type MultiFlashReportProps = {
  provenance: string;
  rows: readonly RankedReportRow[];
  flashes: readonly GlmFlash[];
  results: Readonly<Record<string, AnalyzeFlashResponse>>;
  onOpenFlash: (globalFlashId: string) => void;
  onBackToMap: () => void;
};

const ENV_ROWS: { key: ReportFeatureKey; label: string; feature: string; emoji: string }[] = [
  { key: "temperature", label: "Temperature", feature: REPORT_FEATURE_KEYS.temperature, emoji: "🌡️" },
  { key: "relativeHumidity", label: "Relative humidity", feature: REPORT_FEATURE_KEYS.relativeHumidity, emoji: "🌡️" },
  { key: "vpd", label: "VPD", feature: REPORT_FEATURE_KEYS.vpd, emoji: "🌡️" },
  { key: "precipitation24h", label: "Precipitation, 24 h", feature: REPORT_FEATURE_KEYS.precipitation24h, emoji: "🌧️" },
  { key: "surfaceSoilMoisture", label: "Surface soil moisture", feature: REPORT_FEATURE_KEYS.surfaceSoilMoisture, emoji: "💧" },
  { key: "vegetationNdvi", label: "NDVI", feature: REPORT_FEATURE_KEYS.vegetationNdvi, emoji: "🌿" },
  { key: "vegetationNdwi", label: "NDWI", feature: REPORT_FEATURE_KEYS.vegetationNdwi, emoji: "🌿" },
];

const LIGHTNING_ROWS: { key: keyof RankedReportRow["lightning"]; label: string; feature: string | null }[] = [
  { key: "durationMs", label: "Duration", feature: "flash_duration_ms" },
  { key: "energy", label: "Energy", feature: "flash_energy" },
  { key: "area", label: "Area", feature: "flash_area" },
  { key: "groupCount", label: "Groups", feature: "group_count" },
  { key: "totalEvents", label: "Events", feature: null },
];

const RANGE_SUBTITLE = "Range across the successfully analyzed flashes.";

function formatClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function featureText(name: string | null, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (!name) return String(Math.round(value));
  const formatted = formatFeatureDisplayValue(name, value);
  return formatted.unit ? `${formatted.text} ${formatted.unit}` : formatted.text;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

export function MultiFlashReport({
  provenance,
  rows,
  flashes,
  results,
  onOpenFlash,
  onBackToMap,
}: MultiFlashReportProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const successful = rows.filter((row) => row.rank !== null && row.modelScore !== null);
  const summary = reportScoreSummary(rows);
  const span = reportTimeSpan(rows.map((row) => row.utcTime));
  const sameDay = span ? formatDay(span.startMs) === formatDay(span.endMs) : false;
  const spanLabel = !span
    ? null
    : sameDay
      ? `${formatDay(span.startMs)} · ${formatClock(span.startMs)}–${formatClock(span.endMs)} UTC`
      : `${formatDay(span.startMs)} ${formatClock(span.startMs)} – ${formatDay(span.endMs)} ${formatClock(span.endMs)} UTC`;
  const points = useMemo(
    () =>
      rows.flatMap((row) =>
        row.rank !== null && row.latitude !== null && row.longitude !== null
          ? [{ id: row.globalFlashId, rank: row.rank, lon: row.longitude, lat: row.latitude, label: row.flashIdLabel }]
          : [],
      ),
    [rows],
  );

  const highlight = (id: string) => {
    setActiveId(id);
  };

  const reveal = (id: string) => {
    setActiveId(id);
    document.getElementById(`report-row-${id}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <section
      aria-label="Multi-flash surveillance report"
      className="pointer-events-auto absolute inset-0 z-20 flex flex-col bg-background"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[18px] font-medium tracking-tight text-foreground">
            Multi-Flash Surveillance Report
          </h2>
          <p className="mt-1 text-[13px] text-foreground/85">
            {rows.length} selected{spanLabel ? ` · ${spanLabel}` : ""}
          </p>
          {provenance ? (
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Lightning search · {provenance}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (saving) return;
                setSaving(true);
                setSaveError(null);
                void import("@/lib/multi-flash-report-pdf")
                  .then(({ saveMultiFlashReport }) =>
                    saveMultiFlashReport({ provenance, rows, flashes, results }),
                  )
                  .catch(() => {
                    setSaveError("The PDF could not be created. The report is unchanged.");
                  })
                  .finally(() => setSaving(false));
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-[13px] text-foreground/90 transition-colors hover:bg-white/8 disabled:opacity-50"
            >
              {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
              {saving ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onBackToMap}
              className="inline-flex h-8 items-center rounded-md border border-white/10 bg-white/5 px-3 text-[13px] text-foreground/90 transition-colors hover:bg-white/8"
            >
              Back to Map
            </button>
          </div>
          {saveError ? <p className="max-w-64 text-right text-[12px] text-destructive">{saveError}</p> : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric
            label="Highest FlashRisk"
            value={summary.highest === null ? "—" : formatFlashRiskScore(summary.highest)}
          />
          <Metric
            label="Lowest FlashRisk"
            value={summary.lowest === null ? "—" : formatFlashRiskScore(summary.lowest)}
          />
          <Metric
            label="Score Spread"
            hint="Highest − lowest"
            value={summary.difference === null ? "—" : formatFlashRiskScore(summary.difference)}
          />
        </div>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-label="Surveillance priority" className="min-w-0">
            <SectionLabel>Surveillance priority</SectionLabel>
            <p className="mt-1 text-[12px] text-muted-foreground">Ranked by FlashRisk score · 0–100</p>
            <div className="mt-2 space-y-1.5">
              {successful.map((row) => {
                const active = row.globalFlashId === activeId;
                const width = flashRiskBarPercent(row.modelScore as number);
                return (
                  <button
                    key={row.globalFlashId}
                    id={`report-priority-${row.globalFlashId}`}
                    type="button"
                    onMouseEnter={() => highlight(row.globalFlashId)}
                    onClick={() => highlight(row.globalFlashId)}
                    className={cn(
                      "grid w-full grid-cols-[2rem_minmax(4.5rem,7.5rem)_minmax(0,1fr)_3rem] items-center gap-2 rounded-md px-2 py-1.5 text-left",
                      active ? "bg-primary/10 ring-1 ring-primary/35" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="text-[15px] font-medium tabular-nums text-primary">{row.rank}</span>
                    <span className="truncate text-[13px] text-foreground/90">{row.flashIdLabel}</span>
                    <span className="relative h-2 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-primary/80"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="text-right text-[14px] font-medium tabular-nums text-foreground">
                      {formatFlashRiskScore(row.modelScore as number)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Geographic context" className="flex min-h-64 min-w-0 flex-col">
            <SectionLabel>Locations by rank</SectionLabel>
            <p className="mt-1 text-[12px] text-muted-foreground">Rank labels on the successfully analyzed flashes</p>
            <div className="mt-2 min-h-64 flex-1">
              {points.length > 0 ? (
                <ReportFlashMap
                  points={points}
                  activeId={activeId}
                  onHover={highlight}
                  onActivate={reveal}
                />
              ) : (
                <div className="flex h-full min-h-[16rem] items-center justify-center rounded-md border border-white/10 text-[13px] text-muted-foreground">
                  No mapped flashes
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Comparison
            title="Environmental Range Across Selected Flashes"
            subtitle={RANGE_SUBTITLE}
            rows={ENV_ROWS.map((item) => {
              const range = numericRange(successful.map((row) => row.features[item.key]));
              return {
                emoji: item.emoji,
                label: item.label,
                min: range ? featureText(item.feature, range.min) : "—",
                max: range ? featureText(item.feature, range.max) : "—",
              };
            })}
          />
          <Comparison
            title="Lightning Range Across Selected Flashes"
            subtitle={RANGE_SUBTITLE}
            emoji="⚡"
            rows={LIGHTNING_ROWS.map((item) => {
              const range = numericRange(successful.map((row) => row.lightning[item.key]));
              return {
                label: item.label,
                min: range ? featureText(item.feature, range.min) : "—",
                max: range ? featureText(item.feature, range.max) : "—",
              };
            })}
          />
        </div>

        <section aria-label="Ranked flashes" className="mt-5">
          <SectionLabel>Ranked flashes</SectionLabel>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left text-[13px]">
              <thead>
                <tr className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {["Rank", "Flash", "UTC time", "FlashRisk", "Temp", "RH", "VPD", ""].map((label) => (
                    <th key={label || "action"} className="sticky top-0 bg-background px-2 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const interactive = row.rank !== null && row.modelScore !== null;
                  const active = row.globalFlashId === activeId;
                  return (
                    <tr
                      key={row.globalFlashId}
                      id={`report-row-${row.globalFlashId}`}
                      onMouseEnter={interactive ? () => highlight(row.globalFlashId) : undefined}
                      onClick={interactive ? () => onOpenFlash(row.globalFlashId) : undefined}
                      className={cn(
                        interactive ? "cursor-pointer hover:bg-white/[0.04]" : "text-muted-foreground",
                        active && "bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)]",
                      )}
                    >
                      <td className="border-t border-white/8 px-2 py-2 text-[15px] font-medium tabular-nums text-primary">
                        {row.rank ?? "—"}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 font-medium text-foreground/95">
                        {row.flashIdLabel}
                        {row.status === "failed" ? (
                          <span className="mt-0.5 block text-[12px] font-normal text-amber-100/85">
                            Failed{row.error ? ` · ${row.error}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 whitespace-nowrap tabular-nums">
                        {formatUtc(row.utcTime)}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 text-[15px] font-medium tabular-nums text-foreground">
                        {row.modelScore === null ? "—" : formatFlashRiskScore(row.modelScore)}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 tabular-nums">
                        {row.status === "failed" ? "—" : featureText(REPORT_FEATURE_KEYS.temperature, row.features.temperature)}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 tabular-nums">
                        {row.status === "failed" ? "—" : featureText(REPORT_FEATURE_KEYS.relativeHumidity, row.features.relativeHumidity)}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 tabular-nums">
                        {row.status === "failed" ? "—" : featureText(REPORT_FEATURE_KEYS.vpd, row.features.vpd)}
                      </td>
                      <td className="border-t border-white/8 px-2 py-2 text-right">
                        {interactive ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenFlash(row.globalFlashId);
                            }}
                            className="text-[13px] text-primary hover:underline"
                          >
                            View Flash →
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-black/20 px-3 py-2">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-[18px] font-medium tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p> : <p className="mt-0.5 text-[11px]">&nbsp;</p>}
    </div>
  );
}

function Comparison({
  title,
  subtitle,
  emoji,
  rows,
}: {
  title: string;
  subtitle: string;
  emoji?: string;
  rows: { emoji?: string; label: string; min: string; max: string }[];
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-start gap-2">
        {emoji ? (
          <span className="mt-0.5 text-[14px] leading-none" aria-hidden>
            {emoji}
          </span>
        ) : null}
        <div className="min-w-0">
          <SectionLabel>{title}</SectionLabel>
          <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <dl className="mt-2 divide-y divide-white/8 rounded-md border border-white/8">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-1.5">
            <dt className="text-[13px] text-muted-foreground">
              {row.emoji ? (
                <span className="mr-1.5 text-[14px] leading-none" aria-hidden>
                  {row.emoji}
                </span>
              ) : null}
              {row.label}
            </dt>
            <dd className="text-right text-[13px] tabular-nums text-foreground/90">
              {row.min === row.max ? row.min : `${row.min} – ${row.max}`}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
