# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) —
one Markdown file per user-visible change. The `release.yml` workflow consumes
them via `changesets/action@v1`: on push to `main` it opens a "Version
Packages" PR that bumps `package.json#version`, regenerates `CHANGELOG.md`,
and (when merged) publishes to npm with OIDC provenance.

## Adding a changeset

```bash
npm run changeset
```

Pick the bump level (`patch` / `minor` / `major`) — see SemVer — and write a
one-paragraph summary aimed at downstream consumers, not internal reviewers.

`spec_version: "0"` and the JSON `schemaVersion: "0.1"` envelope have their
own stability rules (additive-only; rename/remove = next major of the
package). Schema bumps are a **major** version event for this package — call
that out explicitly in the changeset.

## Files in this directory

- `config.json` — changesets configuration (GitHub changelog formatter, public
  access, baseBranch `main`).
- `README.md` — this file.
- `*.md` (anything else) — pending changesets, consumed and deleted by
  `changeset version` during the release PR.
