# What each agent reads

Checked on 2026-11-03 against the vendors' documentation and current write-ups. These conventions move: check the sources
again before changing the design, and treat a claim marked "unverified" as such.

| Agent | File it reads | Notes |
| --- | --- | --- |
| Codex (OpenAI) | `AGENTS.md`, `AGENTS.override.md` | Per directory, from the repository root down to the working directory, one file per directory (the override first), concatenated root to leaf so the closest wins. Stops adding files at `project_doc_max_bytes`, 32 KiB by default, and truncates silently. |
| Claude Code | `CLAUDE.md` (and `CLAUDE.local.md`), nested ones when working in a subfolder | Supports `@path` imports. Reads `CLAUDE.md`, not `AGENTS.md`, by the documentation read; one source said it now reads `AGENTS.md` natively, unverified, and an `@AGENTS.md` import works either way. The first import in a project asks for approval. Nesting depth of imports is limited (4 or 5 hops, sources differ). |
| Gemini CLI | `GEMINI.md`; the name is configurable with `context.fileName` in settings | Loads the global file, then the project and its parents, then subdirectories as needed. Supports `@file.md` imports. `context.fileName` can be a list such as `["AGENTS.md", "GEMINI.md"]`; a blog used another key name, unverified. The import in `GEMINI.md` does not depend on that setting. |
| GitHub Copilot | `.github/copilot-instructions.md` (repository-wide), `.github/instructions/**/*.instructions.md` (path-specific, `applyTo` glob), `AGENTS.md` (nearest wins) | The cloud agent and the CLI read `AGENTS.md`; the CLI also reads `CLAUDE.md` and `GEMINI.md`. File references (`@path`) are **not** expanded in `*.instructions.md` or `GEMINI.md` as Copilot reads them, so those files must be self-contained. Code review reads only the first part of `copilot-instructions.md` (about 4,000 characters). `excludeAgent` front matter can keep a file away from one agent. |

## What the design does with that

- `AGENTS.md` is the single source. It stays small: the rules, the agent working agreements, conventions, commands. Long
  explanations live in `CONTRIBUTING.md` and `docs/`, which agents open on demand.
- `CLAUDE.md` is `@AGENTS.md` plus a place for Claude-only notes. `GEMINI.md` is `@./AGENTS.md` plus a place for Gemini-only
  notes.
- `.github/copilot-instructions.md` is a self-contained digest, written so a reader that sees nothing else still enforces the
  essentials (branching, Conventional Commits, tests, secrets, no weakened checks), and says to read `AGENTS.md`.
- Path-specific Copilot files (`tests`, `docs`, one per component) are self-contained, short, and carry only what applies to
  that path.
- Enforcement is in git hooks and CI, which every agent hits equally.

## Adding another agent

Cursor, Windsurf, Aider, Zed and others read their own files (`.cursor/rules`, `.windsurfrules`, `CONVENTIONS.md`...). Add a
thin file that points to `AGENTS.md` (an import if the tool has one, one sentence otherwise). Never paste the rules in.

## Sources

- GitHub Docs, repository custom instructions and Copilot CLI instructions:
  https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions and
  https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- Gemini CLI, GEMINI.md: https://geminicli.com/docs/cli/gemini-md and
  https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html
- Codex, AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- Claude Code memory and imports: https://docs.anthropic.com/en/docs/claude-code/memory (not re-fetched on 2026-11-03: the nested-file behaviour is from earlier reading of the Claude Code docs; re-check it)
