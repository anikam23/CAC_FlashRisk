export type LonLat = { lng: number; lat: number };

export type SearchWindowMinutes = 15 | 30 | 60;
export type SearchRadiusKm = 5 | 10 | 25;

export const SEARCH_WINDOW_OPTIONS = [
  { minutes: 15 as const, label: "15 min" },
  { minutes: 30 as const, label: "30 min" },
  { minutes: 60 as const, label: "1 hr" },
];

export const SEARCH_RADIUS_OPTIONS = [
  { km: 5 as const, label: "5 km" },
  { km: 10 as const, label: "10 km" },
  { km: 25 as const, label: "25 km" },
];

export type LocationSource = "map" | "place" | "coordinates";

/** User-selected search point inside California. */
export type SelectedSearchLocation = LonLat & {
  label: string;
  source: LocationSource;
};

/** Frontend setup for a GLM lightning search. */
export type LightningSearchSetup = {
  location: SelectedSearchLocation | null;
  date: string;
  time: string;
  windowMinutes: SearchWindowMinutes;
  radiusKm: SearchRadiusKm;
};

export type LightningSearchRequest = {
  longitude: number;
  latitude: number;
  label: string;
  date: string;
  time: string;
  windowMinutes: SearchWindowMinutes;
  radiusKm: SearchRadiusKm;
};

/** Inclusive UTC calendar-day bounds for selectable GLM search dates. */
export function glmSearchDateBounds(now = new Date()): { min: string; max: string } {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const max = new Date(todayUtc - 4 * dayMs);
  const min = new Date(todayUtc - 365 * dayMs);
  return {
    min: toIsoDateUtc(min),
    max: toIsoDateUtc(max),
  };
}

function toIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDateWithinGlmBounds(date: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { min, max } = glmSearchDateBounds(now);
  return date >= min && date <= max;
}

export function createEmptySearchSetup(): LightningSearchSetup {
  return {
    location: null,
    date: "",
    time: "",
    windowMinutes: 30,
    radiusKm: 25,
  };
}

export function isSearchSetupReady(setup: LightningSearchSetup): boolean {
  return Boolean(
    setup.location &&
      setup.date &&
      setup.time &&
      isDateWithinGlmBounds(setup.date),
  );
}

export function describeSearchWindow(minutes: SearchWindowMinutes): string {
  if (minutes === 60) return "1 hr";
  return `${minutes} min`;
}

export function describeSearchRadius(km: SearchRadiusKm): string {
  return `${km} km`;
}

export function buildLightningSearchRequest(
  setup: LightningSearchSetup,
): LightningSearchRequest | null {
  if (!isSearchSetupReady(setup) || !setup.location) return null;
  return {
    longitude: setup.location.lng,
    latitude: setup.location.lat,
    label: setup.location.label,
    date: setup.date,
    time: setup.time,
    windowMinutes: setup.windowMinutes,
    radiusKm: setup.radiusKm,
  };
}

/** Combine UI date + time fields into an ISO-8601 UTC instant. */
export function toUtcIsoDatetime(date: string, time: string): string {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalizedTime}Z`;
}
