# The interview and the answers file

Ask in one message, with the defaults stated, so a "go with the defaults" is a complete answer. Detect what you can (stacks,
GitHub owner and repo from `git remote -v`, the maintainer from `git config user.name`/GitHub) and propose it instead of asking.

## Questions

| Question | Default | Notes |
| --- | --- | --- |
| Project name, one-line description | none | The description is the first line of the README and `AGENTS.md`. |
| GitHub `owner` and `repo` | from `git remote` | Used in issue-template links. |
| Components: name, path, stack | one component at the root | Stacks: `node`, `java-maven`, `java-gradle`, `rust`, `python`, `go`, `other`. Names are kebab-case: they become commit scopes and CI job names. |
| Maintainer GitHub handle | the owner | CODEOWNERS and the code of conduct contact. |
| Public or private repository, and CodeQL | public: CodeQL on; private: off | `codeql`. Code scanning is free on a public repository. On a **private** one it needs GitHub Code Security (paid, and not offered to every account type); without it the generated workflow fails its upload and every pull request has a red check. Ask, and if the repository is private ask whether they have Code Security. `gh repo view OWNER/REPO --json isPrivate` can answer the first part. |
| Nix dev shell (`flake.nix`, `.envrc`) | no | `nix`. Yes when the user uses Nix: a shell with the toolchains of every component plus `git`, `gh`, `jq`; direnv loads it. Run `nix flake lock` once afterwards (needs the network) and commit `flake.lock`. |
| Release automation (release-please) | yes | `release_please`. Needs a PAT secret to run CI on release PRs (see `github-settings.md`). |
| Spec-driven (openspec + spec-drift reviewer) | no | Only for one component at the root, best with a TypeScript/JavaScript layout. See `spec-driven.md`. |
| Attribution trailers in commits and PRs | none allowed | `no_attribution: true` writes the rule into AGENTS.md, CONTRIBUTING and the Copilot digest. |
| Licence | MIT | Only MIT text is generated; for another licence set `license` to its name and add the file by hand. |
| Default branch | `main` | |
| Runtime versions | from the profile | Node 24, Java 21, Rust stable, Python 3.13, Go stable. Prefer what the project already uses. |

Do not ask about things the base already decides (the commit types, the hook mechanism, the workflow). Tell the user what the
defaults are in one line each, so they can object.

## The answers file

Single project:

```json
{
  "project_name": "Acme Billing",
  "project_slug": "acme-billing",
  "description": "Invoicing for small shops.",
  "owner": "acme",
  "repo": "acme-billing",
  "profile": "java-maven"
}
```

Monorepo:

```json
{
  "project_name": "Acme Platform",
  "project_slug": "acme-platform",
  "description": "The Acme platform: API, workers and web app.",
  "owner": "acme",
  "repo": "platform",
  "components": [
    { "name": "api", "path": "services/api", "profile": "rust" },
    { "name": "worker", "path": "services/worker", "profile": "python", "owner": "data-team" },
    { "name": "web", "path": "web", "profile": "node" }
  ]
}
```

### Fields

Required: `project_name`, `project_slug`, `description`, `owner`, `repo`, and either `profile` or `components`.

Root options (all optional): `maintainer_handle`, `license` (`MIT`), `license_holder`, `default_branch`, `release_please`,
`codeql`, `dependabot`, `nix`, `spec_driven`, `no_attribution`, `header_max` (100), `body_max` (120), `scopes_example`, `ci_timeout`.

A component takes `name`, `path`, `profile`, an optional `owner` (a CODEOWNERS line for its folder), and any profile value to
override it for this component: `runtime_version`, `setup_cmd`, `build_cmd`, `lint_cmd`, `format_cmd`, `format_check_cmd`,
`test_cmd`, `quality_cmd`, `precommit_cmd`, `dependabot_ecosystem`, `codeql_language`, `release_type`, `src_dir`, `test_dir`,
`test_globs`, `gitignore_extra`, `indent_size`, `label`. In a single project the same overrides go at the root.

`quality_cmd` is the one that matters: it must run everything CI should require of that component. `precommit_cmd` is empty
everywhere on purpose; set it (for Node: `npx lint-staged`, with lint-staged installed) only once the project has a fast
staged-files check, because a hook that calls a missing tool breaks the first commit.

### What is derived

For a monorepo the root `quality_cmd` becomes `sh scripts/quality.sh`, the pre-push hook runs `sh scripts/quality.sh --changed`,
scopes become the component names plus `deps`, `docs`, `ci`, `release`, and the files that list components (table in
`AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/ENGINEERING.md`, the Copilot digest) are generated from the answers. Change
the answers and re-run with `--force` on the files you have not edited, rather than hand-editing a table.

## Re-running, and upgrading

`init` is safe to re-run: existing files are skipped and listed, `.gitignore` gains the missing lines, `.env.example` gains the
spec-review block. To add a component later, add it to the answers file, then use `upgrade --config answers.json` (the answers
recorded in `.project-foundation.json` are used when `--config` is left out): it shows what the new answers and the current
templates would change in the files that were generated, and `--apply` writes the safe ones and leaves a `<file>.upstream` next
to any file edited here. `SKILL.md`, step 8, has the states.
