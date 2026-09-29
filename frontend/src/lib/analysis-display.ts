/** Presentation helpers for FlashRisk Analysis Report (display only). */

export type FeatureSectionId =
  | "atmosphere"
  | "precipitation"
  | "soil"
  | "vegetation"
  | "seasonality"
  | "lightning";

export type FeatureDisplayMeta = {
  name: string;
  label: string;
  unit?: string;
  section: FeatureSectionId;
  /** Display precision / style — values themselves are never altered. */
  format: "temp" | "pct" | "kpa" | "mm" | "mspeed" | "moisture" | "index" | "season" | "energy" | "area" | "duration" | "count" | "raw";
};

export const FEATURE_SECTIONS: { id: FeatureSectionId; title: string; blurb: string }[] = [
  {
    id: "atmosphere",
    title: "Atmosphere",
    blurb: "Near-surface weather at the flash time and location",
  },
  {
    id: "precipitation",
    title: "Precipitation",
    blurb: "Accumulated rainfall over recent windows",
  },
  {
    id: "soil",
    title: "Soil moisture",
    blurb: "NASA SMAP volumetric water content",
  },
  {
    id: "vegetation",
    title: "Vegetation",
    blurb: "MODIS greenness and water indices",
  },
  {
    id: "seasonality",
    title: "Seasonality",
    blurb: "Annual cycle encoding from flash timestamp",
  },
  {
    id: "lightning",
    title: "Lightning characteristics",
    blurb: "GOES-18 GLM properties of the selected flash",
  },
];

/** Metadata for the frozen 21-feature vector (presentation only). */
export const FEATURE_DISPLAY: Record<string, FeatureDisplayMeta> = {
  era5_temperature_2m_c: {
    name: "era5_temperature_2m_c",
    label: "Air temperature (2 m)",
    unit: "°C",
    section: "atmosphere",
    format: "temp",
  },
  era5_relative_humidity_pct: {
    name: "era5_relative_humidity_pct",
    label: "Relative humidity",
    unit: "%",
    section: "atmosphere",
    format: "pct",
  },
  era5_vpd_kpa: {
    name: "era5_vpd_kpa",
    label: "Vapor pressure deficit",
    unit: "kPa",
    section: "atmosphere",
    format: "kpa",
  },
  era5_wind_speed_10m_ms: {
    name: "era5_wind_speed_10m_ms",
    label: "Wind speed (10 m)",
    unit: "m/s",
    section: "atmosphere",
    format: "mspeed",
  },
  era5_precip_24h_mm: {
    name: "era5_precip_24h_mm",
    label: "Precipitation (24 h)",
    unit: "mm",
    section: "precipitation",
    format: "mm",
  },
  era5_precip_72h_mm: {
    name: "era5_precip_72h_mm",
    label: "Precipitation (72 h)",
    unit: "mm",
    section: "precipitation",
    format: "mm",
  },
  era5_precip_168h_mm: {
    name: "era5_precip_168h_mm",
    label: "Precipitation (7 d)",
    unit: "mm",
    section: "precipitation",
    format: "mm",
  },
  era5_precip_30d_mm: {
    name: "era5_precip_30d_mm",
    label: "Precipitation (30 d)",
    unit: "mm",
    section: "precipitation",
    format: "mm",
  },
  smap_surface_soil_moisture: {
    name: "smap_surface_soil_moisture",
    label: "Surface soil moisture",
    unit: "m³/m³",
    section: "soil",
    format: "moisture",
  },
  smap_rootzone_soil_moisture: {
    name: "smap_rootzone_soil_moisture",
    label: "Root-zone soil moisture",
    unit: "m³/m³",
    section: "soil",
    format: "moisture",
  },
  modis_ndwi: {
    name: "modis_ndwi",
    label: "NDWI",
    section: "vegetation",
    format: "index",
  },
  modis_ndvi: {
    name: "modis_ndvi",
    label: "NDVI",
    section: "vegetation",
    format: "index",
  },
  season_sin: {
    name: "season_sin",
    label: "Season sine",
    section: "seasonality",
    format: "season",
  },
  season_cos: {
    name: "season_cos",
    label: "Season cosine",
    section: "seasonality",
    format: "season",
  },
  flash_energy: {
    name: "flash_energy",
    label: "Flash energy",
    unit: "J",
    section: "lightning",
    format: "energy",
  },
  flash_area: {
    name: "flash_area",
    label: "Flash area",
    unit: "m²",
    section: "lightning",
    format: "area",
  },
  flash_duration_ms: {
    name: "flash_duration_ms",
    label: "Flash duration",
    unit: "ms",
    section: "lightning",
    format: "duration",
  },
  max_group_area: {
    name: "max_group_area",
    label: "Max group area",
    unit: "m²",
    section: "lightning",
    format: "area",
  },
  max_group_energy: {
    name: "max_group_energy",
    label: "Max group energy",
    unit: "J",
    section: "lightning",
    format: "energy",
  },
  group_count: {
    name: "group_count",
    label: "Group count",
    section: "lightning",
    format: "count",
  },
  max_events_per_group: {
    name: "max_events_per_group",
    label: "Max events per group",
    section: "lightning",
    format: "count",
  },
};

