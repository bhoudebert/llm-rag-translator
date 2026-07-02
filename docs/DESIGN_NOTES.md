# Design notes & findings

Working notes distilled from the design conversation. Captures how the tool works,
what the vector store actually does, and the decisions/values behind it.

## 1. Pipeline (call by call)

Only **one** call is networked and billed: Claude. Everything else is local.

1. **Read** the whole Markdown file into memory.
2. **Segment** (`segmenter.py`, local, no model): walk lines top-to-bottom.
   - Fenced code blocks (```` ``` ````/`~~~`) → one **non-translatable** segment, verbatim.
   - Everything else → blocks split on blank lines (heading, paragraph, list). Each
     is a **translatable** segment. Reassembly is lossless.
   - "Based on what?" → blank lines delimit prose; code fences are detected and kept.
     No model is involved in segmenting.
3. **Per translatable segment** (`translator.py`):
   - **TM lookup** → vector query (local embedding, no network). Returns nearest
     stored segments + cosine distance.
   - **Decide**: distance ≤ `EXACT_MATCH_DISTANCE` **and** byte-identical → reuse
     stored translation, **no Claude call**. Else gather fuzzy refs (≤ `FUZZY_MATCH_DISTANCE`).
   - **Claude call** (`messages.create`, `claude-opus-4-8`) only when not reused.
     Fuzzy refs go in the user message; the system prompt (rules + glossary) is
     identical every segment → **prompt-cached**, paid once per run.
   - **Store** the new pair (TM upsert) → persisted to disk. This is what the next
     run reuses.
4. **Write** the reassembled output once.

Two "saves": a TM upsert per model translation, and the output file at the end.

## 2. What the vector store does for us

Chroma (and pgvector) is the whole retrieval engine. We supply text + thresholds;
it does embedding storage, similarity search, and distance.

- **We give:** the query **vector** (encoded text) + a `WHERE`/threshold.
- **DB computes + returns:** the **distance** per row, sorted.
- **We decide:** reuse / fuzzy / translate, using the returned distance.

Ours (not the DB's): hashing source → id (upsert key), and the reuse/fuzzy policy
(the `0.05` / `0.35` thresholds).

## 3. Embedding model — the one thing Chroma hid

- "Embed model" = a **separate small AI model** (NOT Claude) that turns text into a
  vector of floats representing *meaning*. Claude translates; the embedder measures
  similarity.
- We were already running one locally: Chroma's default `all-MiniLM-L6-v2` (onnx,
  CPU). That was the `libstdc++`/onnxruntime crash on NixOS.
- Flow: `model.encode(text) -> [floats] -> DB`. `encode` runs the net → a point in
  N-dim space; similar meanings land close.
- **Dim** = vector length, fixed by the model (MiniLM 384, Voyage 1024, OpenAI
  3-large 3072). Bigger ≠ automatically more accurate — it's more capacity but more
  storage/compute. Training quality matters more than raw dim.
- At **query time**: encoding still needed (to make the query vector); the distance
  math itself is model-free DB arithmetic. **Same model must be used for writes and
  queries**, or distances are meaningless.
- Local (MiniLM) = free/private/weak. Hosted (Voyage/Cohere/OpenAI) = paid/networked/
  strong + multilingual → the production choice for a multilingual retailer.

## 4. One Postgres table replaces Chroma's many tables

Chroma exposes its internal bookkeeping as ~15 SQLite tables (data, ANN segments,
write queue, tenants, FTS shadow tables, migrations). Postgres does the same work
but hides it in the engine:

| Chroma tables | Postgres |
|---|---|
| `embedding_metadata` (text+meta) | `source`/`translation` columns |
| `embeddings` (vectors) | `embedding vector(N)` column |
| segment/ANN index | the `hnsw` **index** (not a visible table) |
| `embeddings_queue`, `max_seq_id` | Postgres WAL (internal) |
| `collections`/`databases`/`tenants` | a `src_lang`/`tgt_lang` column |
| `embedding_fulltext_search` + 6 shadow tables | Postgres FTS — only if you add it |
| `migrations` | your migration tool |

So one defined table + one index covers what we use. The ANN index still has real
cost (RAM/build time) — it's just not a browsable table.

## 5. Identified flaws & decisions

### 5a. Provenance — record which models produced a row  ✅ implemented (pg)
Two models matter:
- **Embedding model** (correctness): vectors are only comparable within one model's
  space. Storing `embedding_model` + `embedding_dim` lets a later swap be *detected*
  so you re-embed instead of returning garbage matches.
- **Translator model** (audit/provenance): store which Claude produced a machine
  translation, to re-review/regenerate later. Nice-to-have, not correctness.

### 5b. `origin` flag  ✅ implemented
`origin ∈ {machine, human_reviewed}`. A reviewed pair should outrank a raw machine
one. Cheap column, real value for a review workflow.

### 5c. Directionality  ⚠️ known limitation, documented (not yet implemented)
We embed the **source** side only and key by direction (`en→fr`). So a later `fr→en`
query finds nothing even for the same sentence pair — the reverse side was never
indexed. Not purely a bug: reverse translation isn't guaranteed identical to the
original (register/ambiguity), so auto-reusing the reverse can be subtly wrong; real
TMS tools flag reverse matches for review.
Options (future):
- **(a) Symmetric store**: on write, also insert the reverse `(tgt→src, embed target)`
  with `origin='reverse_derived'` so it surfaces but is down-ranked / flagged. Extra
  embed call + double rows.
- **(b) Bilingual unit**: one row, both texts + both embeddings, match either side.

## 6. Backends

Pluggable via `TM_BACKEND`:
- `chroma` (default): embedded Chroma over SQLite. Zero infra. Dev/test.
- `postgres`: pgvector. Provenance columns, real backups/IAM, joins to business data.
  `docker compose up -d` gives a ready pgvector on host port **13833**.

Interface (`backends/base.py`): `lookup` / `store(..., translator_model, origin)` /
`stats` / `all_pairs`. Swapping backends touches nothing in the translation logic.

## 7. Production recommendations (for a retailer like Electro Dépôt)

- **Store**: pgvector on managed Postgres is the pragmatic default (one DB, ACID,
  backups, filter+join to product data). Qdrant if you outgrow it; OpenSearch if you
  want hybrid keyword+vector.
- **Embedder**: do NOT ship MiniLM — use a hosted **multilingual** embedder
  (Voyage/Cohere/OpenAI). The DB is swappable; a weak embedder poisons every lookup.
- **Build vs buy**: if translation is a recurring reviewed business process, a **TMS**
  (Phrase/Trados/memoQ/Lokalise/Crowdin) gives TM + glossary + reviewer workflow +
  char-level fuzzy (edit-distance) matching out of the box. Classic TMs match on
  character fuzzy, not just semantic embeddings — more precise for "same sentence,
  one word changed." Build on pgvector + Claude when you need it embedded in your own
  DMS/product pipeline and want full control.

## 8. Values / thresholds (config.py)

| Setting | Value | Meaning |
|---|---|---|
| `MODEL` | `claude-opus-4-8` | Translator LLM. No `budget_tokens`/`temperature` (400 on 4.8). |
| `MAX_TOKENS` | 16000 | Non-streaming cap; segments are short. |
| `EXACT_MATCH_DISTANCE` | 0.05 | ≤ this + byte-identical → reuse, no Claude call. |
| `FUZZY_MATCH_DISTANCE` | 0.35 | ≤ this → attach as reference to the Claude call. |
| `FUZZY_MATCH_COUNT` | 3 | Max fuzzy refs per segment. |
| `EMBED_MODEL` / `EMBED_DIM` | `all-MiniLM-L6-v2` / 384 | Local default; swap for hosted multilingual in prod. |
