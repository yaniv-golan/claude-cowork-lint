/**
 * Per-rule metadata: declared contract anchors + lifecycle status.
 *
 * `cwlint doctor` (see `src/doctor.ts`) walks every rule's `contractAnchors`
 * against the loaded contract and reports any rule whose declared paths no
 * longer resolve. This is how we catch CW004-style drift the moment a
 * contract field disappears or moves — replacing the manual binary-grep
 * audit cycle.
 *
 * Rules:
 * - One entry per rule in `ALL_RULES` (CW007 is reserved indefinitely; skip).
 * - `contractAnchors` is the set of dotted paths the rule actually reads from
 *   `Spec`. Be precise: over-declaring an anchor that doesn't exist in the
 *   bundled contract surfaces as a false `stale` signal.
 * - `verifiedAgainst` records the Claude.app version this rule was last
 *   empirically validated against (live binary or fixtures, not just
 *   contract text).
 * - `status` drives `overall` precedence in the doctor report: a rule with
 *   `status: "deprecated"` is reported as `deprecated` regardless of anchor
 *   resolution.
 */

export interface RuleMeta {
  ruleId: string;
  /** Contract field paths this rule reads (dotted, e.g. "subagent_tool_filter.drop_set.names"). */
  contractAnchors: string[];
  /** Claude.app version this rule was last empirically verified against. */
  verifiedAgainst: string;
  /** Lifecycle status. `deprecated` takes priority over `stale` in doctor reports. */
  status: "stable" | "deprecated" | "experimental";
}

export const RULE_META: Record<string, RuleMeta> = {
  CW001: {
    ruleId: "CW001",
    contractAnchors: [
      "subagent_tool_filter.async_dispatch_allowlist.names",
      "subagent_tool_filter.drop_set.names",
      "host_loop_tool_substitution.host_loop_excluded_builtins.names",
      "host_loop_tool_substitution.host_loop_excluded_builtins.mcp_replacements",
    ],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW002: {
    ruleId: "CW002",
    // Computes the same survivor set as CW001 (host_loop + subagent gates),
    // then asserts the surviving set contains a persistence primitive.
    contractAnchors: [
      "subagent_tool_filter.async_dispatch_allowlist.names",
      "subagent_tool_filter.drop_set.names",
      "host_loop_tool_substitution.host_loop_excluded_builtins.names",
    ],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW003: {
    ruleId: "CW003",
    contractAnchors: ["skill_frontmatter_invariants.env_var_substitution"],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW004: {
    ruleId: "CW004",
    // Decision Log #3: CW004 stays stable (severity error, re-anchored in B1).
    contractAnchors: ["skill_frontmatter_invariants.forbidden_fields"],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW005: {
    ruleId: "CW005",
    contractAnchors: ["skill_frontmatter_invariants.required_fields"],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW006: {
    ruleId: "CW006",
    // Builds a known-tools set from every allowlist + safe set + excluded
    // builtins; warns on near-matches that aren't in any of them.
    contractAnchors: [
      "subagent_tool_filter.async_dispatch_allowlist.names",
      "subagent_tool_filter.drop_set.names",
      "subagent_tool_filter.fork_subagent_allowlist.names",
      "subagent_tool_filter.experimental_fallback_allowlist.names",
      "host_loop_tool_substitution.host_loop_safe_set.names",
      "host_loop_tool_substitution.host_loop_excluded_builtins.names",
    ],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  // CW007 is reserved indefinitely (see CLAUDE.md / ROADMAP). No metadata.
  CW008: {
    ruleId: "CW008",
    // Pure heuristic over SKILL.md text; doesn't read the spec.
    contractAnchors: [],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW009: {
    ruleId: "CW009",
    // Reads .mcp.json in the target repo PLUS the contract's list of
    // auto-registered Cowork built-in MCP servers (9 names in v1.6608.2:
    // cowork, cowork-onboarding, mcp-registry, plugins, radar,
    // scheduled-tasks, skills, terminal, workspace). Refreshed in B5 after
    // the v1.6608.2 bundle audit showed the prior 3-name hardcoded list was
    // silently false-positiving the other 6.
    //
    // Note: `cowork_builtin_mcp_servers` was introduced in contract
    // v1.6608.2. On older contracts (e.g. cowork-v2.1.121.json) this anchor
    // resolves to `undefined` and `doctor` will report CW009 as `stale` —
    // the rule itself falls back to the legacy 3-name set in cw009.ts.
    contractAnchors: ["host_loop_tool_substitution.cowork_builtin_mcp_servers.names"],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW010: {
    ruleId: "CW010",
    // Demoted to info + deprecated in Task B4. The contract field
    // `user_secrets_injection.validation` still exists (A2 kept it as
    // historical record), but the Operon kernel-secrets subsystem that
    // enforced it was removed in Claude.app 1.6608.2. The rule lives on
    // as a hygiene check — running it produces info-severity findings,
    // and `doctor` reports it as `— deprecated`.
    contractAnchors: ["user_secrets_injection.validation"],
    verifiedAgainst: "1.6608.2",
    status: "deprecated",
  },
  CW011: {
    ruleId: "CW011",
    // Behavioural rule about Cowork's --setting-sources=user launch flag;
    // not parameterised by any contract field today.
    contractAnchors: [],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
  CW012: {
    ruleId: "CW012",
    // Hard-coded BROKEN_EVENTS set in source; doesn't read the spec.
    contractAnchors: [],
    verifiedAgainst: "1.6608.2",
    status: "stable",
  },
};
