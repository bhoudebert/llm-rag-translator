"""Command-line interface."""

from __future__ import annotations

import sys
from pathlib import Path

import click

from . import config
from .translator import Translator, load_glossary


@click.group()
def cli():
    """Translate Markdown manuals with Claude + a RAG translation memory."""


@cli.command()
@click.argument("input_file", type=click.Path(exists=True, dir_okay=False))
@click.option("-s", "--source", required=True, help="Source language, e.g. English.")
@click.option("-t", "--target", required=True, help="Target language, e.g. French.")
@click.option(
    "-o",
    "--output",
    type=click.Path(dir_okay=False),
    help="Output file. Defaults to <input>.<target>.md",
)
@click.option(
    "-g",
    "--glossary",
    type=click.Path(exists=True, dir_okay=False),
    help="JSON file mapping source terms to target terms.",
)
def translate(input_file, source, target, output, glossary):
    """Translate INPUT_FILE from --source to --target."""
    src_path = Path(input_file)
    text = src_path.read_text(encoding="utf-8")

    if output is None:
        output = str(src_path.with_suffix(f".{target.lower()}.md"))

    translator = Translator(
        source_lang=source,
        target_lang=target,
        glossary=load_glossary(glossary),
    )

    click.echo(f"Translating {input_file}  ({source} -> {target}) ...", err=True)
    translated, stats = translator.translate_document(text)
    Path(output).write_text(translated, encoding="utf-8")

    click.echo(f"Wrote {output}", err=True)
    click.echo(
        "Segments: {total} total, {tr} translatable | "
        "reused from memory: {reused}, translated by model: {model} "
        "(fuzzy-assisted: {fuzzy})".format(
            total=stats.total_segments,
            tr=stats.translatable,
            reused=stats.reused_from_memory,
            model=stats.translated_by_model,
            fuzzy=stats.fuzzy_assisted,
        ),
        err=True,
    )


@cli.command()
@click.option("-s", "--source", required=True)
@click.option("-t", "--target", required=True)
def stats(source, target):
    """Show how many segment pairs are stored for a language pair."""
    tm = Translator(source, target).memory
    click.echo(f"{tm.stats()} stored segment pairs for {source} -> {target}")
    click.echo(f"Memory dir: {config.STORE_DIR}")


@cli.command()
@click.option("-s", "--source", required=True)
@click.option("-t", "--target", required=True)
def dump(source, target):
    """Print every stored source/translation pair for a language pair."""
    tm = Translator(source, target).memory
    n = 0
    for src, tgt in tm.all_pairs():
        click.echo("-" * 60)
        click.echo(f"SRC: {src}")
        click.echo(f"TGT: {tgt}")
        n += 1
    click.echo("-" * 60)
    click.echo(f"{n} pairs in {config.STORE_DIR} ({source} -> {target})")


def main():
    try:
        cli()
    except Exception as exc:  # noqa: BLE001
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
