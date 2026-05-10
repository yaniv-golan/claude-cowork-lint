/**
 * Walk hook-payload structures (hooks.json or settings.json `hooks:` block)
 * and yield strings whose semantics are documented as "shell command" — i.e.
 * `command:` field values nested inside a hook-handler object. Skips
 * `prompt:` (LLM prose), `description:`, `matcher:`, `timeout:`, etc.
 *
 * Returns absolute (line, string) tuples so rules can attach findings to
 * specific positions.
 */
export interface HookCommand {
  command: string;
  /** 1-based line in the source file, computed lazily by the caller. */
  approxLine: number;
}

export function extractHookCommands(text: string): HookCommand[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }
  const out: HookCommand[] = [];
  const lines = text.split("\n");
  function findApproxLine(value: string): number {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(value)) return i + 1;
    }
    return 1;
  }
  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    const obj = node as Record<string, unknown>;
    // A hook-handler object has type:"command" or type:"prompt" plus a sibling
    // command: or prompt: string. We only care about command:.
    if (typeof obj.command === "string") {
      out.push({ command: obj.command, approxLine: findApproxLine(obj.command) });
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(payload);
  return out;
}
