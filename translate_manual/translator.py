"""Orchestrates segmentation, TM lookup, and Claude translation calls."""

from __future__ import annotations

import json
from dataclasses import dataclass

import anthropic

from . import config
from .backends import get_memory
from .segmenter import segment_markdown


@dataclass
class TranslateStats:
    total_segments: int = 0
    translatable: int = 0
    reused_from_memory: int = 0
    translated_by_model: int = 0
    fuzzy_assisted: int = 0


def _build_system_prompt(source_lang: str, target_lang: str, glossary: dict) -> str:
    lines = [
        f"You are a professional technical translator. Translate Markdown manual "
        f"content from {source_lang} into {target_lang}.",
        "",
        "Rules:",
        "- Preserve all Markdown syntax exactly: headings (#), lists, tables, "
        "links, bold/italic markers, and inline `code`.",
        "- Do NOT translate code, identifiers, URLs, file paths, or placeholder "
        "tokens like {name} or %s.",
        "- Keep leading/trailing whitespace and line breaks of the input.",
        "- Translate only the natural-language text. Return ONLY the translated "
        "segment, with no preamble, quotes, or explanation.",
    ]
    if glossary:
        lines.append("")
        lines.append(
            "Use this glossary for the given terms (source => target); apply it "
            "consistently:"
        )
        for src, tgt in glossary.items():
            lines.append(f"- {src} => {tgt}")
    return "\n".join(lines)


class Translator:
    def __init__(
        self,
        source_lang: str,
        target_lang: str,
        glossary: dict | None = None,
        client: anthropic.Anthropic | None = None,
    ):
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.glossary = glossary or {}
        self.client = client or anthropic.Anthropic()
        self.memory = get_memory(source_lang, target_lang)
        # Stable across every segment of a run → cached by the API, so we pay for
        # the (potentially long) glossary/instructions prefix only once.
        self._system = [
            {
                "type": "text",
                "text": _build_system_prompt(source_lang, target_lang, self.glossary),
                "cache_control": {"type": "ephemeral"},
            }
        ]

    def _translate_one(self, source_text: str, stats: TranslateStats) -> str:
        neighbors = self.memory.lookup(
            source_text, n_results=config.FUZZY_MATCH_COUNT + 1
        )

        # Exact reuse: nearest neighbor is byte-identical and essentially at
        # distance 0. No model call.
        for doc, translation, dist in neighbors:
            if dist <= config.EXACT_MATCH_DISTANCE and doc == source_text:
                stats.reused_from_memory += 1
                return translation

        # Otherwise gather fuzzy matches as reference context for the model.
        refs = [
            (doc, translation)
            for doc, translation, dist in neighbors
            if dist <= config.FUZZY_MATCH_DISTANCE and doc != source_text
        ][: config.FUZZY_MATCH_COUNT]

        user_parts = []
        if refs:
            stats.fuzzy_assisted += 1
            ref_block = "\n\n".join(
                f"Source: {src}\nTranslation: {tgt}" for src, tgt in refs
            )
            user_parts.append(
                "Reference translations of similar past segments (match their "
                "terminology and style):\n\n" + ref_block + "\n\n---\n"
            )
        user_parts.append("Translate this segment:\n\n" + source_text)

        response = self.client.messages.create(
            model=config.MODEL,
            max_tokens=config.MAX_TOKENS,
            system=self._system,
            messages=[{"role": "user", "content": "".join(user_parts)}],
        )
        translation = "".join(
            block.text for block in response.content if block.type == "text"
        )

        self.memory.store(
            source_text, translation, translator_model=config.MODEL, origin="machine"
        )
        stats.translated_by_model += 1
        return translation

    def translate_document(self, text: str) -> tuple[str, TranslateStats]:
        stats = TranslateStats()
        segments = segment_markdown(text)
        stats.total_segments = len(segments)
        out_parts = []
        for seg in segments:
            if not seg.translatable:
                out_parts.append(seg.text)
                continue
            stats.translatable += 1
            # Translate the stripped core, but keep the segment's surrounding
            # whitespace so blank-line structure survives.
            core = seg.text.strip("\n")
            lead = seg.text[: len(seg.text) - len(seg.text.lstrip("\n"))]
            trail = seg.text[len(seg.text.rstrip("\n")) :]
            translated = self._translate_one(core, stats)
            out_parts.append(lead + translated + trail)
        return "".join(out_parts), stats


def load_glossary(path: str | None) -> dict:
    if not path:
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
