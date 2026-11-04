#!/usr/bin/env node
// project-foundation: renders the templates into a repository, and later says what changed in them.
//
//   my-skills init                          look at the repository, ask what cannot be seen, generate
//   my-skills init --config answers.json    the same, from an answers file (what an agent does)
//   my-skills status | upgrade [--apply]    what changed in the templates since the repository was generated
//   my-skills badges [--apply]              a row of badges for the README (printed, or written between markers)
//   my-skills list | version
// Every command takes --target <folder> (default: the current folder); init also --modules a,b, --dry-run, --force, --yes.
//
// Node standard library only. Never changes git state (it only reads `git ls-files`, to warn about files that are tracked
// although they are now ignored), never uses the network, never overwrites a file that exists unless --force is given. `init` records what it wrote in .project-foundation.json (the skill version and source commit,
// the answers, a hash of every generated file), which is what lets `upgrade` tell a template change from a local edit.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ASSETS, SKILL, TEMPLATES, UserError, loadVariables, readJson } from "./lib/answers.mjs";
import { applyBadges, badgeBlock, badgeLines } from "./lib/badges.mjs";
import { interview, lineAsker, repositoryIsPrivate } from "./lib/interview.mjs";
import { render, truthy } from "./lib/render.mjs";

export const PROVENANCE = ".project-foundation.json";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const norm = (p) => path.posix.normalize(p);

// ------------------------------------------------------------------------------------------------ the skill itself

export function skillVersion() {
  const file = path.join(SKILL, "VERSION");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "unknown";
}

