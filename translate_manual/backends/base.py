"""Backend interface shared by the Chroma and Postgres translation memories."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator


class TranslationMemory(ABC):
    """A source->translation store with vector similarity lookup.

    All backends key entries by (source_lang, target_lang, source_text) and return
    cosine distances from lookups. Storing the same source again overwrites it.
    """

    @abstractmethod
    def lookup(
        self, source_text: str, n_results: int
    ) -> list[tuple[str, str, float]]:
        """Return nearest entries as (source, translation, distance), nearest first."""

    @abstractmethod
    def store(
        self,
        source_text: str,
        translation: str,
        *,
        translator_model: str | None = None,
        origin: str = "machine",
    ) -> None:
        """Upsert a source->translation pair with provenance.

        origin: 'machine' (LLM output) or 'human_reviewed' (trusted). A reviewed
        pair should outrank a raw machine one when both match.
        """

    @abstractmethod
    def stats(self) -> int:
        """Number of stored pairs for this language pair."""

    @abstractmethod
    def all_pairs(self) -> Iterator[tuple[str, str]]:
        """Yield every stored (source, translation) pair."""
