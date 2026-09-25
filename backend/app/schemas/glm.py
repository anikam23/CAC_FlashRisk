from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

WindowMinutes = Literal[15, 30, 60]
RadiusKm = Literal[5, 10, 25]


class GlmSearchRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    datetime_utc: datetime
    window_minutes: WindowMinutes
    radius_km: RadiusKm

    @field_validator("datetime_utc")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("datetime_utc must include a timezone (use UTC)")

        return value.astimezone(UTC)


class GlmFlashResponse(BaseModel):
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


class GlmSearchResponse(BaseModel):
    flashes: list[GlmFlashResponse]
    count: int
    latitude: float
    longitude: float
    datetime_utc: datetime
    window_minutes: int
    radius_km: int
    window_start: datetime
    window_end: datetime
    granules_listed: int
    granules_selected: int
    granules_downloaded: int


class GlmFlashReconstructionRequest(BaseModel):
    source_file: str = Field(..., min_length=20, max_length=200)
    flash_id: int = Field(..., ge=0)


class GlmGroupResponse(BaseModel):
    group_id: int
    group_lat: float
    group_lon: float
    animation_offset_ms: float
    group_area: float
    group_energy: float
    event_count: int


class GlmEventResponse(BaseModel):
    event_id: int
    parent_group_id: int
    event_lat: float
    event_lon: float
    animation_offset_ms: float
    event_energy: float


class GlmFlashReconstructionResponse(BaseModel):
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
    groups: list[GlmGroupResponse]
    events: list[GlmEventResponse]
