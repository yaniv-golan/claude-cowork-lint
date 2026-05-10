/**
 * Diff two contract JSON objects and render a human-readable markdown report.
 *
 * Port of `_legacy/python/cwlint/diff.py`. Three categories:
 *   - meta_changed:  fixed top-level metadata (versions, extracted_at)
 *   - sets_changed:  per-named-set additions/removals, where a "named set" is
 *                    any nested `{ "names": [...] }` object the walker finds
 *   - other_changed: any other top-level key whose JSON value differs and
 *                    isn't already accounted for via named-set walking
 *
 * `renderMarkdownDiff()` produces a PR-body-ready markdown summary; if every
 * category is empty it emits a single `_No differences detected._` line.
 */

export interface SpecDiff {
  meta_changed: Record<string, { old: unknown; new: unknown }>;
  sets_changed: Record<string, { added: string[]; removed: string[] }>;
  other_changed: Record<string, "value differs (no named-set walk)">;
}

const META_KEYS = new Set([
  "claude_app_version",
  "operon_core_version",
  "claude_cli_version",
  "extracted_at",
]);

export function diffSpecs(old: Record<string, unknown>, next: Record<string, unknown>): SpecDiff {
  const metaChanged: SpecDiff["meta_changed"] = {};
  const setsChanged: SpecDiff["sets_changed"] = {};
  const otherChanged: SpecDiff["other_changed"] = {};

  for (const key of META_KEYS) {
    if (!deepEqual(old[key], next[key])) {
      metaChanged[key] = { old: old[key], new: next[key] };
    }
  }

  // Collect every named-string set in both old and new for diff
  const oldPaths = namedSetPaths(old);
  const newPaths = namedSetPaths(next);
  const allPaths = new Map<string, string[]>();
  for (const [k, v] of oldPaths) {
    allPaths.set(k, v);
  }
  for (const [k, v] of newPaths) {
    allPaths.set(k, v);
  }

  for (const path of allPaths.values()) {
    const oldNode = getAt(old, path);
    const newNode = getAt(next, path);
    const oldNames = new Set(extractNames(oldNode));
    const newNames = new Set(extractNames(newNode));
    const added = [...newNames].filter((n) => !oldNames.has(n)).sort();
    const removed = [...oldNames].filter((n) => !newNames.has(n)).sort();
    if (added.length > 0 || removed.length > 0) {
      setsChanged[path.join(".")] = { added, removed };
    }
  }

  // Other top-level keys (not yet covered by meta or named sets)
  const namedTopLevels = new Set<string>();
  for (const path of allPaths.values()) {
    const head = path[0];
    if (head !== undefined) {
      namedTopLevels.add(head);
    }
  }
  const allKeys = new Set([...Object.keys(old), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (META_KEYS.has(key)) continue;
    if (deepEqual(old[key], next[key])) continue;
    if (namedTopLevels.has(key)) continue;
    otherChanged[key] = "value differs (no named-set walk)";
  }

  return {
    meta_changed: metaChanged,
    sets_changed: setsChanged,
    other_changed: otherChanged,
  };
}

export function renderMarkdownDiff(diff: SpecDiff, oldVersion: string, newVersion: string): string {
  const lines: string[] = [];
  lines.push(`# Cowork contract: ${oldVersion} → ${newVersion}\n`);

  const metaKeys = Object.keys(diff.meta_changed);
  if (metaKeys.length > 0) {
    lines.push("## Metadata\n");
    for (const key of metaKeys) {
      const change = diff.meta_changed[key];
      lines.push(`- \`${key}\`: \`${change?.old}\` → \`${change?.new}\``);
    }
    lines.push("");
  }

  const setPaths = Object.keys(diff.sets_changed).sort();
  if (setPaths.length > 0) {
    lines.push("## Named-set changes\n");
    for (const setPath of setPaths) {
      const change = diff.sets_changed[setPath];
      if (!change) continue;
      lines.push(`### \`${setPath}\`\n`);
      if (change.added.length > 0) {
        const names = change.added.map((n) => `\`${n}\``).join(", ");
        lines.push(`- **Added** (${change.added.length}): ${names}`);
      }
      if (change.removed.length > 0) {
        const names = change.removed.map((n) => `\`${n}\``).join(", ");
        lines.push(`- **Removed** (${change.removed.length}): ${names}`);
      }
      lines.push("");
    }
  }

  const otherKeys = Object.keys(diff.other_changed).sort();
  if (otherKeys.length > 0) {
    lines.push("## Other top-level changes\n");
    for (const key of otherKeys) {
      lines.push(`- \`${key}\`: value differs`);
    }
    lines.push("");
  }

  if (metaKeys.length === 0 && setPaths.length === 0 && otherKeys.length === 0) {
    lines.push("_No differences detected._\n");
  }

  return lines.join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walk every dict in the object tree; emit the path to any node shaped like
 * `{ names: string[] }`. Mirrors the Python `_named_set_paths` helper. Keyed
 * by the dotted-string form of the path so duplicates de-dupe naturally.
 */
function namedSetPaths(obj: unknown, path: string[] = []): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isPlainObject(obj)) return out;
  if (Array.isArray(obj.names) && path.length > 0) {
    out.set(path.join("."), [...path]);
  }
  for (const [key, value] of Object.entries(obj)) {
    const sub = namedSetPaths(value, [...path, key]);
    for (const [k, v] of sub) {
      out.set(k, v);
    }
  }
  return out;
}

function getAt(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const part of path) {
    if (!isPlainObject(cur) || !(part in cur)) {
      return null;
    }
    cur = cur[part];
  }
  return cur;
}

function extractNames(node: unknown): string[] {
  if (!isPlainObject(node)) return [];
  const names = node.names;
  if (!Array.isArray(names)) return [];
  return names.filter((n): n is string => typeof n === "string");
}

/**
 * Structural equality for JSON-shaped values. Mirrors Python `==` semantics
 * for the dict/list/scalar types we actually see in contracts.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!(k in b)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}
