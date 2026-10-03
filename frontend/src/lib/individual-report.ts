/** Printable individual-flash report model. Presentation only; values are not recomputed. */

import {
  formatAnalysisRuntime,
  formatFeatureDisplayValue,
  formatFlashRiskScore,
  primaryEnvironmentSections,
  scoreMarkerPercent,
  secondaryFeatureSections,
  FEATURE_SECTIONS,
  type FeatureSectionId,
  type SectionFeatureRow,
} from "./analysis-display";
import {
  formatAcquisitionUtc,
  formatClarity,
  formatImageryAge,
  formatSceneCloud,
  SURVEILLANCE_RADIUS_KM,
} from "./sentinel-display";

export const REPORT_SCORE_INTERPRETATION =
  "Model-generated ignition surveillance priority. Higher scores indicate flashes the model identifies for greater ignition surveillance priority.";

export const REPORT_VEGETATION_NOTE =
  "NDVI and NDWI each range from −1 to +1. Higher NDVI generally corresponds to greener vegetation; higher NDWI generally corresponds to a stronger vegetation moisture signal.";

export const REPORT_SEASONALITY_NOTE =
  "These sine and cosine values encode the flash’s time of year as a continuous annual cycle so the model can use seasonality without calendar discontinuities. They are technical model variables, not direct environmental measurements.";

export const REPORT_SURVEILLANCE_INTRO =
  "Pre-flash Sentinel-2 landscape context within the research-supported surveillance vicinity of the selected flash.";

export type ReportValueRow = {
  label: string;
  text: string;
  unit?: string;
  hint?: string;
};

export type ReportValueSection = {
  id: FeatureSectionId;
  title: string;
  blurb: string;
  note?: string;
  rows: ReportValueRow[];
};

export type ReportSurveillanceStatus = "available" | "unavailable" | "error" | "pending";

export type ReportSurveillance = {
  status: ReportSurveillanceStatus;
  radiusKm: number;
  heading: string;
  intro: string;
  acquiredUtc: string | null;
  timing: string | null;
  clarity: string | null;
  sceneCloud: string | null;
  qualityLine: string | null;
  message: string | null;
  imageDataUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type IndividualFlashReport = {
  title: string;
  flashId: number;
  globalFlashId: string;
  generatedAtUtc: string;
  timestampUtc: string;
  coordinates: string;
  locality: string | null;
  scoreText: string;
  scoreMarkerPercent: number;
  scoreInterpretation: string;
  runtime: string;
  environment: ReportValueSection[];
  lightning: ReportValueSection | null;
  seasonality: ReportValueSection | null;
  surveillance: ReportSurveillance;
};

export type ReportSurveillanceInput = {
  status: ReportSurveillanceStatus;
  radiusKm?: number | null;
  acquiredUtc?: string | null;
  hoursBeforeFlash?: number | null;
  pointClarity?: number | null;
  sceneCloudPct?: number | null;
  message?: string | null;
  imageDataUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
};

export type IndividualReportInput = {
  flashId: number;
  globalFlashId: string;
  timestampUtc: string;
  latitude: number;
  longitude: number;
  modelScore: number;
  featureNames: string[];
  featureValues: Record<string, number>;
  analysisSeconds: number;
  locality?: string | null;
  surveillance?: ReportSurveillanceInput | null;
  generatedAt?: Date;
};

function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return iso || "—";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function toRows(rows: SectionFeatureRow[]): ReportValueRow[] {
  return rows.map((row) => ({
    label: row.label,
    text: row.displayText,
    unit: row.unit,
    hint: row.hint,
  }));
}

function sectionById(
  featureNames: string[],
  featureValues: Record<string, number>,
  id: FeatureSectionId,
): ReportValueSection | null {
  const match = secondaryFeatureSections(featureNames, featureValues).find(
    (entry) => entry.section.id === id,
  );
  if (!match) return null;
  const note = id === "seasonality" ? REPORT_SEASONALITY_NOTE : undefined;
  return {
    id,
    title: match.section.title,
    blurb: match.section.blurb,
    note,
    rows: toRows(match.rows),
  };
}

function surveillanceFromInput(input: ReportSurveillanceInput | null | undefined): ReportSurveillance {
  const status = input?.status ?? "pending";
  const radiusKm = input?.radiusKm ?? SURVEILLANCE_RADIUS_KM;
  const acquired =
    input?.acquiredUtc && status === "available" ? formatAcquisitionUtc(input.acquiredUtc) : null;
  const age =
    input?.hoursBeforeFlash === null || input?.hoursBeforeFlash === undefined
      ? null
      : formatImageryAge(input.hoursBeforeFlash);
  const clarity = formatClarity(input?.pointClarity ?? null);
  const sceneCloud = formatSceneCloud(input?.sceneCloudPct ?? null);
  const available = status === "available" && Boolean(input?.imageDataUrl);
  return {
    status,
    radiusKm,
    heading: `${radiusKm} km Surveillance Area`,
    intro: REPORT_SURVEILLANCE_INTRO,
    acquiredUtc: acquired,
    timing: available ? (age ? `Pre-flash · ${age}` : "Pre-flash") : null,
    clarity,
    sceneCloud,
    qualityLine: available ? "Clear pre-flash scene" : null,
    message:
      status === "pending"
        ? "Pre-flash Sentinel-2 imagery has not been retrieved in this session."
        : (input?.message ?? null),
    imageDataUrl: available ? (input?.imageDataUrl ?? null) : null,
    imageWidth: available && input?.imageWidth ? input.imageWidth : null,
    imageHeight: available && input?.imageHeight ? input.imageHeight : null,
  };
}

/** Assemble a printable report from an already completed analysis. */
export function buildIndividualFlashReport(input: IndividualReportInput): IndividualFlashReport {
  const environment = primaryEnvironmentSections(input.featureNames, input.featureValues).map(
    ({ section, rows }) => ({
      id: section.id,
      title: section.title,
      blurb: section.blurb,
      note: section.id === "vegetation" ? REPORT_VEGETATION_NOTE : undefined,
      rows: toRows(rows),
    }),
  );

  return {
    title: "Lightning Ignition Surveillance Report",
    flashId: input.flashId,
    globalFlashId: input.globalFlashId,
    generatedAtUtc: formatUtc((input.generatedAt ?? new Date()).toISOString()),
    timestampUtc: formatUtc(input.timestampUtc),
    coordinates: formatCoord(input.latitude, input.longitude),
    locality: input.locality?.trim() ? input.locality.trim() : null,
    scoreText: formatFlashRiskScore(input.modelScore),
    scoreMarkerPercent: scoreMarkerPercent(input.modelScore),
    scoreInterpretation: REPORT_SCORE_INTERPRETATION,
    runtime: formatAnalysisRuntime(input.analysisSeconds),
    environment,
    lightning: sectionById(input.featureNames, input.featureValues, "lightning"),
    seasonality: sectionById(input.featureNames, input.featureValues, "seasonality"),
    surveillance: surveillanceFromInput(input.surveillance),
  };
}

export function individualReportFileName(report: IndividualFlashReport): string {
  const day = report.timestampUtc.slice(0, 10);
  return `FlashRisk-flash-${report.flashId}-${day || "report"}.pdf`;
}

/** Section order used by the printable layout. Exposed so a later multi-flash PDF can reuse it. */
export const INDIVIDUAL_REPORT_SECTION_ORDER = FEATURE_SECTIONS.map((section) => section.id);

export function reportFeatureText(name: string, value: number): string {
  const formatted = formatFeatureDisplayValue(name, value);
  return formatted.unit ? `${formatted.text} ${formatted.unit}` : formatted.text;
}
