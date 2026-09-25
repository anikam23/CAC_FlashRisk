import { NextResponse } from "next/server";

import { isInsideCalifornia } from "@/lib/california";
import type { PlaceSuggestion } from "@/lib/california-places";

export const runtime = "nodejs";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    "ISO3166-2-lvl4"?: string;
  };
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
    type?: string;
    street?: string;
  };
};

function isCaliforniaNominatim(result: NominatimResult): boolean {
  const address = result.address;
  if (!address) return false;
  if (address["ISO3166-2-lvl4"] === "US-CA") return true;
  return (address.state ?? "").toLowerCase().includes("california");
}

function nominatimLabel(result: NominatimResult): { label: string; detail: string } {
  const address = result.address ?? {};
  const primary =
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.suburb ??
    address.neighbourhood ??
    address.road ??
    result.display_name.split(",")[0]?.trim() ??
    "California location";
  const detail = [address.county, "California"].filter(Boolean).join(" · ");
  return { label: primary, detail };
}

async function searchNominatim(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", `${query}, California`);
  url.searchParams.set("viewbox", "-124.48,42.08,-114.06,32.46");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FlashRisk/0.1 (Congressional App Challenge; local demo)",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);

  const payload = (await response.json()) as NominatimResult[];
  const results: PlaceSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of payload) {
    if (!isCaliforniaNominatim(item)) continue;
    const lng = Number(item.lon);
    const lat = Number(item.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (!isInsideCalifornia(lng, lat)) continue;
    const { label, detail } = nominatimLabel(item);
    const key = `${label.toLowerCase()}|${lng.toFixed(3)}|${lat.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: `nominatim:${item.place_id}`, label, detail, lng, lat });
    if (results.length >= 6) break;
  }
  return results;
}

async function searchPhoton(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("lat", "37.25");
  url.searchParams.set("lon", "-119.45");
  url.searchParams.set("limit", "8");
  url.searchParams.set("bbox", "-124.48,32.46,-114.06,42.08");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);

  const payload = (await response.json()) as { features?: PhotonFeature[] };
  const results: PlaceSuggestion[] = [];
  const seen = new Set<string>();

  for (const feature of payload.features ?? []) {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    if (!coords) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if ((props.state ?? "").toLowerCase() !== "california" && props.countrycode !== "US") {
      // Photon bbox helps, but still enforce California geometry.
    }
    if (!isInsideCalifornia(lng, lat)) continue;
    if (props.state && !props.state.toLowerCase().includes("california")) continue;

    const label = props.name ?? props.city ?? props.street ?? "California location";
    const detail = [props.type ?? props.city, "California"].filter(Boolean).join(" · ");
    const key = `${label.toLowerCase()}|${lng.toFixed(3)}|${lat.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: `photon:${props.osm_id ?? key}`,
      label,
      detail,
      lng,
      lat,
    });
    if (results.length >= 6) break;
  }
  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ results: [] as PlaceSuggestion[] });
  }

  try {
    const results = await searchNominatim(query);
    return NextResponse.json({ results, provider: "nominatim" });
  } catch {
    try {
      const results = await searchPhoton(query);
      return NextResponse.json({ results, provider: "photon" });
    } catch {
      return NextResponse.json({ results: [], error: "Place lookup unavailable" }, { status: 502 });
    }
  }
}
