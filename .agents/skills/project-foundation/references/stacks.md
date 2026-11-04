# Stacks: what the project must provide, and how to add one

The profiles in `assets/profiles.json` are conventions of each ecosystem. They generate the commands; the project must make
them work. Check each one before the first push, because the CI job and the pre-push hook call `quality_cmd`.

| Profile | `quality_cmd` | The project must have |
| --- | --- | --- |
| `node` | `npm run quality` | A `package.json` with `quality` chaining typecheck, lint, format check and tests; a committed `package-lock.json` (CI uses `npm ci`). Example: `"quality": "npm run typecheck && npm run lint && npm run format:check && npm test"`. Also `lint`, `format`, `format:check`, `test`. The Node version is `.nvmrc`. |
| `java-maven` | `./mvnw -B verify` | The Maven wrapper (`mvn wrapper:wrapper`). `verify` runs tests and any bound checks. For lint and format add the `checkstyle` and `spotless` plugins bound to `verify`, so the one command covers them; the `lint_cmd` and `format_*` entries assume those plugins. |
| `java-gradle` | `./gradlew check` | The Gradle wrapper. `check` runs tests and linters; add `spotless` for formatting. `release_type` is `simple`, which needs a version file release-please can bump (a `version.txt`, or change `release_type`). |
| `rust` | `cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test --locked --all-features` | A committed `Cargo.lock` for binaries (`--locked`). `rust-toolchain.toml` pins the channel with rustfmt and clippy. |
| `python` | `ruff check . && ruff format --check . && pytest` | A `pyproject.toml` with a `dev` extra (`ruff`, `pytest`) so `pip install -e ".[dev]"` works. Pin the version in `.python-version`. Replace ruff with the team's linter if it differs. |
| `go` | `test -z "$(gofmt -l .)" && go vet ./... && go test ./...` | A `go.mod`. Add `golangci-lint` later by editing `quality_cmd`. |
| `other` | none | Everything. The CI job is a placeholder that fails until you replace it, on purpose, so a missing gate is visible. |

## A minimal manifest per stack

Enough for the gate to run on an empty project, and for release-please to have a version to bump. Adjust names; add real
dependencies later.

- **node** `package.json`: `{"name":"web","version":"0.0.0","private":true,"type":"module","scripts":{"lint":"echo no lint yet","format:check":"echo no format yet","test":"node --test","quality":"npm run lint && npm run format:check && npm test"}}`, then `npm install` to create the lock file. Replace the echo placeholders with ESLint and Prettier once chosen.
- **rust** `Cargo.toml`: `[package]\nname = "api"\nversion = "0.0.0"\nedition = "2021"` and `src/main.rs` with `fn main() {}`; run `cargo generate-lockfile`.
- **python** `pyproject.toml`: `[project]\nname = "worker"\nversion = "0.0.0"\n[project.optional-dependencies]\ndev = ["ruff", "pytest"]`, a `tests/` folder with one passing test (pytest exits 5 when it collects nothing, which fails the gate).
- **java-maven** `pom.xml` with `<version>0.0.0</version>` and the wrapper (`mvn wrapper:wrapper`).
- **go** `go.mod` (`go mod init`).

## The first release

release-please bumps the version in the file of the component's type: `package.json`, `Cargo.toml`, `pyproject.toml`,
`pom.xml`, or a `version.txt` for `simple`. The manifest starts every package at `0.0.0`; the first `feat` makes the release
pull request propose `0.1.0` (`bump-minor-pre-major`). A component whose version file does not exist yet has nothing to bump,
so create it (above) before the first release.

## Rules for a good `quality_cmd`

- It is the single command a contributor runs before pushing, and CI runs the same one: if they differ, CI surprises people.
- It fails on a formatting difference (a check mode), never silently rewrites files.
- It runs offline after dependencies are installed, with no real credentials and no paid service. It does not install them: locally run the component's set-up command first (a Python virtualenv, `npm install`), as CI does.
- It finishes in minutes. If it cannot, keep `quality_cmd` fast and add a second CI job for the slow suite.

## Adding a stack

1. Add a profile to `assets/profiles.json`: `family` (`node|java|rust|python|go|other`; add a new family name to `FAMILIES` in
   `scripts/lib/answers.mjs` only if no existing one fits), `tool` (the package-manager flag that selects a CI job template),
   `label`, the commands, `dependabot_ecosystem`, `codeql_language` (empty when CodeQL does not support it),
   `release_type` (a release-please type), `src_dir`, `test_dir`, `test_globs`, `gitignore_extra`, `indent_size`.
2. If setup differs from the existing job templates, add `assets/templates/github/workflows/jobs/<tool>.yml.tmpl` (copy
   `npm.yml.tmpl`: the first lines are the job header with the monorepo `needs`/`if` block; keep them) and add the tool name to
   `TOOLS` in `scripts/lib/answers.mjs`.
3. A toolchain pin file, if the stack has one: a template under `community/` and a `for_each: component` entry in the
   manifest with `only: lang_<family>`.
4. Add the stack to the tests (`tests/project-foundation.test.mjs` renders every profile) and run `npm test`. Give the profile `nix_packages` (nixpkgs attribute names) so the optional Nix shell has its toolchain.

Ecosystem names for Dependabot: `npm`, `maven`, `gradle`, `cargo`, `pip`, `gomod`, `docker`, `nuget`, `composer`,
`bundler`. CodeQL languages: `javascript-typescript`, `java-kotlin`, `python`, `go`, `rust`, `csharp`, `ruby`, `swift`,
`cpp`. Check the current lists before relying on a new one.
