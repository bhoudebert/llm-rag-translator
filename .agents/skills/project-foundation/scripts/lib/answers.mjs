// From the answers file to the variables the templates use: one set for the root, one per component.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indent, render, truthy } from "./render.mjs";

export const SKILL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const ASSETS = path.join(SKILL, "assets");
export const TEMPLATES = path.join(ASSETS, "templates");

const STRUCTURAL = new Set(["name", "path", "profile", "components"]);
const FAMILIES = ["node", "java", "rust", "python", "go", "other"];
const TOOLS = ["npm", "maven", "gradle", "cargo", "pip", "go", "none"];

export class UserError extends Error {}

const fail = (message) => {
  throw new UserError(message);
};

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** posix normpath, with no trailing slash. */
const normalize = (p) => {
  const n = path.posix.normalize(p);
  return n.length > 1 && n.endsWith("/") ? n.slice(0, -1) : n;
};

function addFlags(variables) {
  for (const known of FAMILIES) variables[`lang_${known}`] = variables.family === known;
  for (const known of TOOLS) variables[`tool_${known}`] = (variables.tool ?? "none") === known;
}

function componentVariables(defaults, profiles, component) {
  const profile = component.profile;
  if (!(profile in profiles)) fail(`Unknown profile '${profile}'. Choose one of: ${Object.keys(profiles).sort().join(", ")}`);
  const name = component.name ?? "";
  if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`Component name '${name}' must be kebab-case (it is a commit scope and a CI job name)`);
  const p = normalize(component.path ?? ".");
  if (p.startsWith("/") || p.startsWith("..") || p.split("/").includes("..")) {
    fail(`Component '${name}': the path must be inside the repository, not '${p}'`);
  }
  const overrides = Object.fromEntries(Object.entries(component).filter(([k]) => !STRUCTURAL.has(k)));
  const v = { ...defaults, ...profiles[profile], ...overrides };
  v.profile = profile;
  v.component_name = name;
  v.component_key = name.replaceAll("-", "_");
  v.component_path = p;
  v.component_prefix = p === "." ? "" : `${p}/`;
  v.component_glob = p === "." ? "**" : `${p}/**`;
  v.component_test_globs = String(v.test_globs ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => v.component_prefix + g)
    .join(",");
  v.component_label_short = v.label ?? profile;
  addFlags(v);
  return v;
}

export function loadVariables(config) {
  const profilesFile = readJson(path.join(ASSETS, "profiles.json"));
  const { defaults, profiles } = profilesFile;

  const rootConfig = Object.fromEntries(Object.entries(config).filter(([k]) => !STRUCTURAL.has(k)));
  for (const required of ["project_name", "project_slug", "description", "owner", "repo"]) {
    if (!config[required]) fail(`Missing required answer: ${required}`);
  }
  let raw;
  if ("components" in config) {
    raw = config.components;
    if (!raw.length) fail("`components` is empty: list at least one component");
  } else {
    if (!("profile" in config)) fail("Answer either `profile` (one project) or `components` (a monorepo)");
    raw = [{ name: config.project_slug ?? "", path: ".", profile: config.profile, ...rootConfig }];
  }
  const components = raw.map((c) => componentVariables(defaults, profiles, c));
  const names = components.map((c) => c.component_name);
  const paths = components.map((c) => c.component_path);
  if (new Set(names).size !== names.length || new Set(paths).size !== paths.length) fail("Component names and paths must each be unique");
  if (components.length > 1 && paths.includes(".")) fail("A component at the repository root cannot sit beside others: give it a folder");

  const monorepo = components.length > 1;
  let root;
  if (monorepo) {
    root = { ...defaults };
    root.label = "Monorepo: " + components.map((c) => `${c.component_name} (${c.component_label_short})`).join(", ");
    root.quality_cmd = "sh scripts/quality.sh";
    root.setup_cmd = "sh scripts/quality.sh --help";
    for (const key of ["test_cmd", "lint_cmd", "format_cmd", "build_cmd", "format_check_cmd", "runtime_version"]) root[key] = "";
    root.src_dir = "<component>/src";
    root.test_dir = "<component>/tests";
    root.test_globs = components.map((c) => c.component_test_globs).join(",");
    root.gitignore_extra = [...new Set(components.flatMap((c) => String(c.gitignore_extra).split("\n")))].join("\n");
    root.family = "other";
    root.tool = "none";
  } else {
    root = { ...components[0] };
  }
  Object.assign(root, rootConfig);
  for (const key of ["component_name", "component_path", "component_prefix", "component_glob", "component_key", "component_test_globs", "component_label_short"]) {
    if (!(key in root)) root[key] = "";
  }

  const today = new Date();
  root.year ??= String(today.getFullYear());
  root.today ??= today.toISOString().slice(0, 10);
  for (const required of ["project_name", "project_slug", "description", "owner", "repo"]) {
    if (!root[required]) fail(`Missing required answer: ${required}`);
  }
  root.maintainer_handle = root.maintainer_handle || root.owner;
  root.license_holder = root.license_holder || root.owner;
  root.license_mit = String(root.license ?? "").toUpperCase() === "MIT";
  root.monorepo = monorepo;
  // Flags that say "some component is a ...": a root file can only describe the repository as a whole.
  for (const known of FAMILIES) root[`lang_${known}`] = components.some((c) => c.family === known);
  for (const known of TOOLS) root[`tool_${known}`] = components.some((c) => c.tool === known);
  const languages = [...new Set(components.map((c) => c.codeql_language).filter(Boolean))];
  const ecosystems = components.filter((c) => c.dependabot_ecosystem);
  root.codeql = truthy(root.codeql) && languages.length > 0;
  root.dependabot = truthy(root.dependabot) && ecosystems.length > 0;
  for (const flag of ["spec_driven", "no_attribution", "release_please", "nix", "agent_opens_prs", "skill_in_repo"]) root[flag] = truthy(root[flag]);
  if (root.spec_driven && monorepo) {
    fail(
      "spec_driven is not supported for a monorepo yet: the spec reviewer assumes one src/ layout at the root. " +
        "Keep the decision records and the other modules, and leave spec_driven off.",
    );
  }
  derive(root, components, languages);
  return { root, components };
}

