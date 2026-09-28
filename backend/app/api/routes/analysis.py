"""HTTP routes for single-flash Analyze (orchestration only; no science changes)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import AnalyzeFlashRequest, AnalyzeFlashResponse
from app.services.features.pipeline import (
    FlashAnalysisConfigError,
    FlashAnalysisError,
    analyze_selected_flash,
)
from app.services.glm.selected_flash import GlmFlashNotFoundError
from app.services.glm.search import GlmSearchError

router = APIRouter(tags=["analysis"])


def _is_flash_not_found(exc: BaseException) -> GlmFlashNotFoundError | None:
    current: BaseException | None = exc
    while current is not None:
        if isinstance(current, GlmFlashNotFoundError):
            return current
        current = current.__cause__ or current.__context__
    return None


@router.post("/analyze", response_model=AnalyzeFlashResponse)
def analyze_flash(body: AnalyzeFlashRequest) -> AnalyzeFlashResponse:
    """Run the validated single-flash pipeline and return raw score + 21 features."""
    try:
        result = analyze_selected_flash(
            source_file=body.source_file,
            flash_id=body.flash_id,
        )
    except GlmFlashNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FlashAnalysisConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FlashAnalysisError as exc:
        missing = _is_flash_not_found(exc)
        if missing is not None:
            raise HTTPException(status_code=404, detail=str(missing)) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except GlmSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return AnalyzeFlashResponse(
        global_flash_id=result.glm.global_flash_id,
        source_file=result.glm.source_file,
        flash_id=result.glm.flash_id,
        flash_lat=float(result.glm.flash_lat),
        flash_lon=float(result.glm.flash_lon),
        flash_timestamp_utc=result.flash_timestamp_utc,
        model_score=result.model_score,
        feature_names=list(result.feature_names),
        feature_values=dict(result.feature_values),
        analysis_seconds=result.analysis_seconds,
    )
