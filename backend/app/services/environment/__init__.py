"""Environmental data retrieval and offline seasonality features."""

from app.services.environment.era5 import (
    Era5ConfigError,
    Era5CoverageError,
    Era5DataError,
    Era5Error,
    Era5Features,
    Era5Result,
    Era5RetrievalError,
    ensure_utc_timestamp,
    fetch_era5_features,
)
from app.services.environment.modis import (
    ModisConfigError,
    ModisCoverageError,
    ModisError,
    ModisFeatures,
    ModisResult,
    ModisRetrievalError,
    fetch_modis_features,
)
from app.services.environment.seasonality import (
    SeasonalityFeatures,
    SeasonalityResult,
    compute_seasonality,
)
from app.services.environment.smap import (
    SmapConfigError,
    SmapCoverageError,
    SmapError,
    SmapFeatures,
    SmapResult,
    SmapRetrievalError,
    fetch_smap_features,
)

__all__ = [
    "Era5ConfigError",
    "Era5CoverageError",
    "Era5DataError",
    "Era5Error",
    "Era5Features",
    "Era5Result",
    "Era5RetrievalError",
    "ModisConfigError",
    "ModisCoverageError",
    "ModisError",
    "ModisFeatures",
    "ModisResult",
    "ModisRetrievalError",
    "SeasonalityFeatures",
    "SeasonalityResult",
    "SmapConfigError",
    "SmapCoverageError",
    "SmapError",
    "SmapFeatures",
    "SmapResult",
    "SmapRetrievalError",
    "compute_seasonality",
    "ensure_utc_timestamp",
    "fetch_era5_features",
    "fetch_modis_features",
    "fetch_smap_features",
]
