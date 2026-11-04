---
name: project-foundation
description: Bootstrap or retrofit a repository with a complete, agent-compatible engineering foundation, for one project or a monorepo mixing stacks (Rust, Python, Node, Java, Go...). Generates one AGENTS.md that Claude Code, Codex, Gemini CLI and GitHub Copilot all follow (with the thin CLAUDE.md, GEMINI.md and Copilot files that point to it), CONTRIBUTING with the idea-to-release workflow drawing, an ADR folder, PR and issue templates, tool-neutral Conventional Commits git hooks, CI with one required check, CodeQL, Dependabot, release-please, and an optional spec-driven module. Use this whenever the user starts a new project or repo, says "set up the repo", "bootstrap the project", "add CONTRIBUTING / AGENTS.md / CI / ADRs / hooks / templates", "make this repo agent-friendly or ready for AI agents", "same setup as agentRide", or wants the same working agreements across Java, Node, Rust, Python or Go projects, even if they only name one of those pieces.
---

# Project foundation

Starts a repository from a good base: the rules a team and its coding agents follow, the checks that enforce them, and the
documents that explain them. It is distilled from a project that ran this way for months with several agents and
contributors, so every file exists for a reason that is written next to it.

Two ideas shape everything, and keep them when you adapt anything:

1. **One source of truth for agents.** `AGENTS.md` holds the rules. `CLAUDE.md`, `GEMINI.md` and the Copilot file only point
   to it. Four copies of the rules drift apart, and an agent that follows a stale copy breaks the workflow.
2. **Enforcement lives in git and CI, never in one agent's settings.** Hooks and required checks bind a person, Claude,
   Codex, Gemini and Copilot alike. An agent-specific setting (a Claude hook, a Cursor rule) can be a convenience on top,
   but a rule that only one tool honours is a wish.

## What you produce

| Module | Files | Why |
| --- | --- | --- |
| `agent-instructions` | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, path-specific Copilot files; per component in a monorepo | every agent reads its own file; all lead to the same rules |
| `community` | `README`, `CONTRIBUTING` (workflow drawing, "what do I do", "what is checked where"), `SECURITY`, `SUPPORT`, `CODE_OF_CONDUCT`, `LICENSE`, `ROADMAP`, `.editorconfig`, `.gitignore`, toolchain pins | a newcomer, human or agent, can act without asking |
| `decisions` | `docs/EVOLVING.md`, `docs/ENGINEERING.md`, `docs/adr/` with a template and three seed records | the path from idea to release, and the reasons behind it |
| `github` | PR template, issue templates, `CODEOWNERS`, Dependabot | the maintainer's review is structured, dependencies stay current |
| `ci` | one `CI` workflow (a job per component, one required `Quality gate`), PR title check, CodeQL | the rule that cannot be skipped |
| `release` | release-please workflow and config | a release is one merge |
| `hooks` | `.githooks/` (commit-msg, pre-push), `scripts/` (commit check, quality gate, setup) | fast feedback before CI, in POSIX shell, for every stack |
| `spec-driven` (optional) | `openspec/`, the spec-drift reviewer, `specs.yml` | behaviour is specified first, and drift is caught |

`node scripts/foundation.mjs list` prints the exact files. Add `nix` (a flake dev shell with the toolchains of every component,
and direnv) when the user uses Nix: it is off by default.

## Workflow

### 1. Look before asking

Read the target folder: is it empty, or an existing repository? `ls`, `git log --oneline | head`, manifests
(`package.json`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `pyproject.toml`, `go.mod`), existing CI, existing
`CONTRIBUTING`/`AGENTS.md`. Detect the stacks and, in a monorepo, where each lives. In an existing repository, never replace
what is there: the script skips existing files and reports them, and you merge by hand (the workflow's reasons are in the
templates; keep the project's own wording where it already says the same thing).

### 2. Interview, briefly, and wait for the answer

**Stop and ask before generating anything.** What you detected (stacks, GitHub owner and repo, the name) are facts you can state.
The choices are the user's: whether the repository is public or private and so whether CodeQL runs (private needs the paid
GitHub Code Security, see `references/interview.md`), the Nix dev shell, release automation, spec-driven, the attribution rule,
the maintainer, and any command that does not fit what you saw (the quality gate above all). A default is a proposal, not a decision, so never apply
one silently.

