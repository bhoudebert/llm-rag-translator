# Command line

## Purpose

The `translate-manual` command: translate a file and inspect the translation memory.

## Requirements

### Requirement: translate command

The system SHALL translate INPUT_FILE from `--source` to `--target`, requiring both options, and write UTF-8 to `--output`, or to the input path with its suffix replaced by `.<target lowercased>.md` when none is given. `--glossary` SHALL name a JSON file mapping source terms to target terms.

#### Scenario: Default output name

- **WHEN** `manual.md` is translated to French with no `--output`
- **THEN** the result is written to `manual.french.md`

#### Scenario: Missing input

- **WHEN** INPUT_FILE does not exist
- **THEN** the command fails before translating anything

### Requirement: Progress goes to stderr

The system SHALL write progress and the statistics summary to standard error.

#### Scenario: Summary

- **WHEN** a translation finishes
- **THEN** stderr names the output file and the segment counts

### Requirement: stats and dump commands

The system SHALL print the number of stored pairs for a language pair (`stats`) and every stored source and translation pair of it (`dump`).

#### Scenario: Stats

- **WHEN** `stats -s English -t French` runs
- **THEN** it prints the count of stored pairs for that pair

### Requirement: Errors exit non-zero

The system SHALL print `Error: <message>` to standard error and exit with status 1 when a command raises.

#### Scenario: Backend failure

- **WHEN** the Postgres backend cannot connect
- **THEN** the message is printed and the exit status is 1
