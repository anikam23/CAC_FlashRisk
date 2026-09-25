import boundary from "./california-boundary";

/** Display outline for the state. It frames the map; it is not a study-area mask. */
export const CALIFORNIA_BOUNDARY = boundary;

/** State extent with comfortable margin so tips are not flush to the canvas edge. */
export const CALIFORNIA_BOUNDS: [[number, number], [number, number]] = [
  [-124.55, 32.28],
  [-114.0, 42.22],
];

/** Default spatial radius of the lightning search area (meters). */
export const DEFAULT_LIGHTNING_SEARCH_RADIUS_METERS = 25_000;

/** @deprecated Prefer passing an explicit radius from the search setup. */
export const LIGHTNING_SEARCH_RADIUS_METERS = DEFAULT_LIGHTNING_SEARCH_RADIUS_METERS;

export type LonLat = { lng: number; lat: number };

type FramingPadding = { top: number; right: number; bottom: number; left: number };

/**
 * Keeps the state in the open map on desktop, clear of the floating panels.
 * Below the desktop breakpoint the analysis card sits along the bottom instead.
 */
export function californiaFramingPadding(width: number, height: number): FramingPadding {
  const desktop = width >= 1280 && height >= 640;
  const preferred: FramingPadding = desktop
    ? { top: 36, right: 392, bottom: 64, left: 348 }
    : { top: 28, right: 16, bottom: 112, left: 16 };
  const maxX = Math.max(12, Math.floor((Math.max(width, 1) - 96) / 2));
  const maxY = Math.max(12, Math.floor((Math.max(height, 1) - 96) / 2));
  return {
    top: Math.min(preferred.top, maxY),
    right: Math.min(preferred.right, maxX),
    bottom: Math.min(preferred.bottom, maxY),
    left: Math.min(preferred.left, maxX),
  };
}

export function formatCoordinates({ lng, lat }: LonLat): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`;
}

/** Parse common coordinate strings such as `34.05, -118.25` or `34.05°N, 118.25°W`. */
export function parseCoordinateInput(value: string): LonLat | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const labeled =
    /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])\s*,?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])\s*$/.exec(
      trimmed,
    );
  if (labeled) {
    let lat = Number(labeled[1]);
    let lng = Number(labeled[3]);
    if (labeled[2]!.toUpperCase() === "S") lat = -Math.abs(lat);
    else lat = Math.abs(lat);
    if (labeled[4]!.toUpperCase() === "W") lng = -Math.abs(lng);
    else lng = Math.abs(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lng, lat };
  }

  const plain = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(trimmed);
  if (plain) {
    const lat = Number(plain[1]);
    const lng = Number(plain[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lng, lat };
  }

  return null;
}

type Ring = number[][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length || !pointInRing(lng, lat, rings[0]!)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i]!)) return false;
  }
  return true;
}

/** True when the point lies inside California, including coastal islands in the outline. */
export function isInsideCalifornia(lng: number, lat: number): boolean {
  const { geometry } = CALIFORNIA_BOUNDARY;
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  return false;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
  }
  return sum / 2;
}

function ensureWinding(ring: Ring, clockwise: boolean): Ring {
  const area = ringArea(ring);
  const isClockwise = area < 0;
  if (isClockwise === clockwise) return ring.map((position) => [...position]);
  return ring.map((position) => [...position]).reverse();
}

/**
 * Regional polygon with California cut out, used to subtly dim out-of-state geography.
 * Neighbors remain visible underneath the translucent mask.
 */
export function createOutsideCaliforniaMask(): GeoJSON.Feature<GeoJSON.Polygon> {
  // Bounded to the western U.S. view rather than a global ring — MapLibre handles
  // this hole cutout more reliably than a near-world polygon.
  const frame: Ring = [
    [-130.5, 28.5],
    [-130.5, 45.5],
    [-108.5, 45.5],
    [-108.5, 28.5],
    [-130.5, 28.5],
  ];

  const holes: Ring[] = [];
  if (CALIFORNIA_BOUNDARY.geometry.type === "MultiPolygon") {
    for (const polygon of CALIFORNIA_BOUNDARY.geometry.coordinates) {
      const outer = polygon[0];
      if (!outer || outer.length < 4) continue;
      holes.push(ensureWinding(outer, true));
    }
  }

  return {
    type: "Feature",
    properties: { kind: "outside-california-mask" },
    geometry: {
      type: "Polygon",
      coordinates: [ensureWinding(frame, false), ...holes],
    },
  };
}

function destinationPoint(lng: number, lat: number, bearingDeg: number, distanceM: number): [number, number] {
  const radius = 6_371_008.8;
  const δ = distanceM / radius;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * sinφ2);
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
}

/** Approximate geodesic circle used as the lightning search-area outline. */
export function createSearchAreaPolygon(
  center: LonLat,
  radiusMeters = DEFAULT_LIGHTNING_SEARCH_RADIUS_METERS,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    ring.push(destinationPoint(center.lng, center.lat, (i / steps) * 360, radiusMeters));
  }
  return {
    type: "Feature",
    properties: {
      kind: "lightning-search-area",
      radiusMeters,
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

/** Label point on the southern search-radius boundary (not the selected flash). */
export function createSearchRadiusLabelPoint(
  center: LonLat,
  radiusKm: number,
): GeoJSON.Feature<GeoJSON.Point> {
  const [lon, lat] = destinationPoint(center.lng, center.lat, 180, radiusKm * 1000);
  return {
    type: "Feature",
    properties: {
      kind: "lightning-search-radius-label",
      label: `${radiusKm} km search radius`,
      radiusKm,
    },
    geometry: {
      type: "Point",
      coordinates: [lon, lat],
    },
  };
}
