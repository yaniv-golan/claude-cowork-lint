# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email yaniv@lool.vc with the subject line `SECURITY: claude-cowork-lint — <short summary>`. Include:

- A description of the issue and its impact
- Steps to reproduce
- Affected version(s)
- Any suggested fix

You'll receive an acknowledgment within 72 hours. A fix and disclosure timeline will be coordinated with you. We follow a 90-day disclosure window by default.

## Supported versions

While the project is pre-1.0, only the latest published `0.x` line is supported.

| Version | Supported |
|---|---|
| 0.1.x | ✅ — fixes land on `main` and ship in the next patch release |
| < 0.1 | ❌ |

## Threat model (current)

`claude-cowork-lint` reads files in a target repo and a vendored JSON spec. It does **not**:

- Execute any code from the target repo
- Open network connections
- Mutate the target repo
- Read environment variables outside `CWLINT_*` configuration prefixes

Spec files in `contracts/` are facts about Anthropic's runtime extracted from binaries
the user already has installed. No Anthropic source or proprietary data is redistributed.
