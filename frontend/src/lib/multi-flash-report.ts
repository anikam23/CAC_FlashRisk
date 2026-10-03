/** Presentation-only ranking and navigation for a finished multi-flash report. */

export const REPORT_FEATURE_KEYS = {
  temperature: "era5_temperature_2m_c",
  relativeHumidity: "era5_relative_humidity_pct",
  vpd: "era5_vpd_kpa",
  precipitation24h: "era5_precip_24h_mm",
  surfaceSoilMoisture: "smap_surface_soil_moisture",
  vegetationNdvi: "modis_ndvi",
  vegetationNdwi: "modis_ndwi",
} as const;

export type ReportFeatureKey = keyof typeof REPORT_FEATURE_KEYS;

export type ReportSourceStatus = "completed" | "failed";

/** One selected flash plus the analysis payload already returned for it. */
export type ReportSourceRow = {
  globalFlashId: string;
  flashIdLabel: string;
  utcTime: string;
  status: ReportSourceStatus;
  /** Raw model score from the existing analysis response. Null when analysis failed. */
  modelScore: number | null;
  error: string | null;
  latitude: number | null;
  longitude: number | null;
  features: Record<ReportFeatureKey, number | null>;
  lightning: {
    durationMs: number | null;
    energy: number | null;
    area: number | null;
    groupCount: number | null;
    totalEvents: number | null;
  };
};

export type RankedReportRow = ReportSourceRow & {
  /** 1 is the highest FlashRisk score in this report. Failed flashes are unranked. */
  rank: number | null;
};

export type ReportNav = {
  view: "report" | "flash" | "map";
  openFlashId: string | null;
};

type JobLike = {
  globalFlashId: string;
  status: string;
  modelScore: number | null;
  error: string | null;
};

type FlashLike = {
  global_flash_id: string;
  flash_id: number;
  flash_start_time: string;
  flash_lat?: number;
  flash_lon?: number;
  flash_energy?: number;
  flash_area?: number;
  flash_duration_ms?: number;
  group_count?: number;
  total_events?: number;
};

type StoredAnalysis = {
  modelScore: number;
  flashTimestampUtc: string;
  featureValues: Record<string, number>;
};

function emptyFeatures(): Record<ReportFeatureKey, number | null> {
  return {
    temperature: null,
    relativeHumidity: null,
    vpd: null,
    precipitation24h: null,
    surfaceSoilMoisture: null,
    vegetationNdvi: null,
    vegetationNdwi: null,
  };
}

