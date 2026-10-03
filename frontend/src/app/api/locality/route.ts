import { NextResponse } from "next/server";

import { formatFlashLocality, type LocalityAddress } from "@/lib/flash-locality";

export const runtime = "nodejs";

type ReverseResult = {
  address?: LocalityAddress;
};

const TRANSIENT_TRANSPORT = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function transportCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  return transportCode(record.cause);
}

function isTransientTransportError(error: unknown): boolean {
  const code = transportCode(error);
  return code !== undefined && TRANSIENT_TRANSPORT.has(code);
}

async function readReverse(url: URL): Promise<ReverseResult> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FlashRisk/0.1 (Congressional App Challenge; local demo)",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  return (await response.json()) as ReverseResult;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ label: null });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));

  try {
    let payload: ReverseResult;
    try {
      payload = await readReverse(url);
    } catch (error) {
      if (!isTransientTransportError(error)) throw error;
      payload = await readReverse(url);
    }
    return NextResponse.json({ label: formatFlashLocality(payload.address) });
  } catch {
    return NextResponse.json({ label: null }, { status: 503 });
  }
}