// ------------------------------------------------------------------------------------------------ fragments

/** Text blocks built from the components, for the files that list them. */
function derive(root, components, languages) {
  const monorepo = root.monorepo;

  const table = ["| Component | Path | Stack | Quality gate |", "| --------- | ---- | ----- | ------------ |"];
  for (const c of components) table.push(`| \`${c.component_name}\` | \`${c.component_path}\` | ${c.label} | \`${c.quality_cmd || "define it"}\` |`);
  root.components_table = table.join("\n");

  const lines = ["sh scripts/quality.sh                # the gate of every component", "sh scripts/quality.sh --changed      # only the components this branch changed"];
  for (const c of components) {
    lines.push("", `# ${c.component_name}: ${c.label}, in ${c.component_path}/`);
    for (const [label, key] of [["set up", "setup_cmd"], ["tests", "test_cmd"], ["gate", "quality_cmd"]]) {
      if (c[key]) lines.push(`(cd ${c.component_path} && ${c[key]})   # ${label}`);
    }
  }
  root.components_commands = lines.join("\n");
  root.components_digest = components
    .map((c) => `- \`${c.component_name}\` (${c.label}) in \`${c.component_path}/\`: gate \`${c.quality_cmd || "define it"}\`, run from that folder.`)
    .join("\n");
  root.hook_quality_cmd = monorepo ? "sh scripts/quality.sh --changed" : root.quality_cmd;
  if (monorepo) root.scopes_example = [...components.map((c) => c.component_name), "deps", "docs", "ci", "release"].join(", ");

  // Dependabot: one entry per component folder; the workflows are added by the template.
  root.dependabot_updates = components
    .filter((c) => c.dependabot_ecosystem)
    .map((c) => {
      const directory = c.component_path === "." ? "/" : `/${c.component_path}`;
      return (
        `  - package-ecosystem: ${c.dependabot_ecosystem}\n    directory: ${directory}\n    schedule:\n      interval: weekly\n` +
        `    # Dependabot's titles must pass the Conventional Commits check: "build(deps): bump ...".\n` +
        `    commit-message:\n      prefix: build\n      include: scope`
      );
    })
    .join("\n");

  // CodeQL: one matrix entry per language; compiled languages are analysed without a build.
  root.codeql_matrix = languages
    .map((language) => {
      const mode = { "java-kotlin": "none", rust: "none", go: "autobuild" }[language];
      return `          - language: ${language}` + (mode ? `\n            build-mode: ${mode}` : "");
    })
    .join("\n");

  // release-please: one package per component, tagged with the component's name in a monorepo.
  const packages = {};
  for (const c of components) packages[c.component_path] = { "release-type": c.release_type, ...(monorepo ? { component: c.component_name } : {}) };
  root.release_packages_json = indent(JSON.stringify(packages, null, 2), 2).trimStart();
  root.release_manifest_json = JSON.stringify(Object.fromEntries(components.map((c) => [c.component_path, "0.0.0"])), null, 2);
  root.release_component_in_tag = monorepo ? "true" : "false";

  // Editorconfig: a section where a component's indentation differs from the default.
  root.editorconfig_sections = components
    .filter((c) => c.indent_size !== "2")
    .map((c) => `[${c.component_path === "." ? "*" : `${c.component_path}/**`}]\nindent_size = ${c.indent_size}`)
    .join("\n\n");
  root.indent_size = "2";

  root.codeowners_lines = components
    .filter((c) => c.owner && c.component_path !== ".")
    .map((c) => `/${c.component_path}/ @${String(c.owner).replace(/^@/, "")}`)
    .join("\n");

  // Nix dev shell: the packages of every stack, once each.
  const nixPackages = [...new Set(components.flatMap((c) => String(c.nix_packages ?? "").split(/\s+/).filter(Boolean)))];
  root.nix_packages = nixPackages.join(" ");
  root.nix_package_lines = nixPackages.map((p) => `            ${p}`).join("\n");

  // CI: a job per component, a job that says which components a change touches, one gate that is the required check.
  root.ci_jobs = components
    .map((c) => {
      const file = path.join(TEMPLATES, "github", "workflows", "jobs", `${c.tool ?? "none"}.yml.tmpl`);
      return render(readFileSync(file, "utf8"), { ...root, ...c }, path.relative(TEMPLATES, file)).replace(/\n+$/, "");
    })
    .join("\n\n");
  root.gate_needs = ["commits", ...components.map((c) => `quality-${c.component_name}`)].join(", ");
  root.changes_outputs = components.map((c) => `      ${c.component_key}: \${{ steps.diff.outputs.${c.component_key} }}`).join("\n");
  const script = [
    'if [ "${{ github.event_name }}" = "pull_request" ]; then',
    '  files=$(git diff --name-only "${{ github.event.pull_request.base.sha }}" "${{ github.event.pull_request.head.sha }}")',
    'elif [ "${{ github.event_name }}" = "push" ] && [ "${{ github.event.before }}" != "0000000000000000000000000000000000000000" ]; then',
    '  files=$(git diff --name-only "${{ github.event.before }}" "${{ github.sha }}")',
    "else",
    "  files=ALL   # a schedule, a manual run, a first push: everything",
    "fi",
    "all=false",
    '[ "$files" = ALL ] && all=true',
    "# A change to the workflows or the shared scripts can break any component.",
    "echo \"$files\" | grep -Eq '^(\\.github/|scripts/)' && all=true",
  ];
  for (const c of components) {
    script.push(
      `if [ "$all" = true ] || echo "$files" | grep -q "^${c.component_path}/"; then echo "${c.component_key}=true" >> "$GITHUB_OUTPUT"; ` +
        `else echo "${c.component_key}=false" >> "$GITHUB_OUTPUT"; fi`,
    );
  }
  root.changes_script = indent(script.join("\n"), 10);

  // scripts/quality.sh: the gate of each component, runnable whole or for what a branch changed.
  const functions = [];
  const pathsCase = [];
  for (const c of components) {
    const command = c.quality_cmd || 'echo "no quality gate defined for this component yet" >&2; false';
    functions.push(`run_${c.component_key}() { echo "==> ${c.component_name} (${c.component_path})"; (cd "${c.component_path}" && ${command}); }`);
    pathsCase.push(`    ${c.component_name}) echo "${c.component_path}" ;;`);
  }
  root.quality_functions = functions.join("\n");
  root.quality_paths_case = pathsCase.join("\n");
  root.quality_names = components.map((c) => c.component_name).join(" ");
  root.quality_dispatch = components.map((c) => `    ${c.component_name}) run_${c.component_key} || status=1 ;;`).join("\n");
}
