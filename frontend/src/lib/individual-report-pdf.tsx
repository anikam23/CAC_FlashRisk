"use client";

import {
  Circle,
  Document,
  Image,
  Line,
  Page,
  Path,
  Polygon,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

import type { AnalyzeFlashResponse, GlmFlash, SentinelPreview } from "@/lib/api";
import { readFlashLocality } from "@/lib/flash-locality";
import {
  buildIndividualFlashReport,
  individualReportFileName,
  type IndividualFlashReport,
  type ReportSurveillanceStatus,
  type ReportValueSection,
} from "@/lib/individual-report";
import { readSentinelSession } from "@/lib/sentinel-session";
import { circleRingLngLat, projectToImage } from "@/lib/sentinel-display";

const ink = "#243038";
const muted = "#5e6872";
const line = "#e4e7eb";
const orange = "#c56a1a";
const paper = "#ffffff";
const band = "#f6f3ef";
const CONTENT_WIDTH = 532;
const MAX_FIGURE_HEIGHT = 378;

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 40,
    backgroundColor: paper,
    color: ink,
    fontFamily: "Helvetica",
    fontSize: 9.5,
  },
  kicker: {
    color: orange,
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  subtitle: {
    color: muted,
    fontSize: 9,
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: line,
    borderLeftWidth: 3,
    borderLeftColor: orange,
    backgroundColor: band,
    marginBottom: 8,
  },
  scoreLabel: {
    color: orange,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
  },
  scoreDenom: {
    fontSize: 11,
    color: muted,
  },
  interpretation: {
    marginTop: 4,
    color: muted,
    fontSize: 8,
    lineHeight: 1.35,
    maxWidth: 290,
  },
  track: {
    marginTop: 8,
    height: 4,
    width: 180,
    backgroundColor: "#e6e8eb",
    borderRadius: 2,
  },
  trackFill: {
    height: 4,
    backgroundColor: orange,
    borderRadius: 2,
  },
  trackLabels: {
    width: 180,
    marginTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    color: muted,
    fontSize: 7.5,
  },
  meta: {
    width: 228,
    justifyContent: "center",
  },
  metaLine: {
    marginBottom: 3,
    fontSize: 8.5,
    lineHeight: 1.25,
  },
  metaLabel: {
    color: muted,
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  section: {
    marginTop: 4,
    marginBottom: 8,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  sectionRule: {
    height: 2,
    width: 36,
    backgroundColor: orange,
    marginBottom: 6,
  },
  blurb: {
    color: muted,
    fontSize: 8,
    lineHeight: 1.3,
    marginBottom: 2,
  },
  group: {
    marginBottom: 4,
    paddingBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: line,
  },
  groupHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  note: {
    color: muted,
    fontSize: 8,
    lineHeight: 1.3,
    marginTop: 1,
    marginBottom: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 1,
  },
  cell: {
    width: "50%",
    paddingRight: 16,
    paddingTop: 2,
    paddingBottom: 3,
  },
  cellLabel: {
    color: muted,
    fontSize: 8,
    marginBottom: 1,
  },
  cellValue: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
  },
  hint: {
    color: "#8b939c",
    fontSize: 7.5,
  },
  locality: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  figureWrap: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 8,
  },
  figure: {
    borderWidth: 0.75,
    borderColor: line,
  },
  caption: {
    color: muted,
    fontSize: 8,
    marginBottom: 12,
    textAlign: "center",
  },
  metaGroups: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 2,
  },
  metaGroup: {
    paddingRight: 14,
  },
  metaGroupTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: orange,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  metaItem: {
    marginBottom: 8,
  },
  provenance: {
    marginTop: 12,
    color: "#8b939c",
    fontSize: 7,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 18,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: line,
    flexDirection: "row",
    justifyContent: "space-between",
    color: muted,
    fontSize: 8,
  },
});

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}{"\n"}</Text>
      {value}
    </Text>
  );
}

