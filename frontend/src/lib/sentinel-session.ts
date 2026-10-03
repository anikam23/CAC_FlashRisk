export type SentinelLoadStatus = "available" | "unavailable";

export type SentinelSessionStatus = "loading" | SentinelLoadStatus | "error";

export type SentinelSession<T extends { status: SentinelLoadStatus } = { status: SentinelLoadStatus }> = {
  key: string;
  status: SentinelSessionStatus;
  result?: T;
  error?: string;
};

const sessions = new Map<string, SentinelSession<{ status: SentinelLoadStatus }>>();
const inflight = new Map<string, Promise<SentinelSession<{ status: SentinelLoadStatus }>>>();

export function sentinelCacheKey(globalFlashId: string): string {
  return globalFlashId;
}

export function readSentinelSession<T extends { status: SentinelLoadStatus }>(
  key: string,
): SentinelSession<T> | undefined {
  return sessions.get(key) as SentinelSession<T> | undefined;
}

export function clearSentinelError(key: string): void {
  const existing = sessions.get(key);
  if (existing?.status === "error") sessions.delete(key);
}

/** Test hook. Session cache is process-local for one application visit. */
export function resetSentinelSessions(): void {
  sessions.clear();
  inflight.clear();
}

function isFinished(
  session: SentinelSession<{ status: SentinelLoadStatus }> | undefined,
): session is SentinelSession<{ status: SentinelLoadStatus }> {
  return session?.status === "available" || session?.status === "unavailable";
}

/**
 * Load Sentinel context once per flash for this session.
 * A finished available or unavailable result is reused. An in-flight request is shared.
 * An error is not cached as success, so a later call may try again.
 */
export function loadSentinel<T extends { status: SentinelLoadStatus }>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<SentinelSession<T>> {
  const existing = sessions.get(key);
  if (isFinished(existing)) return Promise.resolve(existing as SentinelSession<T>);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<SentinelSession<T>>;

  sessions.set(key, { key, status: "loading" });
  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((result) => {
      const session: SentinelSession<T> = {
        key,
        status: result.status,
        result,
      };
      sessions.set(key, session);
      return session;
    })
    .catch((error: unknown) => {
      const session: SentinelSession<T> = {
        key,
        status: "error",
        error: error instanceof Error ? error.message : "Sentinel-2 imagery could not be retrieved.",
      };
      sessions.set(key, session);
      return session;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Hold a finished model result until its Sentinel attempt is terminal.
 * Available, unavailable, and error sessions all settle. A Sentinel failure does not reject the analysis.
 * If the model analysis itself fails, that failure is returned and the analysis is not treated as complete.
 */
export async function settleWithSentinel<T>(analysis: Promise<T>, sentinel: Promise<unknown>): Promise<T> {
  const result = await analysis;
  await sentinel;
  return result;
}