Send **one message** with: what you found, then a numbered list of every choice with the default you suggest, and end with
"Reply with changes, or say go." Then wait. `references/interview.md` has the questions and the answers file. Skip the wait
only when the user said so in this conversation ("don't ask", "use the defaults"), or when no one can answer (a subagent, a
script); in that case state each default you chose, in one line each, in your report.

After the answers, before writing, show the dry-run file list (step 3) and let the user say go or exclude something.

### 3. Write the answers file and preview

If the user has the `my-skills` command (`npm link` from the skills repository, or `npx github:bhoudebert/my-skills`), the
simplest path is to tell them to run `my-skills init` in the repository: it detects the stacks and the GitHub owner and repo,
asks the rest, and needs no answers file. Otherwise write `answers.json` outside the repository (or in `/tmp`), then:

```bash
node <skill>/scripts/foundation.mjs init --config answers.json --target <repo> --dry-run
node <skill>/scripts/foundation.mjs init --config answers.json --target <repo>
```

`<skill>` is the folder this `SKILL.md` is in. The script needs Node 22 or later and nothing else. It renders every template
with the stack's commands, never overwrites a file (add `--force` only when the user asks), runs no git and no network, and
prints what it created, merged and skipped. It also writes `.project-foundation.json` in the repository: the skill version
and source commit, your answers, and a hash of each file it generated. Commit it: it is what makes the next section work.

### 4. Make the gate real

The templates reference commands (`npm run quality`, `./mvnw -B verify`, `cargo clippy ...`). The CI and the pre-push hook call
them, so each must exist. `references/stacks.md` says, per stack, what the project has to provide (a `quality` script, a
formatter plugin, a lint config, a test runner), gives a minimal manifest for each stack, and lists the version file
release-please bumps for a first release (`Cargo.toml`, `pyproject.toml`, `package.json`, `pom.xml`). In an empty repository
none of that exists yet, so **right after the bootstrap the gate fails, and so does the pre-push hook**: that is correct, not a
defect of the base. Either scaffold the manifests now (when the user asked for a working skeleton), or say so plainly and tell
them the first push needs `SKIP_PRE_PUSH=1` until the project has code. Do not invent application code to turn the gate green. Where a command in the profile does not fit the project, change `quality_cmd` in the answers and re-render, or edit the
generated file; the one rule is that `quality_cmd` runs everything CI runs.

### 5. Replace the placeholders

Every `<!-- ... -->` comment in the generated documents asks for something only this project knows: the product status, the
code conventions a newcomer gets wrong (`AGENTS.md`, "Code conventions"), what the software reaches (`SECURITY.md`), the
overview and rules the code enforces (`docs/ENGINEERING.md`), what helps most (`CONTRIBUTING.md`). Fill the ones you can
answer from the code and the conversation, and never invent facts for the rest. Leave those comments in place, and end your
report with the list (`grep -rn "<!--" --include="*.md" .` finds them) so the user knows what is still theirs to write. A few
comments are meant to stay: the Claude-only and Gemini-only notes under the import line, and the hints in the PR template. Keep `AGENTS.md` short (Codex reads 32 KiB at most) and the Copilot file under
about 4,000 characters (code review reads only the start).

### 6. Verify, and show the evidence

```bash
sh scripts/setup-hooks.sh
git commit --allow-empty -m "bad message"                # must be rejected by the commit-msg hook
git commit --allow-empty -m "chore: start the project"   # must pass
git commit --allow-empty -m "chore: x" -m "Co-Authored-By: Someone <a@b.c>"   # rejected too, unless attribution is allowed
<the quality command>                                     # must pass once the project has its manifests (step 4)
```

A fresh repository may have no `user.name`/`user.email`: set a local identity for these commits rather than a global one.

Parse the workflows if you can (`actionlint`, or any YAML parser), and run the skill's own checks when you change a template
(`npm test` in the skills repository). Report what you ran and what you did not.

### 7. Hand over what only the owner can do

