/** Earth mean radius (km) for haversine distances. */
const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance between two WGS84 points in kilometers. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const a = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Observed span: maximum great-circle distance between any two actual GLM
 * event coordinates. Returns null when fewer than two distinct locations exist.
 */
export function observedEventSpanKm(
  events: ReadonlyArray<{ event_lat: number; event_lon: number }>,
): number | null {
  const points: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const event of events) {
    const { event_lat: lat, event_lon: lon } = event;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([lon, lat]);
  }

  if (points.length < 2) return null;

  let maxKm = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j]!;
      const d = haversineKm(a[1], a[0], b[1], b[0]);
      if (d > maxKm) maxKm = d;
    }
  }
  return maxKm;
}

export function formatObservedSpanKm(spanKm: number | null): string | null {
  if (spanKm == null || !Number.isFinite(spanKm)) return null;
  if (spanKm < 0.05) return "Observed span · <0.1 km";
  if (spanKm < 10) return `Observed span · ${spanKm.toFixed(1)} km`;
  return `Observed span · ${spanKm.toFixed(1)} km`;
}
