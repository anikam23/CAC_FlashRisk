import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisForReportDrillDown,
  buildReportSources,
  createReportNav,
  flashRiskBarPercent,
  multiFlashReportFileName,
  numericRange,
  openReportFlash,
  packetIndividualFlashIds,
  rankMultiFlashReport,
  reportReadyOnMap,
  reportScoreSummary,
  reportTimeSpan,
  returnReportToMap,
  returnToReport,
  showReport,
  type ReportSourceRow,
} from "./multi-flash-report.ts";

function source(partial: Partial<ReportSourceRow> & Pick<ReportSourceRow, "globalFlashId" | "modelScore" | "status">): ReportSourceRow {
  return {
    flashIdLabel: partial.globalFlashId,
    utcTime: partial.utcTime ?? "2025-06-15T18:00:00Z",
    error: partial.error ?? null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    features: partial.features ?? {
      temperature: 30,
      relativeHumidity: 20,
      vpd: 2,
      precipitation24h: 0,
      surfaceSoilMoisture: 0.1,
      vegetationNdvi: 0.4,
      vegetationNdwi: 0.1,
    },
    lightning: partial.lightning ?? {
      durationMs: 12,
      energy: 1,
      area: 100,
      groupCount: 2,
      totalEvents: 8,
    },
    ...partial,
  };
}

test("rank 1 is the highest score and scores are not changed", () => {
  const input = [
    source({ globalFlashId: "low", modelScore: 0.2, status: "completed" }),
    source({ globalFlashId: "high", modelScore: 0.91, status: "completed" }),
    source({ globalFlashId: "mid", modelScore: 0.5, status: "completed" }),
  ];
  const ranked = rankMultiFlashReport(input);

  assert.deepEqual(
    ranked.map((row) => ({ id: row.globalFlashId, rank: row.rank, score: row.modelScore })),
    [
      { id: "high", rank: 1, score: 0.91 },
      { id: "mid", rank: 2, score: 0.5 },
      { id: "low", rank: 3, score: 0.2 },
    ],
  );
  assert.equal(input[0]?.modelScore, 0.2);
  assert.equal(input[1]?.modelScore, 0.91);
});

test("equal scores keep incoming order and stay unique ranks", () => {
  const ranked = rankMultiFlashReport([
    source({ globalFlashId: "first", modelScore: 0.4, status: "completed" }),
    source({ globalFlashId: "second", modelScore: 0.4, status: "completed" }),
  ]);
  assert.equal(ranked[0]?.globalFlashId, "first");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.globalFlashId, "second");
  assert.equal(ranked[1]?.rank, 2);
  assert.equal(ranked[0]?.modelScore, 0.4);
  assert.equal(ranked[1]?.modelScore, 0.4);
});

test("a failed flash stays in the report without a score or rank", () => {
  const ranked = rankMultiFlashReport([
    source({ globalFlashId: "ok", modelScore: 0.33, status: "completed" }),
    source({
      globalFlashId: "bad",
      modelScore: 0.99,
      status: "failed",
      error: "ERA5 unavailable",
    }),
  ]);

  assert.equal(ranked[0]?.globalFlashId, "ok");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.modelScore, 0.33);
  assert.equal(ranked[1]?.globalFlashId, "bad");
  assert.equal(ranked[1]?.rank, null);
  assert.equal(ranked[1]?.modelScore, null);
  assert.equal(ranked[1]?.error, "ERA5 unavailable");
});

test("a finished report stays on the map until the user opens it", () => {
  const stored = { ok: { modelScore: 0.4, flashTimestampUtc: "2025-06-15T18:00:00Z", featureValues: {} } };
  let nav = reportReadyOnMap();
  assert.equal(nav.view, "map");
  assert.equal(nav.openFlashId, null);
  nav = showReport(nav);
  assert.equal(nav.view, "report");
  nav = returnReportToMap(nav);
  assert.equal(nav.view, "map");
  assert.equal(stored.ok.modelScore, 0.4);
});

test("score summary uses successful analyses only and does not change scores", () => {
  const ranked = rankMultiFlashReport([
    source({ globalFlashId: "low", modelScore: 0.25, status: "completed" }),
    source({ globalFlashId: "high", modelScore: 0.8, status: "completed" }),
    source({ globalFlashId: "bad", modelScore: 0.99, status: "failed", error: "failed" }),
  ]);
  const summary = reportScoreSummary(ranked);
  assert.equal(summary.analyzed, 2);
  assert.equal(summary.highest, 0.8);
  assert.equal(summary.lowest, 0.25);
  assert.equal(summary.difference, 0.55);
  assert.equal(flashRiskBarPercent(0.25), 25);
  assert.notEqual(flashRiskBarPercent(0.25), 100);
  assert.equal(ranked.find((row) => row.globalFlashId === "bad")?.rank, null);
});

test("time span and environmental range ignore missing values", () => {
  const span = reportTimeSpan(["2025-06-15T18:11:00Z", "2025-06-15T18:02:00Z"]);
  assert.equal(span?.startMs, Date.parse("2025-06-15T18:02:00Z"));
  assert.equal(span?.endMs, Date.parse("2025-06-15T18:11:00Z"));
  assert.deepEqual(numericRange([12, null, 4, undefined]), { min: 4, max: 12 });
  assert.equal(numericRange([null, undefined]), null);
});