function SectionMark({ id }: { id: string }) {
  const stroke = orange;
  const sw = 1.6;
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" style={{ marginRight: 6 }}>
      {id === "atmosphere" ? (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={stroke} strokeWidth={sw} fill="none" />
          <Line x1={12} y1={2.5} x2={12} y2={5.5} stroke={stroke} strokeWidth={sw} />
          <Line x1={12} y1={18.5} x2={12} y2={21.5} stroke={stroke} strokeWidth={sw} />
          <Line x1={2.5} y1={12} x2={5.5} y2={12} stroke={stroke} strokeWidth={sw} />
          <Line x1={18.5} y1={12} x2={21.5} y2={12} stroke={stroke} strokeWidth={sw} />
          <Line x1={5.1} y1={5.1} x2={7.2} y2={7.2} stroke={stroke} strokeWidth={sw} />
          <Line x1={16.8} y1={16.8} x2={18.9} y2={18.9} stroke={stroke} strokeWidth={sw} />
          <Line x1={18.9} y1={5.1} x2={16.8} y2={7.2} stroke={stroke} strokeWidth={sw} />
          <Line x1={7.2} y1={16.8} x2={5.1} y2={18.9} stroke={stroke} strokeWidth={sw} />
        </>
      ) : null}
      {id === "precipitation" ? (
        <>
          <Path d="M8 4 C8 4 5 9 5 11.2 C5 13 6.3 14.4 8 14.4 C9.7 14.4 11 13 11 11.2 C11 9 8 4 8 4 Z" stroke={stroke} strokeWidth={sw} fill="none" />
          <Path d="M16 8 C16 8 13.4 12.2 13.4 14 C13.4 15.5 14.5 16.6 16 16.6 C17.5 16.6 18.6 15.5 18.6 14 C18.6 12.2 16 8 16 8 Z" stroke={stroke} strokeWidth={sw} fill="none" />
        </>
      ) : null}
      {id === "soil" ? (
        <>
          <Line x1={3} y1={7} x2={21} y2={7} stroke={stroke} strokeWidth={sw} />
          <Line x1={4} y1={12} x2={20} y2={12} stroke={stroke} strokeWidth={sw} />
          <Line x1={5} y1={17} x2={19} y2={17} stroke={stroke} strokeWidth={sw} />
        </>
      ) : null}
      {id === "vegetation" ? (
        <Path
          d="M12 21 C12 21 5 15 5 9.5 C5 6.5 7.5 4 12 4 C16.5 4 19 6.5 19 9.5 C19 15 12 21 12 21 Z M12 21 L12 10"
          stroke={stroke}
          strokeWidth={sw}
          fill="none"
        />
      ) : null}
      {id === "lightning" ? (
        <Polygon points="13,2 6,13 11,13 9,22 18,10 13,10" stroke={stroke} strokeWidth={sw} fill="none" />
      ) : null}
      {id === "seasonality" ? (
        <>
          <Circle cx={12} cy={12} r={8} stroke={stroke} strokeWidth={sw} fill="none" />
          <Path d="M12 4 A8 8 0 0 1 12 20" stroke={stroke} strokeWidth={sw} fill="none" />
          <Line x1={4} y1={12} x2={20} y2={12} stroke={stroke} strokeWidth={sw} />
        </>
      ) : null}
      {id === "surveillance" ? (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={2} stroke={stroke} strokeWidth={sw} fill="none" />
          <Circle cx={12} cy={12} r={3.2} stroke={stroke} strokeWidth={sw} fill="none" />
          <Polyline points="12,6 12,8" stroke={stroke} strokeWidth={sw} />
          <Polyline points="12,16 12,18" stroke={stroke} strokeWidth={sw} />
          <Polyline points="6,12 8,12" stroke={stroke} strokeWidth={sw} />
          <Polyline points="16,12 18,12" stroke={stroke} strokeWidth={sw} />
        </>
      ) : null}
    </Svg>
  );
}