/** Presentation-only 0–100 FlashRisk Score from raw model output. */
export function toFlashRiskScore(modelScore: number): number {
  if (!Number.isFinite(modelScore)) return Number.NaN;
  return modelScore * 100;
}

export function formatFlashRiskScore(modelScore: number): string {
  const score = toFlashRiskScore(modelScore);
  if (!Number.isFinite(score)) return "—";
  return score.toFixed(1);
}

/** Clamp display position for the score marker (0–100 scale). */
export function scoreMarkerPercent(modelScore: number): number {
  const score = toFlashRiskScore(modelScore);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

export function formatFeatureDisplayValue(
  name: string,
  value: number,
): { text: string; unit?: string } {
  const meta = FEATURE_DISPLAY[name];
  if (!Number.isFinite(value)) return { text: "—", unit: meta?.unit };

  if (!meta) {
    return { text: formatFeatureValue(value) };
  }

  switch (meta.format) {
    case "temp":
      return { text: value.toFixed(1), unit: meta.unit };
    case "pct":
      return { text: value.toFixed(1), unit: meta.unit };
    case "kpa":
      return { text: value.toFixed(3), unit: meta.unit };
    case "mm":
      return { text: value.toFixed(2), unit: meta.unit };
    case "mspeed":
      return { text: value.toFixed(2), unit: meta.unit };
    case "moisture":
      return { text: value.toFixed(3), unit: meta.unit };
    case "index":
    case "season":
      return { text: value.toFixed(3), unit: meta.unit };
    case "energy":
      return { text: value.toExponential(3), unit: meta.unit };
    case "area":
      return { text: formatAreaDisplay(value), unit: meta.unit };
    case "duration":
      return { text: value.toFixed(1), unit: meta.unit };
    case "count":
      return { text: String(Math.round(value)), unit: meta.unit };
    default:
      return { text: formatFeatureValue(value), unit: meta.unit };
  }
}

function formatAreaDisplay(value: number): string {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}×10⁶`;
  if (Math.abs(value) >= 1e3) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Raw/debug formatting for expandable model-input list. */
export function formatFeatureValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    return value.toExponential(4);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });
}

/** Ordered (name, value) rows from the Analyze response. */
export function analysisFeatureRows(
  featureNames: string[],
  featureValues: Record<string, number>,
): { name: string; value: number }[] {
  return featureNames.map((name) => ({
    name,
    value: featureValues[name],
  }));
}

export type SectionFeatureRow = {
  name: string;
  label: string;
  value: number;
  displayText: string;
  unit?: string;
};

export function featuresBySection(
  featureNames: string[],
  featureValues: Record<string, number>,
): { section: (typeof FEATURE_SECTIONS)[number]; rows: SectionFeatureRow[] }[] {
  const bySection = new Map<FeatureSectionId, SectionFeatureRow[]>();

  for (const name of featureNames) {
    const meta = FEATURE_DISPLAY[name];
    const sectionId = meta?.section ?? "atmosphere";
    const formatted = formatFeatureDisplayValue(name, featureValues[name]);
    const row: SectionFeatureRow = {
      name,
      label: meta?.label ?? name,
      value: featureValues[name],
      displayText: formatted.text,
      unit: formatted.unit,
    };
    const list = bySection.get(sectionId) ?? [];
    list.push(row);
    bySection.set(sectionId, list);
  }

  return FEATURE_SECTIONS.map((section) => ({
    section,
    rows: bySection.get(section.id) ?? [],
  })).filter((entry) => entry.rows.length > 0);
}

export function formatAnalysisRuntime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds - minutes * 60;
  return `${minutes}m ${rem.toFixed(0)}s`;
}
