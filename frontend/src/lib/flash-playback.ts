/** Visual playback slowdown for GLM flash reconstructions.

Real flash spans are often ~0.5 s — too brief to follow. A constant 20× factor
keeps relative timing/order exact while stretching a ~513 ms flash to ~10 s,
which is comfortable to watch without feeling sluggish.
*/
export const GLM_PLAYBACK_SLOWDOWN = 20;

export function visualDurationMs(animationEndMs: number): number {
  return Math.max(animationEndMs, 0) * GLM_PLAYBACK_SLOWDOWN;
}

/** Map wall-clock visual elapsed time back onto the real GLM animation axis. */
export function glmTimeFromVisual(visualElapsedMs: number): number {
  return visualElapsedMs / GLM_PLAYBACK_SLOWDOWN;
}
