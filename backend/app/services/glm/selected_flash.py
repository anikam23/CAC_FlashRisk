"""Selected-flash GLM reconstruction from a single NOAA GOES-18 granule.

Behavior mirrors reference/glm/glm_selected_flash_reference.py.
This module does not import the reference file at runtime.
"""

from __future__ import annotations

import logging
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import s3fs
import xarray as xr

from app.services.glm.search import (
    GLM_PRODUCT,
    GOES_BUCKET,
    GOES_TIME_RE,
    GlmSearchError,
    _ensure_utc_timestamp,
    _to_utc_datetime,
    parse_goes_timestamp,
)

logger = logging.getLogger(__name__)

SOURCE_FILE_RE = re.compile(
    r"^OR_GLM-L2-LCFA_G18_s\d{14}_e\d{14}_c\d{14}\.nc$"
)


class GlmFlashNotFoundError(ValueError):
    """Raised when the requested flash_id is absent from the granule."""


@dataclass(frozen=True, slots=True)
class GlmGroup:
    group_id: int
    group_lat: float
    group_lon: float
    animation_offset_ms: float
    group_area: float
    group_energy: float
    event_count: int


@dataclass(frozen=True, slots=True)
class GlmEvent:
    event_id: int
    parent_group_id: int
    event_lat: float
    event_lon: float
    animation_offset_ms: float
    event_energy: float


@dataclass(frozen=True, slots=True)
class GlmFlashReconstruction:
    global_flash_id: str
    source_file: str
    flash_id: int
    flash_lat: float
    flash_lon: float
    flash_first_event_frame_time: datetime
    flash_last_event_frame_time: datetime
    animation_start_time: datetime
    animation_end_ms: float
    flash_energy: float
    flash_area: float
    flash_duration_ms: float
    max_group_area: float
    max_group_energy: float
    group_count: int
    max_events_per_group: int
    total_events: int
    groups: list[GlmGroup]
    events: list[GlmEvent]


def s3_path_for_source_file(source_file: str) -> str:
    """Derive the NOAA anonymous S3 key from a GOES GLM LCFA filename."""
    name = Path(source_file).name
    if not SOURCE_FILE_RE.match(name):
        raise ValueError(f"Invalid GLM source_file name: {name}")

    match = GOES_TIME_RE.search(name)
    if match is None:
        raise ValueError(f"Could not parse GLM filename timestamps: {name}")

    start = parse_goes_timestamp(match.group(1))
    year = int(start.year)
    doy = int(start.dayofyear)
    hour = int(start.hour)
    return f"{GOES_BUCKET}/{GLM_PRODUCT}/{year}/{doy:03d}/{hour:02d}/{name}"


def _relative_ms(timestamp: pd.Timestamp, anchor: pd.Timestamp) -> float:
    return (timestamp - anchor).total_seconds() * 1000.0


def _flat(ds: xr.Dataset, name: str) -> np.ndarray:
    return np.asarray(ds[name].values).reshape(-1)


def _numeric(ds: xr.Dataset, name: str) -> np.ndarray:
    return pd.to_numeric(
        pd.Series(_flat(ds, name)),
        errors="coerce",
    ).to_numpy()


