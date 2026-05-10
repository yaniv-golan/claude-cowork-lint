"""Diff two contract JSON objects and render a human-readable markdown report."""

from __future__ import annotations

from typing import Any


def diff_specs(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    """Produce a structured diff. Categories:
    - meta_changed: top-level metadata (versions, extracted_at)
    - sets_changed: per-named-set additions/removals
    - other_changed: other top-level keys whose value differs
    """
    meta_keys = {"claude_app_version", "operon_core_version", "claude_cli_version", "extracted_at"}
    meta_changed: dict[str, dict[str, Any]] = {}
    sets_changed: dict[str, dict[str, Any]] = {}
    other_changed: dict[str, Any] = {}

    for key in meta_keys:
        if old.get(key) != new.get(key):
            meta_changed[key] = {"old": old.get(key), "new": new.get(key)}

    # Collect every named-string set in both old and new for diff
    for path in _named_set_paths(old) | _named_set_paths(new):
        old_names = set(_get_at(old, path).get("names", []) if _get_at(old, path) else [])
        new_names = set(_get_at(new, path).get("names", []) if _get_at(new, path) else [])
        added = sorted(new_names - old_names)
        removed = sorted(old_names - new_names)
        if added or removed:
            sets_changed[".".join(path)] = {"added": added, "removed": removed}

    # Other top-level keys (not yet covered by meta or named sets)
    for key in set(old) | set(new):
        if key in meta_keys:
            continue
        if old.get(key) != new.get(key):
            # Skip keys we've already accounted for via named-set walking.
            if any(p[0] == key for p in _named_set_paths(old) | _named_set_paths(new)):
                continue
            other_changed[key] = "value differs (no named-set walk)"

    return {
        "meta_changed": meta_changed,
        "sets_changed": sets_changed,
        "other_changed": other_changed,
    }


def render_markdown_diff(diff: dict[str, Any], old_version: str, new_version: str) -> str:
    """Render a human-readable PR-body markdown from the structured diff."""
    lines: list[str] = []
    lines.append(f"# Cowork contract: {old_version} → {new_version}\n")

    if diff["meta_changed"]:
        lines.append("## Metadata\n")
        for key, change in diff["meta_changed"].items():
            lines.append(f"- `{key}`: `{change['old']}` → `{change['new']}`")
        lines.append("")

    if diff["sets_changed"]:
        lines.append("## Named-set changes\n")
        for set_path, change in sorted(diff["sets_changed"].items()):
            added = change["added"]
            removed = change["removed"]
            lines.append(f"### `{set_path}`\n")
            if added:
                lines.append(f"- **Added** ({len(added)}): {', '.join(f'`{n}`' for n in added)}")
            if removed:
                rem_str = ", ".join(f"`{n}`" for n in removed)
                lines.append(f"- **Removed** ({len(removed)}): {rem_str}")
            lines.append("")

    if diff["other_changed"]:
        lines.append("## Other top-level changes\n")
        for key in sorted(diff["other_changed"]):
            lines.append(f"- `{key}`: value differs")
        lines.append("")

    if not (diff["meta_changed"] or diff["sets_changed"] or diff["other_changed"]):
        lines.append("_No differences detected._\n")

    return "\n".join(lines)


def _named_set_paths(obj: Any, path: tuple[str, ...] = ()) -> set[tuple[str, ...]]:
    out: set[tuple[str, ...]] = set()
    if isinstance(obj, dict):
        if "names" in obj and isinstance(obj["names"], list) and path:
            out.add(path)
        for key, value in obj.items():
            out |= _named_set_paths(value, (*path, str(key)))
    return out


def _get_at(obj: Any, path: tuple[str, ...]) -> Any:
    cur = obj
    for part in path:
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur
