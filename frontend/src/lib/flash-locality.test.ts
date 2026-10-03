import assert from "node:assert/strict";
import test from "node:test";

import { enterFlashRisk, returnToLanding } from "./app-entry.ts";
import {
  formatFlashLocality,
  loadFlashLocality,
  readFlashLocality,
  resetFlashLocalities,
} from "./flash-locality.ts";

test("a named place and county become a concise location", () => {
  assert.equal(
    formatFlashLocality({
      village: "Coloma",
      county: "El Dorado County",
      state: "California",
    }),
    "Near Coloma · El Dorado County, California",
  );
});

test("a remote named feature is used when no city is present", () => {
  assert.equal(
    formatFlashLocality({
      peak: "Mount Whitney",
      county: "Inyo County",
      state: "California",
      country: "United States",
    }),
    "Near Mount Whitney · Inyo County, California",
  );
});

test("county alone is kept when no named place is available", () => {
  assert.equal(
    formatFlashLocality({ county: "Trinity County", state: "California" }),
    "Trinity County, California",
  );
});

test("missing or non-california lookups do not invent a place", () => {
  assert.equal(formatFlashLocality(null), null);
  assert.equal(formatFlashLocality({}), null);
  assert.equal(
    formatFlashLocality({ city: "Reno", county: "Washoe County", state: "Nevada" }),
    null,
  );
});

test("a completed locality is reused and a transport failure is not cached", async () => {
  resetFlashLocalities();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return "Near Auburn · Placer County, California";
  };
  const first = await loadFlashLocality("flash-1", fetcher);
  const second = await loadFlashLocality("flash-1", fetcher);
  assert.equal(calls, 1);
  assert.equal(first, "Near Auburn · Placer County, California");
  assert.equal(second, first);
  assert.equal(readFlashLocality("flash-1"), first);

  let empties = 0;
  const empty = async () => {
    empties += 1;
    return null;
  };
  assert.equal(await loadFlashLocality("flash-2", empty), null);
  assert.equal(await loadFlashLocality("flash-2", empty), null);
  assert.equal(empties, 1);
  assert.equal(readFlashLocality("flash-2"), null);

  let failures = 0;
  const fail = async () => {
    failures += 1;
    const error = new Error("fetch failed");
    (error as { cause?: { code: string } }).cause = { code: "ECONNRESET" };
    throw error;
  };
  await assert.rejects(() => loadFlashLocality("flash-3", fail));
  await assert.rejects(() => loadFlashLocality("flash-3", fail));
  assert.equal(failures, 2);
  assert.equal(readFlashLocality("flash-3"), undefined);
});

test("Grass Lake formats as the Case 1 surveillance location", () => {
  assert.equal(
    formatFlashLocality({
      hamlet: "Grass Lake",
      county: "Siskiyou County",
      state: "California",
      country: "United States",
    }),
    "Near Grass Lake · Siskiyou County, California",
  );
});

test("entering and leaving the workspace keeps the investigation", () => {
  const investigation = { flashes: 4, analysis: "ready" };
  const entered = enterFlashRisk(investigation);
  assert.equal(entered.view, "workspace");
  assert.equal(entered.investigation, investigation);
  const home = returnToLanding(entered.investigation);
  assert.equal(home.view, "landing");
  assert.equal(home.investigation, investigation);
  assert.equal(home.investigation.flashes, 4);
});
