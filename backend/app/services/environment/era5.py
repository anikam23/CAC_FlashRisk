"""ERA5-Land atmospheric and precipitation feature retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from typing import Any

import cdsapi
import numpy as np
import pandas as pd
import xarray as xr

from app.core.config import get_settings
from app.services.environment.era5_physics import (
    atmospheric_features_from_kelvin,
    reconstruct_hourly_precip_mm,
    sum_precip_window_mm,
    sum_raw_tp_window_mm,
    wind_speed_ms,
)

DATASET = "reanalysis-era5-land"
GRID_PAD_DEG = 0.20
ALL_HOURS = [f"{h:02d}:00" for h in range(24)]

RECENT_VARS = [
    "2m_temperature",
    "2m_dewpoint_temperature",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "total_precipitation",
]
TP_ONLY = ["total_precipitation"]

T2M_CANDIDATES = ("t2m", "2m_temperature")
D2M_CANDIDATES = ("d2m", "2m_dewpoint_temperature")
U10_CANDIDATES = ("u10", "10m_u_component_of_wind")
V10_CANDIDATES = ("v10", "10m_v_component_of_wind")
TP_CANDIDATES = ("tp", "total_precipitation")


class Era5Error(Exception):
    """Base ERA5 service error (never includes credentials)."""


class Era5ConfigError(Era5Error):
    """Missing or invalid local ERA5 configuration."""


class Era5RetrievalError(Era5Error):
    """CDS request or download failure."""


class Era5DataError(Era5Error):
    """Downloaded NetCDF is unreadable or missing required fields."""


class Era5CoverageError(Era5Error):
    """Atmospheric timestamp or precipitation window coverage is incomplete."""


@dataclass(frozen=True, slots=True)
class Era5Features:
    era5_temperature_2m_c: float
    era5_relative_humidity_pct: float
    era5_vpd_kpa: float
    era5_precip_24h_mm: float
    era5_precip_72h_mm: float
    era5_precip_168h_mm: float
    era5_wind_speed_10m_ms: float
    era5_precip_30d_mm: float


@dataclass(frozen=True, slots=True)
class Era5Result:
    features: Era5Features
    grid_latitude: float
    grid_longitude: float
    atmospheric_timestamp_utc: datetime
    flash_timestamp_utc: datetime
    flash_latitude: float
    flash_longitude: float
    retrieval_seconds: float
    request_labels: tuple[str, ...]


def ensure_utc_timestamp(value: datetime | pd.Timestamp | str) -> pd.Timestamp:
    """Require an explicit UTC timestamp (reject naive / ambiguous local times)."""
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        raise Era5ConfigError(
            "Flash timestamp must be timezone-aware UTC "
            "(naive timestamps are rejected to avoid local-time ambiguity)."
        )
    return ts.tz_convert("UTC")


def timestamp_to_utc_datetime(value: pd.Timestamp | datetime) -> datetime:
    """Convert a UTC pandas Timestamp to ``datetime`` for result metadata.

    Python ``datetime`` only stores microseconds. Any leftover nanoseconds are
    truncated (floored toward earlier time), never rounded forward. All ERA5
    science comparisons continue to use the full-precision pandas Timestamp.
    """
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    # Floor to microsecond so conversion does not discard "nonzero nanoseconds"
    # via an implicit warning-raising path.
    ts = ts.floor("us")
    return datetime(
        ts.year,
        ts.month,
        ts.day,
        ts.hour,
        ts.minute,
        ts.second,
        ts.microsecond,
        tzinfo=UTC,
    )


def fetch_era5_features(
    *,
    flash_time_utc: datetime | pd.Timestamp | str,
    latitude: float,
    longitude: float,
) -> Era5Result:
    """Retrieve the eight validated ERA5-Land features for a flash location/time."""
    flash_time = ensure_utc_timestamp(flash_time_utc)
    if not np.isfinite(latitude) or not np.isfinite(longitude):
        raise Era5ConfigError("Flash latitude and longitude must be finite numbers.")

    settings = get_settings()
    api_key = (settings.cds_api_key or "").strip()
    if not api_key:
        raise Era5ConfigError(
            "CDS_API_KEY is not configured. Set it in backend/.env (never commit secrets)."
        )

    t0 = perf_counter()
    request_labels: list[str] = []

    with TemporaryDirectory(prefix="flashrisk-era5-") as tmp:
        out_dir = Path(tmp)
        paths = _retrieve_era5_files(
            out_dir=out_dir,
            flash_time=flash_time,
            latitude=latitude,
            longitude=longitude,
            api_url=settings.cds_api_url,
            api_key=api_key,
            request_labels=request_labels,
        )
        result = _compute_features_from_files(
            paths=paths,
            flash_time=flash_time,
            latitude=latitude,
            longitude=longitude,
        )

    elapsed = perf_counter() - t0
    return Era5Result(
        features=result.features,
        grid_latitude=result.grid_latitude,
        grid_longitude=result.grid_longitude,
        atmospheric_timestamp_utc=result.atmospheric_timestamp_utc,
        flash_timestamp_utc=timestamp_to_utc_datetime(flash_time),
        flash_latitude=latitude,
        flash_longitude=longitude,
        retrieval_seconds=elapsed,
        request_labels=tuple(request_labels),
    )


@dataclass(frozen=True, slots=True)
class _Computed:
    features: Era5Features
    grid_latitude: float
    grid_longitude: float
    atmospheric_timestamp_utc: datetime


def _retrieve_era5_files(
    *,
    out_dir: Path,
    flash_time: pd.Timestamp,
    latitude: float,
    longitude: float,
    api_url: str,
    api_key: str,
    request_labels: list[str],
) -> list[Path]:
    recent_start, recent_end, older_start, older_end = _retrieval_calendar_windows(flash_time)
    area = [
        latitude + GRID_PAD_DEG,
        longitude - GRID_PAD_DEG,
        latitude - GRID_PAD_DEG,
        longitude + GRID_PAD_DEG,
    ]

    try:
        client = cdsapi.Client(url=api_url, key=api_key, quiet=True, progress=False)
    except TypeError:
        # Older cdsapi builds may not accept quiet/progress kwargs.
        client = cdsapi.Client(url=api_url, key=api_key)
    except Exception as exc:  # noqa: BLE001 — surface as retrieval config failure
        raise Era5RetrievalError("Failed to initialize the CDS API client.") from exc

    paths: list[Path] = []

    # Older support (tp only), split by calendar month like the validated reference.
    if older_start <= older_end:
        for idx, (chunk_start, chunk_end) in enumerate(_month_chunks(older_start, older_end)):
            label = f"era5-older-tp-{idx + 1}"
            target = out_dir / f"{label}.nc"
            _cds_retrieve(
                client=client,
                variables=TP_ONLY,
                start_date=chunk_start,
                end_date=chunk_end,
                area=area,
                target=target,
                label=label,
            )
            request_labels.append(label)
            paths.append(target)

    # Recent support: atmosphere + tp.
    label = "era5-recent-full"
    target = out_dir / f"{label}.nc"
    _cds_retrieve(
        client=client,
        variables=RECENT_VARS,
        start_date=recent_start,
        end_date=recent_end,
        area=area,
        target=target,
        label=label,
    )
    request_labels.append(label)
    paths.append(target)
    return paths


def _retrieval_calendar_windows(
    flash_time: pd.Timestamp,
) -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    """Match the validated Sep-14 windowing pattern for an arbitrary flash day."""
    flash_day = flash_time.normalize()
    recent_end = flash_day
    recent_start = flash_day - pd.Timedelta(days=8)
    older_end = recent_start - pd.Timedelta(days=1)
    older_start = (flash_time - pd.Timedelta(hours=720)).floor("D")
    return recent_start, recent_end, older_start, older_end


def _month_chunks(
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    chunks: list[tuple[pd.Timestamp, pd.Timestamp]] = []
    cursor = start.normalize()
    end_day = end.normalize()
    while cursor <= end_day:
        month_end = (cursor + pd.offsets.MonthEnd(0)).normalize()
        chunk_end = min(month_end, end_day)
        chunks.append((cursor, chunk_end))
        cursor = chunk_end + pd.Timedelta(days=1)
    return chunks


def _cds_retrieve(
    *,
    client: Any,
    variables: list[str],
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    area: list[float],
    target: Path,
    label: str,
) -> None:
    dates = pd.date_range(start_date.normalize(), end_date.normalize(), freq="D", tz="UTC")
    request = {
        "variable": variables,
        "year": sorted({str(d.year) for d in dates}),
        "month": sorted({f"{d.month:02d}" for d in dates}),
        "day": sorted({f"{d.day:02d}" for d in dates}),
        "time": ALL_HOURS,
        "area": area,
        "data_format": "netcdf",
        "download_format": "unarchived",
    }
    if target.exists():
        target.unlink()
    try:
        client.retrieve(DATASET, request, str(target))
    except Era5Error:
        raise
    except Exception as exc:  # noqa: BLE001
        detail = "CDS retrieval failed"
        text = str(exc).lower()
        if "401" in text or "unauthorized" in text or "authentication" in text:
            detail = (
                "CDS authentication failed. Check that CDS_API_KEY in backend/.env "
                "is a valid Copernicus CDS personal access token "
                "(never commit the key)."
            )
        raise Era5RetrievalError(
            f"{detail} for request '{label}' "
            f"({start_date.date()} through {end_date.date()})."
        ) from exc
    if not target.exists() or target.stat().st_size < 64:
        raise Era5RetrievalError(f"CDS retrieval produced an empty file for '{label}'.")


def _compute_features_from_files(
    *,
    paths: list[Path],
    flash_time: pd.Timestamp,
    latitude: float,
    longitude: float,
) -> _Computed:
    datasets: list[xr.Dataset] = []
    try:
        for path in paths:
            try:
                ds = _normalize_era5(xr.open_dataset(path))
            except Exception as exc:  # noqa: BLE001
                raise Era5DataError(f"Unable to open ERA5 NetCDF '{path.name}'.") from exc
            datasets.append(ds)

        recent_ds = datasets[-1]
        t2m = _nearest_point(recent_ds, _find_var(recent_ds, T2M_CANDIDATES), latitude, longitude)
        d2m = _nearest_point(recent_ds, _find_var(recent_ds, D2M_CANDIDATES), latitude, longitude)

        grid_lat = float(t2m["latitude"].values)
        grid_lon = float(t2m["longitude"].values)

        tp_frames: list[pd.DataFrame] = []
        for ds in datasets:
            tp_name = _find_var(ds, TP_CANDIDATES)
            tp = _nearest_point(ds, tp_name, latitude, longitude)
            _assert_same_grid(tp, grid_lat, grid_lon)
            tp_frames.append(_tp_frame(tp))

        _assert_same_grid(d2m, grid_lat, grid_lon)

        atm_idx, atm_time = _atmospheric_index(t2m, flash_time)
        temp_k = float(np.asarray(t2m.values).reshape(-1)[atm_idx])
        dew_k = float(np.asarray(d2m.values).reshape(-1)[atm_idx])
        # Temperature / RH / VPD keep the shared nearest-grid + latest-at-or-before path.
        # Wind uses a separate science-pipeline cell/time selection below.
        atm = atmospheric_features_from_kelvin(temp_k, dew_k, 0.0, 0.0)

        u_name = _find_var(recent_ds, U10_CANDIDATES)
        v_name = _find_var(recent_ds, V10_CANDIDATES)
        wind_ms = _extract_wind_speed_ms(
            recent_ds[u_name],
            recent_ds[v_name],
            flash_time=flash_time,
            latitude=latitude,
            longitude=longitude,
        )

        tp_raw = (
            pd.concat(tp_frames, ignore_index=True)
            .drop_duplicates(subset="time", keep="last")
            .sort_values("time")
            .reset_index(drop=True)
        )
        precip_mm = reconstruct_hourly_precip_mm(tp_raw["time"], tp_raw["tp_m"].to_numpy(dtype=float))
        tp_raw = tp_raw.assign(precip_hour_mm=precip_mm)

        p24 = _require_precip_window(tp_raw, flash_time, 24)
        p72 = _require_precip_window(tp_raw, flash_time, 72)
        p168 = _require_precip_window(tp_raw, flash_time, 168)
        # Notebook 12 Step 6: 30d feature is sum(raw tp_m * 1000), not reconstructed hourly.
        p720 = _require_raw_tp_30d_window(tp_raw, flash_time)

        features = Era5Features(
            era5_temperature_2m_c=atm.temperature_2m_c,
            era5_relative_humidity_pct=atm.relative_humidity_pct,
            era5_vpd_kpa=atm.vpd_kpa,
            era5_precip_24h_mm=p24,
            era5_precip_72h_mm=p72,
            era5_precip_168h_mm=p168,
            era5_wind_speed_10m_ms=wind_ms,
            era5_precip_30d_mm=p720,
        )
        return _Computed(
            features=features,
            grid_latitude=grid_lat,
            grid_longitude=grid_lon,
            atmospheric_timestamp_utc=timestamp_to_utc_datetime(atm_time),
        )
    finally:
        for ds in datasets:
            ds.close()


def _normalize_era5(ds: xr.Dataset) -> xr.Dataset:
    rename: dict[str, str] = {}
    if "valid_time" in ds.coords and "time" not in ds.coords:
        rename["valid_time"] = "time"
    if rename:
        ds = ds.rename(rename)
    return ds


def _find_var(ds: xr.Dataset, candidates: tuple[str, ...]) -> str:
    for candidate in candidates:
        if candidate in ds.data_vars:
            return candidate
    raise Era5DataError(
        f"Could not find any of {list(candidates)}. Available: {list(ds.data_vars)}"
    )


def _nearest_point(
    ds: xr.Dataset,
    variable: str,
    latitude: float,
    longitude: float,
) -> xr.DataArray:
    try:
        return ds[variable].sel(latitude=latitude, longitude=longitude, method="nearest").squeeze()
    except Exception as exc:  # noqa: BLE001
        raise Era5DataError(f"Failed selecting nearest ERA5 grid point for '{variable}'.") from exc


def _assert_same_grid(da: xr.DataArray, grid_lat: float, grid_lon: float) -> None:
    lat = float(da["latitude"].values)
    lon = float(da["longitude"].values)
    if not (np.isclose(lat, grid_lat) and np.isclose(lon, grid_lon)):
        raise Era5DataError(
            "ERA5 files resolved to inconsistent grid points for the same flash location."
        )


def _tp_frame(da: xr.DataArray) -> pd.DataFrame:
    times = pd.to_datetime(da["time"].values, utc=True)
    values = np.asarray(da.values, dtype=float).reshape(-1)
    if len(times) != len(values):
        raise Era5DataError("ERA5 precipitation time axis does not match data length.")
    return pd.DataFrame({"time": times, "tp_m": values})


def _atmospheric_index(
    t2m: xr.DataArray,
    flash_time: pd.Timestamp,
) -> tuple[int, pd.Timestamp]:
    era_times = pd.to_datetime(t2m["time"].values, utc=True)
    eligible = np.flatnonzero(era_times <= flash_time)
    if len(eligible) == 0:
        raise Era5CoverageError("No ERA5 atmospheric timestamp <= flash time.")
    atm_idx = int(eligible[-1])
    atm_time = pd.Timestamp(era_times[atm_idx])
    if flash_time - atm_time >= pd.Timedelta(hours=1):
        raise Era5CoverageError(
            "Latest ERA5 atmospheric timestamp is more than one hour before the flash."
        )
    return atm_idx, atm_time


def _k_nearest_coordinate_values(
    values: np.ndarray,
    target: float,
    k: int = 4,
) -> list[float]:
    """Return up to ``k`` unique coordinate values nearest to ``target``."""
    uniq = np.unique(np.asarray(values, dtype=float))
    if len(uniq) == 0:
        return []
    order = np.argsort(np.abs(uniq - float(target)))
    return [float(v) for v in uniq[order[: min(k, len(uniq))]]]


def rank_wind_candidate_cells(
    latitudes: np.ndarray,
    longitudes: np.ndarray,
    flash_lat: float,
    flash_lon: float,
    *,
    k: int = 4,
) -> list[tuple[float, float]]:
    """Rank up to 16 cells from the ``k`` nearest lats × ``k`` nearest lons.

    Distance is squared Euclidean in degrees with longitude scaled by
    ``cos(flash_latitude)`` (radians).
    """
    lat_cands = _k_nearest_coordinate_values(latitudes, flash_lat, k=k)
    lon_cands = _k_nearest_coordinate_values(longitudes, flash_lon, k=k)
    cos_lat = float(np.cos(np.deg2rad(float(flash_lat))))
    scored: list[tuple[float, float, float]] = []
    for lat in lat_cands:
        for lon in lon_cands:
            dist2 = (lat - flash_lat) ** 2 + ((lon - flash_lon) * cos_lat) ** 2
            scored.append((dist2, lat, lon))
    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    return [(lat, lon) for _, lat, lon in scored]


def nearest_abs_time_index(
    times: pd.Series | np.ndarray,
    flash_time: pd.Timestamp,
) -> int:
    """Index of the ERA timestamp with the smallest |Δt| from the flash."""
    flash_time = pd.Timestamp(flash_time)
    if flash_time.tzinfo is None:
        flash_time = flash_time.tz_localize("UTC")
    else:
        flash_time = flash_time.tz_convert("UTC")
    era_times = pd.to_datetime(times, utc=True)
    if len(era_times) == 0:
        raise Era5CoverageError("ERA5 wind time axis is empty.")
    deltas = np.abs((era_times - flash_time).total_seconds().to_numpy(dtype=float))
    return int(np.argmin(deltas))


def _squeeze_non_spatial_singletons(da: xr.DataArray) -> xr.DataArray:
    """Drop singleton dims that are not time/latitude/longitude (e.g. number, expver)."""
    keep = {"time", "latitude", "longitude"}
    for dim in list(da.dims):
        if dim not in keep and da.sizes.get(dim, 0) == 1:
            da = da.squeeze(dim, drop=True)
    return da


def _extract_wind_speed_ms(
    u_da: xr.DataArray,
    v_da: xr.DataArray,
    *,
    flash_time: pd.Timestamp,
    latitude: float,
    longitude: float,
) -> float:
    """Science-pipeline wind: ranked neighborhood cell + nearest-abs-time U/V."""
    u_da = _squeeze_non_spatial_singletons(u_da)
    v_da = _squeeze_non_spatial_singletons(v_da)
    for name, da in (("u10", u_da), ("v10", v_da)):
        missing = {"time", "latitude", "longitude"} - set(da.dims)
        if missing:
            raise Era5DataError(
                f"ERA5 wind field '{name}' missing dimensions {sorted(missing)}; "
                f"have {list(da.dims)}."
            )

    time_idx = nearest_abs_time_index(u_da["time"].values, flash_time)
    candidates = rank_wind_candidate_cells(
        np.asarray(u_da["latitude"].values, dtype=float),
        np.asarray(u_da["longitude"].values, dtype=float),
        float(latitude),
        float(longitude),
    )
    if not candidates:
        raise Era5CoverageError("No ERA5 wind grid candidates available.")

    u_at_time = u_da.isel(time=time_idx)
    v_at_time = v_da.isel(time=time_idx)
    for lat, lon in candidates:
        u_ms = float(u_at_time.sel(latitude=lat, longitude=lon).values)
        v_ms = float(v_at_time.sel(latitude=lat, longitude=lon).values)
        if np.isfinite(u_ms) and np.isfinite(v_ms):
            return wind_speed_ms(u_ms, v_ms)

    raise Era5CoverageError(
        "No finite ERA5-Land 10 m wind (u10/v10) among ranked neighbor cells "
        "at the nearest absolute timestamp."
    )


def _require_precip_window(
    tp_raw: pd.DataFrame,
    flash_time: pd.Timestamp,
    hours: int,
) -> float:
    total, n_rows, n_valid = sum_precip_window_mm(
        times=tp_raw["time"],
        precip_hour_mm=tp_raw["precip_hour_mm"].to_numpy(dtype=float),
        flash_time=flash_time,
        hours=hours,
    )
    if n_rows != hours:
        raise Era5CoverageError(
            f"{hours}-hour precipitation window contains {n_rows} hourly endpoints "
            f"(expected {hours})."
        )
    if n_valid != hours:
        raise Era5CoverageError(
            f"{hours}-hour precipitation window contains only {n_valid}/{hours} "
            "valid hourly increments."
        )
    if not np.isfinite(total):
        raise Era5CoverageError(f"{hours}-hour precipitation sum is not finite.")
    return float(total)


def _require_raw_tp_30d_window(
    tp_raw: pd.DataFrame,
    flash_time: pd.Timestamp,
) -> float:
    """Notebook 12 Step 6 construction for era5_precip_30d_mm only."""
    hours = 720
    total, n_rows, n_valid = sum_raw_tp_window_mm(
        times=tp_raw["time"],
        tp_m=tp_raw["tp_m"].to_numpy(dtype=float),
        flash_time=flash_time,
        hours=hours,
    )
    if n_rows != hours:
        raise Era5CoverageError(
            f"{hours}-hour raw-tp window contains {n_rows} ERA timestamps "
            f"(expected {hours})."
        )
    if n_valid != hours:
        raise Era5CoverageError(
            f"{hours}-hour raw-tp window contains only {n_valid}/{hours} "
            "finite tp values."
        )
    if not np.isfinite(total):
        raise Era5CoverageError(f"{hours}-hour raw-tp sum is not finite.")
    return float(total)
