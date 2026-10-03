"""Display-only Sentinel-2 true-color retrieval for one selected flash.

Reproduces the feasibility reference: Sentinel-2 surface reflectance linked to
Cloud Score+, newest pre-flash scene at the flash point with clarity >= 0.60,
then a masked B4/B3/B2 thumbnail. The image footprint is slightly wider than the
exact 10 km surveillance circle so that circle is not cropped.

MODIS remains the model's vegetation source. Nothing in this module is a
model feature.
"""

from __future__ import annotations

import base64
import math
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime

import ee

from app.core.config import get_settings
from app.services.environment.ee_client import (
    EarthEngineConfigError,
    initialize_earth_engine,
)
from app.services.imagery.sentinel_selection import (
    CLARITY_MAX_PIXELS,
    CLARITY_SCALE_M,
    CLEAR_THRESHOLD,
    CLOUD_SCORE_BAND,
    CLOUD_SCORE_COLLECTION,
    LOOKBACK_DAYS,
    S2_COLLECTION,
    SEARCH_BUFFER_M,
    SURVEILLANCE_FRAME_RADIUS_M,
    SURVEILLANCE_RADIUS_KM,
    THUMB_MAX_DIMENSION,
    TRUE_COLOR_BANDS,
    UNAVAILABLE_MESSAGE,
    VIS_GAMMA,
    VIS_MAX,
    VIS_MIN,
    SceneCandidate,
    png_dimensions,
    pre_flash_search_window,
    require_utc,
    select_qualifying_scene,
)


class SentinelError(Exception):
    """Base Sentinel visualization error."""


class SentinelConfigError(SentinelError, EarthEngineConfigError):
    """Earth Engine project or credentials are not available."""


class SentinelRetrievalError(SentinelError):
    """Earth Engine or thumbnail retrieval failed. Analysis results are untouched."""


@dataclass(frozen=True, slots=True)
class SentinelBounds:
    west: float
    south: float
    east: float
    north: float


@dataclass(frozen=True, slots=True)
class SentinelSurveillance:
    status: str
    flash_lat: float
    flash_lon: float
    flash_timestamp_utc: datetime
    surveillance_radius_km: float
    lookback_days: int
    clear_threshold: float
    message: str | None = None
    image_png_base64: str | None = None
    image_width: int | None = None
    image_height: int | None = None
    bounds: SentinelBounds | None = None
    acquired_utc: datetime | None = None
    hours_before_flash: float | None = None
    point_clarity: float | None = None
    scene_cloud_pct: float | None = None


def _bounds_from_geometry(geometry: dict) -> SentinelBounds:
    coordinates = geometry.get("coordinates") or []
    ring = coordinates[0] if coordinates else []
    lons = [float(pair[0]) for pair in ring]
    lats = [float(pair[1]) for pair in ring]
    if not lons or not lats:
        raise SentinelRetrievalError("Sentinel-2 thumbnail region had no bounds.")
    return SentinelBounds(
        west=min(lons),
        south=min(lats),
        east=max(lons),
        north=max(lats),
    )


def _download_png(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
    except Exception as exc:
        raise SentinelRetrievalError(
            "Sentinel-2 imagery could not be retrieved. Flash analysis is unchanged."
        ) from exc
    if not data:
        raise SentinelRetrievalError(
            "Sentinel-2 imagery could not be retrieved. Flash analysis is unchanged."
        )
    return data


def _optional_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number):
            return None
        return number
    return None