You cannot and should not change GitHub settings without being asked. List them for the user, with the commands, from
`references/github-settings.md`: branch protection with the required check names (`Quality gate`, `conventional-title`,
and the spec checks when enabled), squash-merge only, the `no-spec` label, the `RELEASE_PLEASE_TOKEN` secret, Dependabot and
code scanning (do not enable CodeQL "default setup" beside the generated workflow).

### 8. Later: keeping a repository up to date

When a repository already has `.project-foundation.json`, the foundation was applied before. Run
`node <skill>/scripts/foundation.mjs status --target <repo>`: it says which skill version generated the repository and whether
the templates changed since (exit code 1 when they did). Then `upgrade --target <repo>` lists, without writing anything, which
generated files can be brought up to date (as generated, template changed), which are new, which were edited locally and also
changed in the templates (conflicts), and which were edited locally only (kept). `upgrade --apply` writes the safe ones, puts
the new template next to a conflicting file as `<file>.upstream` for you to merge by hand, and never overwrites an edited
file. A file that existed before the foundation was applied is the repository's own and is never touched. The skill itself is
updated by whatever installed it (`npx skills update`, or a `git pull` of the clone it is linked from).

### 9. Optional: README badges

`node <skill>/scripts/foundation.mjs badges --target <repo>` prints a row of badges that can say something true, for the user to
paste; `--apply` writes it between `<!-- badges:start -->` and `<!-- badges:end -->` under the README's first title (and
replaces it on a later run), leaving the rest of the README alone. A public repository gets CI, CodeQL (if kept), the latest
release (if release-please is on) and the licence; a private one only the licence, because the others cannot be drawn for people
without access. Pass `--public` or `--private` when `gh` cannot tell. Offer it, never run it unasked.

## Monorepos

A repository is a list of components, each with a name, a path and a stack. Shared rules, hooks, ADRs and one CI workflow live
at the root; each component gets its own `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` (agents read the nearest one), a Copilot
path-specific file, a toolchain pin, a CI job, a Dependabot entry, and a release-please package. CI runs only the components a
pull request touches, and the single required check `Quality gate` waits for them, so a path filter never leaves a required
check pending. Locally, `sh scripts/quality.sh --changed` runs the gates of what a branch changed. Commit scopes are the
component names. `references/monorepo.md` has the design and its limits.

## Agent compatibility

| Agent | Reads | Here |
| --- | --- | --- |
| Codex | `AGENTS.md`, nearest to the file, 32 KiB at most | the source of truth, plus nested files per component |
| Claude Code | `CLAUDE.md` | `@AGENTS.md` import, Claude-only notes below it |
| Gemini CLI | `GEMINI.md` | `@./AGENTS.md` import |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` (`applyTo`), and `AGENTS.md` for its agents | a short self-contained digest, path files per component |

Another agent (Cursor, Windsurf, Aider...) is the same move: a thin file that points to `AGENTS.md`, never a second copy of
the rules. `references/agent-instructions.md` has the verified facts, their sources and the limits.

## Adapting the base, not eroding it

- A new stack is a profile in `assets/profiles.json` and, if its CI setup differs, a job template in
  `assets/templates/github/workflows/jobs/`. `references/stacks.md` says how.
- A rule the user wants to drop goes out of `AGENTS.md`, `CONTRIBUTING.md` and the Copilot digest together, with the hook or
  check that enforced it, and a decision record saying why. Dropping the check and keeping the rule (or the reverse) is how a
  base rots.
- Do not add generated-by footers, co-author trailers or attribution to anything this skill writes, unless the user's answers
  turn `no_attribution` off.
- Keep templates dependency-free: the hooks are POSIX shell, the renderer is the Python standard library, CI needs nothing to
  install beyond the project's own toolchain.

## Reference files

- `references/interview.md`: the questions, the defaults, and the answers file with every field.
- `references/stacks.md`: per stack, what the project must provide for the gate, and how to add a stack.
- `references/monorepo.md`: components, the CI gate, the hooks, releases, limits.
- `references/agent-instructions.md`: what each agent reads, sizes, nesting, sources.
- `references/github-settings.md`: the manual steps and the commands for them.
- `references/spec-driven.md`: the optional spec module, its limits, how it is kept up to date.
- `references/maintenance.md`: evolving this skill: template syntax, tests, vendored code.
