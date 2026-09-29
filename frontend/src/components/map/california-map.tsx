"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { createFlashMarkerElement, applyFlashMarkerState } from "@/components/flash/flash-marker";
import { createSearchTargetElement } from "@/components/map/search-target-marker";
import {
  CALIFORNIA_BOUNDARY,
  CALIFORNIA_BOUNDS,
  californiaFramingPadding,
  createOutsideCaliforniaMask,
  createSearchAreaPolygon,
  createSearchRadiusLabelPoint,
  isInsideCalifornia,
  type LonLat,
} from "@/lib/california";
import type { GlmFlash, GlmFlashReconstruction } from "@/lib/api";
import { BASEMAP_STYLE_URL } from "@/lib/config";
import { convexHullLonLat } from "@/lib/convex-hull";
import { cn } from "cn";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const SEARCH_AREA_SOURCE = "lightning-search-area";
const SEARCH_AREA_FILL = "lightning-search-area-fill";
const SEARCH_AREA_LINE = "lightning-search-area-line";
const SEARCH_RADIUS_LABEL_SOURCE = "lightning-search-radius-label";
const SEARCH_RADIUS_LABEL_LAYER = "lightning-search-radius-label-text";
const MASK_SOURCE = "outside-california-mask";
const MASK_LAYER = "outside-california-mask-fill";
const RECON_EVENTS_SOURCE = "flash-recon-events";
const RECON_EXTENT_SOURCE = "flash-recon-extent";
const RECON_EXTENT_FILL_LAYER = "flash-recon-extent-fill";
const RECON_EXTENT_LINE_LAYER = "flash-recon-extent-line";
const RECON_EVENTS_GLOW_LAYER = "flash-recon-events-plus-glow";
const RECON_EVENTS_TRACE_LAYER = "flash-recon-events-plus-trace";
const RECON_EVENTS_ACTIVE_LAYER = "flash-recon-events-plus-active";
const RECON_EVENT_PLUS_ICON = "glm-event-plus-gold";
const RECON_EVENT_GLOW_ICON = "glm-event-plus-glow";
/** Removed from map (groups stay in panel/API data only). */
const LEGACY_GROUPS_LAYER = "flash-recon-groups-circle";
const LEGACY_GROUPS_SOURCE = "flash-recon-groups";
const LEGACY_EVENT_CIRCLE_TRACE = "flash-recon-events-trace";
const LEGACY_EVENT_CIRCLE_ACTIVE = "flash-recon-events-active";
const LEGACY_CYAN_PLUS_ICON = "glm-event-plus";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const FRAME_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

const EMPTY_SEARCH_AREA: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function framingFor(map: maplibregl.Map) {
  const { clientWidth, clientHeight } = map.getContainer();
  return californiaFramingPadding(clientWidth, clientHeight);
}

function frameCalifornia(map: maplibregl.Map, duration = 0) {
  map.resize();
  const { clientWidth, clientHeight } = map.getContainer();
  if (clientWidth < 2 || clientHeight < 2 || !map.isStyleLoaded()) return false;

  const padding = framingFor(map);
  const camera = map.cameraForBounds(CALIFORNIA_BOUNDS, { padding });
  if (!camera?.center || camera.zoom == null) return false;

  // Slight zoom-in from pure fitBounds so more city labels appear on first load,
  // without returning to the previous over-cropped framing.
  const zoom = camera.zoom + 0.4;

  map.easeTo({
    center: camera.center,
    zoom,
    bearing: 0,
    pitch: 0,
    duration,
    essential: true,
  });
  return true;
}

function focusLocation(map: maplibregl.Map, location: LonLat, duration = 900) {
  const padding = framingFor(map);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.easeTo({
    center: [location.lng, location.lat],
    zoom: Math.max(map.getZoom(), 9.4),
    duration: reduce ? 0 : duration,
    padding: {
      top: Math.max(padding.top, 72),
      right: Math.max(padding.right, 48),
      bottom: Math.max(padding.bottom, 72),
      left: Math.max(padding.left, 48),
    },
    essential: true,
  });
}

class FrameCaliforniaControl implements maplibregl.IControl {
  private container?: HTMLDivElement;
  private onClick?: () => void;

  onAdd(map: maplibregl.Map) {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "flashrisk-frame-ctrl";
    button.title = "Frame California";
    button.setAttribute("aria-label", "Frame California");
    button.innerHTML = FRAME_ICON;

    this.onClick = () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      frameCalifornia(map, reduce ? 0 : 650);
    };
    button.addEventListener("click", this.onClick);
    container.appendChild(button);
    this.container = container;
    return container;
  }

  onRemove() {
    const button = this.container?.querySelector("button");
    if (button && this.onClick) button.removeEventListener("click", this.onClick);
    this.container?.remove();
    this.container = undefined;
    this.onClick = undefined;
  }
}

