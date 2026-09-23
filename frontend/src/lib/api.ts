import { API_BASE_URL } from "@/lib/config";

export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
};

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
