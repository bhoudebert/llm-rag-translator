# The optional spec-driven module

Behaviour is specified in `openspec/specs/<capability>/spec.md` (requirements with scenarios) and a change to behaviour changes
the spec first. The module adds the checks that keep spec and code from drifting apart.

## What it adds

- `openspec/`: a README (how to change a spec, when a proposal is worth it), a code map (`code-map.json`), a spec template.
- `scripts/spec-review.ts` and `scripts/spec-review/`: the reviewer, vendored (below). Dependency-free Node, so CI needs no
  install.
- `.github/workflows/specs.yml`: `Specs validate` (OpenSpec CLI) and `Spec or docs with code` (the reviewer, deterministic).
- `docs/adr/0004-specs-are-checked-in-ci.md`, `.env.example` block for the optional model, `.spec-review/` in `.gitignore`.
- AGENTS.md, CONTRIBUTING, the Copilot digest and the PR template gain the spec-first rule and the `no-spec` rule.
- The pre-push hook runs `node scripts/spec-review.ts --hook` first (deterministic, plus a local model if `SPEC_REVIEW_MODEL`
  is set; it never blocks on its own failure).

## What it checks

Deterministic, in CI and in the hook: the specs validate; a change under `src/` also changes the spec of what it touches (docs
do not count, whitespace-only edits do not count) or carries the `no-spec` label; cited decision records and spec paths exist.
Optional, local: a model reads the touched capabilities and may report a contradiction, every finding quoting the spec and the
code, and the program drops a finding whose quotes it cannot find. A model never edits anything and never blocks CI.

## Limits

- **Layout:** it recognises code under `src/` and tests under `test/`, and reads test titles written in the JavaScript style
  (`test("...")`, `it("...")`). For another stack the spec and code-map checks still work for a `src/` layout; the test-title
  detection and the "file in no code-map entry" audit only see `.ts`/`.test.ts`. A new layout needs a change in the
  reviewer (roots, extensions, test-title patterns), which is the next step if this module is wanted for Java, Rust or Python.
- **Monorepos:** refused (see `monorepo.md`).
- **Node:** the scripts run on Node 24 (type stripping, no build). Node must exist on contributors' machines for the hook and in
  CI; the workflow sets it up.
- **OpenSpec CLI:** `specs.yml` runs `npx @fission-ai/openspec@latest validate`. Pin a version once chosen, so a release of the
  tool cannot turn the check red alone.

## Vendored code

`assets/templates/spec-driven/scripts/` is a verbatim copy of `scripts/spec-review.ts` and `scripts/spec-review/*.ts` from the
agentRide repository (`bhoudebert/agent-motoride`) at commit `a555a6d` (2026-11-03). To update it, copy those files over the
vendored ones from a newer checkout, run `npm test` in the skills repository, and update the commit above. The files are copied
raw: no template tags are interpreted in them.

The reviewer can use a local model through Ollama or any OpenAI-compatible server (LiteLLM, vLLM): see `.env.example` in the
generated repository. A thinking model needs `SPEC_REVIEW_EXTRA_BODY={"think":false}` or it can loop until the context is full;
`SPEC_REVIEW_MAX_TOKENS` caps the answer.