def extract_selected_flash(
    source_file: str,
    flash_id: int,
    *,
    filesystem: s3fs.S3FileSystem | None = None,
) -> GlmFlashReconstruction:
    """Download one GLM granule and extract a single physical flash."""
    name = Path(source_file).name
    s3_path = s3_path_for_source_file(name)
    fs = filesystem or s3fs.S3FileSystem(anon=True)

    tmp_dir = Path(tempfile.mkdtemp(prefix="flashrisk_selected_flash_"))
    local_path = tmp_dir / name

    try:
        try:
            fs.get(s3_path, str(local_path))
        except FileNotFoundError as exc:
            raise GlmSearchError(
                f"GLM granule not found in the NOAA archive: {name}"
            ) from exc
        except Exception as exc:
            raise GlmSearchError(
                f"Failed to download GLM granule {name}: {exc}"
            ) from exc

        try:
            with xr.open_dataset(
                local_path,
                decode_times=True,
                mask_and_scale=True,
            ) as ds:
                return _extract_from_dataset(ds, name, flash_id)
        except (GlmFlashNotFoundError, ValueError, KeyError):
            raise
        except Exception as exc:
            raise GlmSearchError(
                f"Failed to read GLM granule {name}: {exc}"
            ) from exc
    finally:
        if local_path.exists():
            local_path.unlink(missing_ok=True)
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _extract_from_dataset(
    ds: xr.Dataset,
    source_file: str,
    flash_id: int,
) -> GlmFlashReconstruction:
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
        "group_lat",
        "group_lon",
        "group_energy",
        "group_area",
        "group_time_offset",
        "event_id",
        "event_parent_group_id",
        "event_lat",
        "event_lon",
        "event_energy",
        "event_time_offset",
    ]
    missing = [name for name in required if name not in ds.variables]
    if missing:
        raise KeyError("Missing required GLM variables: " + ", ".join(missing))

    flash_ids = _numeric(ds, "flash_id")
    flash_idx = np.flatnonzero(flash_ids == flash_id)
    if len(flash_idx) != 1:
        raise GlmFlashNotFoundError(
            f"Expected exactly one flash with ID {flash_id}, found {len(flash_idx)}"
        )
    fi = int(flash_idx[0])

    flash_first_event_frame_time = _ensure_utc_timestamp(
        _flat(ds, "flash_frame_time_offset_of_first_event")[fi]
    )
    flash_last_event_frame_time = _ensure_utc_timestamp(
        _flat(ds, "flash_frame_time_offset_of_last_event")[fi]
    )
    # MODEL FEATURE — not replaced by animation timing.
    flash_duration_ms = (
        flash_last_event_frame_time - flash_first_event_frame_time
    ).total_seconds() * 1000.0

    flash_lat = float(_flat(ds, "flash_lat")[fi])
    flash_lon = float(_flat(ds, "flash_lon")[fi])
    flash_energy = float(_flat(ds, "flash_energy")[fi])
    flash_area = float(_flat(ds, "flash_area")[fi])

    group_ids = _numeric(ds, "group_id")
    group_parent_flash = _numeric(ds, "group_parent_flash_id")
    group_idx = np.flatnonzero(group_parent_flash == flash_id)
    if len(group_idx) == 0:
        raise ValueError("Selected flash contains no groups.")
    selected_group_ids = group_ids[group_idx]

    event_ids = _numeric(ds, "event_id")
    event_parent_group = _numeric(ds, "event_parent_group_id")
    event_idx = np.flatnonzero(np.isin(event_parent_group, selected_group_ids))
    if len(event_idx) == 0:
        raise ValueError("Selected flash contains no events.")

    group_time_raw = _flat(ds, "group_time_offset")
    event_time_raw = _flat(ds, "event_time_offset")
    selected_group_times = [
        _ensure_utc_timestamp(group_time_raw[gi]) for gi in group_idx
    ]
    selected_event_times = [
        _ensure_utc_timestamp(event_time_raw[ei]) for ei in event_idx
    ]

    # Visual animation anchor = earliest actual event of this flash.
    animation_start_time = min(selected_event_times)

    group_lat = _flat(ds, "group_lat")
    group_lon = _flat(ds, "group_lon")
    group_energy = _flat(ds, "group_energy")
    group_area = _flat(ds, "group_area")

    group_rows: list[GlmGroup] = []
    for position, gi in enumerate(group_idx):
        gid = int(group_ids[gi])
        gtime = selected_group_times[position]
        n_events = int(np.count_nonzero(event_parent_group == gid))
        group_rows.append(
            GlmGroup(
                group_id=gid,
                group_lat=float(group_lat[gi]),
                group_lon=float(group_lon[gi]),
                animation_offset_ms=_relative_ms(gtime, animation_start_time),
                group_area=float(group_area[gi]),
                group_energy=float(group_energy[gi]),
                event_count=n_events,
            )
        )
    group_rows.sort(key=lambda row: (row.animation_offset_ms, row.group_id))

    event_lat = _flat(ds, "event_lat")
    event_lon = _flat(ds, "event_lon")
    event_energy = _flat(ds, "event_energy")

    event_rows: list[GlmEvent] = []
    for position, ei in enumerate(event_idx):
        etime = selected_event_times[position]
        event_rows.append(
            GlmEvent(
                event_id=int(event_ids[ei]),
                parent_group_id=int(event_parent_group[ei]),
                event_lat=float(event_lat[ei]),
                event_lon=float(event_lon[ei]),
                animation_offset_ms=_relative_ms(etime, animation_start_time),
                event_energy=float(event_energy[ei]),
            )
        )
    event_rows.sort(key=lambda row: (row.animation_offset_ms, row.event_id))

    max_group_area = float(max(row.group_area for row in group_rows))
    max_group_energy = float(max(row.group_energy for row in group_rows))
    group_count = len({row.group_id for row in group_rows})
    max_events_per_group = int(max(row.event_count for row in group_rows))
    total_events = len(event_rows)
    animation_end_ms = float(max(row.animation_offset_ms for row in event_rows))

    return GlmFlashReconstruction(
        global_flash_id=f"{source_file}::{flash_id}",
        source_file=source_file,
        flash_id=flash_id,
        flash_lat=flash_lat,
        flash_lon=flash_lon,
        flash_first_event_frame_time=_to_utc_datetime(flash_first_event_frame_time),
        flash_last_event_frame_time=_to_utc_datetime(flash_last_event_frame_time),
        animation_start_time=_to_utc_datetime(animation_start_time),
        animation_end_ms=animation_end_ms,
        flash_energy=flash_energy,
        flash_area=flash_area,
        flash_duration_ms=float(flash_duration_ms),
        max_group_area=max_group_area,
        max_group_energy=max_group_energy,
        group_count=group_count,
        max_events_per_group=max_events_per_group,
        total_events=total_events,
        groups=group_rows,
        events=event_rows,
    )
