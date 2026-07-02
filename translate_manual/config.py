"""Runtime config, loaded from environment / .env."""

import os

from dotenv import load_dotenv

load_dotenv()

# --- Translation model (Claude) -------------------------------------------------
# Default to Opus 4.8. Adaptive thinking is off by default here — translation is
# not a hard-reasoning task, so we skip it to save tokens/latency.
MODEL = os.environ.get("TM_MODEL", "claude-opus-4-8")

# Non-streaming cap. Segments are short; 16000 stays under SDK HTTP timeouts.
MAX_TOKENS = 16000

# --- Translation-memory backend -------------------------------------------------
# "chroma"   -> embedded Chroma over SQLite. Zero infra, good for tests/dev.
# "postgres" -> pgvector on Postgres. Production: provenance columns, real backups.
BACKEND = os.environ.get("TM_BACKEND", "chroma")

# Where the Chroma backend persists (ignored by the Postgres backend).
STORE_DIR = os.environ.get("TM_STORE_DIR", ".translation_memory")

# Postgres DSN for the pgvector backend. Matches docker-compose.yml (port 13833).
DATABASE_URL = os.environ.get(
    "TM_DATABASE_URL", "postgresql://tm:tm@localhost:13833/tm"
)

# --- Embedding model ------------------------------------------------------------
# The model that turns text into vectors. Both backends label stored rows with
# this name so a later model swap is detectable (vectors are only comparable
# within one model's space). The Postgres backend also needs the dimension to
# size its `vector(N)` column. Default = Chroma's bundled MiniLM (local, 384-dim).
# In production, point this at a hosted multilingual embedder (Voyage/Cohere/...).
EMBED_MODEL = os.environ.get("TM_EMBED_MODEL", "all-MiniLM-L6-v2")
EMBED_DIM = int(os.environ.get("TM_EMBED_DIM", "384"))

# --- Match thresholds (cosine distance) -----------------------------------------
# Nearest neighbor at/under this AND byte-identical -> reused verbatim (0 tokens).
EXACT_MATCH_DISTANCE = 0.05

# Neighbors at/under this are surfaced to Claude as reference translations
# (fuzzy matches) to keep terminology/style consistent.
FUZZY_MATCH_DISTANCE = 0.35

# How many fuzzy neighbors to feed the model per segment.
FUZZY_MATCH_COUNT = 3
