"""Shared Google Earth Engine initialization for environmental services.

Production code only calls ``ee.Initialize(project=...)``.
Interactive ``ee.Authenticate()`` is never used here.
"""

from __future__ import annotations

import ee

_ee_initialized_project: str | None = None


class EarthEngineConfigError(Exception):
    """Missing EE project configuration or local credentials."""


def initialize_earth_engine(project: str) -> str:
    """Initialize Earth Engine for ``project``. Idempotent per process/project.

    Returns the normalized project id.
    """
    global _ee_initialized_project
    project = (project or "").strip()
    if not project:
        raise EarthEngineConfigError(
            "EE_PROJECT is not configured. Set EE_PROJECT in backend/.env. "
            "Never commit credentials."
        )
    if _ee_initialized_project == project:
        return project
    try:
        ee.Initialize(project=project)
    except Exception as exc:  # noqa: BLE001 — no interactive Authenticate()
        raise EarthEngineConfigError(
            "Earth Engine is not available for this environment. "
            "Authenticate once locally with the backend Earth Engine CLI, then retry "
            "(application code does not call ee.Authenticate()). "
            "Also confirm EE_PROJECT is set and your account can access that project."
        ) from exc
    _ee_initialized_project = project
    return project
