"""Unit tests for selected-flash helpers (no network)."""

import pytest

from app.services.glm.selected_flash import s3_path_for_source_file


def test_s3_path_for_known_granule() -> None:
    source = (
        "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
    )
    assert (
        s3_path_for_source_file(source)
        == "noaa-goes18/GLM-L2-LCFA/2026/261/00/"
        "OR_GLM-L2-LCFA_G18_s20262610003000_e20262610003200_c20262610003217.nc"
    )


def test_s3_path_rejects_invalid_name() -> None:
    with pytest.raises(ValueError, match="Invalid GLM source_file"):
        s3_path_for_source_file("not-a-glm-file.nc")
