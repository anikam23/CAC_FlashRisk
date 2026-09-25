"""GOES-18 GLM flash search against the NOAA anonymous S3 archive.

Behavior mirrors reference/glm/glm_search_reference.py (validated parity case).
This module is the production adaptation — it does not import the reference file.
"""

from __future__ import annotations

import logging
import math
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import s3fs
import xarray as xr

logger = logging.getLogger(__name__)

GOES_BUCKET = "noaa-goes18"
GLM_PRODUCT = "GLM-L2-LCFA"

GOES_TIME_RE = re.compile(r"_s(\d{14})_e(\d{14})_")

ALLOWED_WINDOW_MINUTES = frozenset({15, 30, 60})
ALLOWED_RADIUS_KM = frozenset({5, 10, 25})

# GLM LCFA archive lag: latest selectable search day is current UTC date minus this.
ARCHIVE_LAG_DAYS = 4
# Earliest selectable search day relative to current UTC date.
ARCHIVE_LOOKBACK_DAYS = 365


class GlmSearchError(Exception):
    """Raised when the GLM archive cannot be queried or a granule cannot be processed."""


@dataclass(frozen=True, slots=True)
class GlmFlash:
    global_flash_id: str
    source_file: str
    flash_id: int
    flash_start_time: datetime
    flash_end_time: datetime
    flash_lat: float
    flash_lon: float
    distance_km: float
    flash_energy: float
    flash_area: float
    flash_duration_ms: float
    max_group_area: float
    max_group_energy: float
    group_count: int
    max_events_per_group: int
    total_events: int


@dataclass(frozen=True, slots=True)
class GlmSearchResult:
    flashes: list[GlmFlash]
    window_start: datetime
    window_end: datetime
    granules_listed: int
    granules_selected: int
    granules_downloaded: int


def archive_date_bounds(now_utc: datetime | None = None) -> tuple[datetime, datetime]:
    """Inclusive UTC calendar-day bounds for selectable search dates."""
    now = now_utc or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    else:
        now = now.astimezone(UTC)

    today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    latest = today - timedelta(days=ARCHIVE_LAG_DAYS)
    earliest = today - timedelta(days=ARCHIVE_LOOKBACK_DAYS)
    return earliest, latest


def centered_window(
    search_datetime_utc: datetime,
    window_minutes: int,
) -> tuple[datetime, datetime]:
    half = timedelta(minutes=window_minutes / 2)
    return search_datetime_utc - half, search_datetime_utc + half


def numeric(arr: object) -> np.ndarray:
    return pd.to_numeric(
        pd.Series(np.asarray(arr).reshape(-1)),
        errors="coerce",
    ).to_numpy()


def vals(ds: xr.Dataset, name: str) -> np.ndarray:
    return np.asarray(ds[name].values).reshape(-1)


def glm_prefix(dt: datetime) -> str:
    doy = dt.timetuple().tm_yday
    return f"{GOES_BUCKET}/{GLM_PRODUCT}/{dt.year}/{doy:03d}/{dt.hour:02d}/"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0088

    lat1_r = math.radians(lat1)
    lon1_r = math.radians(lon1)
    lat2_r = math.radians(lat2)
    lon2_r = math.radians(lon2)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def parse_goes_timestamp(value: str) -> pd.Timestamp:
    # First 13 digits: YYYY + DDD + HH + MM + SS; final digit = tenths of a second.
    base = pd.to_datetime(value[:13], format="%Y%j%H%M%S", utc=True)
    tenth = int(value[13])
    return base + pd.Timedelta(milliseconds=100 * tenth)