function ValueGrid({ rows }: { rows: ReportValueSection["rows"] }) {
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.label} style={styles.cell} wrap={false}>
          <Text style={styles.cellLabel}>
            {row.label}
            {row.hint ? <Text style={styles.hint}>  {row.hint}</Text> : null}
          </Text>
          <Text style={styles.cellValue}>
            {row.text}
            {row.unit ? ` ${row.unit}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ValueSection({ section }: { section: ReportValueSection }) {
  return (
    <View style={styles.group} wrap={false}>
      <View style={styles.groupHeading}>
        <SectionMark id={section.id} />
        <Text style={styles.groupTitle}>{section.title}</Text>
      </View>
      <Text style={styles.blurb}>{section.blurb}</Text>
      {section.note ? <Text style={styles.note}>{section.note}</Text> : null}
      <ValueGrid rows={section.rows} />
    </View>
  );
}

function figureSize(width: number | null, height: number | null): { width: number; height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const scale = Math.min(CONTENT_WIDTH / width, MAX_FIGURE_HEIGHT / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function MetaGroup({
  title,
  rows,
  width,
}: {
  title: string;
  rows: { label: string; text: string }[];
  width: number;
}) {
  if (rows.length === 0) return <View style={[styles.metaGroup, { width }]} />;
  return (
    <View style={[styles.metaGroup, { width }]}>
      <Text style={styles.metaGroupTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.metaItem} wrap={false}>
          <Text style={styles.cellLabel}>{row.label}</Text>
          <Text style={styles.cellValue}>{row.text}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPageFooter({ generatedAtUtc }: { generatedAtUtc: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>FlashRisk</Text>
      <Text>Generated {generatedAtUtc}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

/** Findings for one flash, before the surveillance page. */
export function IndividualFlashFindings({
  report,
  sectionLabel,
}: {
  report: IndividualFlashReport;
  sectionLabel?: string;
}) {
  return (
    <View>
      {sectionLabel ? (
        <View style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: line }}>
          <Text style={styles.kicker}>{sectionLabel}</Text>
        </View>
      ) : null}
      <Text style={styles.kicker}>FlashRisk</Text>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.subtitle}>Individual flash surveillance report</Text>

      <View style={styles.scoreRow} wrap={false}>
        <View>
          <Text style={styles.scoreLabel}>FlashRisk score</Text>
          <Text style={styles.scoreValue}>
            {report.scoreText}
            <Text style={styles.scoreDenom}> / 100</Text>
          </Text>
          <Text style={styles.interpretation}>{report.scoreInterpretation}</Text>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${report.scoreMarkerPercent}%` }]} />
          </View>
          <View style={styles.trackLabels}>
            <Text>0</Text>
            <Text>100</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <MetaLine label="Flash" value={String(report.flashId)} />
          <MetaLine label="Flash time (UTC)" value={report.timestampUtc} />
          <MetaLine label="Coordinates" value={report.coordinates} />
          {report.locality ? <MetaLine label="Location" value={report.locality} /> : null}
          <MetaLine label="Analysis runtime" value={report.runtime} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Environmental conditions</Text>
        </View>
        <View style={styles.sectionRule} />
        <Text style={styles.blurb}>Environmental conditions at the time of the flash</Text>
        {report.environment.map((section) => (
          <ValueSection key={section.id} section={section} />
        ))}
      </View>

      {report.lightning ? <ValueSection section={report.lightning} /> : null}
    </View>
  );
}

