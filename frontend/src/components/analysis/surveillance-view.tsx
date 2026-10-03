"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Image from "next/image";

import { SurveillanceContextMap } from "@/components/analysis/surveillance-context-map";
import { Button } from "@/components/ui/button";
import type { SentinelPreview } from "@/lib/api";
import { fetchSentinelPreview } from "@/lib/api";
import {
  circleRingLngLat,
  formatAcquisitionUtc,
  formatClarity,
  formatImageryAge,
  formatSceneCloud,
  projectToImage,
} from "@/lib/sentinel-display";
import { loadFlashLocality, readFlashLocality } from "@/lib/flash-locality";
import {
  clearSentinelError,
  loadSentinel,
  readSentinelSession,
  sentinelCacheKey,
  type SentinelSession,
} from "@/lib/sentinel-session";

type SurveillanceViewProps = {
  globalFlashId: string;
  latitude: number;
  longitude: number;
  flashTimestampUtc: string;
};

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

export function SurveillanceView({
  globalFlashId,
  latitude,
  longitude,
  flashTimestampUtc,
}: SurveillanceViewProps) {
  const cacheKey = sentinelCacheKey(globalFlashId);
  const [session, setSession] = useState<SentinelSession<SentinelPreview> | null>(
    () => readSentinelSession<SentinelPreview>(cacheKey) ?? null,
  );
  const [attempt, setAttempt] = useState(0);
  const [locality, setLocality] = useState<string | null | undefined>(() =>
    readFlashLocality(cacheKey),
  );

  useEffect(() => {
    let alive = true;
    void loadFlashLocality(cacheKey, async () => {
      const url = `/api/locality?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("locality lookup unavailable");
      const body = (await response.json()) as { label?: unknown };
      return typeof body.label === "string" ? body.label : null;
    }).then(
      (label) => {
        if (alive) setLocality(label);
      },
      () => {
        // A transport failure is not a completed empty lookup.
      },
    );
    return () => {
      alive = false;
    };
  }, [cacheKey, latitude, longitude]);

  useEffect(() => {
    let alive = true;
    void loadSentinel(cacheKey, () =>
      fetchSentinelPreview({
        flashLat: latitude,
        flashLon: longitude,
        flashTimestampUtc,
      }),
    ).then((next) => {
      if (alive) setSession(next as SentinelSession<SentinelPreview>);
    });
    return () => {
      alive = false;
    };
  }, [attempt, cacheKey, latitude, longitude, flashTimestampUtc]);

  const status = session?.status ?? "loading";

  return (
    <section aria-label="Sentinel-2 surveillance" className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-medium text-foreground">10 km Surveillance Area</h3>
        <p className="mt-1 text-[13.5px] font-medium text-foreground/92">
          {locality ?? formatCoord(latitude, longitude)}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
          Pre-flash Sentinel-2 landscape context within the research-supported surveillance vicinity
          of the selected flash.
        </p>
      </div>

      {status === "loading" ? (
        <LoadingFrame />
      ) : status === "available" && session?.result ? (
        <AvailableScene result={session.result} latitude={latitude} longitude={longitude} />
      ) : status === "error" ? (
        <Notice
          title="Sentinel-2 imagery could not be retrieved"
          body={session?.error ?? "Pre-flash imagery is not available for this flash right now."}
          latitude={latitude}
          longitude={longitude}
          radiusKm={10}
          actionLabel="Try again"
          onAction={() => {
            clearSentinelError(cacheKey);
            setSession(null);
            setAttempt((value) => value + 1);
          }}
        />
      ) : (
        <Notice
          title="No clear pre-flash observation"
          body={
            session?.result?.message ??
            "No qualifying clear pre-flash Sentinel-2 observation was found within the 30-day window."
          }
          latitude={latitude}
          longitude={longitude}
          radiusKm={session?.result?.surveillance_radius_km ?? 10}
        />
      )}
    </section>
  );
}

function LoadingFrame() {
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-white/10 bg-black/25 px-4 text-center"
      role="status"
    >
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
      <div>
        <p className="text-[13px] font-medium text-foreground/90">
          Retrieving pre-flash Sentinel-2 imagery
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Looking for a clear pre-flash view of the 10 km surveillance area.
        </p>
      </div>
    </div>
  );
}

function Notice({
  title,
  body,
  latitude,
  longitude,
  radiusKm,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-white/8 bg-black/20 px-3 py-2.5">
        <p className="text-[13px] font-medium text-foreground/90">{title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{body}</p>
        {onAction && actionLabel ? (
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <SurveillanceContextMap latitude={latitude} longitude={longitude} radiusKm={radiusKm} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <Meta label="Surveillance radius" value={`${radiusKm} km`} />
        <Meta label="Flash coordinates" value={formatCoord(latitude, longitude)} />
      </dl>
    </div>
  );
}

function AvailableScene({
  result,
  latitude,
  longitude,
}: {
  result: SentinelPreview;
  latitude: number;
  longitude: number;
}) {
  const radiusKm = result.surveillance_radius_km;
  const acquired = result.acquired_utc ? formatAcquisitionUtc(result.acquired_utc) : "—";
  const age =
    result.hours_before_flash === null ? null : formatImageryAge(result.hours_before_flash);
  const clarity = formatClarity(result.point_clarity);
  const cloud = formatSceneCloud(result.scene_cloud_pct);
  const provenance = [
    clarity ? `Cloud Score+ clarity ${clarity}` : null,
    cloud ? `scene cloud ${cloud}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const width = result.image_width ?? 0;
  const height = result.image_height ?? 0;
  const bounds = result.bounds;
  const flash =
    bounds && width > 0 && height > 0
      ? projectToImage(longitude, latitude, bounds, width, height)
      : null;
  const ring =
    bounds && width > 0 && height > 0
      ? circleRingLngLat(latitude, longitude, radiusKm).map(([lon, lat]) =>
          projectToImage(lon, lat, bounds, width, height),
        )
      : [];
  const ringPoints = ring.map((point) => `${point.x},${point.y}`).join(" ");
  const scale = Math.max(width, height);
  const dot = scale / 150;
  const halo = scale / 78;
  const gap = scale / 160;
  const arm = scale / 52;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-md border border-white/10 bg-[#d4d0c8]">
        {result.image_png_base64 ? (
          <Image
            src={`data:image/png;base64,${result.image_png_base64}`}
            alt={`Pre-flash Sentinel-2 true color around the selected flash, acquired ${acquired}`}
            width={width > 0 ? width : 1}
            height={height > 0 ? height : 1}
            unoptimized
            className="block h-auto w-full"
            style={{ width: "100%", height: "auto" }}
          />
        ) : null}
        {flash && ring.length > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <polygon
              points={ringPoints}
              fill="oklch(0.72 0.17 50 / 0.12)"
              stroke="oklch(0.9 0.08 75)"
              strokeWidth={scale / 420}
            />
            <circle cx={flash.x} cy={flash.y} r={halo} fill="none" stroke="oklch(0.96 0.02 80)" strokeWidth={scale / 500} opacity="0.9">
              <animate attributeName="r" values={`${halo * 0.85};${halo * 1.45}`} dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <line x1={flash.x - arm} y1={flash.y} x2={flash.x - gap} y2={flash.y} stroke="oklch(0.98 0.01 90)" strokeWidth={scale / 520} />
            <line x1={flash.x + gap} y1={flash.y} x2={flash.x + arm} y2={flash.y} stroke="oklch(0.98 0.01 90)" strokeWidth={scale / 520} />
            <line x1={flash.x} y1={flash.y - arm} x2={flash.x} y2={flash.y - gap} stroke="oklch(0.98 0.01 90)" strokeWidth={scale / 520} />
            <line x1={flash.x} y1={flash.y + gap} x2={flash.x} y2={flash.y + arm} stroke="oklch(0.98 0.01 90)" strokeWidth={scale / 520} />
            <circle cx={flash.x} cy={flash.y} r={dot} fill="oklch(0.98 0.01 95)" />
            <circle cx={flash.x} cy={flash.y} r={dot * 0.45} fill="oklch(0.72 0.17 50)" />
          </svg>
        ) : null}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-black/65 px-2.5 py-1.5 text-[11.5px] text-foreground/90">
          <span>Selected flash</span>
          <span>10 km surveillance radius</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-[2px] border border-white/25 bg-[#d4d0c8]" aria-hidden />
            Cloud-obscured / masked area
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
        <Meta label="Acquisition" value={acquired} />
        <Meta label="Timing" value={age ? `Pre-flash · ${age}` : "Pre-flash"} />
        <Meta label="Surveillance radius" value={`${radiusKm} km`} />
        <Meta label="Flash coordinates" value={formatCoord(latitude, longitude)} />
      </dl>
      <div>
        <p className="text-[12.5px] text-foreground/80">Clear pre-flash scene</p>
        {provenance ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/65">{provenance}</p>
        ) : null}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground/90">{value}</dd>
    </div>
  );
}
