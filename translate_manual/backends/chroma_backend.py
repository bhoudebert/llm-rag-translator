"""Embedded Chroma (SQLite) translation memory. Zero infra — dev/test default.

Chroma owns the embedding model internally, so we hand it raw text and let it
embed. Provenance fields (translator_model, origin, embedding_model) are stored
as metadata alongside the translation for parity with the Postgres backend.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator

import chromadb

from .base import TranslationMemory


def _pair_key(source_lang: str, target_lang: str) -> str:
    return f"tm_{source_lang}_{target_lang}".lower().replace(" ", "_")


def _seg_id(source_text: str) -> str:
    return hashlib.sha256(source_text.encode("utf-8")).hexdigest()


class ChromaTranslationMemory(TranslationMemory):
    def __init__(
        self,
        store_dir: str,
        source_lang: str,
        target_lang: str,
        embedding_model: str,
    ):
        self._embedding_model = embedding_model
        self._client = chromadb.PersistentClient(path=store_dir)
        self._collection = self._client.get_or_create_collection(
            name=_pair_key(source_lang, target_lang),
            metadata={"hnsw:space": "cosine"},
        )

    def lookup(
        self, source_text: str, n_results: int
    ) -> list[tuple[str, str, float]]:
        count = self._collection.count()
        if count == 0:
            return []
        res = self._collection.query(
            query_texts=[source_text],
            n_results=min(n_results, count),
        )
        out = []
        for doc, meta, dist in zip(
            res["documents"][0], res["metadatas"][0], res["distances"][0]
        ):
            out.append((doc, meta["translation"], float(dist)))
        return out

    def store(
        self,
        source_text: str,
        translation: str,
        *,
        translator_model: str | None = None,
        origin: str = "machine",
    ) -> None:
        self._collection.upsert(
            ids=[_seg_id(source_text)],
            documents=[source_text],
            metadatas=[
                {
                    "translation": translation,
                    "translator_model": translator_model or "",
                    "origin": origin,
                    "embedding_model": self._embedding_model,
                }
            ],
        )

    def stats(self) -> int:
        return self._collection.count()

    def all_pairs(self) -> Iterator[tuple[str, str]]:
        res = self._collection.get(include=["documents", "metadatas"])
        for doc, meta in zip(res["documents"], res["metadatas"]):
            yield doc, meta["translation"]
