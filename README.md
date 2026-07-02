# translate-manual

Translate Markdown manuals from one language to another using the **Claude API**
(Anthropic) with a **RAG translation memory** backed by ChromaDB.

## Why RAG here

A translation memory *is* retrieval-augmented generation applied to translation.
The source manual is split into segments (paragraphs, headings, list items). For
each segment the tool retrieves the closest previously-translated segments from a
local vector store, then:

- **Exact match** → reuses the stored translation verbatim. No model call — zero
  tokens, and identical output every run. This is the "avoid re-translating all
  the time" part: re-run on an edited manual and only the changed paragraphs hit
  the API.
- **Near match** → feeds the similar past translations to Claude as reference so
  terminology and phrasing stay consistent across the whole manual and across
  future revisions.

Embeddings are computed locally (Chroma's default `all-MiniLM-L6-v2`), so lookups
cost nothing and need no network. Code fences, URLs, and inline code are never
translated. The system prompt (instructions + glossary) is prompt-cached, so its
cost is paid once per run rather than per segment.

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt      # or: pip install -e .
cp .env.example .env                  # then add your ANTHROPIC_API_KEY
```

## Use

```bash
python -m translate_manual.cli translate examples/sample_manual.md \
    --source English --target French \
    --glossary examples/glossary.fr.json \
    --output examples/sample_manual.fr.md
```

Or, after `pip install -e .`, via the `translate-manual` command:

```bash
translate-manual translate examples/sample_manual.md -s English -t French
```

Inspect the memory:

```bash
translate-manual stats -s English -t French
```

## How it fits together

| File | Role |
|------|------|
| `segmenter.py`        | Split Markdown into translatable blocks; keep code fences intact. |
| `backends/base.py`    | Backend interface: `lookup` / `store` / `stats` / `all_pairs`. |
| `backends/chroma_backend.py` | Chroma-over-SQLite store (default). |
| `backends/pg_backend.py`     | pgvector-on-Postgres store (production). |
| `embedding.py`        | Shared text→vector embedder (used by the Postgres backend). |
| `translator.py`       | Per-segment: TM lookup → reuse or call Claude with fuzzy refs. |
| `cli.py`              | `translate`, `stats`, and `dump` commands. |
| `config.py`           | Backend selection, model ids, DSN, match thresholds. |

See [`docs/DESIGN_NOTES.md`](docs/DESIGN_NOTES.md) for the full design rationale
(embeddings, dim, pgvector schema, provenance, directionality, prod recommendations).

## What happens on a run (call by call)

Only **one** kind of call is networked and billed: the Claude API. Everything
else — segmentation, embeddings, the vector store — runs locally on your machine.

1. **Read the file.** The whole input Markdown is loaded into memory once
   (`cli.py`).

2. **Segment it** (`segmenter.py`, local, no calls). The document is walked line
   by line:
   - A fenced code block (opened by ` ``` ` or `~~~`) becomes a single
     **non-translatable** segment, emitted verbatim.
   - Everything else is grouped into blocks split on blank lines — a heading, a
     paragraph, a list, a table. Each becomes one **translatable** segment.
   - Segmentation is *lossless*: concatenating every segment reproduces the input
     byte for byte, so blank-line structure and whitespace survive.

   So "based on what?" — blank lines delimit prose blocks, and code fences are
   detected and kept intact. No model is involved in segmenting.

3. **For each translatable segment** (`translator.py`):

   a. **TM lookup** — query ChromaDB for the nearest stored segments. The query
      text is embedded locally (Chroma's `all-MiniLM-L6-v2` via onnxruntime),
      returning neighbors with a cosine distance. No network, no cost.

   b. **Decide what to do with the result:**
      - If the nearest neighbor is within `EXACT_MATCH_DISTANCE` (0.05) **and** is
        byte-identical to the segment → **reuse the stored translation. Claude is
        NOT called.** Zero tokens.
      - Otherwise → collect neighbors within `FUZZY_MATCH_DISTANCE` (0.35) as
        reference examples.

   c. **Call Claude** — `client.messages.create` with `claude-opus-4-8`. This is
      the only networked, billed call, and it happens only for segments that were
      not reused. Any fuzzy references are included in the user message so
      terminology stays consistent. The system prompt (rules + glossary) is
      identical for every segment, so it is prompt-cached and paid for once per
      run rather than once per segment.

   d. **Save (TM upsert)** — the new `source → translation` pair is written into
      ChromaDB and persisted to `.translation_memory/` on disk. This is what lets
      the *next* run reuse it (step 3b).

4. **Write the output.** The translated segments are reassembled in order and the
   result is written to the output file, once, at the end.

So there are two "saves": a translation-memory upsert per model translation (to
disk, growing over time), and the final output file written once at the end.

Call summary for a document with N translatable segments, of which K are exact
reuses:

| Operation | Where | Count | Cost |
|-----------|-------|-------|------|
| Read input file | disk | 1 | — |
| Segment | local | 1 | — |
| Embed + ChromaDB query (lookup) | local | N | — |
| **Claude `messages.create`** | **Anthropic API** | **N − K** | **billed (system prompt cached)** |
| ChromaDB upsert (store) | local disk | N − K | — |
| Write output file | disk | 1 | — |

## Backends: Chroma (test) or Postgres/pgvector (production)

The translation memory is pluggable via `TM_BACKEND`:

| `TM_BACKEND` | Store | When |
|--------------|-------|------|
| `chroma` (default) | embedded Chroma over SQLite in `.translation_memory/` | dev/test, zero infra |
| `postgres` | pgvector on Postgres | production: provenance columns, real backups, joins to business data |

The two backends share one interface (`backends/base.py`), so switching them
changes nothing in the translation logic.

### Ready-to-use Postgres

A `docker-compose.yml` brings up pgvector on host port **13833** (chosen to avoid
colliding with other local Postgres instances):

```bash
docker compose up -d                 # pgvector on localhost:13833
export TM_BACKEND=postgres           # default DSN already points here
# TM_DATABASE_URL=postgresql://tm:tm@localhost:13833/tm

python -m translate_manual.cli translate examples/sample_manual.md \
    -s English -t French -g examples/glossary.fr.json
```

The app creates the `tm` table and its HNSW index on first run. The Postgres
backend records **provenance** per row: `embedding_model` + `embedding_dim` (so a
later embed-model swap is detectable and forces a re-embed), `translator_model`
(which Claude produced it), and `origin` (`machine` vs `human_reviewed`).

> **Embedding note:** both backends currently embed with Chroma's bundled MiniLM
> (local, 384-dim). It's English-leaning — for a multilingual production corpus,
> point `embedding.py` at a hosted multilingual embedder (Voyage / Cohere / OpenAI)
> and set `TM_EMBED_MODEL` / `TM_EMBED_DIM` accordingly. Writes and queries within
> one store must use the same model.

## Notes

- Model defaults to `claude-opus-4-8` (override with `TM_MODEL`).
- The memory persists in `.translation_memory/` (override with `TM_STORE_DIR`).
  It grows as you translate, improving reuse and consistency over time.
- The glossary is a plain JSON map of `source term -> target term`, injected into
  the (cached) system prompt and applied consistently.
