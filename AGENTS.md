# Working in this repository

Read this before changing anything. It applies to people and to coding agents
(Claude Code, Codex, Gemini CLI, GitHub Copilot, others) alike: this file is the
single source of the rules, and `CLAUDE.md`, `GEMINI.md` and
`.github/copilot-instructions.md` only point here.

## What this is

LLM RAG Translator: Translate Markdown manuals with Claude and a RAG translation memory.

`README.md` explains the product, `CONTRIBUTING.md` how to contribute,
`docs/ENGINEERING.md` how it is built, `docs/EVOLVING.md` the path every change
follows from idea to release, and `docs/adr/` why it is shaped this way.
Behaviour is specified in `openspec/specs/<capability>/spec.md`
(requirements with scenarios); `openspec/README.md` explains how to change a spec.

## Rules

1. **Branch, then pull request.** Never commit to `main`. Branch names:
   `feat/...`, `fix/...`, `docs/...`, `build/...`, `ci/...`, `chore/...`.
2. **Conventional Commits, strictly.** `<type>(<scope>): <subject>` with the
   types `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
   `chore`, `style`, `revert`; kebab-case scope; imperative subject; header at
   most 100 characters, body lines at most 120; one concern per commit. The
   commit-msg hook and CI reject anything else (`CONTRIBUTING.md`, "Commits").
3. **Spec first when behaviour changes.** Update or add the requirement in
   `openspec/specs/...` in the same pull request, committed before the code. CI
   fails a pull request that changes code without touching the spec of what it
   changes; the `no-spec` label (or a `No-Spec: <reason>` line in a commit, read
   by the local hook only) is for changes with no behaviour change. **Deciding,
   for an agent:** would a user or the operator notice (a number, a message, a
   rule, an answer, a setting)? Did a test need a new case or a new expected
   value? If either, behaviour changed: update the requirement, do not use
   `no-spec`. When unsure, update the spec.
4. **Tests with the code.** Deterministic logic gets unit tests; tests never call
   a paid or external service for real.
5. **Quality gate before pushing:** `ruff check . && ruff format --check . && pytest` must pass.
6. **Docs with the change.** The README when the overview changes,
   `docs/ENGINEERING.md` when the architecture changes, `ROADMAP.md` when an
   idea is done or added, a decision record in `docs/adr/` for a significant
   architectural choice (a record is superseded, never rewritten).
7. **Pull request** with the template: summary, decision and spec, what was
   verified, what was not. The maintainer reviews and merges.
8. **No attribution trailers** or generated-by footers in commits, pull request
   descriptions or comments.

## How an agent works here

- **Smallest change that solves the request.** Do not refactor, rename or
  "improve" what was not asked. Say what you noticed and let the owner decide.
- **Verify, then claim.** Run the gate and the relevant tests; report what
  passed, what failed and what you did not run, with the output. Never write
  "done" for something unverified.
- **Ask before anything hard to reverse or visible to others**: pushing,
  merging, deleting, force-pushing, publishing, spending money, changing
  settings. Approval for one action is not approval for the next.
- **Secrets stay secret.** Never read, print, log or commit `.env`, keys or
  tokens. Tests run without real credentials.
- **Hooks and CI are the rules, not obstacles.** Never skip a hook
  (`--no-verify`) or weaken a check to get green; fix the cause, or say why a
  rule should change and propose that in its own pull request.
- **Do not merge your own pull request**, and do not rewrite shared history.
- **Leave a trail.** When a choice was non-obvious, put the reason in the
  commit body or a decision record, not only in a chat.

## Code conventions

<!-- Fill in the conventions that are not obvious from the code: layering, error handling,
     naming, where things live, what must never be done. Keep it to what a newcomer would get wrong. -->

- Language and tools: Python. Code under `translate_manual/`, tests under `tests/`.

## Useful commands

```
python -m pip install -e ".[dev]"      # set up the project
ruff check . && ruff format --check . && pytest    # the gate
pytest       # tests only
ruff check .       # lint
ruff format .     # format
sh scripts/setup-hooks.sh   # install the git hooks (once per clone)
nix develop              # the toolchains of every component (or direnv allow)
```
```
node scripts/spec-review.ts --base origin/main --head HEAD   # check your change against the specs
node scripts/spec-review.ts --audit                                       # check the whole repository
```
