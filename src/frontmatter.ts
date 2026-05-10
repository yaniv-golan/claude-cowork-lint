/**
 * Tiny YAML-frontmatter parser. Handles a small subset:
 *   - inline lists: `tools: [a, b, c]`
 *   - block lists: `tools:\n  - a\n  - b`
 *   - scalar key:value (string, true, false, null)
 *
 * Sufficient for the rules we run against SKILL.md and agents/*.md.
 */

const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  bodyStartLine: number; // 1-based line where frontmatter content starts
}

export function parseFrontmatter(text: string): ParsedFrontmatter | null {
  const match = FRONTMATTER.exec(text);
  if (!match || !match[1]) return null;
  const body = match[1];
  const data: Record<string, unknown> = {};
  const lines = body.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const inlineMatch = /^([A-Za-z][A-Za-z0-9_\-]*)\s*:\s*(.+)$/.exec(line);
    if (!inlineMatch) {
      i += 1;
      continue;
    }
    const key = inlineMatch[1] ?? "";
    const valueRaw = (inlineMatch[2] ?? "").trim();
    if (valueRaw === "") {
      // block list
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const li = lines[j] ?? "";
        const itemMatch = /^\s+-\s+(.+)$/.exec(li);
        if (!itemMatch) break;
        items.push((itemMatch[1] ?? "").trim().replace(/^["']|["']$/g, ""));
        j += 1;
      }
      data[key] = items;
      i = j;
      continue;
    }
    if (valueRaw.startsWith("[")) {
      const inner = valueRaw.replace(/^\[|\]$/g, "");
      data[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (valueRaw === "true") {
      data[key] = true;
    } else if (valueRaw === "false") {
      data[key] = false;
    } else if (valueRaw === "null" || valueRaw === "~") {
      data[key] = null;
    } else {
      data[key] = valueRaw.replace(/^["']|["']$/g, "");
    }
    i += 1;
  }

  // Body starts on the line after the opening `---`.
  return { data, bodyStartLine: 2 };
}

export function findTokenLine(text: string, token: string, fromLine = 1): number {
  const lines = text.split("\n");
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(token)}(?![A-Za-z0-9_])`);
  for (let i = fromLine - 1; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) return i + 1;
  }
  return fromLine;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