function restyleWater(map: maplibregl.Map) {
  // Quiet navy/slate water under roads and labels (do not lift above them).
  // Slightly richer than land charcoal so ocean still reads through the outside-CA veil.
  const waterFill = "#1e2c3f";
  const waterway = "rgba(70, 92, 112, 1)";

  if (map.getLayer("water")) {
    map.setPaintProperty("water", "fill-color", waterFill);
  }
  if (map.getLayer("waterway")) {
    map.setPaintProperty("waterway", "line-color", waterway);
  }
  if (map.getLayer("watername_ocean")) {
    map.setPaintProperty("watername_ocean", "text-color", "rgba(96, 112, 128, 1)");
  }
  if (map.getLayer("watername_sea")) {
    map.setPaintProperty("watername_sea", "text-color", "rgba(86, 100, 114, 1)");
  }
}

/**
 * Bring useful orientation layers in a bit earlier at close zoom without enabling
 * business/POI clutter (stadiums, housenumbers, minor street names stay late/off).
 */
function improveCloseZoomContext(map: maplibregl.Map) {
  const earlierMinzoom: Record<string, number> = {
    // Communities
    place_town: 7,
    place_villages: 8,
    place_hamlet: 10,
    // Roads (lines)
    road_sec_fill_noramp: 11,
    road_sec_case_noramp: 10,
    road_pri_fill_noramp: 9,
    // Road names — major/primary/secondary only
    roadname_major: 11,
    roadname_pri: 12,
    roadname_sec: 13,
    // Parks / nature labels (not shops)
    poi_park: 12,
    park_national_park: 8,
  };

  const styleLayers = map.getStyle().layers ?? [];

  for (const [layerId, minzoom] of Object.entries(earlierMinzoom)) {
    if (!map.getLayer(layerId)) continue;
    const styleLayer = styleLayers.find((layer) => layer.id === layerId);
    const currentMin = styleLayer?.minzoom;
    // Only pull layers earlier; never push always-on or already-earlier layers later.
    if (currentMin == null || minzoom >= currentMin) continue;
    const maxzoom = styleLayer?.maxzoom ?? 24;
    try {
      map.setLayerZoomRange(layerId, minzoom, maxzoom);
    } catch {
      // Layer may not support zoom-range edits; skip.
    }
  }

  // Slightly emphasize highway/road names so they read on the dark basemap.
  for (const layerId of ["roadname_major", "roadname_pri", "roadname_sec"]) {
    if (!map.getLayer(layerId)) continue;
    try {
      map.setPaintProperty(layerId, "text-halo-width", 1.25);
      map.setPaintProperty(layerId, "text-halo-color", "rgba(8, 12, 18, 0.85)");
    } catch {
      // ignore paint property gaps
    }
  }
}

function firstSymbolLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers;
  if (!layers) return undefined;
  return layers.find((layer) => layer.type === "symbol")?.id;
}

/** Match the ~0.64 outside-CA veil so fully out-of-state labels still recede. */
const OUTSIDE_LABEL_OPACITY = 0.36;

function opacityForCaliforniaLabels(
  current: unknown,
): maplibregl.ExpressionSpecification {
  const inside =
    current === undefined || current === null
      ? 1
      : (current as number | maplibregl.ExpressionSpecification);
  const outside =
    typeof inside === "number"
      ? inside * OUTSIDE_LABEL_OPACITY
      : (["*", inside, OUTSIDE_LABEL_OPACITY] as maplibregl.ExpressionSpecification);

  return [
    "case",
    ["within", CALIFORNIA_BOUNDARY as unknown as GeoJSON.GeoJSON],
    inside,
    outside,
  ];
}

/**
 * Keep labels above the veil so glyphs are never half-muted at the state edge.
 * Mute only when the labeled feature itself lies fully outside California —
 * so border-straddling text stays fully clear at every zoom.
 */
function muteOutsideCaliforniaLabels(map: maplibregl.Map) {
  const layers = map.getStyle().layers;
  if (!layers) return;

  for (const layer of layers) {
    if (layer.type !== "symbol") continue;

    try {
      const textField = map.getLayoutProperty(layer.id, "text-field");
      if (textField !== undefined && textField !== null && textField !== "") {
        map.setPaintProperty(
          layer.id,
          "text-opacity",
          opacityForCaliforniaLabels(map.getPaintProperty(layer.id, "text-opacity")),
        );
      }
    } catch {
      // Layer may not expose text paint; skip.
    }

    try {
      const iconImage = map.getLayoutProperty(layer.id, "icon-image");
      if (iconImage !== undefined && iconImage !== null && iconImage !== "") {
        map.setPaintProperty(
          layer.id,
          "icon-opacity",
          opacityForCaliforniaLabels(map.getPaintProperty(layer.id, "icon-opacity")),
        );
      }
    } catch {
      // Layer may not expose icon paint; skip.
    }
  }
}

