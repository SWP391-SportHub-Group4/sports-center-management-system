"""Bounded Gemini calls and sanitized, actionable upstream error categories.

No prompt, key, SDK response body, or member/coach context is returned to callers.
"""
import logging

from google import genai
from google.genai import errors, types

from app.core.config import settings

logger = logging.getLogger("sporthub.ai.gemini")


class GeminiUpstreamError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class GeminiService:
    def __init__(self) -> None:
        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=settings.gemini_timeout_ms),
        )

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        try:
            response = self.client.models.generate_content(
                model=settings.gemini_model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                ),
            )
        except errors.APIError as exc:
            # The SDK status is diagnostic. Never log or return its raw body.
            code = int(getattr(exc, "code", 0) or 0)
            logger.warning("Gemini API failed: http_status=%s model=%s", code, settings.gemini_model)
            if code == 429:
                raise GeminiUpstreamError(429, "ai_quota_exceeded", "The AI provider is rate limited. Please try again later.") from exc
            if code in (401, 403):
                raise GeminiUpstreamError(503, "ai_provider_auth_failed", "The AI provider credentials are unavailable. Please contact support.") from exc
            if code == 404:
                raise GeminiUpstreamError(503, "ai_model_unavailable", "The configured AI model is unavailable. Please contact support.") from exc
            if code in (408, 504):
                raise GeminiUpstreamError(504, "ai_provider_timeout", "The AI provider did not respond in time.") from exc
            if code in (500, 502, 503):
                raise GeminiUpstreamError(503, "ai_provider_unavailable", "The AI provider is temporarily unavailable.") from exc
            raise GeminiUpstreamError(502, "ai_provider_generation_failed", "The AI provider could not complete this request.") from exc
        except TimeoutError as exc:
            logger.warning("Gemini request exceeded its time budget: model=%s", settings.gemini_model)
            raise GeminiUpstreamError(504, "ai_provider_timeout", "The AI provider did not respond in time.") from exc
        except (ConnectionError, OSError) as exc:
            logger.warning("Gemini network connection failed: type=%s", type(exc).__name__)
            raise GeminiUpstreamError(503, "ai_provider_unavailable", "The AI provider connection is temporarily unavailable.") from exc
        except Exception as exc:
            # A controlled response for malformed SDK output / transport failures,
            # with the precise exception type retained in server diagnostics only.
            logger.error("Unexpected Gemini failure: type=%s model=%s", type(exc).__name__, settings.gemini_model)
            raise GeminiUpstreamError(502, "ai_provider_generation_failed", "The AI provider could not complete this request.") from exc

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            logger.warning("Gemini returned no text: model=%s", settings.gemini_model)
            raise GeminiUpstreamError(502, "ai_provider_empty_answer", "The AI provider returned no usable answer.")
        return text
