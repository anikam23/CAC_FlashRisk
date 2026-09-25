import type { PlaceSuggestion } from "@/lib/california-places";

type PlacesResponse = {
  results?: PlaceSuggestion[];
  error?: string;
};

/** Remote California place lookup via the Next.js Nominatim proxy. */
export async function searchRemoteCaliforniaPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const response = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as PlacesResponse;
    return payload.results ?? [];
  } catch {
    if (signal?.aborted) return [];
    return [];
  }
}
