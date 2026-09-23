"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BASEMAP_STYLE_URL, CALIFORNIA_VIEW } from "@/lib/config";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export function CaliforniaMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: CALIFORNIA_VIEW.center,
      zoom: CALIFORNIA_VIEW.zoom,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    map.once("load", () => {
      map.fitBounds(CALIFORNIA_VIEW.bounds, { padding: 48, duration: 0 });
    });
    map.on("error", (e) => {
      if (!map.isStyleLoaded()) {
        setError(e.error?.message ?? "Basemap failed to load");
      }
    });

    return () => map.remove();
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" aria-label="Map of California" />
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md border border-white/10 bg-black/60 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
            Basemap unavailable: {error}
          </p>
        </div>
      )}
    </div>
  );
}
