# Evolving this skill

## Layout

```
SKILL.md                      what Claude reads when the skill triggers
scripts/foundation.mjs         the command line: init, upgrade, status, list
scripts/lib/render.mjs        the template engine
scripts/lib/answers.mjs       answers to variables, and the blocks of text built from the components (`derive`)
VERSION                       the skill's version, recorded in every repository it generates
assets/profiles.json          the stacks: commands, tool names, ecosystems, release types
assets/manifest.json          which template becomes which file, in which module, under which condition
assets/templates/             the templates; spec-driven/scripts is vendored code, copied raw
references/                   documents loaded when needed
(repository root) tests/project-foundation.test.mjs   renders every stack, with and without spec-driven, a monorepo and the Nix shell, and checks the output
```

## Template syntax

`@@name@@` is a variable; an unknown name is an error. `@@#if name@@ ... @@/if@@` and `@@#unless name@@ ... @@/unless@@` are
blocks, nestable; a tag alone on its line removes the line. The delimiters were chosen so that GitHub Actions' `${{ }}` and
shell's `[[ ]]` need no escaping. A block that removes lines can leave two blank lines in a row: the renderer collapses three
newlines to two, and the tests fail on a heading or table that touches the text before it.

Per-component files are manifest entries with `"for_each": "component"`; their destination and content are rendered with the
component's variables over the root's (`component_name`, `component_path`, `component_prefix`, `component_glob`, `label`,
`quality_cmd`, ...). Blocks of text built from all components (`components_table`, `ci_jobs`, `dependabot_updates`,
`codeql_matrix`, `release_packages_json`, `quality_functions`, ...) are made in `derive()` in `scripts/lib/answers.mjs`: when a root file
lists the components, add the block there, not as a loop in a template.

## Changing something

1. Edit the template (and `profiles.json` or `manifest.json` if the set of files or commands changes).
2. `npm test` in the skills repository. To parse the generated YAML too, point `YAML_NODE_PATH` at a `node_modules` folder that
   has the `yaml` package. Install `actionlint` if you can and run it on the output of each stack.
3. If a rule changes, change it in every place that states it: `AGENTS.md`, `CONTRIBUTING.md`, the Copilot digest, the PR
   template, the hook or workflow that enforces it, and the ADR. The tests check the sizes of the agent files and the links
   between generated files, not that the wording agrees.
4. Keep `AGENTS.md` small and the Copilot digest under 4,000 characters: a test enforces both.

## Where this comes from

The workflow, the commit rules, the ADR practice, the spec-drift reviewer and the agent working agreements were distilled from
the agentRide project (`bhoudebert/agent-motoride`): `AGENTS.md`, `CONTRIBUTING.md`, `docs/EVOLVING.md`, `docs/adr/`,
`.github/workflows/`. When that project learns something, update the matching template here and its test.
