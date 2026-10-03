"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BASEMAP_STYLE_URL } from "@/lib/config";
import { circleRingLngLat } from "@/lib/sentinel-display";
import { cn } from "cn";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const AREA_COLOR = "oklch(0.72 0.17 50)";

type SurveillanceContextMapProps = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  className?: string;
};

export function SurveillanceContextMap({
  latitude,
  longitude,
  radiusKm,
  className,
}: SurveillanceContextMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      const ring = circleRingLngLat(latitude, longitude, radiusKm);
      const feature = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      };
      const source = map.getSource("surveillance-area");
      if (source && "setData" in source) {
        (source as maplibregl.GeoJSONSource).setData(feature);
      } else {
        map.addSource("surveillance-area", { type: "geojson", data: feature });
        map.addLayer({
          id: "surveillance-area-fill",
          type: "fill",
          source: "surveillance-area",
          paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.16 },
        });
        map.addLayer({
          id: "surveillance-area-line",
          type: "line",
          source: "surveillance-area",
          paint: { "line-color": AREA_COLOR, "line-width": 2 },
        });
      }

      const element = document.createElement("span");
      element.className = "flash-marker is-selected";
      element.setAttribute("aria-label", "Selected lightning flash");
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([longitude, latitude])
        .addTo(map);
      const bounds = new maplibregl.LngLatBounds();
      for (const coord of ring) bounds.extend(coord);
      map.fitBounds(bounds, { padding: 28, maxZoom: 12, duration: 0 });
      return marker;
    };

    let marker: maplibregl.Marker | null = null;
    const run = () => {
      marker?.remove();
      marker = sync();
    };
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
    return () => {
      map.off("load", run);
      marker?.remove();
    };
  }, [latitude, longitude, radiusKm]);

  return (
    <div
      ref={containerRef}
      className={cn("h-64 w-full overflow-hidden rounded-md border border-white/10", className)}
      role="region"
      aria-label="10 km surveillance area"
    />
  );
}
