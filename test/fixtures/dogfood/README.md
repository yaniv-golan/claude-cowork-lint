# Dogfood corpus

This directory holds the **canonical real-world fixture corpus** used by
`test/integration/dogfood-corpus.test.ts`. Each fixture mirrors a pattern
that actually surfaced — or should have surfaced — a finding when
`cwlint` was run against a third-party Claude skill or plugin repo
during dogfood passes.

## Why this exists

Synthetic fixtures test what the author *thought* to test. Real
fixtures catch what the author *didn't* think to test.

Concrete example: the CW006 prose false-positive (a `prompt:` field
containing the English word "WriteFile" was flagged as a typo) sat
unnoticed for months because none of the synthetic CW006 fixtures had a
`prompt:` field. Once a real hook from a third-party repo was added to
the corpus, the false-positive surfaced immediately.

The integration test in `test/integration/dogfood-corpus.test.ts` walks
every fixture in this directory and asserts a small per-fixture
expectations table (which rules MUST fire, which MUST NOT). Adding a
new fixture is the lightest-weight regression test we ship.

## Anonymisation policy

No fixture in this directory contains verbatim text from a third-party
repo. Prose is paraphrased; skill names and paths are renamed; any
identifying string literals are stripped. The provenance table below
records the *inspiration* — the originating repo + the rule the fixture
exercises — without claiming the fixture is a copy.

If you add a fixture inspired by a third-party repo, follow the same
policy: paraphrase, rename, and credit only in this README.

## Fixtures

| Fixture | Inspiration | Pattern exercised | Expected findings |
|---|---|---|---|
| `clean-skill.md` | synthesised | negative control — clean skill body | (none) |
| `disable-model-invocation.md` | `trailofbits/firebase-apk-scanner` | `disable-model-invocation: true` in frontmatter | CW004 |
| `hook-with-prompt-field.json` | `trailofbits/fp-check` | `prompt:` prose alongside a `command:` referencing `WriteFile` | CW006 (on the `command:` only, NOT the prose), CW011, CW012 |
| `hooks-with-broken-events.json` | `trailofbits/fp-check` | plugin-scoped hooks declaring `SessionStart`, `Stop`, `UserPromptSubmit` | CW011, CW012 |
| `multi-cue-bash-fence.md` | `gstack/ship` | multiple sub-agent dispatch cues preceding a single bash fence | CW008 (single finding, not one-per-cue) |
| `agents-with-shorthand-tools.md` | synthesised | inline-list `tools: [Bash, Read, NotebookEdit]` | CW001, CW002 |

Commit SHAs of the inspirations are intentionally omitted — the value of
this corpus is the *pattern* it mirrors, not the specific third-party
commit. If you need to re-verify against the original repo, search the
repo for the pattern name in the table above.

## License

Each fixture in this directory is licensed under the same MIT license as
the main project. Because no verbatim third-party content is shipped,
no additional attribution is required at runtime.

## When a fixture should change

- A rule's behaviour changed legitimately (e.g. severity bumped): update
  the test expectations, not the fixture.
- A rule produces a false positive on a fixture: file an issue and add
  a new fixture that captures the false-positive pattern; do NOT silence
  the rule by editing the fixture to avoid it.
- A fixture stops triggering its target rule: investigate before
  modifying — the fixture is the regression signal.
