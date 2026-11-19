"""Four independently scoped Gemini projects; secrets stay in environment settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

PROFILES = ('plan', 'suggestion', 'member_chat', 'coach_chat')

class ProjectSettings(BaseSettings):
    gemini_multi_project_enabled: bool = False
    gemini_plan_api_key: str | None = None
    gemini_plan_project_id: str | None = None
    gemini_suggestion_api_key: str | None = None
    gemini_suggestion_project_id: str | None = None
    gemini_member_chat_api_key: str | None = None
    gemini_member_chat_project_id: str | None = None
    gemini_coach_chat_api_key: str | None = None
    gemini_coach_chat_project_id: str | None = None
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

@lru_cache(maxsize=1)
def project_settings() -> ProjectSettings:
    settings = ProjectSettings()
    if settings.gemini_multi_project_enabled:
        keys = [getattr(settings, f'gemini_{p}_api_key') for p in PROFILES]
        ids = [getattr(settings, f'gemini_{p}_project_id') for p in PROFILES]
        if any(not value or not value.strip() for value in keys + ids):
            raise ValueError('Four-project Gemini routing requires all four API keys and project IDs')
        if len(set(keys)) != 4 or len(set(ids)) != 4:
            raise ValueError('Four-project Gemini routing requires four distinct keys and project IDs')
    return settings

def for_profile(name: str) -> tuple[str, str] | None:
    if name not in PROFILES:
        raise ValueError('Unknown Gemini project profile')
    settings = project_settings()
    if not settings.gemini_multi_project_enabled:
        return None
    return (getattr(settings, f'gemini_{name}_api_key'),
            getattr(settings, f'gemini_{name}_project_id'))