def granule_time_range(s3_path: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    filename = Path(s3_path).name
    match = GOES_TIME_RE.search(filename)
    if match is None:
        raise ValueError(f"Could not parse GLM filename: {filename}")
    start = parse_goes_timestamp(match.group(1))
    end = parse_goes_timestamp(match.group(2))
    return start, end


def granule_overlaps_window(
    s3_path: str,
    window_start: pd.Timestamp,
    window_end: pd.Timestamp,
) -> bool:
    granule_start, granule_end = granule_time_range(s3_path)
    return granule_end >= window_start and granule_start <= window_end


def _ensure_utc_timestamp(value: object) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        return ts.tz_localize("UTC")
    return ts.tz_convert("UTC")


def _to_utc_datetime(ts: pd.Timestamp) -> datetime:
    # Floor to microseconds so datetime conversion does not warn on leftover ns.
    return ts.floor("us").to_pydatetime()


def search_glm_flashes(
    latitude: float,
    longitude: float,
    search_datetime_utc: datetime,
    window_minutes: int = 30,
    radius_km: float = 25,
    *,
    filesystem: s3fs.S3FileSystem | None = None,
) -> GlmSearchResult:
    if window_minutes not in ALLOWED_WINDOW_MINUTES:
        raise ValueError(
            f"window_minutes must be one of {sorted(ALLOWED_WINDOW_MINUTES)}"
        )
    if radius_km not in ALLOWED_RADIUS_KM:
        raise ValueError(f"radius_km must be one of {sorted(ALLOWED_RADIUS_KM)}")

    search_ts = _ensure_utc_timestamp(search_datetime_utc)
    window_start, window_end = centered_window(search_ts.to_pydatetime(), window_minutes)
    window_start_ts = pd.Timestamp(window_start)
    window_end_ts = pd.Timestamp(window_end)

    first_hour = window_start_ts.floor("h")
    last_hour = window_end_ts.floor("h")
    hours = pd.date_range(first_hour, last_hour, freq="h", tz="UTC")

    fs = filesystem or s3fs.S3FileSystem(anon=True)

    all_candidate_files: list[str] = []
    try:
        for hour in hours:
            prefix = glm_prefix(hour.to_pydatetime())
            try:
                hour_files = sorted(f for f in fs.ls(prefix) if f.endswith(".nc"))
            except FileNotFoundError:
                hour_files = []
            except Exception as exc:
                raise GlmSearchError(
                    f"Failed to list GLM archive hour {prefix}: {exc}"
                ) from exc
            all_candidate_files.extend(hour_files)
    except GlmSearchError:
        raise
    except Exception as exc:
        raise GlmSearchError(f"Failed to query the GLM archive: {exc}") from exc

    all_candidate_files = list(dict.fromkeys(all_candidate_files))

    selected_files: list[str] = []
    for s3_path in all_candidate_files:
        try:
            if granule_overlaps_window(s3_path, window_start_ts, window_end_ts):
                selected_files.append(s3_path)
        except ValueError:
            logger.warning("Skipping unparseable GLM path: %s", s3_path)

    tmp_dir = Path(tempfile.mkdtemp(prefix="flashrisk_glm_search_"))
    flashes: list[GlmFlash] = []
    files_downloaded = 0

    try:
        for s3_path in selected_files:
            local_path = tmp_dir / Path(s3_path).name
            try:
                fs.get(s3_path, str(local_path))
                files_downloaded += 1
            except Exception as exc:
                raise GlmSearchError(
                    f"Failed to download GLM granule {Path(s3_path).name}: {exc}"
                ) from exc

            try:
                with xr.open_dataset(
                    local_path,
                    decode_times=True,
                    mask_and_scale=True,
                ) as ds:
                    required = [
                        "flash_id",
                        "flash_lat",
                        "flash_lon",
                        "flash_energy",
                        "flash_area",
                        "flash_frame_time_offset_of_first_event",
                        "flash_frame_time_offset_of_last_event",
                        "group_id",
                        "group_parent_flash_id",
                        "group_area",
                        "group_energy",
                        "event_parent_group_id",
                    ]
                    if any(name not in ds.variables for name in required):
                        continue

                    flash_ids = numeric(vals(ds, "flash_id"))
                    flash_lat_arr = vals(ds, "flash_lat")
                    flash_lon_arr = vals(ds, "flash_lon")
                    flash_energy_arr = vals(ds, "flash_energy")
                    flash_area_arr = vals(ds, "flash_area")
                    flash_start_arr = vals(
                        ds, "flash_frame_time_offset_of_first_event"
                    )
                    flash_end_arr = vals(ds, "flash_frame_time_offset_of_last_event")

                    group_ids = numeric(vals(ds, "group_id"))
                    group_parent = numeric(vals(ds, "group_parent_flash_id"))
                    group_area_arr = vals(ds, "group_area")
                    group_energy_arr = vals(ds, "group_energy")
                    event_parent = numeric(vals(ds, "event_parent_group_id"))

                    for idx in range(len(flash_ids)):
                        flash_lat = float(flash_lat_arr[idx])
                        flash_lon = float(flash_lon_arr[idx])

                        distance_km = haversine_km(
                            latitude, longitude, flash_lat, flash_lon
                        )
                        if distance_km > radius_km:
                            continue

                        start = _ensure_utc_timestamp(flash_start_arr[idx])
                        end = _ensure_utc_timestamp(flash_end_arr[idx])

                        if not (window_start_ts <= start <= window_end_ts):
                            continue

                        duration_ms = (end - start).total_seconds() * 1000.0
                        native_id = float(flash_ids[idx])
                        gidx = np.flatnonzero(group_parent == native_id)
                        if len(gidx) == 0:
                            continue

                        focal_group_ids = group_ids[gidx]
                        event_counts: list[int] = []
                        total_events = 0
                        for gid in focal_group_ids:
                            n_events = int(np.count_nonzero(event_parent == gid))
                            event_counts.append(n_events)
                            total_events += n_events

                        source_file = Path(s3_path).name
                        flashes.append(
                            GlmFlash(
                                global_flash_id=f"{source_file}::{int(native_id)}",
                                source_file=source_file,
                                flash_id=int(native_id),
                                flash_start_time=_to_utc_datetime(start),
                                flash_end_time=_to_utc_datetime(end),
                                flash_lat=flash_lat,
                                flash_lon=flash_lon,
                                distance_km=float(distance_km),
                                flash_energy=float(flash_energy_arr[idx]),
                                flash_area=float(flash_area_arr[idx]),
                                flash_duration_ms=float(duration_ms),
                                max_group_area=float(np.max(group_area_arr[gidx])),
                                max_group_energy=float(np.max(group_energy_arr[gidx])),
                                group_count=len(np.unique(focal_group_ids)),
                                max_events_per_group=int(np.max(event_counts)),
                                total_events=int(total_events),
                            )
                        )
            finally:
                if local_path.exists():
                    local_path.unlink()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    flashes.sort(key=lambda flash: (flash.flash_start_time, flash.distance_km))

    return GlmSearchResult(
        flashes=flashes,
        window_start=window_start
        if window_start.tzinfo
        else window_start.replace(tzinfo=UTC),
        window_end=window_end
        if window_end.tzinfo
        else window_end.replace(tzinfo=UTC),
        granules_listed=len(all_candidate_files),
        granules_selected=len(selected_files),
        granules_downloaded=files_downloaded,
    )
