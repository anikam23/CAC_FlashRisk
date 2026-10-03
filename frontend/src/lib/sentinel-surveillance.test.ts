import assert from "node:assert/strict";
import test from "node:test";

import { haversineKm } from "./geo-distance.ts";
import {
  circleRingLngLat,
  formatClarity,
  formatImageryAge,
  formatSceneCloud,
  projectToImage,
} from "./sentinel-display.ts";
import {
  clearSentinelError,
  loadSentinel,
  readSentinelSession,
  resetSentinelSessions,
  settleWithSentinel,
} from "./sentinel-session.ts";

test("imagery age and clarity stay descriptive", () => {
  assert.equal(formatImageryAge(5), "5 hours before the flash");
  assert.equal(formatImageryAge(48), "2 days before the flash");
  assert.equal(formatImageryAge(-1), null);
  assert.equal(formatClarity(0.812), "0.812");
  assert.equal(formatClarity(null), null);
  assert.equal(formatSceneCloud(14.24), "14.2%");
  assert.equal(formatSceneCloud(null), null);
});

test("the flash projects to the center of its image bounds", () => {
  const bounds = { west: -121.6, south: 38.4, east: -121.4, north: 38.6 };
  const point = projectToImage(-121.5, 38.5, bounds, 1000, 800);
  assert.equal(point.x, 500);
  assert.equal(point.y, 400);
});

test("surveillance ring stays near the requested radius", () => {
  const ring = circleRingLngLat(38.5, -121.5, 10, 36);
  assert.equal(ring.length, 37);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  for (const [lon, lat] of ring.slice(0, -1)) {
    const distance = haversineKm(38.5, -121.5, lat, lon);
    assert.ok(Math.abs(distance - 10) < 0.05, `expected about 10 km, got ${distance}`);
  }
});

test("a finished sentinel preview is reused across later requests", async () => {
  resetSentinelSessions();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { status: "available" as const, image: "cached" };
  };
  const first = await loadSentinel("flash-1", fetcher);
  const second = await loadSentinel("flash-1", fetcher);
  assert.equal(calls, 1);
  assert.equal(first.status, "available");
  assert.equal(second.result?.image, "cached");
  assert.equal(readSentinelSession("flash-1")?.status, "available");
});

test("an unavailable preview is kept and an error can be requested again", async () => {
  resetSentinelSessions();
  let unavailableCalls = 0;
  await loadSentinel("flash-2", async () => {
    unavailableCalls += 1;
    return { status: "unavailable" as const };
  });
  await loadSentinel("flash-2", async () => {
    unavailableCalls += 1;
    return { status: "unavailable" as const };
  });
  assert.equal(unavailableCalls, 1);

  let errorCalls = 0;
  const fail = async () => {
    errorCalls += 1;
    throw new Error("Earth Engine unavailable");
  };
  const failed = await loadSentinel("flash-3", fail);
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "Earth Engine unavailable");
  clearSentinelError("flash-3");
  const recovered = await loadSentinel("flash-3", async () => ({ status: "available" as const }));
  assert.equal(errorCalls, 1);
  assert.equal(recovered.status, "available");
});

test("investigation preload is reused when surveillance opens", async () => {
  resetSentinelSessions();
  let calls = 0;
  const fetcher = () =>
    new Promise<{ status: "available" }>((resolve) => {
      calls += 1;
      setTimeout(() => resolve({ status: "available" }), 15);
    });
  const preload = loadSentinel("flash-5", fetcher);
  const opened = loadSentinel("flash-5", fetcher);
  const [first, second] = await Promise.all([preload, opened]);
  assert.equal(calls, 1);
  assert.equal(first.status, "available");
  assert.equal(second.status, "available");
  const again = await loadSentinel("flash-5", fetcher);
  assert.equal(calls, 1);
  assert.equal(again.status, "available");
});

test("analysis completion waits until sentinel is terminal", async () => {
  resetSentinelSessions();
  let stage = "start";
  const analysis = new Promise<{ modelScore: number }>((resolve) => {
    setTimeout(() => {
      stage = "analysis";
      resolve({ modelScore: 0.2 });
    }, 15);
  });
  const sentinel = loadSentinel("flash-9", () =>
    new Promise<{ status: "unavailable" }>((resolve) => {
      setTimeout(() => {
        stage = "sentinel";
        resolve({ status: "unavailable" });
      }, 40);
    }),
  );
  const result = await settleWithSentinel(analysis, sentinel);
  assert.equal(result.modelScore, 0.2);
  assert.equal(stage, "sentinel");
  assert.equal(readSentinelSession("flash-9")?.status, "unavailable");
});

test("a sentinel error still releases the finished model analysis", async () => {
  resetSentinelSessions();
  const result = await settleWithSentinel(
    Promise.resolve({ modelScore: 0.4 }),
    loadSentinel("flash-10", async () => {
      throw new Error("Earth Engine unavailable");
    }),
  );
  assert.equal(result.modelScore, 0.4);
  assert.equal(readSentinelSession("flash-10")?.status, "error");
});

test("a failed model analysis is not treated as complete", async () => {
  resetSentinelSessions();
  await assert.rejects(
    settleWithSentinel(
      Promise.reject(new Error("Analyze failed.")),
      loadSentinel("flash-11", async () => ({ status: "available" as const })),
    ),
    /Analyze failed/,
  );
});
