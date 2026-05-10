# claude-cowork-lint (Node.js port)

TypeScript bindings for [`claude-cowork-lint`](https://github.com/yaniv-golan/claude-cowork-lint).

> **Status: v0.4 scaffolding.** v0.1 ships the spec loader and `CW001` as a
> proof of concept. Rules `CW002`–`CW012` will land in v0.4 alongside the
> Python reference implementation. Until then, prefer the Python package for
> production use.

## Install

```bash
npm install claude-cowork-lint
```

## Usage

```ts
import { loadDefaultSpec, checkCw001 } from "claude-cowork-lint";

const spec = loadDefaultSpec();
const findings = checkCw001("agents/reviewer.md", spec);
for (const f of findings) {
  console.log(`${f.ruleId} ${f.path}:${f.line}  ${f.message}`);
}
```

## Architecture

The Node port reads the **same** `contracts/cowork-v*.json` files as the
Python package — the contract is the source of truth, both implementations
are renderers. JSON schema parity is enforced by
`tests/unit/test_contracts_sync.py` in the Python package.

## License

MIT