/** Surveillance page for one flash. Reusable as a later multi-flash section. */
export function IndividualFlashSurveillance({ report }: { report: IndividualFlashReport }) {
  const surveillance = report.surveillance;
  const sized = figureSize(surveillance.imageWidth, surveillance.imageHeight);
  const acquisition = [
    surveillance.acquiredUtc ? { label: "Acquired", text: surveillance.acquiredUtc } : null,
    surveillance.timing ? { label: "Timing", text: surveillance.timing } : null,
  ].filter((row) => row !== null);
  const location = [
    { label: "Coordinates", text: report.coordinates },
    { label: "Surveillance radius", text: `${surveillance.radiusKm} km` },
  ];
  const scene = [
    surveillance.qualityLine ? { label: "Scene", text: surveillance.qualityLine } : null,
    surveillance.clarity ? { label: "Cloud Score+ clarity", text: surveillance.clarity } : null,
    surveillance.sceneCloud ? { label: "Scene cloud", text: surveillance.sceneCloud } : null,
  ].filter((row) => row !== null);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.sectionHeading}>
        <SectionMark id="surveillance" />
        <Text style={styles.sectionTitle}>{surveillance.heading}</Text>
      </View>
      <View style={styles.sectionRule} />
      {report.locality ? <Text style={styles.locality}>{report.locality}</Text> : null}
      <Text style={styles.blurb}>{surveillance.intro}</Text>
      {surveillance.imageDataUrl ? (
        <View style={styles.figureWrap} wrap={false}>
          <Image
            src={surveillance.imageDataUrl}
            style={sized ? [styles.figure, sized] : [styles.figure, { width: CONTENT_WIDTH }]}
          />
        </View>
      ) : null}
      {surveillance.imageDataUrl ? (
        <Text style={styles.caption}>
          Selected flash · 10 km surveillance radius{"\n"}Cloud-obscured / masked area
        </Text>
      ) : null}
      {surveillance.message ? <Text style={styles.note}>{surveillance.message}</Text> : null}
      <View style={styles.metaGroups} wrap={false}>
        <MetaGroup title="Acquisition" rows={acquisition} width={214} />
        <MetaGroup title="Location" rows={location} width={156} />
        <MetaGroup title="Scene quality" rows={scene} width={150} />
      </View>
      <Text style={styles.provenance}>GLM identification{"\n"}{report.globalFlashId}</Text>
    </View>
  );
}

/** One flash’s report body, reusable inside a later multi-flash document. */
export function IndividualFlashReportBody({ report }: { report: IndividualFlashReport }) {
  return (
    <View>
      <IndividualFlashFindings report={report} />
      {report.seasonality ? <ValueSection section={report.seasonality} /> : null}
      <View break>
        <IndividualFlashSurveillance report={report} />
      </View>
    </View>
  );
}

/** The two pages of one individual report, for a standalone file or a multi-flash packet. */
export function IndividualFlashReportPages({
  report,
  sectionLabel,
}: {
  report: IndividualFlashReport;
  sectionLabel?: string;
}) {
  return (
    <>
      <Page size="LETTER" style={styles.page}>
        <IndividualFlashFindings report={report} sectionLabel={sectionLabel} />
        <ReportPageFooter generatedAtUtc={report.generatedAtUtc} />
      </Page>
      <Page size="LETTER" style={styles.page}>
        {report.seasonality ? <ValueSection section={report.seasonality} /> : null}
        <IndividualFlashSurveillance report={report} />
        <ReportPageFooter generatedAtUtc={report.generatedAtUtc} />
      </Page>
    </>
  );
}

export function IndividualFlashReportDocument({ report }: { report: IndividualFlashReport }) {
  return (
    <Document
      title={`FlashRisk surveillance report, flash ${report.flashId}`}
      author="FlashRisk"
      subject={report.title}
    >
      <IndividualFlashReportPages report={report} />
    </Document>
  );
}

