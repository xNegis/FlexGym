import json
import os
from pathlib import Path

_DEV_JWT_SECRET = "flexgym-development-secret-do-not-use-in-production"


class ConfigurationError(Exception):
    pass


def _load_local_settings() -> dict[str, str]:
    settings_path = Path(__file__).resolve().parent.parent / "local.settings.json"
    if settings_path.exists():
        data = json.loads(settings_path.read_text())
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    return {}


def _get_value(key: str, defaults: dict[str, str]) -> str:
    value = os.getenv(key) or defaults.get(key)
    if value is None:
        raise ConfigurationError(f"Missing required configuration: {key}")
    return value


def _parse_allowed_origins(raw: str) -> list[str]:
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if not origins:
        raise ConfigurationError("ALLOWED_ORIGINS must contain at least one origin")
    return origins


class Config:
    def __init__(self) -> None:
        defaults = _load_local_settings()
        self.app_env = os.getenv("APP_ENV") or defaults.get("APP_ENV", "development")
        if self.app_env == "development":
            defaults.setdefault("DATABASE_URL", "sqlite:///../data/db/flexgym.db")
            defaults.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
            defaults.setdefault("JWT_SECRET", _DEV_JWT_SECRET)
        self.database_url = _get_value("DATABASE_URL", defaults)
        self.allowed_origins = _parse_allowed_origins(_get_value("ALLOWED_ORIGINS", defaults))
        self.jwt_secret = _get_value("JWT_SECRET", defaults)
        if self.app_env != "development" and self.jwt_secret == _DEV_JWT_SECRET:
            raise ConfigurationError(
                "JWT_SECRET must not use the development default in non-development environments"
            )


_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config


def reset_config() -> None:
    global _config
    _config = None
