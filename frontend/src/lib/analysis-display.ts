/** Display helpers for temporary Analyze results (no risk labels). */

export function formatModelScore(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return score.toFixed(6);
}

export function formatFeatureValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    return value.toExponential(4);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });
}

/** Ordered (name, value) rows from the Analyze response. */
export function analysisFeatureRows(
  featureNames: string[],
  featureValues: Record<string, number>,
): { name: string; value: number }[] {
  return featureNames.map((name) => ({
    name,
    value: featureValues[name],
  }));
}
