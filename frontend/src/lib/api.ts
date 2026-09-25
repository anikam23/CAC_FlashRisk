import { API_BASE_URL } from "@/lib/config";
import type { SearchRadiusKm, SearchWindowMinutes } from "@/lib/search";

export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
};

export type GlmFlash = {
  global_flash_id: string;
  source_file: string;
  flash_id: number;
  flash_start_time: string;
  flash_end_time: string;
  flash_lat: number;
  flash_lon: number;
  distance_km: number;
  flash_energy: number;
  flash_area: number;
  flash_duration_ms: number;
  max_group_area: number;
  max_group_energy: number;
  group_count: number;
  max_events_per_group: number;
  total_events: number;
};

export type GlmSearchResponse = {
  flashes: GlmFlash[];
  count: number;
  latitude: number;
  longitude: number;
  datetime_utc: string;
  window_minutes: number;
  radius_km: number;
  window_start: string;
  window_end: string;
  granules_listed: number;
  granules_selected: number;
  granules_downloaded: number;
};

export type GlmSearchParams = {
  latitude: number;
  longitude: number;
  datetimeUtc: string;
  windowMinutes: SearchWindowMinutes;
  radiusKm: SearchRadiusKm;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Health check failed with HTTP ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

function detailMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return fallback;
}

export async function searchGlmFlashes(
  params: GlmSearchParams,
  signal?: AbortSignal,
): Promise<GlmSearchResponse> {
  const res = await fetch(`${API_BASE_URL}/api/glm/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    cache: "no-store",
    body: JSON.stringify({
      latitude: params.latitude,
      longitude: params.longitude,
      datetime_utc: params.datetimeUtc,
      window_minutes: params.windowMinutes,
      radius_km: params.radiusKm,
    }),
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    throw new ApiError(
      detailMessage(payload, `Lightning search failed (HTTP ${res.status})`),
      res.status,
    );
  }

  return (await res.json()) as GlmSearchResponse;
}

export type GlmGroup = {
  group_id: number;
  group_lat: number;
  group_lon: number;
  animation_offset_ms: number;
  group_area: number;
  group_energy: number;
  event_count: number;
};

export type GlmEvent = {
  event_id: number;
  parent_group_id: number;
  event_lat: number;
  event_lon: number;
  animation_offset_ms: number;
  event_energy: number;
};

export type GlmFlashReconstruction = {
  global_flash_id: string;
  source_file: string;
  flash_id: number;
  flash_lat: number;
  flash_lon: number;
  flash_first_event_frame_time: string;
  flash_last_event_frame_time: string;
  animation_start_time: string;
  animation_end_ms: number;
  flash_energy: number;
  flash_area: number;
  flash_duration_ms: number;
  max_group_area: number;
  max_group_energy: number;
  group_count: number;
  max_events_per_group: number;
  total_events: number;
  groups: GlmGroup[];
  events: GlmEvent[];
};

export async function fetchFlashReconstruction(
  sourceFile: string,
  flashId: number,
  signal?: AbortSignal,
): Promise<GlmFlashReconstruction> {
  const res = await fetch(`${API_BASE_URL}/api/glm/flash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    cache: "no-store",
    body: JSON.stringify({
      source_file: sourceFile,
      flash_id: flashId,
    }),
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    throw new ApiError(
      detailMessage(payload, `Flash reconstruction failed (HTTP ${res.status})`),
      res.status,
    );
  }

  return (await res.json()) as GlmFlashReconstruction;
}
