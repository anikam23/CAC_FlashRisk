/** Max flashes a user may include in one multi-flash analysis. */
export const MAX_SELECTED_FLASHES = 10;

export type MultiFlashStatus = "waiting" | "analyzing" | "completed" | "failed";

/** Per-flash status for one multi-analysis run. Earlier results are never dropped. */
export type MultiFlashJob = {
  globalFlashId: string;
  status: MultiFlashStatus;
  modelScore: number | null;
  error: string | null;
};

export function toggleFlashSelection(
  selectedIds: readonly string[],
  flashId: string,
  max = MAX_SELECTED_FLASHES,
): { selectedIds: string[]; atLimit: boolean } {
  if (selectedIds.includes(flashId)) {
    return {
      selectedIds: selectedIds.filter((id) => id !== flashId),
      atLimit: false,
    };
  }
  if (selectedIds.length >= max) {
    return { selectedIds: [...selectedIds], atLimit: true };
  }
  return { selectedIds: [...selectedIds, flashId], atLimit: false };
}

/**
 * Select every returned flash when the result set is within the limit.
 * Returns null when there are more flashes than the limit so the caller
 * does not choose a subset automatically.
 */
export function selectAllReturnedFlashes(
  flashIds: readonly string[],
  max = MAX_SELECTED_FLASHES,
): string[] | null {
  if (flashIds.length > max) return null;
  return [...flashIds];
}

export function createWaitingJobs(flashIds: readonly string[]): MultiFlashJob[] {
  return flashIds.map((globalFlashId) => ({
    globalFlashId,
    status: "waiting",
    modelScore: null,
    error: null,
  }));
}

export function replaceJob(jobs: readonly MultiFlashJob[], next: MultiFlashJob): MultiFlashJob[] {
  return jobs.map((job) => (job.globalFlashId === next.globalFlashId ? next : job));
}

/**
 * Run the existing single-flash analyze function once per selected id.
 * Status updates are real transitions only. One failure does not clear earlier successes.
 * An aborted signal stops before the next flash and leaves completed jobs intact.
 */
export async function analyzeFlashesSequentially(
  flashIds: readonly string[],
  analyze: (flashId: string, signal: AbortSignal) => Promise<{ modelScore: number }>,
  onJobs: (jobs: MultiFlashJob[]) => void,
  signal: AbortSignal,
): Promise<MultiFlashJob[]> {
  let jobs = createWaitingJobs(flashIds);
  onJobs(jobs);

  for (const flashId of flashIds) {
    if (signal.aborted) break;

    jobs = replaceJob(jobs, {
      globalFlashId: flashId,
      status: "analyzing",
      modelScore: null,
      error: null,
    });
    onJobs(jobs);

    try {
      const result = await analyze(flashId, signal);
      jobs = replaceJob(jobs, {
        globalFlashId: flashId,
        status: "completed",
        modelScore: result.modelScore,
        error: null,
      });
      onJobs(jobs);
      if (signal.aborted) break;
    } catch (error: unknown) {
      if (signal.aborted) break;
      const message = error instanceof Error && error.message ? error.message : "Analyze failed.";
      jobs = replaceJob(jobs, {
        globalFlashId: flashId,
        status: "failed",
        modelScore: null,
        error: message,
      });
      onJobs(jobs);
    }
  }

  return jobs;
}
