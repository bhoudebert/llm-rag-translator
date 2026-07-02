"""Shared text -> vector embedder.

The Chroma backend embeds internally, but the Postgres backend must produce
vectors itself (Postgres stores and compares vectors; it does not create them).
To keep the two backends comparable and avoid a second heavy dependency, we reuse
ChromaDB's bundled MiniLM (all-MiniLM-L6-v2, onnx, local, 384-dim) here.

Swap this module to use a hosted embedder in production (Voyage / Cohere /
OpenAI). Rule that must hold: writes and queries within one store MUST use the
same model, or the distances are meaningless — hence config.EMBED_MODEL is
recorded on every stored row.
"""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def _embedding_fn():
    # Imported lazily so `--backend chroma` users who never embed manually don't
    # pay the import, and so a future hosted embedder can drop in here.
    from chromadb.utils import embedding_functions

    return embedding_functions.DefaultEmbeddingFunction()


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch of strings -> list of float vectors."""
    fn = _embedding_fn()
    return [[float(x) for x in vec] for vec in fn(texts)]


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
