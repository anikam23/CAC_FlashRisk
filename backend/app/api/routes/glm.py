from datetime import UTC

from fastapi import APIRouter, HTTPException

from app.schemas.glm import (
    GlmEventResponse,
    GlmFlashReconstructionRequest,
    GlmFlashReconstructionResponse,
    GlmFlashResponse,
    GlmGroupResponse,
    GlmSearchRequest,
    GlmSearchResponse,
)
from app.services.glm import (
    GlmFlashNotFoundError,
    GlmSearchError,
    archive_date_bounds,
    extract_selected_flash,
    search_glm_flashes,
)

router = APIRouter(tags=["glm"])


@router.post("/glm/search", response_model=GlmSearchResponse)
def glm_search(body: GlmSearchRequest) -> GlmSearchResponse:
    search_dt = body.datetime_utc.astimezone(UTC)
    earliest, latest = archive_date_bounds()
    search_day = search_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if search_day < earliest or search_day > latest:
        raise HTTPException(
            status_code=422,
            detail=(
                "datetime_utc date must be between "
                f"{earliest.date().isoformat()} and {latest.date().isoformat()} UTC "
                "(archive availability window)."
            ),
        )

    try:
        result = search_glm_flashes(
            latitude=body.latitude,
            longitude=body.longitude,
            search_datetime_utc=search_dt,
            window_minutes=body.window_minutes,
            radius_km=body.radius_km,
        )
    except GlmSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    flashes = [
        GlmFlashResponse(
            global_flash_id=flash.global_flash_id,
            source_file=flash.source_file,
            flash_id=flash.flash_id,
            flash_start_time=flash.flash_start_time,
            flash_end_time=flash.flash_end_time,
            flash_lat=flash.flash_lat,
            flash_lon=flash.flash_lon,
            distance_km=flash.distance_km,
            flash_energy=flash.flash_energy,
            flash_area=flash.flash_area,
            flash_duration_ms=flash.flash_duration_ms,
            max_group_area=flash.max_group_area,
            max_group_energy=flash.max_group_energy,
            group_count=flash.group_count,
            max_events_per_group=flash.max_events_per_group,
            total_events=flash.total_events,
        )
        for flash in result.flashes
    ]

    return GlmSearchResponse(
        flashes=flashes,
        count=len(flashes),
        latitude=body.latitude,
        longitude=body.longitude,
        datetime_utc=search_dt,
        window_minutes=body.window_minutes,
        radius_km=body.radius_km,
        window_start=result.window_start,
        window_end=result.window_end,
        granules_listed=result.granules_listed,
        granules_selected=result.granules_selected,
        granules_downloaded=result.granules_downloaded,
    )


@router.post("/glm/flash", response_model=GlmFlashReconstructionResponse)
def glm_flash_reconstruction(
    body: GlmFlashReconstructionRequest,
) -> GlmFlashReconstructionResponse:
    try:
        result = extract_selected_flash(
            source_file=body.source_file,
            flash_id=body.flash_id,
        )
    except GlmFlashNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GlmSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return GlmFlashReconstructionResponse(
        global_flash_id=result.global_flash_id,
        source_file=result.source_file,
        flash_id=result.flash_id,
        flash_lat=result.flash_lat,
        flash_lon=result.flash_lon,
        flash_first_event_frame_time=result.flash_first_event_frame_time,
        flash_last_event_frame_time=result.flash_last_event_frame_time,
        animation_start_time=result.animation_start_time,
        animation_end_ms=result.animation_end_ms,
        flash_energy=result.flash_energy,
        flash_area=result.flash_area,
        flash_duration_ms=result.flash_duration_ms,
        max_group_area=result.max_group_area,
        max_group_energy=result.max_group_energy,
        group_count=result.group_count,
        max_events_per_group=result.max_events_per_group,
        total_events=result.total_events,
        groups=[
            GlmGroupResponse(
                group_id=group.group_id,
                group_lat=group.group_lat,
                group_lon=group.group_lon,
                animation_offset_ms=group.animation_offset_ms,
                group_area=group.group_area,
                group_energy=group.group_energy,
                event_count=group.event_count,
            )
            for group in result.groups
        ],
        events=[
            GlmEventResponse(
                event_id=event.event_id,
                parent_group_id=event.parent_group_id,
                event_lat=event.event_lat,
                event_lon=event.event_lon,
                animation_offset_ms=event.animation_offset_ms,
                event_energy=event.event_energy,
            )
            for event in result.events
        ],
    )
