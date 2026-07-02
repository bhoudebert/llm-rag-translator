"""Split Markdown into translatable segments while preserving structure.

Strategy: walk the document line by line. Fenced code blocks (``` or ~~~) are
emitted as single non-translatable segments verbatim. Everything else is grouped
into blocks separated by blank lines — a heading, a paragraph, a list, a table.
Each translatable block is sent to Claude as a unit, with an instruction to keep
its Markdown markers intact. Block-level granularity is also what makes the
translation memory effective: identical paragraphs across manual versions hash
to the same source text and get reused.
"""

from dataclasses import dataclass


@dataclass
class Segment:
    text: str
    translatable: bool


_FENCE_MARKERS = ("```", "~~~")


def _is_fence(line: str) -> str | None:
    stripped = line.lstrip()
    for marker in _FENCE_MARKERS:
        if stripped.startswith(marker):
            return marker
    return None


def segment_markdown(text: str) -> list[Segment]:
    """Return an ordered list of segments covering the whole document."""
    lines = text.splitlines(keepends=True)
    segments: list[Segment] = []
    buffer: list[str] = []
    i = 0

    def flush_buffer() -> None:
        # Split the accumulated prose into blank-line-delimited blocks.
        if not buffer:
            return
        chunk = "".join(buffer)
        parts = chunk.split("\n\n")
        for idx, part in enumerate(parts):
            # Re-add the separator we split on, except after the last part.
            piece = part + ("\n\n" if idx < len(parts) - 1 else "")
            if piece.strip():
                segments.append(Segment(text=piece, translatable=True))
            elif piece:
                segments.append(Segment(text=piece, translatable=False))
        buffer.clear()

    while i < len(lines):
        line = lines[i]
        marker = _is_fence(line)
        if marker:
            flush_buffer()
            block = [line]
            i += 1
            # Consume until the closing fence of the same marker.
            while i < len(lines):
                block.append(lines[i])
                if _is_fence(lines[i]) == marker and len(block) > 1:
                    i += 1
                    break
                i += 1
            segments.append(Segment(text="".join(block), translatable=False))
        else:
            buffer.append(line)
            i += 1

    flush_buffer()
    return segments
