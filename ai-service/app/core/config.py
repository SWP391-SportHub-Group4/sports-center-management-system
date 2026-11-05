from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    gemini_api_key: str
    gemini_model: str = "gemini-3.5-flash-lite"
    # Google SDK HttpOptions.timeout is milliseconds, not seconds. Keep below .NET 35s.
    gemini_timeout_ms: int = 25000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()