from google import genai
from google.genai import types

from app.core.config import settings


class GeminiService:
    def __init__(self) -> None:
        self.client = genai.Client(
            api_key=settings.gemini_api_key
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        response = self.client.models.generate_content(
            model=settings.gemini_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.2,
            ),
        )

        if response.text is None:
            raise RuntimeError(
                "Gemini returned an empty response."
            )

        text = response.text.strip()

        if not text:
            raise RuntimeError(
                "Gemini returned an empty response."
            )

        return text