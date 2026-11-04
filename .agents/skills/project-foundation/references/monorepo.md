# Monorepos with several stacks

A single project is a monorepo with one component at the root; the code path is the same. With two or more components
(for example a Rust backend, a Python worker and a Node front end), the shared rules stay at the root and each component
adds what is its own.

## What is shared, what is per component

| Root, once | Per component |
| --- | --- |
| `AGENTS.md` (with the components table), `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` | `<path>/AGENTS.md`, `<path>/CLAUDE.md`, `<path>/GEMINI.md`, `.github/instructions/<name>.instructions.md` (`applyTo: "<path>/**"`) |
| `CONTRIBUTING`, `README`, `docs/` (workflow, engineering, ADRs), PR and issue templates | toolchain pin in the component folder (`.nvmrc`, `rust-toolchain.toml`, `.python-version`) |
| `.githooks/`, `scripts/` (commit check, `quality.sh`, setup) | a CI job in `ci.yml`, a Dependabot entry for its folder, a CodeQL matrix entry per language |
| one `ci.yml`, one `release.yml`, release-please config | a release-please package (tagged `<name>-vX.Y.Z`) |

Why nested agent files: Codex and Copilot read the `AGENTS.md` nearest to the file being worked on, Claude Code and Gemini CLI
read the `CLAUDE.md`/`GEMINI.md` of the folder they work in, in addition to the root ones. So an agent in `services/api/`
gets the root rules plus the Rust component's commands and conventions, and nothing about the web app.

## CI: a job per component, one required check

`ci.yml` has a `changes` job that decides, from the diff, which components a pull request touches (everything when
`.github/` or `scripts/` changed, on a schedule, or on a manual run). Each component job runs only if its folder changed.
The final job, `Quality gate`, waits for all of them and passes when each passed or was skipped. **Make only `Quality gate` a
required check.** A workflow-level `paths:` filter would leave a required check "pending" forever on a pull request that does
not touch its paths, blocking the merge; this design cannot.

Each job runs with `working-directory` set to the component folder and the toolchain of its stack. The `commits` job checks
every commit message of the pull request with the same shell script the hook uses.

## Hooks

`commit-msg` is the same for the whole repository. `pre-push` runs `sh scripts/quality.sh --changed`: the gate of each
component the branch changed, compared with the upstream (or `origin/<default>` when there is none). Documentation-only
branches run nothing. With no upstream and no `origin/<default>` to compare with (a brand-new repository), it runs every component. `sh scripts/quality.sh` runs everything; `sh scripts/quality.sh api web` runs some.

## Releases

release-please runs in manifest mode with one package per component and `include-component-in-tag`, so each component has its
own version, changelog and tag. A commit's scope should be the component, because release-please attributes a commit to a
package by the paths it touches, and the scope tells a reader which. A change that spans components appears in each.

## Limits, stated plainly

- `spec_driven` is refused for a monorepo: the spec reviewer assumes one `src/` layout at the root. Use decision records and
  keep specs per component by hand until the reviewer supports layouts.
- Cross-component changes (an API contract used by the web app) are checked only by each component's own gate, and by the jobs
  that run because both folders changed. A contract test between components is the project's to write.
- A component at the root cannot sit beside others; give it a folder.
- Component names are commit scopes and job ids: kebab-case, unique.
