# claude-cowork-lint (Node.js port)

TypeScript bindings for [`claude-cowork-lint`](https://github.com/yaniv-golan/claude-cowork-lint).

Implements the same rule set as the Python reference (`CW001`–`CW012`,
with `CW007` reserved). Reads the same `contracts/cowork-v*.json` files —
the contract is the source of truth, both implementations are renderers.

## Install

```bash
npm install claude-cowork-lint
```

## Usage

### Programmatic

```ts
import { checkRepo, loadDefaultSpec } from "claude-cowork-lint";

const spec = loadDefaultSpec();
const report = checkRepo("./my-skill-repo", spec);
for (const f of report.findings) {
  console.log(`${f.ruleId} ${f.path}:${f.line}  ${f.message}`);
}
```

### Tree-shake the rules

```ts
import { CW001, CW004, discover, loadDefaultSpec } from "claude-cowork-lint";

const spec = loadDefaultSpec();
const layout = discover("./my-skill-repo");
const findings = [...CW001.check(layout, spec), ...CW004.check(layout, spec)];
```

### Suppression

Inline markers honour the same `cwlint: ignore CWxxx reason="..."` syntax as
the Python implementation.

```ts
import { isSuppressed, parseSuppressions } from "claude-cowork-lint";

const lines = source.split("\n");
const sups = parseSuppressions(lines);
isSuppressed(sups, "CW001", 42);  // true if marker on line 41 or 42
```

## Build & test

```bash
npm install
npm run build
npm test
```

## License

MIT
