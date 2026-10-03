import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORT_SCORE_INTERPRETATION,
  buildIndividualFlashReport,
  individualReportFileName,
} from "./individual-report.ts";

const base = {
  flashId: 17,
  globalFlashId: "glm-17",
  timestampUtc: "2026-09-17T00:30:00Z",
  latitude: 41.6376,
  longitude: -122.177,
  modelScore: 0.423,
  analysisSeconds: 12.4,
  featureNames: ["era5_temperature_2m_c", "flash_energy", "season_sin"],
  featureValues: {
    era5_temperature_2m_c: 28.16,
    flash_energy: 1.2e11,
    season_sin: 0.5,
  },
  generatedAt: new Date("2026-10-01T20:00:00Z"),
};

test("the printable score stays on the 0–100 surveillance-priority scale", () => {
  const report = buildIndividualFlashReport(base);
  assert.equal(report.scoreText, "42.3");
  assert.equal(report.scoreInterpretation, REPORT_SCORE_INTERPRETATION);
  assert.equal(report.scoreInterpretation.toLowerCase().includes("probability"), false);
  assert.equal(report.modelScore, undefined);
});

test("a human-readable location is kept only when the lookup provided one", () => {
  const withPlace = buildIndividualFlashReport({
    ...base,
    locality: "Near Grass Lake · Siskiyou County, California",
  });
  assert.equal(withPlace.locality, "Near Grass Lake · Siskiyou County, California");
  assert.equal(withPlace.coordinates, "41.6376°N, 122.1770°W");

  const withoutPlace = buildIndividualFlashReport({ ...base, locality: null });
  assert.equal(withoutPlace.locality, null);
  assert.equal(withoutPlace.coordinates, withPlace.coordinates);
});

test("environmental and lightning values are formatted, not recalculated", () => {
  const report = buildIndividualFlashReport(base);
  const temperature = report.environment.find((section) => section.id === "atmosphere")?.rows[0];
  assert.equal(temperature?.label, "Air temperature");
  assert.equal(temperature?.text, "28.2");
  assert.equal(temperature?.unit, "°C");
  assert.equal(report.lightning?.rows[0]?.label, "Flash energy");
  assert.match(report.lightning?.rows[0]?.text ?? "", /e\+11/i);
  assert.match(report.seasonality?.note ?? "", /technical model variables/);
});

test("surveillance uses the stored scene and does not invent an image", () => {
  const pending = buildIndividualFlashReport(base);
  assert.equal(pending.surveillance.status, "pending");
  assert.equal(pending.surveillance.imageDataUrl, null);
  assert.equal(pending.surveillance.radiusKm, 10);
  assert.match(pending.surveillance.message ?? "", /not been retrieved/);

  const available = buildIndividualFlashReport({
    ...base,
    surveillance: {
      status: "available",
      radiusKm: 10,
      acquiredUtc: "2026-09-10T18:40:00Z",
      hoursBeforeFlash: 150,
      pointClarity: 0.812,
      sceneCloudPct: 4.2,
      imageDataUrl: "data:image/png;base64,abc",
    },
  });
  assert.equal(available.surveillance.qualityLine, "Clear pre-flash scene");
  assert.equal(available.surveillance.timing, "Pre-flash · 6 days before the flash");
  assert.equal(available.surveillance.clarity, "0.812");
  assert.equal(available.surveillance.sceneCloud, "4.2%");
  assert.equal(available.surveillance.imageDataUrl, "data:image/png;base64,abc");

  const unavailable = buildIndividualFlashReport({
    ...base,
    surveillance: {
      status: "unavailable",
      message: "No qualifying clear pre-flash Sentinel-2 observation was found within the 30-day window.",
      imageDataUrl: "data:image/png;base64,should-not-be-used",
    },
  });
  assert.equal(unavailable.surveillance.imageDataUrl, null);
  assert.match(unavailable.surveillance.message ?? "", /30-day/);
});

test("the download name identifies the flash and day", () => {
  const report = buildIndividualFlashReport(base);
  assert.equal(individualReportFileName(report), "FlashRisk-flash-17-2026-09-17.pdf");
});
