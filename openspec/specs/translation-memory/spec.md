# Translation memory

## Purpose

Store source-to-translation pairs per language pair and find the nearest stored sources by cosine distance, behind one interface with a Chroma and a Postgres (pgvector) backend.

## Requirements

### Requirement: Backend selection

The system SHALL pick the backend from `TM_BACKEND`: `chroma` (the default) or `postgres`, and SHALL fail with an error naming the accepted values for any other value.

#### Scenario: Default

- **WHEN** `TM_BACKEND` is unset
- **THEN** the embedded Chroma backend is used

#### Scenario: Unknown backend

- **WHEN** `TM_BACKEND` is `foo`
- **THEN** a ValueError says the value is unknown and that `chroma` or `postgres` is expected

### Requirement: Pairs are keyed by language pair and source text

The system SHALL key an entry by source language, target language and source text, and storing the same source again SHALL overwrite the earlier entry.

#### Scenario: Re-store

- **WHEN** the same source text is stored twice for one language pair
- **THEN** one entry remains, holding the latest translation

#### Scenario: Other direction

- **WHEN** a pair was stored for English to French
- **THEN** a lookup for French to English does not find it

### Requirement: Lookup returns nearest first with cosine distance

The system SHALL return up to the requested number of entries as (source, translation, distance), nearest first, and an empty list when the memory is empty.

#### Scenario: Empty memory

- **WHEN** nothing is stored for the language pair
- **THEN** lookup returns an empty list

### Requirement: Provenance is recorded

The system SHALL record on every stored entry the translator model, the origin (`machine` by default, or `human_reviewed`) and the embedding model.

#### Scenario: Machine translation stored

- **WHEN** the translator stores a model translation
- **THEN** the entry carries origin machine and the configured translator and embedding model names

### Requirement: Vectors come from one embedding model

The system SHALL embed writes and queries of one store with the same model, configured by `TM_EMBED_MODEL` and `TM_EMBED_DIM`.

#### Scenario: Postgres column size

- **WHEN** the Postgres backend creates its table
- **THEN** the vector column has `TM_EMBED_DIM` dimensions
