# Translation pipeline

## Purpose

Translate a Markdown document segment by segment, reusing the translation memory where it can and calling Claude only for the rest.

## Requirements

### Requirement: Non-translatable segments pass through

The system SHALL copy non-translatable segments to the output unchanged and SHALL NOT call the model or the memory for them.

#### Scenario: Code block

- **WHEN** the document holds a fenced code block
- **THEN** the output holds the same block byte for byte

### Requirement: Exact reuse costs no model call

The system SHALL reuse a stored translation, with no model call, when the nearest entry's distance is at most `EXACT_MATCH_DISTANCE` (0.05) and its source text is byte-identical to the segment.

#### Scenario: Identical paragraph

- **WHEN** a segment equals a stored source
- **THEN** the stored translation is used and counted as reused from memory

#### Scenario: Close but not identical

- **WHEN** the nearest entry is within 0.05 but its text differs
- **THEN** it is not reused verbatim and the model is called

### Requirement: Fuzzy matches guide the model

The system SHALL pass up to `FUZZY_MATCH_COUNT` (3) stored pairs whose distance is at most `FUZZY_MATCH_DISTANCE` (0.35) and whose text differs from the segment to the model as reference translations.

#### Scenario: Similar segment

- **WHEN** a stored pair lies within 0.35 of the segment
- **THEN** the request carries it as a reference and the segment counts as fuzzy-assisted

### Requirement: Model output is remembered

The system SHALL store each model translation in the memory with origin `machine` and the model name, so a later run can reuse it.

#### Scenario: New segment

- **WHEN** the model translates a segment
- **THEN** the pair is stored before the next segment is handled

### Requirement: Instructions protect Markdown and apply the glossary

The system SHALL instruct the model to keep Markdown syntax, code, identifiers, URLs, paths and placeholders untranslated, and to apply the glossary terms consistently when one is given. The instructions SHALL be identical for every segment of a run and marked for prompt caching.

#### Scenario: Glossary given

- **WHEN** a glossary maps "cart" to "panier"
- **THEN** the system prompt lists "cart => panier"

### Requirement: Whitespace around segments is kept

The system SHALL translate a segment without its leading and trailing newlines and restore them around the translation.

#### Scenario: Blank-line structure

- **WHEN** a segment ends with a blank line
- **THEN** the translated segment ends with the same newlines

### Requirement: Statistics are reported

The system SHALL count total segments, translatable segments, segments reused from memory, segments translated by the model and fuzzy-assisted segments.

#### Scenario: Second run on same file

- **WHEN** a document is translated twice with the same memory
- **THEN** the second run reports every translatable segment as reused and none translated by the model