function addCaliforniaEmphasis(map: maplibregl.Map) {
  if (map.getSource("california-boundary")) return;

  map.addSource(MASK_SOURCE, {
    type: "geojson",
    data: createOutsideCaliforniaMask() as GeoJSON.GeoJSON,
  });
  map.addSource("california-boundary", {
    type: "geojson",
    data: CALIFORNIA_BOUNDARY as unknown as GeoJSON.GeoJSON,
  });

  // Veil dims out-of-state land/roads under labels. Labels stay above it and are
  // muted per-feature (see muteOutsideCaliforniaLabels) so border text is not split.
  map.addLayer(
    {
      id: MASK_LAYER,
      type: "fill",
      source: MASK_SOURCE,
      paint: {
        // Strong enough to hush out-of-state detail on the dark basemap,
        // while leaving neighbors still recognizable underneath.
        "fill-color": "rgba(5, 9, 15, 0.64)",
        "fill-opacity": 1,
        "fill-antialias": true,
      },
    },
    firstSymbolLayerId(map),
  );

  map.addLayer({
    id: "california-boundary-casing",
    type: "line",
    source: "california-boundary",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "rgba(0, 0, 0, 0.55)",
      "line-width": 3.25,
    },
  });
  map.addLayer({
    id: "california-boundary",
    type: "line",
    source: "california-boundary",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "rgba(236, 232, 224, 0.78)",
      "line-width": 1.35,
    },
  });

  muteOutsideCaliforniaLabels(map);
}

function ensureSearchAreaLayers(map: maplibregl.Map) {
  if (!map.getSource(SEARCH_AREA_SOURCE)) {
    map.addSource(SEARCH_AREA_SOURCE, {
      type: "geojson",
      data: EMPTY_SEARCH_AREA,
    });
  }

  if (!map.getLayer(SEARCH_AREA_FILL)) {
    map.addLayer({
      id: SEARCH_AREA_FILL,
      type: "fill",
      source: SEARCH_AREA_SOURCE,
      paint: {
        "fill-color": "rgba(148, 186, 214, 0.10)",
        "fill-outline-color": "rgba(148, 186, 214, 0)",
      },
    });
  }

  if (!map.getLayer(SEARCH_AREA_LINE)) {
    map.addLayer({
      id: SEARCH_AREA_LINE,
      type: "line",
      source: SEARCH_AREA_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "rgba(186, 214, 232, 0.78)",
        "line-width": 1.25,
        "line-dasharray": [1.2, 1.6],
      },
    });
  }

  if (!map.getSource(SEARCH_RADIUS_LABEL_SOURCE)) {
    map.addSource(SEARCH_RADIUS_LABEL_SOURCE, {
      type: "geojson",
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer(SEARCH_RADIUS_LABEL_LAYER)) {
    map.addLayer({
      id: SEARCH_RADIUS_LABEL_LAYER,
      type: "symbol",
      source: SEARCH_RADIUS_LABEL_SOURCE,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-font": ["Montserrat Regular", "Open Sans Regular", "Noto Sans Regular"],
        "text-anchor": "top",
        "text-offset": [0, 0.55],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": false,
      },
      paint: {
        "text-color": "rgba(196, 218, 232, 0.78)",
        "text-halo-color": "rgba(8, 14, 22, 0.88)",
        "text-halo-width": 1.35,
        "text-opacity": 0.92,
      },
    });
  }
}

function removeLayerIfPresent(map: maplibregl.Map, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}

function removeSourceIfPresent(map: maplibregl.Map, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}

function removeImageIfPresent(map: maplibregl.Map, id: string) {
  if (map.hasImage(id)) map.removeImage(id);
}

function paintPlusIcon(
  size: number,
  options: {
    arm: number;
    halfThickness: number;
    rgb: [number, number, number];
    alpha: number;
    glowRgb?: [number, number, number];
    glowRadius?: number;
    glowAlpha?: number;
  },
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const { arm, halfThickness, rgb, alpha, glowRgb, glowRadius = 0, glowAlpha = 0 } = options;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - cx + 0.5);
      const dy = Math.abs(y - cy + 0.5);
      const i = (y * size + x) * 4;

      if (glowRgb && glowRadius > 0) {
        const alongArm =
          Math.min(dx, dy) <= halfThickness + 2.5 && Math.max(dx, dy) <= arm + 1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (alongArm || dist < glowRadius) {
          const t = Math.min(1, dist / glowRadius);
          const gA = Math.round(glowAlpha * (1 - t) * (1 - t));
          if (gA > (data[i + 3] ?? 0)) {
            data[i] = glowRgb[0];
            data[i + 1] = glowRgb[1];
            data[i + 2] = glowRgb[2];
            data[i + 3] = gA;
          }
        }
      }

      const inHorizontal = dy <= halfThickness && dx <= arm;
      const inVertical = dx <= halfThickness && dy <= arm;
      if (!inHorizontal && !inVertical) continue;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = alpha;
    }
  }
  return data;
}

