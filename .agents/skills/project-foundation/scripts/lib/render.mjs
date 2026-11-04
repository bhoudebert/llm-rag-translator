// Template syntax (chosen so that GitHub's ${{ }} and shell's [[ ]] pass through untouched):
//   @@name@@                         the value of a variable (an unknown name is an error, not an empty string)
//   @@#if name@@ ... @@/if@@         kept when the variable is true (non-empty, not "false")
//   @@#unless name@@ ... @@/unless@@ kept when it is false
// A tag alone on its line is structure: the whole line goes.

export const truthy = (value) =>
  !(
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    value === "false" ||
    value === "False" ||
    value === "0" ||
    value === 0 ||
    (Array.isArray(value) && value.length === 0)
  );

export function render(text, variables, source) {
  // A tag alone on its line is structure, not text: drop the whole line, so a block leaves no blank-line debris.
  text = text.replace(/^[ \t]*(@@[#/](?:if|unless)[^@\n]*@@)[ \t]*\n/gm, "$1");

  // Innermost blocks first: a block whose body holds no other block opener.
  const block = /@@#(if|unless) ([a-z0-9_]+)@@((?:(?!@@#(?:if|unless) )[\s\S])*?)@@\/\1@@/g;
  let previous;
  do {
    previous = text;
    text = text.replace(block, (_, kind, name, body) => {
      if (!(name in variables)) throw new Error(`${source}: unknown flag '${name}' in @@#${kind} ${name}@@`);
      return truthy(variables[name]) === (kind === "if") ? body : "";
    });
  } while (text !== previous);
  if (/@@#(?:if|unless) |@@\/(?:if|unless)@@/.test(text)) throw new Error(`${source}: unbalanced @@#if / @@/if blocks`);

  text = text.replace(/@@([a-z0-9_]+)@@/g, (_, name) => {
    if (!(name in variables)) throw new Error(`${source}: unknown variable '${name}'`);
    const value = variables[name];
    return value === null || value === undefined ? "" : String(value);
  });
  // A removed block can leave two blank lines in a row; a template never wants more than one.
  return text.replace(/\n{3,}/g, "\n\n");
}

export function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}
