"""Registry smoke tests."""

from __future__ import annotations

from cwlint.rules import all_rules


def test_registry_lists_all_v01_rules() -> None:
    """v0.1 ships 11 rules: CW001–CW006, CW008–CW012. CW007 is deferred to v0.2."""
    ids = sorted(r.rule_id for r in all_rules())
    expected = [f"CW{n:03d}" for n in range(1, 13) if n != 7]
    assert ids == expected
    assert "CW007" not in ids


def test_every_rule_has_required_metadata() -> None:
    for rule in all_rules():
        assert isinstance(rule.rule_id, str)
        assert rule.rule_id.startswith("CW")
        assert isinstance(rule.summary, str)
        assert rule.summary
