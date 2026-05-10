# Frontmatter-fields audit (Task C4)

Status: complete. Outcome: **0 new rules**.

This document records the round-4-follow-up investigation of three
"skill-frontmatter" fields the prior audit
(`docs/internal/CONTRACT-AUDIT-1.6608.2.md`, lines 120-137) flagged for
discovery: `allowed-tools`, `force-for-plugin`,
`keep-coding-instructions`.

Source artefact: the deminified CLI bundle for
`claude-code-cli@2.1.138`, extracted as
`/tmp/cli-extracted.js` during round-4. Anchors below quote that file.

## Headline finding

**The prior audit conflated three different schemas into one
"skill-frontmatter" bucket.** The CLI bundle declares three sibling
zod schemas, registered together at the `NU1` lookup table:

```
NU1={skill:IH(()=>LU1().strict()),
     agent:IH(()=>kU1().strict()),
     "output-style":IH(()=>VU1().strict())}
```

- `LU1` — skill frontmatter (extends a base `ZU1`).
- `kU1` — agent frontmatter (the surface CW001/CW002 read via `tools:`).
- `VU1` — output-style frontmatter.

Two of the three fields under investigation belong to `VU1`
(output-style), not to `LU1` (skill). The prior round-4 audit script
appears to have counted any kebab-case key it found in the bundle and
labelled the set "skill-frontmatter", which is the source of the
miscategorisation.

| Field                       | Actual schema | Prior audit's label | Correct label    |
|-----------------------------|---------------|---------------------|------------------|
| `allowed-tools`             | `LU1`         | skill-frontmatter   | skill-frontmatter|
| `force-for-plugin`          | `VU1`         | skill-frontmatter   | output-style     |
| `keep-coding-instructions`  | `VU1`         | skill-frontmatter   | output-style     |

`claude-cowork-lint` does not currently lint output-style files
(only `agents/*.md`, `commands/*.md`, `skills/**/SKILL.md`, and a few
plugin manifests). Adding output-style linting is a future-scope
decision outside this task. Below: what we learned per field anyway,
and the decision rationale.

## Field 1: `allowed-tools` (skill frontmatter; LU1)

### Schema declaration

`LU1` extends the base `ZU1`, which declares:

```
"allowed-tools": WpH().optional().describe(
  "Tools available to the model while this file is active.
   Comma-separated string or YAML list."
)
```

### Where it's read

The frontmatter parser normalises the value via `Vs(...)` (a helper
that splits comma-separated strings and ignores arrays containing
`"*"`):

```
allowedTools: Vs(H["allowed-tools"])
```

The resulting array is attached to the loaded skill/command record as
`.allowedTools`.

### What the runtime does with it

`allowedTools` is folded into `alwaysAllowRules.command` at
skill-invocation time. Representative call site (the built-in
`security-review` plugin command, which is the simplest worked
example):

```
async getPromptWhileMarketplaceIsPrivate(H, _) {
  let q = yw(aD3),
      K = Vs(q.frontmatter["allowed-tools"]);
  return [{
    type: "text",
    text: await Ge(q.content, {
      ..._,
      getToolPermissionContext() {
        let T = _.getToolPermissionContext();
        return {
          ...T,
          alwaysAllowRules: {
            ...T.alwaysAllowRules,
            command: K            // <-- the parsed allowed-tools list
          }
        };
      },
      ...
    })
  }];
}
```

`alwaysAllowRules.command` is the same destination that the
`--allowed-tools` CLI flag populates (`sourceDisplay: "--allowed-tools"`
in the rule-display strings). So this field is a **permission
grant**, not a tool-set filter. Its values are permission-rule strings
(e.g. `"Bash(git *)"`, `"Edit"`, `"WebFetch"`), parsed by the same rule
parser the CLI flag uses.

### Relationship to agent `tools:`

`tools:` (in the agent schema `kU1`) is documented as: "Tools available
to this agent. **Replaces the default set.**" — i.e. it FILTERS the
agent's tool surface. `allowed-tools` (in the skill schema `LU1`) is
documented as: "Tools available to the model while this file is
active." — but the runtime treatment is permission-grant, not
surface-filtering. **The two fields are not equivalent and don't
overlap.** CW001/CW002 read `tools:` on agents; they should NOT also
walk `allowed-tools` on skills, because that would conflate
"permission-rule strings" (with optional `(...)` argument predicates)
with "tool-name identifiers".

### Footgun analysis

The plausible failure modes if a skill author writes
`allowed-tools: WebFetch` (a bare tool name) on a Cowork-targeted
skill, where `WebFetch` is in the drop set:

1. Skill loads without error. Frontmatter validation passes
   (`allowed-tools` accepts any string).
2. At invocation, `alwaysAllowRules.command` gains an entry for
   `WebFetch` — but since `WebFetch` was never registered as a tool
   for the Cowork sub-agent, the permission entry simply never
   matches anything. No-op.
3. The author may believe they "added" the tool, when in fact the
   field only relaxes permission gating for tools that are ALREADY
   on the surface.

This is a misconception footgun, not a runtime-failure footgun. The
skill still functions; the author just doesn't get a tool they
mistakenly thought `allowed-tools` would introduce.

The narrower legitimate case — `allowed-tools` listing `Bash(...)`
patterns on a skill that runs in Cowork mode — is already covered by
CW003 (skill bash usage), which flags the skill's actual bash
invocations regardless of whether `allowed-tools` granted permission.
The permission entry alone, without a corresponding bash invocation
in the skill body, has no effect.

### Decision

**Document only. No rule.** The field is correctly typed, validates
all-strings, and its worst case in Cowork is a silent no-op rather
than a failure. Inventing a rule that flags "every `allowed-tools`
entry referencing a Cowork-stripped tool" would generate noise
without preventing a real failure mode. CW003 already covers the
actual failure surface (skill body invokes a stripped tool).

If a future audit surfaces evidence that the permission system DOES
introduce tools rather than just allowing pre-existing ones, this
decision should be revisited — but the current bundle shows clear
"grant, don't introduce" semantics.

## Field 2: `force-for-plugin` (output-style frontmatter; VU1)

### Schema declaration

```
"force-for-plugin": R3_().optional().describe(
  "@internal — only meaningful for plugin-bundled styles;
   ignored for user styles"
)
```

The `@internal` marker plus the explicit "ignored for user styles"
phrasing leaves little ambiguity. This is not a public field.

### What the runtime does with it

Two call sites:

```
// Plugin-bundled output style: value is honoured.
{
  name: Y,
  description: w,
  prompt: A.trim(),
  source: "plugin",
  forceForPlugin: k3_(T["force-for-plugin"]),
  keepCodingInstructions: k3_(T["keep-coding-instructions"])
}

// User-defined output style: value is REJECTED with a warning.
if (O["force-for-plugin"] !== void 0) {
  y(`Output style "${Y}" has force-for-plugin set, but this option
     only applies to plugin output styles. Ignoring.`,
    {level: "warn"});
}
```

I.e. user-authored output styles that set `force-for-plugin` get an
explicit warning at load time and the field is dropped. Plugin-bundled
output styles silently accept it.

The downstream effect of `forceForPlugin: true` on a plugin output
style is not visible at the consumption site within easy grep reach;
the field is stashed on the loaded-style record and consulted
elsewhere. Plausible (NOT verified) hypothesis: it forces the style
to apply even when a user-level style is also selected. Verifying
this would require tracing the output-style activation path through
the prompt-construction layer, which is out of scope for C4.

### Scope check

This is **NOT a skill-frontmatter field.** It does not appear in `LU1`
(skill schema) or `kU1` (agent schema). It lives in `VU1`
(output-style schema). `claude-cowork-lint` does not currently lint
`output-styles/*.md` files.

### Decision

**Document only. No rule.** Even if `force-for-plugin` had a clear
footgun for plugin authors, it would belong to an output-style rule
family that doesn't exist yet. Adding output-style linting is a
separate scope decision; this task is not the right vehicle for it.
The CLI already emits a runtime warning when a user-authored style
misuses the field, which is the primary surface where the mistake
matters.

## Field 3: `keep-coding-instructions` (output-style frontmatter; VU1)

### Schema declaration

```
"keep-coding-instructions": R3_().optional().describe(
  "If true, the default coding instructions stay in the system
   prompt alongside this style."
)
```

The describe-string is the runtime documentation. Behaviour: when the
output style is active, this boolean controls whether the default
system-prompt coding instructions remain layered with the style's
custom prompt (true) or are replaced entirely by the style's prompt
(false).

### What the runtime does with it

Loaded into both plugin and user output styles:

```
// Plugin output style:
keepCodingInstructions: k3_(T["keep-coding-instructions"])

// User output style:
J = k3_(O["keep-coding-instructions"])
```

The flag is then consulted at output-style application time (the
prompt-construction site is in a different code region; semantics
match the describe-string).

### Footgun analysis

The describe-string makes the semantics explicit: this is the
classic "augment or replace" toggle for the default-coding-instructions
chunk of the system prompt. If a Cowork user authors an output style
with `keep-coding-instructions: false`, the default coding
instructions are dropped from their system prompt — potentially a
surprise, but it's the documented opt-in behaviour.

### Scope check

Same as `force-for-plugin`: this is an output-style field, not a
skill field. `claude-cowork-lint` doesn't lint output styles.

### Decision

**Document only. No rule.** The field has clear, documented
semantics (and a one-line describe in the schema itself). The
behaviour is opt-in — `keep-coding-instructions: false` is the
author's explicit choice. Flagging it would be paternalistic.

If output-style linting becomes a future scope (CW0xx for output
styles), a rule warning that `keep-coding-instructions: false` will
strip the default coding system prompt is a reasonable advisory-grade
candidate, NOT an error-grade rule.

## Summary table

| Field                       | Schema     | Decision  | Rationale (one line)                                                          |
|-----------------------------|------------|-----------|-------------------------------------------------------------------------------|
| `allowed-tools`             | skill      | document  | Permission grant, not a tool filter; misuse is silent no-op, not failure.     |
| `force-for-plugin`          | output-style | document  | Wrong-surface (not a skill field); CLI already warns on user-style misuse.    |
| `keep-coding-instructions`  | output-style | document  | Wrong-surface (not a skill field); documented opt-in semantics, no footgun.   |

## Contract / SPEC follow-ups

The contract (`contracts/cowork-v1.6608.2.json`) and the audit
(`docs/internal/CONTRACT-AUDIT-1.6608.2.md`) both treat all five
fields as belonging to `skill_frontmatter_invariants /
runtime_parser_fields_v2_1_138`. This is the conflation flagged
above. Two corrections applied in the same commit as this audit:

1. The contract's `runtime_parser_fields_v2_1_138` entry annotates
   each field with its actual schema (`skill` vs `output-style`).
   The two output-style fields' `_followup` strings are updated to
   point at this audit and explain the misclassification.
2. SPEC.md's `skill_frontmatter_invariants` section gains a brief
   "what's not a skill field" note pointing here.

## Reproducibility

To re-verify these findings against a future CLI release, the grep
recipe is:

```bash
# Locate the schema registry that maps surface → zod schema.
grep -oE 'NU1=\{[^}]+\}' /tmp/cli-extracted.js

# For each surface, inspect its schema body.
grep -oE 'LU1=[^;]{0,2000}' /tmp/cli-extracted.js   # skill
grep -oE 'kU1=[^;]{0,2000}' /tmp/cli-extracted.js   # agent
grep -oE 'VU1=[^;]{0,2000}' /tmp/cli-extracted.js   # output-style

# Confirm a field's owning schema by checking its describe-string.
grep -oE '.{40}allowed-tools.{40}' /tmp/cli-extracted.js
```

Symbol names (`NU1`, `LU1`, `kU1`, `VU1`) rotate every release; the
anchor is the describe-string text, which is stable. If the
describe-strings change, re-do this audit.
