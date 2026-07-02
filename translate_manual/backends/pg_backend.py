"""pgvector-on-Postgres translation memory. Production backend.

One table + one HNSW index does what Chroma's many internal tables do — plus
provenance columns (which embedding model, which translator model, machine vs
human-reviewed) that the POC lacked.

We embed text ourselves (see embedding.py) and pass the vector as a string
literal cast to `::vector`, so the only dependency is psycopg — no vector type
adapter needed. Distances come back from the DB; thresholds stay in the app.
"""

from __future__ import annotations

from collections.abc import Iterator

import psycopg

from .. import embedding
from .base import TranslationMemory

_SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tm (
    id                bigserial PRIMARY KEY,
    src_lang          text NOT NULL,
    tgt_lang          text NOT NULL,
    source            text NOT NULL,
    translation       text NOT NULL,
    embedding         vector(%(dim)s) NOT NULL,
    embedding_model   text NOT NULL,
    embedding_dim     int  NOT NULL,
    translator_model  text,
    origin            text NOT NULL DEFAULT 'machine',
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (src_lang, tgt_lang, source)
);

CREATE INDEX IF NOT EXISTS tm_embedding_idx
    ON tm USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS tm_pair_idx ON tm (src_lang, tgt_lang);
"""


def _vec_literal(vec: list[float]) -> str:
    # pgvector accepts a '[1,2,3]' text literal cast to ::vector.
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


class PgTranslationMemory(TranslationMemory):
    def __init__(
        self,
        dsn: str,
        source_lang: str,
        target_lang: str,
        embedding_model: str,
        embedding_dim: int,
    ):
        self.src = source_lang
        self.tgt = target_lang
        self._embedding_model = embedding_model
        self._conn = psycopg.connect(dsn, autocommit=True)
        with self._conn.cursor() as cur:
            cur.execute(_SCHEMA % {"dim": int(embedding_dim)})

    def lookup(
        self, source_text: str, n_results: int
    ) -> list[tuple[str, str, float]]:
        qvec = _vec_literal(embedding.embed_one(source_text))
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT source, translation, embedding <=> %s::vector AS distance "
                "FROM tm WHERE src_lang = %s AND tgt_lang = %s "
                "ORDER BY embedding <=> %s::vector LIMIT %s",
                (qvec, self.src, self.tgt, qvec, n_results),
            )
            return [(s, t, float(d)) for s, t, d in cur.fetchall()]

    def store(
        self,
        source_text: str,
        translation: str,
        *,
        translator_model: str | None = None,
        origin: str = "machine",
    ) -> None:
        vec = embedding.embed_one(source_text)
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO tm "
                "(src_lang, tgt_lang, source, translation, embedding, "
                " embedding_model, embedding_dim, translator_model, origin) "
                "VALUES (%s, %s, %s, %s, %s::vector, %s, %s, %s, %s) "
                "ON CONFLICT (src_lang, tgt_lang, source) DO UPDATE SET "
                "  translation = EXCLUDED.translation, "
                "  embedding = EXCLUDED.embedding, "
                "  embedding_model = EXCLUDED.embedding_model, "
                "  embedding_dim = EXCLUDED.embedding_dim, "
                "  translator_model = EXCLUDED.translator_model, "
                "  origin = EXCLUDED.origin, "
                "  created_at = now()",
                (
                    self.src,
                    self.tgt,
                    source_text,
                    translation,
                    _vec_literal(vec),
                    self._embedding_model,
                    len(vec),
                    translator_model,
                    origin,
                ),
            )

    def stats(self) -> int:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM tm WHERE src_lang = %s AND tgt_lang = %s",
                (self.src, self.tgt),
            )
            return cur.fetchone()[0]

    def all_pairs(self) -> Iterator[tuple[str, str]]:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT source, translation FROM tm "
                "WHERE src_lang = %s AND tgt_lang = %s ORDER BY created_at",
                (self.src, self.tgt),
            )
            for source, translation in cur.fetchall():
                yield source, translation
