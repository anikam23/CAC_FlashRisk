/** Monotone-chain convex hull for lon/lat pairs (planar approximation for local extents). */
export function convexHullLonLat(points: Array<[number, number]>): Array<[number, number]> {
  const unique: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push([lon, lat]);
  }

  if (unique.length < 3) return [];

  unique.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Array<[number, number]> = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<[number, number]> = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return [];
  // Close the ring for GeoJSON Polygon.
  hull.push([hull[0]![0], hull[0]![1]]);
  return hull;
}
