# 0005. The spec reviewer is adapted for the Python layout

- Status: accepted
- Date: 2026-11-03

## Context

The vendored spec reviewer (ADR 0004) recognises code under `src/` and tests under `test/`, and reads JavaScript test titles. This project keeps its package in `translate_manual/` and its tests in `tests/`, in pytest style.

## Decision

`scripts/spec-review/checks.ts` and `context.ts` are edited in this repository: code is `translate_manual/**/*.py`, tests are `tests/test_*.py`, and `def test_*` names count as test titles. `scripts/package.json` marks the scripts as ES modules. The edits are small and local. When the reviewer is refreshed from upstream, reapply them.

## Consequences

The spec and code-map checks, the unmapped-file warning and the test-title context work for Python. The reviewer's literal-change heuristics are tuned for JavaScript syntax and may miss Python-only constructs.

## Alternatives considered

Moving the package to `src/translate_manual/`: valid layout, but it churns imports, packaging and history for a tooling reason. Forking the reviewer upstream with configurable roots: better long term, not needed yet.
