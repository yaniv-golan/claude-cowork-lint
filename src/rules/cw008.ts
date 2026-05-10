/**
 * CW008 — sub-agent dispatch cue followed by a fenced bash block.
 *
 * Heuristic: when an SKILL.md contains a structured dispatch cue (`Task(`,
 * `/bg`, `subagent_type:`, etc.) and a ```bash fence within 30 lines, warn
 * unless the user marked the block as main-thread within 3 lines above.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

const DISPATCH_CUES: RegExp[] = [
  /\bsubagent_type\s*[:=]/,
  /\bTask\s*\(/,
  /(?<![\w/])\/bg(?![\w/])/,
  /(?<![\w/])\/background(?![\w/])/,
  /(?<![\w/])\/fork(?![\w/])/,
  /\bspawn_subagent\b/,
  /\brun_in_background\s*[:=]\s*true/,
];
const BASH_FENCE = /^```(?:bash|sh|shell)\b/i;
const MAIN_THREAD = /main[- ]thread/i;

export const CW008: Rule = {
  ruleId: "CW008",
  severity: "warn",
  summary: "Sub-agent dispatch cue followed by a fenced bash block within 30 lines",
  check(layout, _spec) {
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const cueLines: number[] = [];
      lines.forEach((line, idx) => {
        for (const cue of DISPATCH_CUES) {
          if (cue.test(line)) {
            cueLines.push(idx + 1);
            break;
          }
        }
      });
      for (const cueLine of cueLines) {
        const end = Math.min(cueLine + 30, lines.length);
        for (let fenceIdx = cueLine + 1; fenceIdx <= end; fenceIdx++) {
          if (!BASH_FENCE.test(lines[fenceIdx - 1] ?? "")) continue;
          const preStart = Math.max(0, fenceIdx - 1 - 3);
          const preWindow = lines.slice(preStart, fenceIdx - 1);
          if (preWindow.some((l) => MAIN_THREAD.test(l))) break;
          if (isSuppressed(sups, "CW008", fenceIdx)) break;
          findings.push({
            ruleId: "CW008",
            severity: "warn",
            path: rel(layout.root, path),
            line: fenceIdx,
            message: "bash block follows a sub-agent dispatch cue",
            detail: `Cue at line ${cueLine}; bash is stripped from Cowork sub-agents.`,
            suggestion:
              "If main-thread, add a 'main-thread' comment within 3 lines above the fence; otherwise use mcp__workspace__bash.",
          });
          break;
        }
      }
    }
    return findings;
  },
};
