---
name: scanner-helper
description: Helper for running an APK scan across an artifact bundle.
user-invocable: true
disable-model-invocation: true
---

# Scanner helper

This skill walks the user through running a static-analysis pass over an
extracted APK bundle. It is intended for manual invocation only — the
author set `disable-model-invocation: true` so the runtime will not
auto-launch it.

## Steps

1. Drop the APK into the working directory.
2. Run the bundled extractor against it.
3. Inspect the report.

The skill body intentionally omits any runtime tooling references; the
fixture exists solely to exercise CW004.