test("sources keep mapped flashes and do not invent failed conditions", () => {
  const sources = buildReportSources(
    [
      { globalFlashId: "ok", status: "completed", modelScore: 0.4, error: null },
      { globalFlashId: "bad", status: "failed", modelScore: null, error: "timeout" },
    ],
    [
      {
        global_flash_id: "ok",
        flash_id: 3,
        flash_start_time: "2025-06-15T18:00:00Z",
        flash_lat: 37.1,
        flash_lon: -119.2,
        flash_duration_ms: 20,
        flash_energy: 1.5,
        flash_area: 400,
        group_count: 4,
        total_events: 12,
      },
      {
        global_flash_id: "bad",
        flash_id: 9,
        flash_start_time: "2025-06-15T18:04:00Z",
        flash_lat: 37.2,
        flash_lon: -119.3,
      },
    ],
    {
      ok: {
        modelScore: 0.4,
        flashTimestampUtc: "2025-06-15T18:00:00Z",
        featureValues: { era5_temperature_2m_c: 31.2, modis_ndwi: -0.05 },
      },
    },
  );

  assert.equal(sources[0]?.latitude, 37.1);
  assert.equal(sources[0]?.longitude, -119.2);
  assert.equal(sources[0]?.lightning.totalEvents, 12);
  assert.equal(sources[0]?.lightning.durationMs, 20);
  assert.equal(sources[0]?.features.temperature, 31.2);
  assert.equal(sources[0]?.features.vegetationNdwi, -0.05);
  assert.equal(sources[1]?.status, "failed");
  assert.equal(sources[1]?.modelScore, null);
  assert.equal(sources[1]?.features.temperature, null);
  assert.equal(sources[1]?.features.vegetationNdvi, null);
  assert.equal(sources[1]?.features.vegetationNdwi, null);

  const ranked = rankMultiFlashReport(sources);
  assert.equal(ranked[0]?.globalFlashId, "ok");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.rank, null);
  assert.equal(ranked[1]?.modelScore, null);
});

test("drill-down and return keep the stored analyses", () => {
  const stored = {
    ok: { modelScore: 0.42, flashTimestampUtc: "2025-06-15T18:00:00Z", featureValues: {} },
  };
  const jobs = [
    { globalFlashId: "ok", status: "completed", modelScore: 0.42, error: null },
    { globalFlashId: "bad", status: "failed", modelScore: null, error: "failed" },
  ];
  const flashes = [
    { global_flash_id: "ok", flash_id: 7, flash_start_time: "2025-06-15T18:00:00Z" },
    { global_flash_id: "bad", flash_id: 8, flash_start_time: "2025-06-15T18:05:00Z" },
  ];
  const sources = buildReportSources(jobs, flashes, stored);
  const ranked = rankMultiFlashReport(sources);
  const snapshot = structuredClone(stored);

  let nav = createReportNav();
  const opened = analysisForReportDrillDown(stored.ok, "completed", stored.ok.modelScore);
  assert.equal(opened, stored.ok);
  nav = openReportFlash(nav, "ok", opened !== null);
  assert.equal(nav.view, "flash");
  assert.equal(nav.openFlashId, "ok");

  const blocked = analysisForReportDrillDown(undefined, "failed", null);
  assert.equal(blocked, null);
  nav = openReportFlash(nav, "bad", blocked !== null);
  assert.equal(nav.openFlashId, "ok");

  nav = returnToReport(nav);
  assert.deepEqual(nav, { view: "report", openFlashId: null });
  nav = returnReportToMap(nav);
  assert.equal(nav.view, "map");
  nav = showReport(nav);
  assert.equal(nav.view, "report");

  assert.deepEqual(stored, snapshot);
  assert.equal(ranked.find((row) => row.globalFlashId === "ok")?.modelScore, 0.42);
  assert.equal(ranked.find((row) => row.globalFlashId === "bad")?.rank, null);
});

test("the packet appends stored successes in rank order and skips failures", () => {
  const ranked = rankMultiFlashReport([
    source({ globalFlashId: "low", status: "completed", modelScore: 0.2 }),
    source({ globalFlashId: "bad", status: "failed", modelScore: null, error: "missing" }),
    source({ globalFlashId: "high", status: "completed", modelScore: 0.8 }),
    source({ globalFlashId: "orphan", status: "completed", modelScore: 0.5 }),
  ]);
  assert.deepEqual(packetIndividualFlashIds(ranked, ["low", "high", "bad"]), ["high", "low"]);
  assert.equal(multiFlashReportFileName(new Date("2026-10-02T18:00:00Z")), "FlashRisk-multi-2026-10-02.pdf");
});

test("single-flash drill-down reuses the stored result and does not invent a score", () => {
  const single = { modelScore: 0.15, featureValues: { era5_temperature_2m_c: 28.2 } };
  const reused = analysisForReportDrillDown(single, "completed", single.modelScore);
  assert.equal(reused, single);
  assert.equal(reused?.modelScore, 0.15);
  assert.equal(analysisForReportDrillDown(single, "failed", single.modelScore), null);
});