function ensureEventPlusIcons(map: maplibregl.Map) {
  removeImageIfPresent(map, LEGACY_CYAN_PLUS_ICON);

  if (!map.hasImage(RECON_EVENT_PLUS_ICON)) {
    const size = 96;
    const data = paintPlusIcon(size, {
      arm: 30,
      halfThickness: 3.4,
      rgb: [255, 196, 110],
      alpha: 235,
      glowRgb: [232, 168, 74],
      glowRadius: 22,
      glowAlpha: 90,
    });
    map.addImage(
      RECON_EVENT_PLUS_ICON,
      { width: size, height: size, data },
      { pixelRatio: 2 },
    );
  }

  if (!map.hasImage(RECON_EVENT_GLOW_ICON)) {
    const size = 96;
    const data = paintPlusIcon(size, {
      arm: 18,
      halfThickness: 2,
      rgb: [255, 210, 140],
      alpha: 40,
      glowRgb: [255, 186, 96],
      glowRadius: 36,
      glowAlpha: 140,
    });
    map.addImage(
      RECON_EVENT_GLOW_ICON,
      { width: size, height: size, data },
      { pixelRatio: 2 },
    );
  }
}

function ensureReconstructionLayers(map: maplibregl.Map) {
  // Drop legacy circle / group map layers (groups remain in panel data only).
  removeLayerIfPresent(map, LEGACY_EVENT_CIRCLE_TRACE);
  removeLayerIfPresent(map, LEGACY_EVENT_CIRCLE_ACTIVE);
  removeLayerIfPresent(map, LEGACY_GROUPS_LAYER);
  removeSourceIfPresent(map, LEGACY_GROUPS_SOURCE);

  ensureEventPlusIcons(map);

  if (!map.getSource(RECON_EXTENT_SOURCE)) {
    map.addSource(RECON_EXTENT_SOURCE, {
      type: "geojson",
      data: EMPTY_FEATURE_COLLECTION,
    });
  }
  if (!map.getSource(RECON_EVENTS_SOURCE)) {
    map.addSource(RECON_EVENTS_SOURCE, {
      type: "geojson",
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  const beforeEvents = map.getLayer(RECON_EVENTS_GLOW_LAYER)
    ? RECON_EVENTS_GLOW_LAYER
    : map.getLayer(RECON_EVENTS_TRACE_LAYER)
      ? RECON_EVENTS_TRACE_LAYER
      : map.getLayer(RECON_EVENTS_ACTIVE_LAYER)
        ? RECON_EVENTS_ACTIVE_LAYER
        : undefined;

  // Observed-extent styling preserved (amber dashed outline + faint fill).
  if (!map.getLayer(RECON_EXTENT_FILL_LAYER)) {
    map.addLayer(
      {
        id: RECON_EXTENT_FILL_LAYER,
        type: "fill",
        source: RECON_EXTENT_SOURCE,
        paint: {
          "fill-color": "rgba(232, 168, 74, 0.04)",
          "fill-opacity": 1,
        },
      },
      beforeEvents,
    );
  }

  if (!map.getLayer(RECON_EXTENT_LINE_LAYER)) {
    map.addLayer(
      {
        id: RECON_EXTENT_LINE_LAYER,
        type: "line",
        source: RECON_EXTENT_SOURCE,
        paint: {
          "line-color": "rgba(232, 168, 74, 0.42)",
          "line-width": 1,
          "line-dasharray": [1.1, 1.8],
          "line-opacity": 0.85,
        },
      },
      beforeEvents,
    );
  }

  if (!map.getLayer(RECON_EVENTS_GLOW_LAYER)) {
    map.addLayer({
      id: RECON_EVENTS_GLOW_LAYER,
      type: "symbol",
      source: RECON_EVENTS_SOURCE,
      layout: {
        "icon-image": RECON_EVENT_GLOW_ICON,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.55,
          11,
          0.85,
          14,
          1.1,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-opacity": 0,
      },
    });
  }

  if (!map.getLayer(RECON_EVENTS_TRACE_LAYER)) {
    map.addLayer({
      id: RECON_EVENTS_TRACE_LAYER,
      type: "symbol",
      source: RECON_EVENTS_SOURCE,
      layout: {
        "icon-image": RECON_EVENT_PLUS_ICON,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.48,
          11,
          0.72,
          14,
          0.92,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-opacity": 0.55,
      },
    });
  } else {
    map.setLayoutProperty(RECON_EVENTS_TRACE_LAYER, "icon-image", RECON_EVENT_PLUS_ICON);
  }

  if (!map.getLayer(RECON_EVENTS_ACTIVE_LAYER)) {
    map.addLayer({
      id: RECON_EVENTS_ACTIVE_LAYER,
      type: "symbol",
      source: RECON_EVENTS_SOURCE,
      layout: {
        "icon-image": RECON_EVENT_PLUS_ICON,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.62,
          11,
          0.95,
          14,
          1.2,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-opacity": 0,
      },
    });
  } else {
    map.setLayoutProperty(RECON_EVENTS_ACTIVE_LAYER, "icon-image", RECON_EVENT_PLUS_ICON);
  }

  if (map.getLayer(RECON_EVENTS_GLOW_LAYER)) {
    if (map.getLayer(RECON_EXTENT_FILL_LAYER)) {
      map.moveLayer(RECON_EXTENT_FILL_LAYER, RECON_EVENTS_GLOW_LAYER);
    }
    if (map.getLayer(RECON_EXTENT_LINE_LAYER)) {
      map.moveLayer(RECON_EXTENT_LINE_LAYER, RECON_EVENTS_GLOW_LAYER);
    }
  }
}

function setReconstructionData(
  map: maplibregl.Map,
  reconstruction: GlmFlashReconstruction | null,
  playbackGlmMs: number,
  active: boolean,
) {
  ensureReconstructionLayers(map);

  const eventsSource = map.getSource(RECON_EVENTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const extentSource = map.getSource(RECON_EXTENT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!eventsSource || !extentSource) return;

  if (!reconstruction || !active) {
    eventsSource.setData(EMPTY_FEATURE_COLLECTION);
    extentSource.setData(EMPTY_FEATURE_COLLECTION);
    return;
  }

  const visibleEvents = reconstruction.events.filter(
    (event) => event.animation_offset_ms <= playbackGlmMs + 0.05,
  );
  eventsSource.setData({
    type: "FeatureCollection",
    features: visibleEvents.map((event) => ({
      type: "Feature",
      properties: {
        event_id: event.event_id,
        offset_ms: event.animation_offset_ms,
        age_ms: playbackGlmMs - event.animation_offset_ms,
      },
      geometry: {
        type: "Point",
        coordinates: [event.event_lon, event.event_lat],
      },
    })),
  });

  const hull = convexHullLonLat(
    visibleEvents.map((event) => [event.event_lon, event.event_lat] as [number, number]),
  );
  if (hull.length >= 4) {
    extentSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [hull],
          },
        },
      ],
    });
  } else {
    extentSource.setData(EMPTY_FEATURE_COLLECTION);
  }

  // NEW: bright pulse + warm glow; RECENT: full gold +; OLDER: dim gold trace.
  map.setLayoutProperty(RECON_EVENTS_ACTIVE_LAYER, "icon-size", [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 0.78, 45, 0.62, 90, 0.52],
    11,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 1.15, 45, 0.92, 90, 0.76],
    14,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 1.4, 45, 1.12, 90, 0.95],
  ]);
  map.setPaintProperty(RECON_EVENTS_ACTIVE_LAYER, "icon-opacity", [
    "interpolate",
    ["linear"],
    ["get", "age_ms"],
    0,
    1,
    40,
    0.7,
    90,
    0,
  ]);
  map.setPaintProperty(RECON_EVENTS_GLOW_LAYER, "icon-opacity", [
    "interpolate",
    ["linear"],
    ["get", "age_ms"],
    0,
    0.7,
    50,
    0.28,
    110,
    0,
  ]);
  map.setLayoutProperty(RECON_EVENTS_TRACE_LAYER, "icon-size", [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 0.42, 90, 0.5, 280, 0.46],
    11,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 0.62, 90, 0.74, 280, 0.68],
    14,
    ["interpolate", ["linear"], ["get", "age_ms"], 0, 0.8, 90, 0.94, 280, 0.86],
  ]);
  map.setPaintProperty(RECON_EVENTS_TRACE_LAYER, "icon-opacity", [
    "interpolate",
    ["linear"],
    ["get", "age_ms"],
    0,
    0.18,
    70,
    0.78,
    180,
    0.62,
    400,
    0.4,
    900,
    0.32,
  ]);
}

