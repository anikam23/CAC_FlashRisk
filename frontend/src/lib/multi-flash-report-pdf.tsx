"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import type { AnalyzeFlashResponse, GlmFlash } from "@/lib/api";
import { formatFeatureDisplayValue, formatFlashRiskScore } from "@/lib/analysis-display";
import {
  IndividualFlashReportPages,
  assembleIndividualFlashReport,
} from "@/lib/individual-report-pdf";
import {
  flashRiskBarPercent,
  multiFlashReportFileName,
  numericRange,
  packetIndividualFlashIds,
  reportScoreSummary,
  reportTimeSpan,
  REPORT_FEATURE_KEYS,
  type RankedReportRow,
  type ReportFeatureKey,
} from "@/lib/multi-flash-report";

const ink = "#243038";
const muted = "#5e6872";
const line = "#e4e7eb";
const orange = "#c56a1a";

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 36,
    backgroundColor: "#ffffff",
    color: ink,
    fontFamily: "Helvetica",
    fontSize: 9,
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
    marginBottom: 2,
  },
  subtitle: {
    color: muted,
    fontSize: 9,
    marginBottom: 3,
  },
  provenance: {
    color: muted,
    fontSize: 8,
    marginBottom: 12,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: line,
    borderLeftWidth: 3,
    borderLeftColor: orange,
    backgroundColor: "#f6f3ef",
    padding: 8,
  },
  metricLabel: {
    color: orange,
    fontSize: 7.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
  },
  metricHint: {
    color: muted,
    fontSize: 7.5,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  rule: {
    height: 2,
    width: 36,
    backgroundColor: orange,
    marginBottom: 4,
  },
  blurb: {
    color: muted,
    fontSize: 8,
    marginBottom: 6,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  rankNum: {
    width: 22,
    color: orange,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  rankName: {
    width: 88,
    fontSize: 8.5,
  },
  track: {
    width: 250,
    height: 5,
    backgroundColor: "#e6e8eb",
    borderRadius: 2,
  },
  trackFill: {
    height: 5,
    backgroundColor: orange,
    borderRadius: 2,
  },
  rankScore: {
    width: 42,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: line,
    paddingBottom: 3,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f2",
    paddingVertical: 4,
  },
  headText: {
    color: muted,
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cell: {
    fontSize: 8,
  },
  failedNote: {
    color: muted,
    fontSize: 7.5,
    marginTop: 1,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f2",
    paddingVertical: 3,
  },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
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

const ENV_ROWS: { key: ReportFeatureKey; label: string; feature: string }[] = [
  { key: "temperature", label: "Temperature", feature: REPORT_FEATURE_KEYS.temperature },
  { key: "relativeHumidity", label: "Relative humidity", feature: REPORT_FEATURE_KEYS.relativeHumidity },
  { key: "vpd", label: "VPD", feature: REPORT_FEATURE_KEYS.vpd },
  { key: "precipitation24h", label: "Precipitation, 24 h", feature: REPORT_FEATURE_KEYS.precipitation24h },
  { key: "surfaceSoilMoisture", label: "Surface soil moisture", feature: REPORT_FEATURE_KEYS.surfaceSoilMoisture },
  { key: "vegetationNdvi", label: "NDVI", feature: REPORT_FEATURE_KEYS.vegetationNdvi },
  { key: "vegetationNdwi", label: "NDWI", feature: REPORT_FEATURE_KEYS.vegetationNdwi },
];

const LIGHTNING_ROWS: { key: keyof RankedReportRow["lightning"]; label: string; feature: string | null }[] = [
  { key: "durationMs", label: "Duration", feature: "flash_duration_ms" },
  { key: "energy", label: "Energy", feature: "flash_energy" },
  { key: "area", label: "Area", feature: "flash_area" },
  { key: "groupCount", label: "Groups", feature: "group_count" },
  { key: "totalEvents", label: "Events", feature: null },
];

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

function formatGenerated(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatCoord(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function featureText(name: string | null, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (!name) return String(Math.round(value));
  const formatted = formatFeatureDisplayValue(name, value);
  return formatted.unit ? `${formatted.text} ${formatted.unit}` : formatted.text;
}

function spanLabel(times: readonly string[]): string | null {
  const span = reportTimeSpan(times);
  if (!span) return null;
  const sameDay = formatDay(span.startMs) === formatDay(span.endMs);
  return sameDay
    ? `${formatDay(span.startMs)} · ${formatClock(span.startMs)}–${formatClock(span.endMs)} UTC`
    : `${formatDay(span.startMs)} ${formatClock(span.startMs)} – ${formatDay(span.endMs)} ${formatClock(span.endMs)} UTC`;
}

function rangeText(
  values: readonly (number | null)[],
  feature: string | null,
): string {
  const range = numericRange(values);
  if (!range) return "—";
  const min = featureText(feature, range.min);
  const max = featureText(feature, range.max);
  return min === max ? min : `${min} – ${max}`;
}

function PacketFooter({ generatedAtUtc }: { generatedAtUtc: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>FlashRisk</Text>
      <Text>Generated {generatedAtUtc}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function GroupReport({
  provenance,
  rows,
}: {
  provenance: string;
  rows: readonly RankedReportRow[];
}) {
  const successful = rows.filter((row) => row.rank !== null && row.modelScore !== null);
  const failed = rows.filter((row) => row.rank === null);
  const summary = reportScoreSummary(rows);
  const when = spanLabel(rows.map((row) => row.utcTime));
  return (
    <View>
      <Text style={styles.kicker}>FlashRisk</Text>
      <Text style={styles.title}>Multi-Flash Surveillance Report</Text>
      <Text style={styles.subtitle}>
        {rows.length} selected{when ? ` · ${when}` : ""}
      </Text>
      {provenance ? <Text style={styles.provenance}>Lightning search · {provenance}</Text> : null}

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Highest FlashRisk</Text>
          <Text style={styles.metricValue}>
            {summary.highest === null ? "—" : formatFlashRiskScore(summary.highest)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Lowest FlashRisk</Text>
          <Text style={styles.metricValue}>
            {summary.lowest === null ? "—" : formatFlashRiskScore(summary.lowest)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Score Spread</Text>
          <Text style={styles.metricValue}>
            {summary.difference === null ? "—" : formatFlashRiskScore(summary.difference)}
          </Text>
          <Text style={styles.metricHint}>Highest − lowest</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Surveillance priority</Text>
      <View style={styles.rule} />
      <Text style={styles.blurb}>Ranked by FlashRisk score · 0–100</Text>
      {successful.map((row) => (
        <View key={row.globalFlashId} style={styles.rankRow} wrap={false}>
          <Text style={styles.rankNum}>{row.rank}</Text>
          <Text style={styles.rankName}>{row.flashIdLabel}</Text>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${flashRiskBarPercent(row.modelScore as number)}%` }]} />
          </View>
          <Text style={styles.rankScore}>{formatFlashRiskScore(row.modelScore as number)}</Text>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Ranked flashes</Text>
      <View style={styles.rule} />
      {failed.length > 0 ? (
        <Text style={styles.blurb}>
          Failed analyses stay in this list without a rank or score. They are not given an individual report.
        </Text>
      ) : null}
      <View style={styles.tableHead}>
        {["Rank", "Flash", "UTC time", "Location", "FlashRisk", "Temp", "RH", "VPD"].map((label) => (
          <Text key={label} style={[styles.headText, columnStyle(label)]}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((row) => {
        const failedRow = row.rank === null || row.status === "failed";
        return (
          <View key={row.globalFlashId} style={styles.tableRow} wrap={false}>
            <Text style={[styles.cell, columnStyle("Rank")]}>{row.rank ?? "—"}</Text>
            <View style={columnStyle("Flash")}>
              <Text style={styles.cell}>{row.flashIdLabel}</Text>
              {failedRow ? (
                <Text style={styles.failedNote}>Failed{row.error ? ` · ${row.error}` : ""}</Text>
              ) : null}
            </View>
            <Text style={[styles.cell, columnStyle("UTC time")]}>{formatUtc(row.utcTime)}</Text>
            <Text style={[styles.cell, columnStyle("Location")]}>{formatCoord(row.latitude, row.longitude)}</Text>
            <Text style={[styles.cell, columnStyle("FlashRisk")]}>
              {row.modelScore === null ? "—" : formatFlashRiskScore(row.modelScore)}
            </Text>
            <Text style={[styles.cell, columnStyle("Temp")]}>
              {failedRow ? "—" : featureText(REPORT_FEATURE_KEYS.temperature, row.features.temperature)}
            </Text>
            <Text style={[styles.cell, columnStyle("RH")]}>
              {failedRow ? "—" : featureText(REPORT_FEATURE_KEYS.relativeHumidity, row.features.relativeHumidity)}
            </Text>
            <Text style={[styles.cell, columnStyle("VPD")]}>
              {failedRow ? "—" : featureText(REPORT_FEATURE_KEYS.vpd, row.features.vpd)}
            </Text>
          </View>
        );
      })}

      <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={styles.sectionTitle}>Environmental ranges</Text>
          <View style={styles.rule} />
          <Text style={styles.blurb}>Range across the successfully analyzed flashes.</Text>
          {ENV_ROWS.map((item) => (
            <View key={item.key} style={styles.rangeRow} wrap={false}>
              <Text style={styles.cell}>{item.label}</Text>
              <Text style={styles.cell}>
                {rangeText(successful.map((row) => row.features[item.key]), item.feature)}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={styles.sectionTitle}>Lightning ranges</Text>
          <View style={styles.rule} />
          <Text style={styles.blurb}>Range across the successfully analyzed flashes.</Text>
          {LIGHTNING_ROWS.map((item) => (
            <View key={item.key} style={styles.rangeRow} wrap={false}>
              <Text style={styles.cell}>{item.label}</Text>
              <Text style={styles.cell}>
                {rangeText(successful.map((row) => row.lightning[item.key]), item.feature)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function columnStyle(label: string) {
  const widths: Record<string, number> = {
    Rank: 32,
    Flash: 78,
    "UTC time": 108,
    Location: 108,
    FlashRisk: 52,
    Temp: 48,
    RH: 42,
    VPD: 48,
  };
  return { width: widths[label] ?? 40 };
}

export function MultiFlashPacketDocument({
  provenance,
  rows,
  individuals,
  generatedAtUtc,
}: {
  provenance: string;
  rows: readonly RankedReportRow[];
  individuals: { report: Awaited<ReturnType<typeof assembleIndividualFlashReport>>; rank: number }[];
  generatedAtUtc: string;
}) {
  return (
    <Document title="FlashRisk multi-flash surveillance report" author="FlashRisk" subject="Multi-Flash Surveillance Report">
      <Page size="LETTER" style={styles.page}>
        <GroupReport provenance={provenance} rows={rows} />
        <PacketFooter generatedAtUtc={generatedAtUtc} />
      </Page>
      {individuals.map((item) => (
        <IndividualFlashReportPages
          key={item.report.globalFlashId}
          report={item.report}
          sectionLabel={`Individual flash report · Rank ${item.rank}`}
        />
      ))}
    </Document>
  );
}

export async function saveMultiFlashReport(input: {
  provenance: string;
  rows: readonly RankedReportRow[];
  flashes: readonly GlmFlash[];
  results: Readonly<Record<string, AnalyzeFlashResponse>>;
}): Promise<void> {
  const generatedAt = new Date();
  const ids = packetIndividualFlashIds(input.rows, Object.keys(input.results));
  const individuals: { report: Awaited<ReturnType<typeof assembleIndividualFlashReport>>; rank: number }[] = [];
  for (const id of ids) {
    const result = input.results[id];
    const flash = input.flashes.find((item) => item.global_flash_id === id);
    const row = input.rows.find((item) => item.globalFlashId === id);
    if (!result || !flash || row?.rank == null) continue;
    individuals.push({
      report: await assembleIndividualFlashReport(result, flash, generatedAt),
      rank: row.rank,
    });
  }
  const generatedAtUtc = individuals[0]?.report.generatedAtUtc ?? formatGenerated(generatedAt);
  const blob = await pdf(
    <MultiFlashPacketDocument
      provenance={input.provenance}
      rows={input.rows}
      individuals={individuals}
      generatedAtUtc={generatedAtUtc}
    />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = multiFlashReportFileName(generatedAt);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