def retrieve_sentinel_surveillance(
    *,
    flash_lat: float,
    flash_lon: float,
    flash_timestamp_utc: datetime,
) -> SentinelSurveillance:
    """Find and render the newest clear pre-flash Sentinel-2 view, or report none."""
    flash_utc = require_utc(flash_timestamp_utc)
    base = SentinelSurveillance(
        status="unavailable",
        flash_lat=float(flash_lat),
        flash_lon=float(flash_lon),
        flash_timestamp_utc=flash_utc,
        surveillance_radius_km=float(SURVEILLANCE_RADIUS_KM),
        lookback_days=LOOKBACK_DAYS,
        clear_threshold=CLEAR_THRESHOLD,
        message=UNAVAILABLE_MESSAGE,
    )

    project = (get_settings().ee_project or "").strip()
    try:
        initialize_earth_engine(project)
    except EarthEngineConfigError as exc:
        raise SentinelConfigError(str(exc)) from exc

    try:
        point = ee.Geometry.Point([float(flash_lon), float(flash_lat)])
        search_region = point.buffer(SEARCH_BUFFER_M)
        vis_region = point.buffer(SURVEILLANCE_FRAME_RADIUS_M).bounds()
        start_day, end_day = pre_flash_search_window(flash_utc)
        window_start = ee.Date(start_day.isoformat())
        window_end = ee.Date(end_day.isoformat())

        collection = (
            ee.ImageCollection(S2_COLLECTION)
            .filterBounds(search_region)
            .filterDate(window_start, window_end)
            .linkCollection(ee.ImageCollection(CLOUD_SCORE_COLLECTION), [CLOUD_SCORE_BAND])
        )
        count = int(collection.size().getInfo())
        if count <= 0:
            return base

        # Newest first, then stop at the first scene the shared selector accepts.
        images = collection.sort("system:time_start", False).toList(count)
        selected: SceneCandidate | None = None
        selected_image: ee.Image | None = None

        for index in range(count):
            img = ee.Image(images.get(index))
            clear_value = (
                img.select(CLOUD_SCORE_BAND)
                .reduceRegion(
                    reducer=ee.Reducer.first(),
                    geometry=point,
                    scale=CLARITY_SCALE_M,
                    bestEffort=False,
                    maxPixels=CLARITY_MAX_PIXELS,
                )
                .get(CLOUD_SCORE_BAND)
                .getInfo()
            )
            clarity = _optional_float(clear_value)
            if clarity is None:
                continue
            acquired_ms = img.get("system:time_start").getInfo()
            if acquired_ms is None:
                continue
            acquired = datetime.fromtimestamp(float(acquired_ms) / 1000, tz=UTC)
            cloud_pct = _optional_float(img.get("CLOUDY_PIXEL_PERCENTAGE").getInfo())
            candidate = SceneCandidate(
                acquired_utc=acquired,
                point_clarity=clarity,
                scene_cloud_pct=cloud_pct,
            )
            if select_qualifying_scene((candidate,), flash_utc) is None:
                continue
            selected = candidate
            selected_image = img
            break

        if selected is None or selected_image is None:
            return base
        clear_mask = selected_image.select(CLOUD_SCORE_BAND).gte(CLEAR_THRESHOLD)
        rgb = selected_image.updateMask(clear_mask).select(list(TRUE_COLOR_BANDS))
        url = rgb.getThumbURL(
            {
                "region": vis_region,
                "dimensions": THUMB_MAX_DIMENSION,
                "format": "png",
                "min": VIS_MIN,
                "max": VIS_MAX,
                "gamma": VIS_GAMMA,
            }
        )
        png = _download_png(url)
        width, height = png_dimensions(png)
        bounds = _bounds_from_geometry(vis_region.getInfo())
        hours = (flash_utc - require_utc(selected.acquired_utc)).total_seconds() / 3600
    except SentinelError:
        raise
    except EarthEngineConfigError as exc:
        raise SentinelConfigError(str(exc)) from exc
    except Exception as exc:
        raise SentinelRetrievalError(
            "Sentinel-2 imagery could not be retrieved. Flash analysis is unchanged."
        ) from exc

    return SentinelSurveillance(
        status="available",
        flash_lat=float(flash_lat),
        flash_lon=float(flash_lon),
        flash_timestamp_utc=flash_utc,
        surveillance_radius_km=float(SURVEILLANCE_RADIUS_KM),
        lookback_days=LOOKBACK_DAYS,
        clear_threshold=CLEAR_THRESHOLD,
        image_png_base64=base64.b64encode(png).decode("ascii"),
        image_width=width,
        image_height=height,
        bounds=bounds,
        acquired_utc=require_utc(selected.acquired_utc),
        hours_before_flash=hours,
        point_clarity=float(selected.point_clarity) if selected.point_clarity is not None else None,
        scene_cloud_pct=selected.scene_cloud_pct,
    )
