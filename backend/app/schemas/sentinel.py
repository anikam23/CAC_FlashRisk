"""Schemas for display-only Sentinel-2 surveillance imagery."""

from datetime import datetime

from pydantic import BaseModel, Field


class SentinelPreviewRequest(BaseModel):
    flash_lat: float = Field(..., ge=-90, le=90)
    flash_lon: float = Field(..., ge=-180, le=180)
    flash_timestamp_utc: datetime


class SentinelBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class SentinelPreviewResponse(BaseModel):
    """Contextual Sentinel-2 view. Not a model score and not a feature vector."""

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