function readFeature(values: Record<string, number> | undefined, name: string): number | null {
  const value = values?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isMultiFlashRunFinished(jobs: readonly { status: string }[] | null | undefined): boolean {
  return !!jobs && jobs.length > 0 && jobs.every((job) => job.status === "completed" || job.status === "failed");
}

export function buildReportSources(
  jobs: readonly JobLike[],
  flashes: readonly FlashLike[],
  analyses: Readonly<Record<string, StoredAnalysis>>,
): ReportSourceRow[] {
  const sources: ReportSourceRow[] = [];
  for (const job of jobs) {
    if (job.status !== "completed" && job.status !== "failed") continue;
    const flash = flashes.find((item) => item.global_flash_id === job.globalFlashId);
    const stored = analyses[job.globalFlashId];
    const completed = job.status === "completed" && stored && Number.isFinite(stored.modelScore);
    const features = emptyFeatures();
    if (completed) {
      for (const key of Object.keys(REPORT_FEATURE_KEYS) as ReportFeatureKey[]) {
        features[key] = readFeature(stored.featureValues, REPORT_FEATURE_KEYS[key]);
      }
    }
    sources.push({
      globalFlashId: job.globalFlashId,
      flashIdLabel: flash ? `Flash ${flash.flash_id}` : job.globalFlashId,
      utcTime: completed
        ? stored.flashTimestampUtc || flash?.flash_start_time || ""
        : flash?.flash_start_time || "",
      status: completed ? "completed" : "failed",
      modelScore: completed ? stored.modelScore : null,
      error: completed ? null : job.error,
      latitude: finiteOrNull(flash?.flash_lat),
      longitude: finiteOrNull(flash?.flash_lon),
      features,
      lightning: {
        durationMs: finiteOrNull(flash?.flash_duration_ms),
        energy: finiteOrNull(flash?.flash_energy),
        area: finiteOrNull(flash?.flash_area),
        groupCount: finiteOrNull(flash?.group_count),
        totalEvents: finiteOrNull(flash?.total_events),
      },
    });
  }
  return sources;
}

/**
 * Rank successful analyses by raw model score, highest first.
 * Equal scores keep their incoming order. Scores are not modified.
 * Failed analyses stay in the report without a rank or a score.
 */
export function rankMultiFlashReport(sources: readonly ReportSourceRow[]): RankedReportRow[] {
  const ranked: { row: ReportSourceRow; order: number }[] = [];
  const failed: RankedReportRow[] = [];

  sources.forEach((source, index) => {
    if (source.status === "completed" && source.modelScore !== null && Number.isFinite(source.modelScore)) {
      ranked.push({ row: source, order: index });
    } else {
      failed.push({
        ...source,
        status: "failed",
        modelScore: null,
        rank: null,
      });
    }
  });

  ranked.sort((a, b) => {
    const scoreDiff = (b.row.modelScore as number) - (a.row.modelScore as number);
    if (scoreDiff !== 0) return scoreDiff;
    return a.order - b.order;
  });

  return [
    ...ranked.map((entry, index) => ({
      ...entry.row,
      rank: index + 1,
    })),
    ...failed,
  ];
}

export function createReportNav(): ReportNav {
  return { view: "report", openFlashId: null };
}

/** A finished run stays on the map. The report is opened only when the user asks. */
export function reportReadyOnMap(): ReportNav {
  return { view: "map", openFlashId: null };
}

/** Width of a FlashRisk bar on the real 0–100 scale. Does not stretch the set maximum to 100. */
export function flashRiskBarPercent(modelScore: number): number {
  if (!Number.isFinite(modelScore)) return 0;
  return Math.min(100, Math.max(0, modelScore * 100));
}

export function reportScoreSummary(rows: readonly Pick<RankedReportRow, "rank" | "modelScore">[]): {
  analyzed: number;
  highest: number | null;
  lowest: number | null;
  difference: number | null;
} {
  const scores = rows
    .filter((row) => row.rank !== null && row.modelScore !== null && Number.isFinite(row.modelScore))
    .map((row) => row.modelScore as number);
  if (scores.length === 0) {
    return { analyzed: 0, highest: null, lowest: null, difference: null };
  }
  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);
  return { analyzed: scores.length, highest, lowest, difference: highest - lowest };
}

export function reportTimeSpan(times: readonly string[]): { startMs: number; endMs: number } | null {
  const parsed = times.map((value) => Date.parse(value)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const startMs = parsed[0];
  const endMs = parsed[parsed.length - 1];
  if (startMs === undefined || endMs === undefined) return null;
  return { startMs, endMs };
}

export function numericRange(values: readonly (number | null | undefined)[]): { min: number; max: number } | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length === 0) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

export function openReportFlash(nav: ReportNav, flashId: string, canOpen: boolean): ReportNav {
  if (!canOpen) return nav;
  return { view: "flash", openFlashId: flashId };
}

export function returnToReport(nav: ReportNav): ReportNav {
  return { ...nav, view: "report", openFlashId: null };
}

export function returnReportToMap(nav: ReportNav): ReportNav {
  return { ...nav, view: "map", openFlashId: null };
}

export function showReport(nav: ReportNav): ReportNav {
  return { ...nav, view: "report", openFlashId: null };
}

/**
 * Successful flashes in ranked order for the appended individual reports.
 * Failed analyses stay out of this list so a packet does not invent a report for them.
 * A ranked row is included only when its stored analysis id is actually present.
 */
export function packetIndividualFlashIds(
  rows: readonly RankedReportRow[],
  storedIds: readonly string[],
): string[] {
  const available = new Set(storedIds);
  return rows
    .filter(
      (row) =>
        row.rank !== null &&
        row.status === "completed" &&
        row.modelScore !== null &&
        Number.isFinite(row.modelScore) &&
        available.has(row.globalFlashId),
    )
    .map((row) => row.globalFlashId);
}

export function multiFlashReportFileName(generatedAt: Date): string {
  return `FlashRisk-multi-${generatedAt.toISOString().slice(0, 10)}.pdf`;
}

/** Reuse the stored analysis object. Failed flashes do not open an investigation. */
export function analysisForReportDrillDown<T>(
  stored: T | undefined,
  status: ReportSourceStatus,
  modelScore: number | null,
): T | null {
  if (status !== "completed" || !stored || modelScore === null || !Number.isFinite(modelScore)) return null;
  return stored;
}