type SavedMapView = {
  center: maplibregl.LngLatLike;
  zoom: number;
  bearing: number;
  pitch: number;
};

function saveMapView(map: maplibregl.Map): SavedMapView {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function restoreMapView(map: maplibregl.Map, view: SavedMapView, duration = 750) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.easeTo({
    ...view,
    duration: reduce ? 0 : duration,
    essential: true,
  });
}

function focusReconstructionExtent(
  map: maplibregl.Map,
  reconstruction: GlmFlashReconstruction,
  duration = 850,
) {
  const coords: [number, number][] = [];
  for (const event of reconstruction.events) {
    coords.push([event.event_lon, event.event_lat]);
  }
  if (coords.length === 0) {
    coords.push([reconstruction.flash_lon, reconstruction.flash_lat]);
  }

  const bounds = coords.reduce(
    (box, coord) => box.extend(coord),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );

  const { clientWidth, clientHeight } = map.getContainer();
  const base = californiaFramingPadding(clientWidth, clientHeight);
  // Extra inset so the full reconstruction clears the floating panels.
  const padding = {
    top: Math.max(base.top, 56),
    right: Math.max(base.right, 392),
    bottom: Math.max(base.bottom, 72),
    left: Math.max(base.left, 340),
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.fitBounds(bounds, {
    padding,
    maxZoom: 12.25,
    duration: reduce ? 0 : duration,
    essential: true,
  });
}

function setSearchArea(
  map: maplibregl.Map,
  location: LonLat | null,
  radiusKm: number,
) {
  ensureSearchAreaLayers(map);
  const areaSource = map.getSource(SEARCH_AREA_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const labelSource = map.getSource(SEARCH_RADIUS_LABEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!areaSource) return;

  if (!location) {
    areaSource.setData(EMPTY_SEARCH_AREA);
    labelSource?.setData(EMPTY_FEATURE_COLLECTION);
    return;
  }

  areaSource.setData({
    type: "FeatureCollection",
    features: [createSearchAreaPolygon(location, radiusKm * 1000)],
  });
  labelSource?.setData({
    type: "FeatureCollection",
    features: [createSearchRadiusLabelPoint(location, radiusKm)],
  });
}

type CaliforniaMapProps = {
  selectedLocation: LonLat | null;
  searchRadiusKm: number;
  flashes: GlmFlash[];
  selectedFlashId: string | null;
  reconstruction: GlmFlashReconstruction | null;
  playbackGlmMs: number;
  /** True while reconstruction timeline is advancing. */
  playing?: boolean;
  /** True after the user presses Play — dims siblings and shows reconstruction layers. */
  reconstructionFocus: boolean;
  /** Incremented when Play should fit the map to the reconstruction extent. */
  reconstructionCameraNonce: number;
  focusNonce: number;
  /**
   * When false, empty-map clicks neither pick a search location nor clear the
   * selected flash (active investigation / locked search area).
   */
  allowMapLocationPick?: boolean;
  onSelectLocation: (location: LonLat) => void;
  onSelectFlash: (flash: GlmFlash) => void;
  onDeselectFlash: () => void;
};

export function CaliforniaMap({
  selectedLocation,
  searchRadiusKm,
  flashes,
  selectedFlashId,
  reconstruction,
  playbackGlmMs,
  playing = false,
  reconstructionFocus,
  reconstructionCameraNonce,
  focusNonce,
  allowMapLocationPick = true,
  onSelectLocation,
  onSelectFlash,
  onDeselectFlash,
}: CaliforniaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const flashMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const playbackHudFadeTimerRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const [playbackHud, setPlaybackHud] = useState<{
    observed: number;
    total: number;
    ms: number;
    x: number;
    y: number;
    phase: "live" | "complete" | "fading";
  } | null>(null);
  const flashesRef = useRef(flashes);
  const onSelectRef = useRef(onSelectLocation);
  const onSelectFlashRef = useRef(onSelectFlash);
  const onDeselectFlashRef = useRef(onDeselectFlash);
  const allowMapLocationPickRef = useRef(allowMapLocationPick);
  const lastFocusNonceRef = useRef(0);
  const lastReconstructionCameraNonceRef = useRef(0);
  const savedViewRef = useRef<SavedMapView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelectLocation;
  }, [onSelectLocation]);

  useEffect(() => {
    onSelectFlashRef.current = onSelectFlash;
  }, [onSelectFlash]);

  useEffect(() => {
    onDeselectFlashRef.current = onDeselectFlash;
  }, [onDeselectFlash]);

  useEffect(() => {
    allowMapLocationPickRef.current = allowMapLocationPick;
    const map = mapRef.current;
    if (map && !allowMapLocationPick) {
      map.getCanvas().style.cursor = "";
    }
  }, [allowMapLocationPick]);

  useEffect(() => {
    flashesRef.current = flashes;
  }, [flashes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const flashMarkers = flashMarkersRef.current;
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

    const padding = californiaFramingPadding(container.clientWidth || 1280, container.clientHeight || 720);
    const map = new maplibregl.Map({
      container,
      style: BASEMAP_STYLE_URL,
      bounds: CALIFORNIA_BOUNDS,
      fitBoundsOptions: { padding, duration: 0 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new FrameCaliforniaControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 88 }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    let framed = false;
    const tryFrame = (duration = 0) => {
      if (framed) return;
      if (!frameCalifornia(map, duration)) return;
      framed = true;
    };

    const onClick = (event: maplibregl.MapMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(".flash-marker")) {
        return;
      }

      // While an investigation is active, empty-map clicks must not move the
      // search area or clear selection / analysis.
      if (!allowMapLocationPickRef.current) {
        return;
      }

      // Empty map space clears flash selection; location pick still applies inside CA.
      onDeselectFlashRef.current();

      const { lng, lat } = event.lngLat;
      if (!isInsideCalifornia(lng, lat)) return;
      onSelectRef.current({ lng, lat });
    };

    const onMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (!allowMapLocationPickRef.current) {
        map.getCanvas().style.cursor = "";
        return;
      }
      const { lng, lat } = event.lngLat;
      map.getCanvas().style.cursor = isInsideCalifornia(lng, lat) ? "crosshair" : "";
    };

    map.on("load", () => {
      restyleWater(map);
      improveCloseZoomContext(map);
      addCaliforniaEmphasis(map);
      ensureSearchAreaLayers(map);
      ensureReconstructionLayers(map);
      tryFrame(0);
    });

    map.once("idle", () => {
      tryFrame(0);
    });

    map.on("click", onClick);
    map.on("mousemove", onMouseMove);

    const observer = new ResizeObserver(() => {
      map.resize();
      if (!framed) tryFrame(0);
    });
    observer.observe(container);

    map.on("error", (event) => {
      if (!map.loaded()) {
        setError(event.error?.message ?? "Basemap failed to load");
      }
    });

    return () => {
      observer.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      if (playbackHudFadeTimerRef.current !== null) {
        window.clearTimeout(playbackHudFadeTimerRef.current);
        playbackHudFadeTimerRef.current = null;
      }
      for (const marker of flashMarkers.values()) marker.remove();
      flashMarkers.clear();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncOverlay = () => {
      if (!map.isStyleLoaded()) return;
      ensureSearchAreaLayers(map);
      setSearchArea(map, selectedLocation, searchRadiusKm);

      if (!selectedLocation) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          element: createSearchTargetElement(),
          anchor: "center",
        })
          .setLngLat([selectedLocation.lng, selectedLocation.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([selectedLocation.lng, selectedLocation.lat]);
      }
    };

    if (map.isStyleLoaded()) {
      syncOverlay();
      return;
    }

    map.once("load", syncOverlay);
  }, [selectedLocation, searchRadiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // HTML Markers are DOM overlays and must not wait on isStyleLoaded().
    // GeoJSON search-radius setData can briefly make isStyleLoaded() false in the
    // same commit as a flash refresh (Update Search with a new committed radius),
    // and map.once("load") never re-fires after the initial map load.
    const nextIds = new Set(flashes.map((flash) => flash.global_flash_id));

    for (const [id, marker] of flashMarkersRef.current) {
      if (!nextIds.has(id)) {
        marker.remove();
        flashMarkersRef.current.delete(id);
      }
    }

    for (const flash of flashes) {
      const selected = flash.global_flash_id === selectedFlashId;
      const dimmed = reconstructionFocus && !selected;
      let marker = flashMarkersRef.current.get(flash.global_flash_id);
      if (!marker) {
        const element = createFlashMarkerElement(selected, dimmed);
        element.dataset.flashId = flash.global_flash_id;
        const selectFlash = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          const id = (event.currentTarget as HTMLElement).dataset.flashId;
          if (!id) return;
          const current = flashesRef.current.find((item) => item.global_flash_id === id);
          if (current) onSelectFlashRef.current(current);
        };
        // Stop map-background deselection / location pick when interacting with a flash.
        element.addEventListener("pointerdown", (event) => event.stopPropagation());
        element.addEventListener("mousedown", (event) => event.stopPropagation());
        element.addEventListener("click", selectFlash);
        marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([flash.flash_lon, flash.flash_lat])
          .addTo(map);
        flashMarkersRef.current.set(flash.global_flash_id, marker);
      } else {
        marker.setLngLat([flash.flash_lon, flash.flash_lat]);
        applyFlashMarkerState(marker.getElement(), selected, dimmed);
      }
    }
  }, [flashes, selectedFlashId, reconstructionFocus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncReconstruction = () => {
      if (!map.isStyleLoaded()) return;
      setReconstructionData(map, reconstruction, playbackGlmMs, reconstructionFocus);
    };

    if (map.isStyleLoaded()) {
      syncReconstruction();
      return;
    }

    map.once("load", syncReconstruction);
  }, [reconstruction, playbackGlmMs, reconstructionFocus]);

  // Temporary playback HUD near the reconstruction — React overlay (not a MapLibre marker),
  // so it stays visible above the canvas and tracks map projection.
  useEffect(() => {
    const map = mapRef.current;

    const clearFadeTimer = () => {
      if (playbackHudFadeTimerRef.current !== null) {
        window.clearTimeout(playbackHudFadeTimerRef.current);
        playbackHudFadeTimerRef.current = null;
      }
    };

    const projectHud = (): { x: number; y: number } | null => {
      if (!map || !reconstruction) return null;
      // Slightly above/right of flash center so the badge does not cover the flash
      // pulse, event markers, or observed-extent geometry.
      const point = map.project([reconstruction.flash_lon, reconstruction.flash_lat]);
      return { x: point.x + 16, y: point.y - 36 };
    };

    if (!map || !reconstruction || !reconstructionFocus) {
      clearFadeTimer();
      wasPlayingRef.current = false;
      setPlaybackHud(null);
      return;
    }

    const observed = reconstruction.events.reduce(
      (count, event) => count + (event.animation_offset_ms <= playbackGlmMs + 0.05 ? 1 : 0),
      0,
    );
    const total = reconstruction.total_events;
    const atEnd = playbackGlmMs >= reconstruction.animation_end_ms - 0.05;
    const pos = projectHud();
    if (!pos) return;

    if (playing) {
      wasPlayingRef.current = true;
      clearFadeTimer();
      setPlaybackHud({
        observed,
        total,
        ms: playbackGlmMs,
        x: pos.x,
        y: pos.y,
        phase: "live",
      });
      return;
    }

    // Natural completion: brief hold of final count, then fade.
    if (wasPlayingRef.current && atEnd) {
      setPlaybackHud({
        observed,
        total,
        ms: playbackGlmMs,
        x: pos.x,
        y: pos.y,
        phase: "complete",
      });
      clearFadeTimer();
      playbackHudFadeTimerRef.current = window.setTimeout(() => {
        setPlaybackHud((current) => (current ? { ...current, phase: "fading" } : null));
        playbackHudFadeTimerRef.current = window.setTimeout(() => {
          wasPlayingRef.current = false;
          setPlaybackHud(null);
          playbackHudFadeTimerRef.current = null;
        }, 420);
      }, 1600);
      return () => clearFadeTimer();
    }

    // Mid-playback pause / seek: hide immediately.
    clearFadeTimer();
    wasPlayingRef.current = false;
    setPlaybackHud(null);
  }, [reconstruction, playbackGlmMs, reconstructionFocus, playing]);

  // Keep the HUD anchored in screen space when the map pans/zooms during playback.
  const hudVisible = playbackHud !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !reconstruction || !hudVisible) return;

    const syncPosition = () => {
      const point = map.project([reconstruction.flash_lon, reconstruction.flash_lat]);
      setPlaybackHud((current) =>
        current
          ? { ...current, x: point.x + 16, y: point.y - 36 }
          : null,
      );
    };

    map.on("move", syncPosition);
    map.on("zoom", syncPosition);
    return () => {
      map.off("move", syncPosition);
      map.off("zoom", syncPosition);
    };
  }, [reconstruction, hudVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !reconstruction) return;
    if (
      reconstructionCameraNonce === 0 ||
      reconstructionCameraNonce === lastReconstructionCameraNonceRef.current
    ) {
      return;
    }
    lastReconstructionCameraNonceRef.current = reconstructionCameraNonce;

    const run = () => {
      if (!savedViewRef.current) {
        savedViewRef.current = saveMapView(map);
      }
      focusReconstructionExtent(map, reconstruction);
    };

    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [reconstructionCameraNonce, reconstruction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (reconstructionFocus) return;

    const saved = savedViewRef.current;
    if (!saved) return;
    savedViewRef.current = null;

    const run = () => restoreMapView(map, saved);
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [reconstructionFocus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedLocation) return;
    if (focusNonce === 0 || focusNonce === lastFocusNonceRef.current) return;
    lastFocusNonceRef.current = focusNonce;

    const run = () => focusLocation(map, selectedLocation);
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [focusNonce, selectedLocation]);

  return (
    <div className="absolute inset-0 bg-[oklch(0.13_0.018_258)]">
      <div
        ref={containerRef}
        className="flashrisk-map h-full w-full"
        role="region"
        aria-label="Map of California"
      />
      {playbackHud ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: playbackHud.x,
            top: playbackHud.y,
            transform: "translate(0, -100%)",
          }}
        >
          <div
            className={cn(
              "recon-playback-hud",
              playbackHud.phase === "complete" && "is-complete",
              playbackHud.phase === "fading" && "is-fading",
            )}
            role="status"
            aria-live="polite"
            aria-label={`${playbackHud.observed} of ${playbackHud.total} events observed`}
          >
            <span className="recon-playback-hud__count">
              {playbackHud.observed} / {playbackHud.total}
            </span>
            <span className="recon-playback-hud__meta">
              events · {Math.round(playbackHud.ms)} ms
            </span>
          </div>
        </div>
      ) : null}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
          <p className="max-w-md rounded-md border border-white/10 bg-black/70 px-3 py-2 text-center text-xs text-muted-foreground backdrop-blur-md">
            Basemap unavailable. {error}
          </p>
        </div>
      )}
    </div>
  );
}
