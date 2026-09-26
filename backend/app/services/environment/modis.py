"""MODIS MOD09GA NDWI + NDVI feature retrieval via Earth Engine.

Reproduces the frozen Notebook 10 (NDWI) and Notebook 12 (NDVI) methods
from the deployment reference — no redesign.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from time import perf_counter

import ee
import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.services.environment.ee_client import EarthEngineConfigError, initialize_earth_engine
from app.services.environment.era5 import ensure_utc_timestamp, timestamp_to_utc_datetime
from app.services.environment.modis_helpers import (
    MAX_LOOKBACK_DAYS,
    MODIS_COLLECTION,
    MODIS_SCALE_METERS,
    REFLECTANCE_SCALE,
    flash_calendar_date_utc,
    is_finite_index,
    lookback_dates,
)


class ModisError(Exception):
    """Base MODIS service error."""


class ModisConfigError(ModisError, EarthEngineConfigError):
    """Missing Earth Engine project / credentials / setup."""


class ModisRetrievalError(ModisError):
    """Earth Engine request or unexpected MOD09GA structure."""


class ModisCoverageError(ModisError):
    """No QA-valid finite NDWI/NDVI observation in D-1..D-16."""


@dataclass(frozen=True, slots=True)
class ModisFeatures:
    modis_ndwi: float
    modis_ndvi: float


@dataclass(frozen=True, slots=True)
class ModisResult:
    features: ModisFeatures
    ndwi_observation_date: date
    ndvi_observation_date: date
    flash_timestamp_utc: datetime
    flash_latitude: float
    flash_longitude: float
    retrieval_seconds: float
    ee_project: str
    collection_id: str = MODIS_COLLECTION
    scale_meters: float = MODIS_SCALE_METERS


def _bits(image: ee.Image, start: int, end: int | None = None) -> ee.Image:
    """Extract inclusive QA bit range (frozen helper)."""
    if end is None:
        end = start
    width = end - start + 1
    mask = (1 << width) - 1
    return image.rightShift(start).bitwiseAnd(mask)


def _build_state_mask(image: ee.Image) -> ee.Image:
    """Frozen Notebook 10/12 state_1km QA conditions."""
    state = image.select("state_1km")
    cloud_state = _bits(state, 0, 1)
    cloud_shadow = _bits(state, 2)
    cirrus = _bits(state, 8, 9)
    internal_cloud = _bits(state, 10)
    snow_ice = _bits(state, 12)
    adjacent_cloud = _bits(state, 13)
    internal_snow = _bits(state, 15)
    return (
        cloud_state.eq(0)
        .And(cloud_shadow.eq(0))
        .And(cirrus.eq(0))
        .And(internal_cloud.eq(0))
        .And(snow_ice.eq(0))
        .And(adjacent_cloud.eq(0))
        .And(internal_snow.eq(0))
    )


def _build_modland_mask(image: ee.Image) -> ee.Image:
    """MODLAND QA bits 0-1 must indicate ideal quality."""
    qc = image.select("QC_500m")
    modland_qa = _bits(qc, 0, 1)
    return modland_qa.eq(0)


def _band_quality_mask(image: ee.Image, start_bit: int, end_bit: int) -> ee.Image:
    """MOD09GA per-band quality nibble; frozen pipeline requires quality code 0."""
    qc = image.select("QC_500m")
    return _bits(qc, start_bit, end_bit).eq(0)


def _extract_ndwi_from_image(image: ee.Image, point: ee.Geometry) -> float | None:
    state_mask = _build_state_mask(image)
    modland_mask = _build_modland_mask(image)
    # band 4 -> bits 14-17; band 6 -> bits 22-25
    band4_quality = _band_quality_mask(image, 14, 17)
    band6_quality = _band_quality_mask(image, 22, 25)

    green = image.select("sur_refl_b04").multiply(REFLECTANCE_SCALE)
    swir = image.select("sur_refl_b06").multiply(REFLECTANCE_SCALE)
    valid_reflectance = green.gte(0).And(swir.gte(0)).And(green.add(swir).gt(0))
    mask = (
        state_mask.And(modland_mask)
        .And(band4_quality)
        .And(band6_quality)
        .And(valid_reflectance)
    )
    ndwi = (
        green.subtract(swir)
        .divide(green.add(swir))
        .rename("modis_ndwi")
        .updateMask(mask)
    )
    result = ndwi.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=point,
        scale=MODIS_SCALE_METERS,
        bestEffort=False,
        maxPixels=100,
    ).getInfo()
    return result.get("modis_ndwi")


def _extract_ndvi_from_image(image: ee.Image, point: ee.Geometry) -> float | None:
    state_mask = _build_state_mask(image)
    modland_mask = _build_modland_mask(image)
    # band 1 -> bits 2-5; band 2 -> bits 6-9
    band1_quality = _band_quality_mask(image, 2, 5)
    band2_quality = _band_quality_mask(image, 6, 9)

    red = image.select("sur_refl_b01").multiply(REFLECTANCE_SCALE)
    nir = image.select("sur_refl_b02").multiply(REFLECTANCE_SCALE)
    valid_reflectance = red.gte(0).And(nir.gte(0)).And(red.add(nir).gt(0))
    mask = (
        state_mask.And(modland_mask)
        .And(band1_quality)
        .And(band2_quality)
        .And(valid_reflectance)
    )
    ndvi = (
        nir.subtract(red)
        .divide(nir.add(red))
        .rename("modis_ndvi")
        .updateMask(mask)
    )
    result = ndvi.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=point,
        scale=MODIS_SCALE_METERS,
        bestEffort=False,
        maxPixels=100,
    ).getInfo()
    return result.get("modis_ndvi")


def fetch_modis_features(
    *,
    flash_time_utc: datetime | pd.Timestamp | str,
    latitude: float,
    longitude: float,
) -> ModisResult:
    """Retrieve frozen MODIS NDWI + NDVI features for a flash (independent dates)."""
    flash_time = ensure_utc_timestamp(flash_time_utc)
    if not np.isfinite(latitude) or not np.isfinite(longitude):
        raise ModisConfigError("Flash latitude and longitude must be finite numbers.")

    settings = get_settings()
    try:
        project = initialize_earth_engine(settings.ee_project or "")
    except EarthEngineConfigError as exc:
        raise ModisConfigError(str(exc)) from exc

    t0 = perf_counter()
    point = ee.Geometry.Point([float(longitude), float(latitude)])
    collection = ee.ImageCollection(MODIS_COLLECTION)
    flash_date = flash_calendar_date_utc(flash_time)

    selected_ndwi: float | None = None
    selected_ndwi_date: pd.Timestamp | None = None
    selected_ndvi: float | None = None
    selected_ndvi_date: pd.Timestamp | None = None

    for target_date in lookback_dates(flash_time):
        next_date = target_date + pd.Timedelta(days=1)
        try:
            daily = collection.filterDate(
                target_date.strftime("%Y-%m-%d"),
                next_date.strftime("%Y-%m-%d"),
            ).filterBounds(point)
            count = int(daily.size().getInfo())
        except Exception as exc:  # noqa: BLE001
            raise ModisRetrievalError(
                f"Earth Engine MODIS query failed for {target_date.date()}."
            ) from exc

        if count == 0:
            continue

        # Frozen production expectation: one daily MOD09GA image.
        if count != 1:
            raise ModisRetrievalError(
                f"Expected exactly one MOD09GA image for {target_date.date()}, found {count}."
            )

        image = ee.Image(daily.first())
        try:
            if selected_ndwi is None:
                ndwi_raw = _extract_ndwi_from_image(image, point)
                if ndwi_raw is not None:
                    ndwi_value = float(ndwi_raw)
                    if is_finite_index(ndwi_value):
                        selected_ndwi = ndwi_value
                        selected_ndwi_date = target_date

            if selected_ndvi is None:
                ndvi_raw = _extract_ndvi_from_image(image, point)
                if ndvi_raw is not None:
                    ndvi_value = float(ndvi_raw)
                    if is_finite_index(ndvi_value):
                        selected_ndvi = ndvi_value
                        selected_ndvi_date = target_date
        except ModisError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ModisRetrievalError(
                f"Earth Engine MODIS extraction failed for {target_date.date()}."
            ) from exc

        if selected_ndwi is not None and selected_ndvi is not None:
            break

    if selected_ndwi is None or selected_ndwi_date is None:
        raise ModisCoverageError(
            "No valid MODIS NDWI observation found within D-1 through D-16."
        )
    if selected_ndvi is None or selected_ndvi_date is None:
        raise ModisCoverageError(
            "No valid MODIS NDVI observation found within D-1 through D-16."
        )

    if not (selected_ndwi_date < flash_date):
        raise ModisCoverageError("NDWI observation date must be before the flash calendar day.")
    if not (selected_ndvi_date < flash_date):
        raise ModisCoverageError("NDVI observation date must be before the flash calendar day.")

    ndwi_lag = (flash_date - selected_ndwi_date).days
    ndvi_lag = (flash_date - selected_ndvi_date).days
    if not (1 <= ndwi_lag <= MAX_LOOKBACK_DAYS):
        raise ModisCoverageError(f"NDWI lookback lag {ndwi_lag} is outside D-1..D-16.")
    if not (1 <= ndvi_lag <= MAX_LOOKBACK_DAYS):
        raise ModisCoverageError(f"NDVI lookback lag {ndvi_lag} is outside D-1..D-16.")

    if not (-1.0 <= selected_ndwi <= 1.0):
        raise ModisRetrievalError(f"Unexpected MODIS NDWI value: {selected_ndwi}")
    if not (-1.0 <= selected_ndvi <= 1.0):
        raise ModisRetrievalError(f"Unexpected MODIS NDVI value: {selected_ndvi}")

    elapsed = perf_counter() - t0
    return ModisResult(
        features=ModisFeatures(modis_ndwi=selected_ndwi, modis_ndvi=selected_ndvi),
        ndwi_observation_date=selected_ndwi_date.date(),
        ndvi_observation_date=selected_ndvi_date.date(),
        flash_timestamp_utc=timestamp_to_utc_datetime(flash_time),
        flash_latitude=latitude,
        flash_longitude=longitude,
        retrieval_seconds=elapsed,
        ee_project=project,
    )
