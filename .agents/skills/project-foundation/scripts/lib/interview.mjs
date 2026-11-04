// `init` with no answers file: look at the repository, ask only what cannot be seen, build the answers.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const IGNORED = new Set([".git", "node_modules", "target", "dist", "build", "vendor", ".venv", "venv", "__pycache__", ".direnv", ".gradle", ".idea"]);

/** The stack a folder holds, from the manifest it contains (first match wins). */
const MANIFESTS = [
  ["package.json", "node"],
  ["Cargo.toml", "rust"],
  ["pom.xml", "java-maven"],
  ["build.gradle", "java-gradle"],
  ["build.gradle.kts", "java-gradle"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["go.mod", "go"],
];

const kebab = (text) => {
  const k = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(k) ? k : `p-${k}`.replace(/-$/, "");
};

/** Stacks found in the folder itself, or else one to three levels down: [{ path, profile }]. */
export function detectStacks(root, maxDepth = 3) {
  const at = (dir) => MANIFESTS.find(([file]) => existsSync(path.join(dir, file)))?.[1];
  const rootStack = at(root);
  // A root manifest with nothing nested is a single project; with component folders below it (a Cargo or npm workspace,
  // a Maven parent) the folders are the components.
  const found = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
      const sub = path.join(dir, entry.name);
      const profile = at(sub);
      if (profile) found.push({ path: path.relative(root, sub).split(path.sep).join("/"), profile });
      else visit(sub, depth + 1);
    }
  };
  visit(root, 1);
  if (found.length >= 2 || (found.length === 1 && !rootStack)) return found;
  return rootStack ? [{ path: ".", profile: rootStack }] : found;
}

/** owner and repo from the origin remote of a GitHub clone. */
export function parseRemote(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url ?? "");
  return m ? { owner: m[1], repo: m[2] } : {};
}

/** Whether a GitHub repository is private, from `gh` when it is installed and logged in; undefined when it cannot say. */
export function repositoryIsPrivate(owner, repo) {
  if (process.env.PROJECT_FOUNDATION_NO_GH) return undefined;
  try {
    const out = execFileSync("gh", ["repo", "view", `${owner}/${repo}`, "--json", "isPrivate", "-q", ".isPrivate"], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    }).trim();
    return out === "true" ? true : out === "false" ? false : undefined;
  } catch {
    return undefined;
  }
}

export function detect(target) {
  const info = { stacks: detectStacks(target), name: path.basename(target), description: "" };
  try {
    const url = execFileSync("git", ["-C", target, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    Object.assign(info, parseRemote(url));
  } catch {
    /* no git, or no remote */
  }
  if (info.owner && info.repo) info.isPrivate = repositoryIsPrivate(info.owner, info.repo);
  const pkg = path.join(target, "package.json");
  if (existsSync(pkg)) {
    try {
      const json = JSON.parse(readFileSync(pkg, "utf8"));
      if (json.description) info.description = json.description;
    } catch {
      /* an unreadable package.json is not our business */
    }
  }
  return info;
}

/** Questions answered from a stream of lines: a terminal, or a pipe (so the interview can be scripted and tested). */
export function lineAsker(input = process.stdin, output = process.stdout) {
  const rl = readline.createInterface({ input });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question, fallback = "") => {
    output.write(fallback !== "" ? `${question} [${fallback}] ` : `${question} `);
    const { value, done } = await lines.next();
    if (done) output.write("\n");
    const answer = (value ?? "").trim();
    return answer === "" ? fallback : answer;
  };
  const yesNo = async (question, fallback) => {
    const answer = (await ask(`${question} (y/n)`, fallback ? "y" : "n")).toLowerCase();
    return answer.startsWith("y");
  };
  return { ask, yesNo, close: () => rl.close() };
}

const PROFILES = ["node", "java-maven", "java-gradle", "rust", "python", "go", "other"];

/**
 * Builds the answers. `asker` has ask(question, default) and yesNo(question, default); `env` says what is installed.
 * Returns the answers object `init` takes.
 */
export async function interview(target, asker, { hasNix = false, out = (t) => console.log(t) } = {}) {
  const seen = detect(target);
  const { ask, yesNo } = asker;

  if (seen.stacks.length) {
    out("Found: " + seen.stacks.map((s) => `${s.profile} in ${s.path === "." ? "the repository root" : s.path}`).join(", "));
  } else {
    out("No Node, Rust, Java, Python or Go manifest found.");
  }

  const answers = {};
  answers.project_name = await ask("Project name?", seen.name);
  answers.project_slug = kebab(answers.project_name);
  answers.description = await ask("One-line description?", seen.description || `${answers.project_name}.`);
  answers.owner = await ask("GitHub owner (user or organisation)?", seen.owner ?? "");
  answers.repo = await ask("GitHub repository name?", seen.repo ?? answers.project_slug);
  if (!answers.owner) throw new Error("A GitHub owner is needed (it is used in links and CODEOWNERS).");
  // Code scanning is free on a public repository; on a private one it needs GitHub Code Security, a paid plan that not every
  // account can buy. Generating the workflow where it cannot run gives a red check on every pull request.
  let isPrivate = seen.isPrivate;
  if (isPrivate === undefined) isPrivate = await yesNo("Is the repository private?", false);
  else out(`GitHub says the repository is ${isPrivate ? "private" : "public"}.`);
  answers.private = isPrivate;
  answers.codeql = isPrivate
    ? await yesNo("CodeQL code scanning on a private repository needs GitHub Code Security (paid). Do you have it?", false)
    : await yesNo("Run CodeQL code scanning (free on a public repository)?", true);
  const maintainer = await ask("Maintainer's GitHub handle?", answers.owner);
  if (maintainer !== answers.owner) answers.maintainer_handle = maintainer.replace(/^@/, "");

  let stacks = seen.stacks;
  if (!stacks.length) {
    const profile = await ask(`Stack? (${PROFILES.join(", ")})`, "other");
    if (!PROFILES.includes(profile)) throw new Error(`Unknown stack '${profile}'`);
    stacks = [{ path: ".", profile }];
  }
  if (stacks.length === 1 && stacks[0].path === ".") {
    answers.profile = stacks[0].profile;
  } else {
    const used = new Set();
    answers.components = [];
    for (const stack of stacks) {
      let name = kebab(path.posix.basename(stack.path));
      for (let i = 2; used.has(name); i++) name = `${kebab(path.posix.basename(stack.path))}-${i}`;
      used.add(name);
      answers.components.push({ name: await ask(`Name of the component in ${stack.path} (${stack.profile})?`, name), path: stack.path, profile: stack.profile });
    }
  }

  answers.nix = await yesNo("Add a Nix dev shell (flake.nix, direnv)?", hasNix);
  answers.release_please = await yesNo("Automate releases with release-please?", true);
  if (!answers.components && answers.profile === "node") {
    answers.spec_driven = await yesNo("Spec-driven development (openspec and the spec-drift reviewer)?", false);
  }
  answers.agent_opens_prs = await yesNo("Should agents open pull requests themselves (push a branch, gh pr create)?", true);
  answers.skill_in_repo = await yesNo("Commit the installed skill into the repository, so every contributor and agent has it?", true);
  answers.no_attribution = await yesNo("Forbid attribution trailers and generated-by footers in commits?", true);
  return answers;
}
