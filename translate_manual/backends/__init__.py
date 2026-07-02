"""Backend selection. `get_memory` returns the configured translation memory."""

from __future__ import annotations

from .. import config
from .base import TranslationMemory


def get_memory(source_lang: str, target_lang: str) -> TranslationMemory:
    if config.BACKEND == "postgres":
        from .pg_backend import PgTranslationMemory

        return PgTranslationMemory(
            config.DATABASE_URL,
            source_lang,
            target_lang,
            config.EMBED_MODEL,
            config.EMBED_DIM,
        )
    if config.BACKEND == "chroma":
        from .chroma_backend import ChromaTranslationMemory

        return ChromaTranslationMemory(
            config.STORE_DIR, source_lang, target_lang, config.EMBED_MODEL
        )
    raise ValueError(
        f"Unknown TM_BACKEND {config.BACKEND!r} (expected 'chroma' or 'postgres')"
    )


__all__ = ["TranslationMemory", "get_memory"]
