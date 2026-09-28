"""Schemas for single-flash Analyze API."""

from datetime import datetime

from pydantic import BaseModel, Field


class AnalyzeFlashRequest(BaseModel):
    source_file: str = Field(..., min_length=20, max_length=200)
    flash_id: int = Field(..., ge=0)


class AnalyzeFlashResponse(BaseModel):
    """Temporary Analyze payload: score + frozen 21 features (no risk labels)."""

    global_flash_id: str
    source_file: str
    flash_id: int
    flash_lat: float
    flash_lon: float
    flash_timestamp_utc: datetime
    model_score: float
    feature_names: list[str]
    feature_values: dict[str, float]
    analysis_seconds: float
