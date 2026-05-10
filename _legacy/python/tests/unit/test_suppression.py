"""Suppression marker parser tests."""

from __future__ import annotations

from cwlint.suppression import Suppression, parse_suppressions


def test_html_comment_suppression() -> None:
    src = """
hello
<!-- cwlint: ignore CW008 reason="main-thread block, not sub-agent" -->
```python
print("hi")
```
""".strip().splitlines()
    sups = parse_suppressions(src)
    assert sups == [
        Suppression(
            line=2,
            rule_ids=("CW008",),
            reason="main-thread block, not sub-agent",
        )
    ]


def test_hash_comment_suppression() -> None:
    src = '# cwlint: ignore CW001,CW003 reason="intentional"'.splitlines()
    assert parse_suppressions(src) == [
        Suppression(line=1, rule_ids=("CW001", "CW003"), reason="intentional"),
    ]


def test_missing_reason_rejected() -> None:
    src = "<!-- cwlint: ignore CW001 -->".splitlines()
    sups = parse_suppressions(src)
    # no reason → not honored
    assert sups == []


def test_suppression_applies_same_line() -> None:
    s = Suppression(line=10, rule_ids=("CW001",), reason="x")
    assert s.applies_to(rule_id="CW001", line=10)


def test_suppression_applies_line_below() -> None:
    s = Suppression(line=10, rule_ids=("CW001",), reason="x")
    assert s.applies_to(rule_id="CW001", line=11)


def test_suppression_does_not_apply_far_below() -> None:
    s = Suppression(line=10, rule_ids=("CW001",), reason="x")
    assert not s.applies_to(rule_id="CW001", line=15)


def test_suppression_does_not_apply_other_rule() -> None:
    s = Suppression(line=10, rule_ids=("CW001",), reason="x")
    assert not s.applies_to(rule_id="CW002", line=11)
