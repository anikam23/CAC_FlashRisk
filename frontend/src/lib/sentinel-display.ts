/** Presentation helpers for the display-only Sentinel surveillance view. */

const EARTH_RADIUS_KM = 6371.0088;

export const SURVEILLANCE_RADIUS_KM = 10;

export type GeoBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ImagePoint = {
  x: number;
  y: number;
};

export function projectToImage(
  lon: number,
  lat: number,
  bounds: GeoBounds,
  width: number,
  height: number,
): ImagePoint {
  const spanX = bounds.east - bounds.west;
  const spanY = bounds.north - bounds.south;
  if (spanX === 0 || spanY === 0 || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2 };
  }
  return {
    x: ((lon - bounds.west) / spanX) * width,
    y: ((bounds.north - lat) / spanY) * height,
  };
}

export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): { lat: number; lon: number } {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/** Closed ring of longitude/latitude pairs, suitable for a GeoJSON polygon. */
export function circleRingLngLat(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 72,
): [number, number][] {
  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const point = destinationPoint(lat, lon, (360 * index) / steps, radiusKm);
    ring.push([point.lon, point.lat]);
  }
  return ring;
}

export function formatImageryAge(hoursBefore: number): string | null {
  if (!Number.isFinite(hoursBefore) || hoursBefore < 0) return null;
  if (hoursBefore < 36) {
    const hours = Math.max(1, Math.round(hoursBefore));
    return hours === 1 ? "1 hour before the flash" : `${hours} hours before the flash`;
  }
  const days = Math.max(1, Math.round(hoursBefore / 24));
  return days === 1 ? "1 day before the flash" : `${days} days before the flash`;
}

export function formatAcquisitionUtc(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

export function formatClarity(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value.toFixed(3);
}

export function formatSceneCloud(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value.toFixed(1)}%`;
}
