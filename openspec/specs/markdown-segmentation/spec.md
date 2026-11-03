# Markdown segmentation

## Purpose

Split a Markdown document into ordered segments, translatable or verbatim, so that joining them restores the document.

## Requirements

### Requirement: Fenced code is never translatable

The system SHALL emit each fenced code block (opened by three backticks or three tildes) as a single non-translatable segment, verbatim, up to the closing fence of the same marker.

#### Scenario: Backtick fence

- **WHEN** the document contains a block fenced with three backticks
- **THEN** the block, fences included, is one segment with translatable false

#### Scenario: Unclosed fence

- **WHEN** a fence is never closed
- **THEN** the rest of the document is part of the non-translatable segment

### Requirement: Prose is split on blank lines

The system SHALL split non-code text into blocks delimited by blank lines (a heading, a paragraph, a list, a table), each a translatable segment, and SHALL mark a block that is only whitespace as non-translatable.

#### Scenario: Two paragraphs

- **WHEN** the text holds two paragraphs separated by a blank line
- **THEN** two translatable segments result, the first ending with its separator

### Requirement: Segmentation is lossless

The system SHALL return segments whose texts, concatenated in order, equal the input document.

#### Scenario: Round trip

- **WHEN** a document is segmented and its segments are concatenated
- **THEN** the result is identical to the input
