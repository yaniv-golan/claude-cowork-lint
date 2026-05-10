# Retrospective — language choice (Python prototype → Node-native rewrite)

This is an internal post-mortem on the language-of-implementation decision
for `claude-cowork-lint`. It exists because the project shipped a working
v0.1 implementation in Python, then re-implemented the same surface in
Node before the first public release. The cost was real, and the rationale
is worth recording so future projects in this neighbourhood can skip the
detour.

## What we originally decided, and why

`docs/internal/SPEC.md` was authored Python-first. The rationale at the
time was:

- **Familiarity for the author.** Python was the language closest at hand,
  the language the SPEC's example pseudo-code naturally fell into.
- **`pydantic`** for the contract loader and **`click`** for the CLI were
  judged the lowest-friction stack to get a strict, typed, schema-validated
  loader plus a polished CLI shipped fast.
- **Pytest** was the default for TDD, and TDD was the discipline the v0.1
  plan committed to.
- **No tight coupling** was visible *at spec time* between the artifacts
  the linter consumes and the language the linter would be written in.
  Skill `SKILL.md`, `plugin.json`, `hooks.json`, `commands/*.md` all parse
  fine in any language; the runtime contract is JSON. The argument "we
  parse JS bundles, we should be in JS" did not surface in the design
  review — that came later, during the v0.2 extractor work.
- **`importlib.resources`** plus a wheel was a known-good pattern for
  shipping the contract files inside the package, with byte-identical
  parity enforced by a sync test.

The Python build got to 11 working rules, `text`/`json`/`sarif` formatters,
suppression markers, an extractor framework against synthetic fixtures, the
schema lock, and the watcher scaffolding — i.e. the v0.1 surface as
originally scoped. The decision wasn't *wrong* in any narrow technical
sense; the Python prototype works. It was wrong on three softer axes that
together turned out to dominate.

## What we learned by doing the Python build

Three lessons crystallised during v0.1 that flipped the language calculus:

1. **The audience is in the TS/JS ecosystem.** Skill and plugin authors
   building for Claude.app are overwhelmingly in JS/TS — the manifests
   they edit, the slash commands and hooks they wire up, the surrounding
   plugin tooling, and the marketplace conventions all assume `npm`.
   Asking that audience to install `pipx` and Python 3.11 to lint their
   skill is friction we created and then had to apologise for. A Node
   package, `npm i -g` and they're done.
2. **The artifacts we extract are JavaScript.** The v0.2 extractor work
   consumes Claude.app's minified Electron bundles and the in-VM CLI's
   Bun-SEA bundle. We tried doing this with regex anchors in Python; it
   worked for the simplest gates and started to hurt the moment we needed
   identifier resolution (e.g. `var H9 = "Read"; new Set([H9, ...])`).
   `@babel/parser` + `@babel/traverse` are the right tools for that job
   and they're JS-native. Re-implementing a JS AST walker in Python was
   never going to be cheaper than writing the extractor in the language
   the AST already lives in.
3. **The surrounding ecosystem is JS-first.** MCP servers are commonly
   distributed as JS. The bundled Claude plugin (`.claude-plugin/`) lives
   inside an environment whose other tooling is JS. `@electron/asar`
   has a clean programmatic API in Node; the equivalent Python wrappers
   are thinner. Each one of these is small in isolation; together they
   add up to "every neighbouring tool I want to call is JS" and the
   path of least resistance is to be JS too.

The order matters: 1 was the headline reason, 2 was the technically-decisive
reason, 3 was the cluster of small ergonomic wins that made the rewrite
*easy* once committed.

## What we'd do differently next time

The mistake wasn't picking Python. The mistake was **not asking the right
questions before locking in a language**. Two questions, asked in spec
review, would have pointed the right way:

- **Where does the audience already type?** If the people you want using
  the tool live in a particular ecosystem, default to that ecosystem and
  argue for deviation. We did not run this check on `claude-cowork-lint`
  at spec time.
- **What artifacts are we touching?** If you're parsing JS bundles, an
  AST library written in JS will out-pace a regex/AST stack in any other
  language. If you're parsing PE binaries, the calculus inverts. Ask
  this *before* writing the extractor, not after.

We also note that the **QA-harness tier** from `plugin-doctor` was
deliberately *not* adopted in this project. plugin-doctor's harness boots a
real Claude session and observes the runtime through it; that is excellent
ground-truth verification for behavioural rules, but it requires a live
Claude.app + sandbox infra and is much heavier than this project's
target. `claude-cowork-lint` is intentionally a static checker — we cite
the field of the contract each rule reads, and we test extractor calibration
against real bundles, but we do not boot Claude. If a future evolution of
this project wants behavioural verification, the harness tier from
plugin-doctor is the design to copy; doing so was out of scope for v0.1
and remains so for the foreseeable future.

## Decision-log entries that no longer apply

The original SPEC review captured several decisions that the Node rewrite
made obsolete. They are listed here so that anyone reading older revisions
of `SPEC.md` can map them to the current state.

- *"Wheel must contain `src/cwlint/_contracts/` byte-identical with the
  canonical `contracts/`; sync enforced by `tests/unit/test_contracts_sync.py`."*
  Obsolete. The npm tarball ships `contracts/` directly via
  `package.json#files`; `loadDefaultSpec()` reads the file at runtime
  with no resource-mirror layer. There is no second copy to keep in sync.
- *"`pydantic` models load and validate the contract."* Obsolete. The
  contract is now loaded by a Zod schema in `src/spec.ts`. Same shape,
  same strictness, no Python dependency.
- *"`click`-based CLI, two console-script entry points in `pyproject.toml`."*
  Obsolete. Commander v12 in `src/cli.ts`, two `bin` entries in
  `package.json`. Exit-code semantics preserved (with one nuance — see
  `docs/CLI.md`'s exit-code table on the commander-vs-action-handler
  split).
- *"`pytest` with `tests/conftest.py::make_skill_repo` fixture."*
  Obsolete. Vitest with a `make_skill_repo` helper in `test/helpers.ts`.
- *"`pre-commit` framework runs `ruff` + `mypy` on staged files."*
  Obsolete. `simple-git-hooks` runs `biome check --staged` on staged
  files only. The strictness of `mypy --strict` has a TS-side equivalent
  via `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` in
  `tsconfig.json`.
- *"PyPI Trusted Publisher with environment `pypi`."* Obsolete. npm
  Trusted Publisher with environment `npm`; `publishConfig.provenance:
  true` for OIDC-signed provenance.

Everything else in `SPEC.md` — the runtime-contract model, the survivor-set
formula, the rule semantics, the extraction strategy, the schema-lock
discipline — survived the rewrite intact. The design was language-agnostic
in all the ways that mattered; only the implementation tooling flipped.
