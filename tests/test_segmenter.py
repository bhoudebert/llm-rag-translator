from translate_manual.segmenter import segment_markdown

DOC = "# Title\n\nSome text.\n\n```py\nx = 1\n```\n\nEnd.\n"


def test_fenced_code_is_one_verbatim_segment():
    segs = segment_markdown(DOC)
    code = [s for s in segs if s.text.startswith("```")]
    assert len(code) == 1
    assert not code[0].translatable
    assert code[0].text == "```py\nx = 1\n```\n"


def test_prose_split_on_blank_lines():
    segs = [s for s in segment_markdown("One.\n\nTwo.\n") if s.translatable]
    assert [s.text for s in segs] == ["One.\n\n", "Two.\n"]


def test_unclosed_fence_swallows_rest():
    segs = segment_markdown("a\n\n```\ncode\nmore\n")
    assert not segs[-1].translatable
    assert segs[-1].text == "```\ncode\nmore\n"


def test_segmentation_is_lossless():
    assert "".join(s.text for s in segment_markdown(DOC)) == DOC
