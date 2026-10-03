import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SELECTED_FLASHES,
  analyzeFlashesSequentially,
  selectAllReturnedFlashes,
  toggleFlashSelection,
} from "./multi-flash-selection.ts";

test("toggle adds and removes a flash without affecting the others", () => {
  const first = toggleFlashSelection([], "a");
  assert.deepEqual(first.selectedIds, ["a"]);
  assert.equal(first.atLimit, false);

  const second = toggleFlashSelection(first.selectedIds, "b");
  assert.deepEqual(second.selectedIds, ["a", "b"]);

  const removed = toggleFlashSelection(second.selectedIds, "a");
  assert.deepEqual(removed.selectedIds, ["b"]);
  assert.equal(removed.atLimit, false);
});

test("an 11th flash is rejected and the existing 10 stay selected", () => {
  const ids = Array.from({ length: MAX_SELECTED_FLASHES }, (_, index) => `f${index}`);
  let selected: string[] = [];
  for (const id of ids) {
    const next = toggleFlashSelection(selected, id);
    assert.equal(next.atLimit, false);
    selected = next.selectedIds;
  }
  assert.equal(selected.length, 10);

  const rejected = toggleFlashSelection(selected, "extra");
  assert.equal(rejected.atLimit, true);
  assert.deepEqual(rejected.selectedIds, selected);

  const afterDeselect = toggleFlashSelection(selected, "f0");
  const added = toggleFlashSelection(afterDeselect.selectedIds, "extra");
  assert.equal(added.atLimit, false);
  assert.equal(added.selectedIds.includes("extra"), true);
  assert.equal(added.selectedIds.includes("f0"), false);
  assert.equal(added.selectedIds.length, 10);
});

test("select all is available only when the search returned 10 or fewer flashes", () => {
  assert.deepEqual(selectAllReturnedFlashes(["a", "b", "c"]), ["a", "b", "c"]);
  assert.equal(selectAllReturnedFlashes(Array.from({ length: 11 }, (_, i) => `f${i}`)), null);
  assert.equal(selectAllReturnedFlashes(Array.from({ length: 10 }, (_, i) => `f${i}`))?.length, 10);
});

test("one failed flash keeps earlier and later successful scores", async () => {
  const calls: string[] = [];
  const snapshots: string[][] = [];

  const jobs = await analyzeFlashesSequentially(
    ["a", "b", "c"],
    async (flashId) => {
      calls.push(flashId);
      if (flashId === "b") throw new Error("retrieval failed for b");
      return { modelScore: flashId === "a" ? 0.2 : 0.8 };
    },
    (next) => {
      snapshots.push(next.map((job) => job.status));
    },
    new AbortController().signal,
  );

  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.deepEqual(
    jobs.map((job) => ({ id: job.globalFlashId, status: job.status, score: job.modelScore })),
    [
      { id: "a", status: "completed", score: 0.2 },
      { id: "b", status: "failed", score: null },
      { id: "c", status: "completed", score: 0.8 },
    ],
  );
  assert.equal(jobs[1]?.error, "retrieval failed for b");
  assert.deepEqual(snapshots[0], ["waiting", "waiting", "waiting"]);
  assert.ok(snapshots.some((row) => row[0] === "analyzing" && row[1] === "waiting"));
  assert.ok(snapshots.some((row) => row[0] === "completed" && row[1] === "failed" && row[2] === "completed"));
});

test("abort stops later flashes and keeps scores already completed", async () => {
  const controller = new AbortController();
  const jobs = await analyzeFlashesSequentially(
    ["a", "b"],
    async (flashId) => {
      if (flashId === "a") {
        controller.abort();
        return { modelScore: 0.4 };
      }
      throw new Error("should not analyze b");
    },
    () => {},
    controller.signal,
  );

  assert.equal(jobs[0]?.status, "completed");
  assert.equal(jobs[0]?.modelScore, 0.4);
  assert.equal(jobs[1]?.status, "waiting");
});
