"""HTTP route for display-only Sentinel-2 surveillance imagery."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.sentinel import (
    SentinelBounds,
    SentinelPreviewRequest,
    SentinelPreviewResponse,
)
from app.services.imagery.sentinel import (
    SentinelConfigError,
    SentinelRetrievalError,
    retrieve_sentinel_surveillance,
)

router = APIRouter(tags=["sentinel"])


@router.post("/sentinel/preview", response_model=SentinelPreviewResponse)
def sentinel_preview(body: SentinelPreviewRequest) -> SentinelPreviewResponse:
    """Return a pre-flash Sentinel-2 view for the selected flash, or an unavailable state.

    This does not run flash analysis and does not change model inputs.
    """
    try:
        result = retrieve_sentinel_surveillance(
            flash_lat=body.flash_lat,
            flash_lon=body.flash_lon,
            flash_timestamp_utc=body.flash_timestamp_utc,
        )
    except SentinelConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SentinelRetrievalError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    bounds = None
    if result.bounds is not None:
        bounds = SentinelBounds(
            west=result.bounds.west,
            south=result.bounds.south,
            east=result.bounds.east,
            north=result.bounds.north,
        )
    return SentinelPreviewResponse(
        status=result.status,
        flash_lat=result.flash_lat,
        flash_lon=result.flash_lon,
        flash_timestamp_utc=result.flash_timestamp_utc,
        surveillance_radius_km=result.surveillance_radius_km,
        lookback_days=result.lookback_days,
        clear_threshold=result.clear_threshold,
        message=result.message,
        image_png_base64=result.image_png_base64,
        image_width=result.image_width,
        image_height=result.image_height,
        bounds=bounds,
        acquired_utc=result.acquired_utc,
        hours_before_flash=result.hours_before_flash,
        point_clarity=result.point_clarity,
        scene_cloud_pct=result.scene_cloud_pct,
    )
