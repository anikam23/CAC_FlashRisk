/** Human-readable flash location from a reverse-geocode address. Presentation only. */

export type LocalityAddress = {
  city?: string | null;
  town?: string | null;
  village?: string | null;
  hamlet?: string | null;
  municipality?: string | null;
  locality?: string | null;
  suburb?: string | null;
  neighbourhood?: string | null;
  city_district?: string | null;
  natural?: string | null;
  peak?: string | null;
  water?: string | null;
  county?: string | null;
  state?: string | null;
  country?: string | null;
};

const PLACE_FIELDS = [
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "locality",
  "suburb",
  "neighbourhood",
  "city_district",
  "natural",
  "peak",
  "water",
] as const satisfies readonly (keyof LocalityAddress)[];

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function isCalifornia(address: LocalityAddress): boolean {
  const country = clean(address.country)?.toLowerCase();
  if (country && country !== "us" && !country.includes("united states")) return false;
  const state = clean(address.state)?.toLowerCase();
  if (!state) return true;
  return state.includes("california");
}

function namedPlace(address: LocalityAddress): string | null {
  for (const field of PLACE_FIELDS) {
    const value = clean(address[field]);
    if (value) return value;
  }
  return null;
}

/**
 * Firefighter-facing place line. Returns null when the lookup has no useful name.
 * Does not invent a city.
 */
export function formatFlashLocality(address: LocalityAddress | null | undefined): string | null {
  if (!address || !isCalifornia(address)) return null;
  const place = namedPlace(address);
  const county = clean(address.county);
  if (place && county && place.toLowerCase() !== county.toLowerCase()) {
    return `Near ${place} · ${county}, California`;
  }
  if (place) return `Near ${place}, California`;
  if (county) return `${county}, California`;
  return null;
}

const settled = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function readFlashLocality(key: string): string | null | undefined {
  return settled.has(key) ? settled.get(key) : undefined;
}

export function resetFlashLocalities(): void {
  settled.clear();
  inflight.clear();
}

/** Resolve a place line once per flash for this session. A thrown lookup is not stored. */
export function loadFlashLocality(
  key: string,
  fetcher: () => Promise<string | null>,
): Promise<string | null> {
  if (settled.has(key)) return Promise.resolve(settled.get(key) ?? null);
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((label) => {
      const value = label?.trim() ? label.trim() : null;
      settled.set(key, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
