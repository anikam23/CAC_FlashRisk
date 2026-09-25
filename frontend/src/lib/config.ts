export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8765"
).replace(/\/$/, "");

// CARTO Dark Matter: free vector basemap, no API key. Attribution is rendered by MapLibre.
export const BASEMAP_STYLE_URL =
  process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
