// A row of badges for the README, from what was generated: only the ones that can say something true.
//   public repository:  CI, CodeQL (if kept), latest release (if release-please is on), licence
//   private repository: the licence only: the others cannot be drawn for people without access
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const START = "<!-- badges:start -->";
export const END = "<!-- badges:end -->";

/**
 * `root` is the variables of loadVariables(); `visibility` is "public", "private" or undefined (unknown: treated as private,
 * because a broken image is worse than a missing one).
 */
export function badgeLines(root, { visibility, licenseFile = true } = {}) {
  const lines = [];
  const base = `https://github.com/${root.owner}/${root.repo}`;
  if (visibility === "public") {
    lines.push(`[![CI](${base}/actions/workflows/ci.yml/badge.svg?branch=${root.default_branch})](${base}/actions/workflows/ci.yml)`);
    if (root.codeql) lines.push(`[![CodeQL](${base}/actions/workflows/codeql.yml/badge.svg?branch=${root.default_branch})](${base}/actions/workflows/codeql.yml)`);
    if (root.release_please) lines.push(`[![Release](https://img.shields.io/github/v/release/${root.owner}/${root.repo})](${base}/releases)`);
  }
  if (root.license_mit) {
    const label = "License: MIT";
    lines.push(`[![${label}](https://img.shields.io/badge/license-MIT-blue.svg)](${licenseFile ? "LICENSE" : "https://opensource.org/licenses/MIT"})`);
  }
  return lines;
}

export const badgeBlock = (lines) => `${START}\n${lines.join(" ")}\n${END}`;

/** Puts the block between its markers, or under the first title, or at the top. Idempotent. */
export function insertBlock(readme, block) {
  const marked = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (marked.test(readme)) return readme.replace(marked, () => block);
  const lines = readme.split("\n");
  const title = lines.findIndex((l) => /^# \S/.test(l));
  if (title === -1) return `${block}\n\n${readme}`;
  const before = lines.slice(0, title + 1).join("\n");
  const after = lines.slice(title + 1).join("\n").replace(/^\n+/, "");
  return `${before}\n\n${block}\n\n${after}`;
}

export function applyBadges(target, root, options) {
  const file = path.join(target, "README.md");
  if (!existsSync(file)) return { changed: false, missing: true };
  const lines = badgeLines(root, { ...options, licenseFile: existsSync(path.join(target, "LICENSE")) });
  if (!lines.length) return { changed: false, empty: true };
  const before = readFileSync(file, "utf8");
  const after = insertBlock(before, badgeBlock(lines));
  if (after !== before) writeFileSync(file, after);
  return { changed: after !== before, lines };
}