async function composeSurveillanceFigure(preview: SentinelPreview): Promise<string | null> {
  if (!preview.image_png_base64) return null;
  const dataUrl = `data:image/png;base64,${preview.image_png_base64}`;
  const width = preview.image_width ?? 0;
  const height = preview.image_height ?? 0;
  const bounds = preview.bounds;
  if (!bounds || width <= 0 || height <= 0 || typeof document === "undefined") return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;

  context.fillStyle = "#d4d0c8";
  context.fillRect(0, 0, width, height);

  try {
    const image = new window.Image();
    image.src = dataUrl;
    await image.decode();
    context.drawImage(image, 0, 0, width, height);
  } catch {
    return dataUrl;
  }

  const ring = circleRingLngLat(
    preview.flash_lat,
    preview.flash_lon,
    preview.surveillance_radius_km,
  ).map(([lon, lat]) => projectToImage(lon, lat, bounds, width, height));
  const flash = projectToImage(preview.flash_lon, preview.flash_lat, bounds, width, height);
  const scale = Math.max(width, height);

  context.beginPath();
  ring.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.fillStyle = "rgba(197, 106, 26, 0.14)";
  context.strokeStyle = "#e39a45";
  context.lineWidth = Math.max(2, scale / 420);
  context.fill();
  context.stroke();

  const arm = scale / 52;
  const gap = scale / 160;
  context.strokeStyle = "#f7f4ef";
  context.lineWidth = Math.max(1.5, scale / 520);
  context.beginPath();
  context.moveTo(flash.x - arm, flash.y);
  context.lineTo(flash.x - gap, flash.y);
  context.moveTo(flash.x + gap, flash.y);
  context.lineTo(flash.x + arm, flash.y);
  context.moveTo(flash.x, flash.y - arm);
  context.lineTo(flash.x, flash.y - gap);
  context.moveTo(flash.x, flash.y + gap);
  context.lineTo(flash.x, flash.y + arm);
  context.stroke();
  context.beginPath();
  context.arc(flash.x, flash.y, scale / 150, 0, Math.PI * 2);
  context.fillStyle = "#f7f4ef";
  context.fill();
  context.beginPath();
  context.arc(flash.x, flash.y, scale / 340, 0, Math.PI * 2);
  context.fillStyle = "#c56a1a";
  context.fill();

  return canvas.toDataURL("image/png");
}

function surveillanceStatus(status: string | undefined): ReportSurveillanceStatus {
  if (status === "available" || status === "unavailable" || status === "error") return status;
  return "pending";
}

/** Build one individual report from the stored analysis and any Surveillance data already in the session. */
export async function assembleIndividualFlashReport(
  result: AnalyzeFlashResponse,
  flash: GlmFlash,
  generatedAt = new Date(),
): Promise<IndividualFlashReport> {
  const session = readSentinelSession<SentinelPreview>(result.global_flash_id);
  const preview = session?.status === "available" || session?.status === "unavailable" ? session.result : null;
  const imageDataUrl =
    session?.status === "available" && preview ? await composeSurveillanceFigure(preview) : null;
  return buildIndividualFlashReport({
    flashId: flash.flash_id,
    globalFlashId: result.global_flash_id,
    timestampUtc: result.flash_timestamp_utc || flash.flash_start_time,
    latitude: result.flash_lat,
    longitude: result.flash_lon,
    modelScore: result.model_score,
    featureNames: result.feature_names,
    featureValues: result.feature_values,
    analysisSeconds: result.analysis_seconds,
    locality: readFlashLocality(result.global_flash_id) ?? null,
    generatedAt,
    surveillance: {
      status: surveillanceStatus(session?.status),
      radiusKm: preview?.surveillance_radius_km,
      acquiredUtc: preview?.acquired_utc,
      hoursBeforeFlash: preview?.hours_before_flash,
      pointClarity: preview?.point_clarity,
      sceneCloudPct: preview?.scene_cloud_pct,
      message:
        session?.status === "error"
          ? (session.error ?? "Pre-flash imagery is not available for this flash right now.")
          : preview?.message,
      imageDataUrl,
      imageWidth: preview?.image_width,
      imageHeight: preview?.image_height,
    },
  });
}

export async function saveIndividualFlashReport(
  result: AnalyzeFlashResponse,
  flash: GlmFlash,
): Promise<void> {
  const report = await assembleIndividualFlashReport(result, flash);
  const blob = await pdf(<IndividualFlashReportDocument report={report} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = individualReportFileName(report);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
