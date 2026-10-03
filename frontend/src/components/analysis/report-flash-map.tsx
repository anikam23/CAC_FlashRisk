"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BASEMAP_STYLE_URL } from "@/lib/config";
import { cn } from "cn";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export type ReportMapPoint = {
  id: string;
  rank: number;
  lon: number;
  lat: number;
  label: string;
};

type ReportFlashMapProps = {
  points: readonly ReportMapPoint[];
  activeId: string | null;
  onHover: (id: string) => void;
  onActivate: (id: string) => void;
};

type RankMarker = {
  marker: maplibregl.Marker;
  element: HTMLButtonElement;
};

export function ReportFlashMap({ points, activeId, onHover, onActivate }: ReportFlashMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, RankMarker>>(new Map());
  const hoverRef = useRef(onHover);
  const activateRef = useRef(onActivate);
  const fittedSignatureRef = useRef<string | null>(null);
  const signature = points
    .map((point) => `${point.id}|${point.rank}|${point.lon}|${point.lat}|${point.label}`)
    .join(";");

  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    activateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const markers = markersRef.current;
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    const map = new maplibregl.Map({
      container,
      style: BASEMAP_STYLE_URL,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      center: [-119.5, 37.2],
      zoom: 5,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      const nextIds = new Set(points.map((point) => point.id));
      for (const [id, entry] of markersRef.current) {
        if (!nextIds.has(id)) {
          entry.marker.remove();
          markersRef.current.delete(id);
        }
      }

      for (const point of points) {
        let entry = markersRef.current.get(point.id);
        if (!entry) {
          const element = document.createElement("button");
          element.type = "button";
          element.className =
            "m-0 flex size-7 cursor-pointer items-center justify-center rounded-full border border-primary/50 bg-[oklch(0.14_0.02_258)] p-0 text-[13px] leading-none font-semibold text-primary tabular-nums shadow-[0_0_0_1px_oklch(0.12_0.02_255/0.9)]";
          element.addEventListener("mouseenter", () => {
            const id = element.dataset.flashId;
            if (id) hoverRef.current(id);
          });
          element.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const id = element.dataset.flashId;
            if (id) activateRef.current(id);
          });
          const marker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([point.lon, point.lat])
            .addTo(map);
          entry = { marker, element };
          markersRef.current.set(point.id, entry);
        }
        entry.element.dataset.flashId = point.id;
        entry.element.textContent = String(point.rank);
        entry.element.setAttribute("aria-label", `Rank ${point.rank}, ${point.label}`);
        entry.marker.setLngLat([point.lon, point.lat]);
        const active = point.id === activeId;
        entry.element.style.background = active ? "var(--primary)" : "";
        entry.element.style.color = active ? "var(--primary-foreground)" : "";
        entry.element.style.zIndex = active ? "2" : "1";
      }

      if (fittedSignatureRef.current === signature) return;
      fittedSignatureRef.current = signature;
      if (points.length === 1) {
        const only = points[0];
        if (only) map.jumpTo({ center: [only.lon, only.lat], zoom: 10 });
      } else if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const point of points) bounds.extend([point.lon, point.lat]);
        map.fitBounds(bounds, { padding: 36, maxZoom: 11, duration: 0 });
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once("load", sync);
    return () => {
      map.off("load", sync);
    };
  }, [points, activeId, signature]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full min-h-[16rem] w-full overflow-hidden rounded-md border border-white/10")}
      role="region"
      aria-label="Ranked flash locations"
    />
  );
}
