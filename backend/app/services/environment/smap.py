"""NASA SMAP SPL4SMGP soil-moisture feature retrieval via Earth Engine."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from time import perf_counter

import ee
import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.services.environment.era5 import ensure_utc_timestamp, timestamp_to_utc_datetime
from app.services.environment.smap_timing import (
    SMAP_HALF_INTERVAL,
    interval_bounds,
    interval_completed_by_flash,
    latest_eligible_midpoint,
)

SMAP_COLLECTION_ID = "NASA/SMAP/SPL4SMGP/008"
SMAP_SURFACE_BAND = "sm_surface"
SMAP_ROOTZONE_BAND = "sm_rootzone"
SMAP_SCALE_METERS = 9000
SMAP_SEARCH_LOOKBACK = pd.Timedelta(hours=24)
SMAP_SEARCH_PAD = pd.Timedelta(minutes=1)


class SmapError(Exception):
    """Base SMAP service error."""


class SmapConfigError(SmapError):
    """Missing Earth Engine project / credentials / setup."""


class SmapRetrievalError(SmapError):
    """Earth Engine request or collection failure."""


class SmapCoverageError(SmapError):
    """No eligible SMAP interval or missing soil-moisture values at the point."""


@dataclass(frozen=True, slots=True)
class SmapFeatures:
    smap_surface_soil_moisture: float
    smap_rootzone_soil_moisture: float


@dataclass(frozen=True, slots=True)
class SmapResult:
    features: SmapFeatures
    midpoint_utc: datetime
    interval_start_utc: datetime
    interval_end_utc: datetime
    flash_timestamp_utc: datetime
    flash_latitude: float
    flash_longitude: float
    retrieval_seconds: float
    ee_project: str
    collection_id: str = SMAP_COLLECTION_ID


_ee_initialized_project: str | None = None


def _initialize_earth_engine(project: str) -> None:
    """Initialize EE for the configured project. Never opens interactive login."""
    global _ee_initialized_project
    project = project.strip()
    if not project:
        raise SmapConfigError(
            "EE_PROJECT is not configured. Set EE_PROJECT in backend/.env "
            "(example: lightning-ignition-research). Never commit credentials."
        )
    if _ee_initialized_project == project:
        return
    try:
        ee.Initialize(project=project)
    except Exception as exc:  # noqa: BLE001 — wrap without interactive Authenticate()
        raise SmapConfigError(
            "Earth Engine is not available for this environment. "
            "Authenticate once locally with the backend Python, then retry "
            "(production code does not call ee.Authenticate()). "
            "Also confirm EE_PROJECT is set and your account can access that project."
        ) from exc
    _ee_initialized_project = project


def fetch_smap_features(
    *,
    flash_time_utc: datetime | pd.Timestamp | str,
    latitude: float,
    longitude: float,
) -> SmapResult:
    """Retrieve the two validated SMAP soil-moisture features for a flash."""
    flash_time = ensure_utc_timestamp(flash_time_utc)
    if not np.isfinite(latitude) or not np.isfinite(longitude):
        raise SmapConfigError("Flash latitude and longitude must be finite numbers.")

    settings = get_settings()
    project = (settings.ee_project or "").strip()
    _initialize_earth_engine(project)

    t0 = perf_counter()
    eligible_midpoint = latest_eligible_midpoint(flash_time)
    eligible_midpoint_ms = int(eligible_midpoint.timestamp() * 1000)

    search_start = flash_time - SMAP_SEARCH_LOOKBACK
    search_end = flash_time + SMAP_SEARCH_PAD

    try:
        collection = (
            ee.ImageCollection(SMAP_COLLECTION_ID)
            .filterDate(
                search_start.strftime("%Y-%m-%dT%H:%M:%S"),
                search_end.strftime("%Y-%m-%dT%H:%M:%S"),
            )
            .filter(ee.Filter.lte("system:time_start", eligible_midpoint_ms))
            .sort("system:time_start", False)
        )
        count = int(collection.size().getInfo())
    except SmapError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise SmapRetrievalError("Earth Engine SMAP collection query failed.") from exc

    if count == 0:
        raise SmapCoverageError(
            "No fully completed SMAP averaging interval is available before the flash."
        )

    try:
        image = ee.Image(collection.first())
        midpoint_ms = int(image.get("system:time_start").getInfo())
    except Exception as exc:  # noqa: BLE001
        raise SmapRetrievalError("Failed reading SMAP image metadata from Earth Engine.") from exc

    midpoint = pd.to_datetime(midpoint_ms, unit="ms", utc=True)
    interval_start, interval_end = interval_bounds(midpoint)

    if not interval_completed_by_flash(midpoint, flash_time):
        raise SmapCoverageError(
            "SMAP leakage safeguard failed: selected interval extends beyond the flash."
        )
    if midpoint > eligible_midpoint:
        raise SmapCoverageError(
            "Selected SMAP midpoint is later than the latest eligible midpoint."
        )

    point = ee.Geometry.Point([float(longitude), float(latitude)])
    try:
        values = (
            image.select([SMAP_SURFACE_BAND, SMAP_ROOTZONE_BAND])
            .reduceRegion(
                reducer=ee.Reducer.first(),
                geometry=point,
                scale=SMAP_SCALE_METERS,
                bestEffort=False,
                maxPixels=100,
            )
            .getInfo()
        )
    except Exception as exc:  # noqa: BLE001
        raise SmapRetrievalError("Earth Engine SMAP reduceRegion extraction failed.") from exc

    if not isinstance(values, dict):
        raise SmapRetrievalError("Earth Engine returned an unexpected SMAP reduceRegion payload.")

    surface_raw = values.get(SMAP_SURFACE_BAND)
    rootzone_raw = values.get(SMAP_ROOTZONE_BAND)
    surface = float(surface_raw) if surface_raw is not None else float("nan")
    rootzone = float(rootzone_raw) if rootzone_raw is not None else float("nan")

    if not np.isfinite(surface):
        raise SmapCoverageError(
            "SMAP surface soil moisture is missing at the flash coordinate "
            "(no interpolation or imputation)."
        )
    if not np.isfinite(rootzone):
        raise SmapCoverageError(
            "SMAP root-zone soil moisture is missing at the flash coordinate "
            "(no interpolation or imputation)."
        )
    if not (0.0 <= surface <= 1.0):
        raise SmapRetrievalError(f"Unexpected SMAP surface soil-moisture value: {surface}")
    if not (0.0 <= rootzone <= 1.0):
        raise SmapRetrievalError(f"Unexpected SMAP root-zone soil-moisture value: {rootzone}")

    elapsed = perf_counter() - t0
    return SmapResult(
        features=SmapFeatures(
            smap_surface_soil_moisture=surface,
            smap_rootzone_soil_moisture=rootzone,
        ),
        midpoint_utc=timestamp_to_utc_datetime(midpoint),
        interval_start_utc=timestamp_to_utc_datetime(interval_start),
        interval_end_utc=timestamp_to_utc_datetime(interval_end),
        flash_timestamp_utc=timestamp_to_utc_datetime(flash_time),
        flash_latitude=latitude,
        flash_longitude=longitude,
        retrieval_seconds=elapsed,
        ee_project=project,
    )


# Re-export timing constant for tests / callers that need the frozen half-interval.
HALF_INTERVAL_MINUTES = int(SMAP_HALF_INTERVAL.total_seconds() // 60)