/** The commit of the checkout the skill runs from, when it runs from one (a copy installed by `skills` has none). */
export function skillSourceSha() {
  try {
    return execFileSync("git", ["-C", SKILL, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** A hash of what the skill generates from: the templates, the manifest and the profiles. */
export function templatesHash() {
  const hash = createHash("sha256");
  for (const file of walk(ASSETS).sort()) {
    hash.update(path.relative(ASSETS, file)).update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex");
}

// ------------------------------------------------------------------------------------------------ the plan

/** A `tree` entry stands for every file under a folder of the templates, copied to the same relative place. */
function expand(entries) {
  return entries.flatMap((entry) => {
    if (!entry.tree) return [entry];
    const folder = path.join(TEMPLATES, entry.tree);
    const { tree, ...rest } = entry;
    return walk(folder)
      .sort()
      .map((file) => {
        const relative = path.relative(folder, file).split(path.sep).join("/");
        return { ...rest, src: `${tree}/${relative}`, dest: `${entry.dest}/${relative}` };
      });
  });
}

/** Every file the answers produce, rendered, in memory. Nothing is written here. */
export function plan(config, requested) {
  const manifest = readJson(path.join(ASSETS, "manifest.json"));
  const { root, components } = loadVariables(config);
  const files = [];
  for (const [name, module] of Object.entries(manifest.modules)) {
    if (requested) {
      if (!requested.has(name)) continue;
    } else if (module.enabled_by && !truthy(root[module.enabled_by])) {
      continue;
    }
    for (const entry of expand(module.files)) {
      const source = path.join(TEMPLATES, entry.src);
      const seen = new Set();
      const sets = entry.for_each === "component" ? components.map((c) => ({ ...root, ...c })) : [root];
      for (const variables of sets) {
        if (entry.only && !truthy(variables[entry.only])) continue;
        if (entry.unless && truthy(variables[entry.unless])) continue;
        const dest = norm(render(entry.dest, variables, `manifest:${entry.dest}`));
        if (seen.has(dest)) continue;
        seen.add(dest);
        // `raw` files (vendored code) are copied as they are: a template tag inside code would be a coincidence.
        const text = entry.raw ? readFileSync(source, "utf8") : render(readFileSync(source, "utf8"), variables, entry.src);
        files.push({ dest, text, merge: entry.merge, exec: Boolean(entry.exec), module: name });
      }
    }
  }
  return { root, components, files };
}

/** The lines of `wanted` that `existing` does not have yet (comments and blanks are not lines). */
function missingLines(existing, wanted) {
  const have = new Set(existing.split("\n").map((l) => l.trim()));
  return wanted.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !have.has(l.trim()));
}

function mergeGitignore(existing, wanted) {
  const add = missingLines(existing, wanted);
  return add.length ? `${existing.replace(/\n+$/, "")}\n\n# project-foundation\n${add.join("\n")}\n` : existing;
}

/**
 * Files git tracks although .gitignore ignores them (added before the line, or by a sweep like `git add -A`, or forced).
 * Ignoring does not untrack: they stay in `git status` and in every commit. Grouped by folder. Read-only.
 */
export function trackedButIgnored(target) {
  let out;
  try {
    out = execFileSync("git", ["-C", target, "ls-files", "-ci", "--exclude-standard"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return []; // not a git repository
  }
  const groups = new Map();
  for (const file of out.split("\n").filter(Boolean)) {
    const top = file.includes("/") ? `${file.split("/")[0]}/` : file;
    groups.set(top, (groups.get(top) ?? 0) + 1);
  }
  return [...groups].map(
    ([top, count]) => `${count} file(s) under ${top} are tracked by git although .gitignore ignores them: \`git rm -r --cached ${top.replace(/\/$/, "")}\` untracks them (the files stay on disk).`,
  );
}

// ------------------------------------------------------------------------------------------------ init

export function init({ config, target, modules, dryRun = false, force = false }) {
  const requested = modules ? new Set(modules) : null;
  const { root, files } = plan(config, requested);
  const report = { created: [], replaced: [], merged: [], skipped: [], notes: [] };
  const written = {};
  for (const file of files) {
    const dest = path.join(target, file.dest);
    const exists = existsSync(dest);
    if (exists && file.merge === "gitignore") {
      const before = readFileSync(dest, "utf8");
      const after = mergeGitignore(before, file.text);
      if (after !== before) {
        report.merged.push(file.dest);
        if (!dryRun) writeFileSync(dest, after);
      }
      continue;
    }
    if (exists && file.merge === "append") {
      const before = readFileSync(dest, "utf8");
      if (file.text.trim() && !before.includes(file.text.trim())) {
        report.merged.push(file.dest);
        if (!dryRun) writeFileSync(dest, `${before.replace(/\n+$/, "")}\n\n${file.text}`);
      }
      continue;
    }
    if (exists && !force) {
      report.skipped.push(file.dest);
      continue;
    }
    (exists ? report.replaced : report.created).push(file.dest);
    if (!file.merge) written[file.dest] = sha256(file.text);
    if (dryRun) continue;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, file.text);
    if (file.exec) chmodSync(dest, statSync(dest).mode | 0o111);
  }
  if (root.spec_driven && !root.lang_node) {
    report.notes.push(
      "the spec reviewer detects code changes under src/ and reads TypeScript test titles; for another stack its test-title and unmapped-file checks do nothing (the spec and code-map checks still work).",
    );
  }
  if (!dryRun) report.notes.push(...trackedButIgnored(target));
  if (root.nix) report.notes.push("run `nix flake lock` in the repository once, to pin nixpkgs (it needs the network), and commit flake.lock.");
  if (!dryRun) {
    const provenance = {
      skill: "project-foundation",
      version: skillVersion(),
      sourceSha: skillSourceSha(),
      templatesHash: templatesHash(),
      generatedAt: new Date().toISOString(),
      modules: modules ?? null,
      // The date is part of what was generated (the decision records carry it): freeze it, or every later `upgrade` would
      // see the records as changed.
      answers: { today: root.today, year: root.year, ...config },
      files: written,
    };
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, PROVENANCE), JSON.stringify(provenance, null, 2) + "\n");
  }
  return report;
}

// ------------------------------------------------------------------------------------------------ upgrade, status

const readProvenance = (target) => {
  const file = path.join(target, PROVENANCE);
  if (!existsSync(file)) throw new UserError(`${PROVENANCE} not found in ${target}: this repository was not generated by project-foundation (or the file was removed)`);
  return readJson(file);
};

/**
 * Compares the files recorded at init with the current templates, rendered with the same answers.
 * update: the file is as generated and the template changed, so it is safe to apply.
 * conflict: edited here and changed upstream. edited: edited here only, kept. new: a file the templates now produce.
 */
export function upgrade({ target, apply = false, config }) {
  const provenance = readProvenance(target);
  // A repository generated before the date was recorded: the day it was generated is the date its records carry.
  const generatedOn = provenance.generatedAt ? { today: provenance.generatedAt.slice(0, 10), year: provenance.generatedAt.slice(0, 4) } : {};
  const answers = { ...generatedOn, ...(config ?? provenance.answers) };
  const { files } = plan(answers, provenance.modules ? new Set(provenance.modules) : null);
  const result = { unchanged: [], update: [], conflict: [], edited: [], new: [], missing: [], applied: [], merged: [], notes: [] };
  const recordedNow = { ...provenance.files };
  for (const file of files) {
    if (file.merge) {
      // Lines are only ever added to these files, never changed or removed: the user's own lines stay.
      const dest = path.join(target, file.dest);
      if (!existsSync(dest)) {
        // The answers need a file the repository does not have (spec-driven turned on later needs .env.example): create it.
        result.new.push(file.dest);
        if (apply) {
          mkdirSync(path.dirname(dest), { recursive: true });
          writeFileSync(dest, file.text);
          result.applied.push(file.dest);
        }
        continue;
      }
      const before = readFileSync(dest, "utf8");
      let after = before;
      if (file.merge === "gitignore") after = mergeGitignore(before, file.text);
      else if (file.merge === "append" && file.text.trim() && !before.includes(file.text.trim())) after = `${before.replace(/\n+$/, "")}\n\n${file.text}`;
      if (after === before) continue;
      result.merged.push(file.dest);
      if (apply) writeFileSync(dest, after);
      continue;
    }
    const dest = path.join(target, file.dest);
    const recorded = provenance.files[file.dest];
    const next = sha256(file.text);
    if (recorded === undefined) {
      if (!existsSync(dest)) {
        result.new.push(file.dest);
        if (apply) writeNew(dest, file, recordedNow, next, result);
      }
      continue; // a file the repository already had before init is the repository's own
    }
    if (!existsSync(dest)) {
      result.missing.push(file.dest);
      continue;
    }
    const local = sha256(readFileSync(dest, "utf8"));
    if (local === recorded && next === recorded) result.unchanged.push(file.dest);
    else if (local === recorded) {
      result.update.push(file.dest);
      if (apply) writeNew(dest, file, recordedNow, next, result);
    } else if (next === recorded) result.edited.push(file.dest);
    else {
      result.conflict.push(file.dest);
      if (apply) {
        writeFileSync(`${dest}.upstream`, file.text);
        result.applied.push(`${file.dest}.upstream`);
      }
    }
  }
  result.notes.push(...trackedButIgnored(target));
  if (apply) {
    const next = {
      ...provenance,
      // New answers given with --config are the repository's answers from now on: otherwise the next `upgrade` would
      // render from the old ones and offer to undo what was just applied.
      answers,
      files: recordedNow,
      // The recorded version moves forward only when nothing is left to merge by hand.
      ...(result.conflict.length ? {} : { version: skillVersion(), sourceSha: skillSourceSha(), templatesHash: templatesHash() }),
      upgradedAt: new Date().toISOString(),
    };
    writeFileSync(path.join(target, PROVENANCE), JSON.stringify(next, null, 2) + "\n");
  }
  return result;
}

function writeNew(dest, file, recordedNow, hash, result) {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, file.text);
  if (file.exec) chmodSync(dest, statSync(dest).mode | 0o111);
  recordedNow[file.dest] = hash;
  result.applied.push(file.dest);
}

export function status(target) {
  const provenance = readProvenance(target);
  const now = { version: skillVersion(), templatesHash: templatesHash(), sourceSha: skillSourceSha() };
  return {
    recorded: { version: provenance.version, sourceSha: provenance.sourceSha, generatedAt: provenance.generatedAt },
    current: { version: now.version, sourceSha: now.sourceSha },
    upToDate: provenance.templatesHash === now.templatesHash,
    notes: trackedButIgnored(target),
  };
}

// ------------------------------------------------------------------------------------------------ cli

const USAGE = `Usage: my-skills <command> [options]   (or: node foundation.mjs <command>)

  init      look at the repository, ask what cannot be seen, generate the files
              --config <answers.json>  skip the questions and use these answers
              --dry-run                list what would be written, write nothing
              --modules a,b            only these modules (see \`list\`)
              --force                  overwrite files that exist
              --yes                    do not ask for confirmation
              --interactive            ask even when no terminal is attached (answers on stdin)
  status    which skill version generated this repository, and have the templates changed since
  upgrade   what differs from the current templates; --apply writes the safe changes
  badges    a row of README badges that can say something true; --apply writes it under the first title
              --public | --private    the repository's visibility (else read from gh, else assumed private)
  list      the modules and files
  version   the skill's version

Every command works on the current folder, or --target <folder>.`;

const hasNix = () => {
  try {
    execFileSync("nix", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function printList(title, items, trailer = "") {
  if (!items.length) return;
  console.log(`${items.length} file(s) ${title}${trailer}:`);
  for (const item of items) console.log(`  ${item}`);
}

export async function main(argv, out = console.log, input = process.stdin) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      config: { type: "string" },
      target: { type: "string" },
      modules: { type: "string" },
      yes: { type: "boolean" },
      interactive: { type: "boolean" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      apply: { type: "boolean" },
      public: { type: "boolean" },
      private: { type: "boolean" },
    },
    allowPositionals: true,
  });
  switch (command) {
    case "version":
      out(skillVersion());
      return 0;
    case "list": {
      const manifest = readJson(path.join(ASSETS, "manifest.json"));
      for (const [name, module] of Object.entries(manifest.modules)) {
        out(`${name}: ${module.summary}`);
        for (const entry of expand(module.files)) out(`    ${entry.dest}${entry.for_each ? "   (once per component)" : ""}`);
      }
      return 0;
    }
    case "init": {
      const target = path.resolve(values.target ?? ".");
      if (existsSync(path.join(target, PROVENANCE)) && !values.force) {
        throw new UserError(`${PROVENANCE} exists in ${target}: this repository was already set up. Use \`upgrade\` to bring it up to date, or --force to generate again`);
      }
      let config;
      if (values.config) config = readJson(values.config);
      else if (values.interactive || (input.isTTY && process.stdout.isTTY)) {
        const asker = lineAsker(input);
        try {
          config = await interview(target, asker, { hasNix: hasNix(), out });
          out(`\nAnswers:\n${JSON.stringify(config, null, 2)}\n`);
          if (!values.yes && !(await asker.yesNo(values["dry-run"] ? "Show what would be generated?" : "Generate the files?", true))) {
            out("Nothing written.");
            return 1;
          }
        } catch (error) {
          throw error instanceof UserError ? error : new UserError(error.message);
        } finally {
          asker.close();
        }
      } else {
        throw new UserError("init needs --config <answers.json>, or a terminal to ask you the questions (or --interactive with answers on stdin)");
      }
      const report = init({
        config,
        target,
        modules: values.modules?.split(","),
        dryRun: values["dry-run"],
        force: values.force,
      });
      const verb = values["dry-run"] ? "would be " : "";
      printList(`${verb}created`, report.created);
      printList(`${verb}replaced`, report.replaced);
      printList(`${verb}merged into`, report.merged);
      printList("already exist and were left alone (merge them by hand, or rerun with --force)", report.skipped);
      for (const note of report.notes) out(`note: ${note}`);
      return 0;
    }
    case "upgrade": {
      const r = upgrade({ target: path.resolve(values.target ?? "."), apply: values.apply, config: values.config ? readJson(values.config) : undefined });
      printList(values.apply ? "updated from the templates" : "can be updated from the templates (--apply)", r.update);
      printList(values.apply ? "created from the templates" : "new in the templates (--apply)", r.new);
      printList(`changed in the templates and edited here${values.apply ? " (the template is next to it as <file>.upstream)" : ""}`, r.conflict);
      printList("edited here, unchanged in the templates (kept)", r.edited);
      printList("recorded at init but deleted here", r.missing);
      printList(values.apply ? "gained the lines they lacked (yours are kept)" : "lack lines the templates now have (--apply adds them)", r.merged);
      for (const note of r.notes) out(`note: ${note}`);
      if (!r.update.length && !r.new.length && !r.conflict.length && !r.merged.length) out("nothing to upgrade: the generated files match the templates");
      return r.conflict.length ? 1 : 0;
    }
    case "badges": {
      const target = path.resolve(values.target ?? ".");
      const { answers } = readProvenance(target);
      const { root } = loadVariables(answers);
      let visibility = values.public ? "public" : values.private ? "private" : undefined;
      if (!visibility && typeof answers.private === "boolean") visibility = answers.private ? "private" : "public";
      if (!visibility) {
        const priv = repositoryIsPrivate(root.owner, root.repo);
        if (priv !== undefined) visibility = priv ? "private" : "public";
      }
      if (!visibility) out("note: visibility unknown, assuming private (only the licence badge). Pass --public if the repository is public.");
      if (values.apply) {
        const result = applyBadges(target, root, { visibility });
        if (result.missing) throw new UserError("README.md not found: nothing to put the badges in");
        if (result.empty) out("no badge applies to this repository");
        else out(result.changed ? "README.md updated" : "README.md already has these badges");
        return 0;
      }
      const lines = badgeLines(root, { visibility, licenseFile: existsSync(path.join(target, "LICENSE")) });
      out(lines.length ? badgeBlock(lines) : "no badge applies to this repository");
      return 0;
    }
    case "status": {
      const s = status(path.resolve(values.target ?? "."));
      out(`generated with project-foundation ${s.recorded.version}${s.recorded.sourceSha ? ` (${s.recorded.sourceSha.slice(0, 7)})` : ""} on ${s.recorded.generatedAt?.slice(0, 10)}`);
      out(`installed skill is ${s.current.version}${s.current.sourceSha ? ` (${s.current.sourceSha.slice(0, 7)})` : ""}`);
      out(s.upToDate ? "the templates are the ones this repository was generated from" : "the templates changed since: run `upgrade` to see what differs");
      for (const note of s.notes) out(`note: ${note}`);
      return s.upToDate ? 0 : 1;
    }
    default:
      out(USAGE);
      return command ? 2 : 0;
  }
}

// Run when this file is the entry point, also through the symlink an npm `bin` makes.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UserError || error?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      console.error(`error: ${error.message}`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
