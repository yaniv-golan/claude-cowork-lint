---
name: ship-changes
description: Stage, push, and open a PR for the current branch.
user-invocable: true
---

# Ship

Run this from the working branch when the change is ready.

## Step 1 — confirm state

The skill may dispatch a helper via Task(subagent_type='reviewer') if the
diff is large. It can also fall back to `/bg review-changes` or
`spawn_subagent` when the reviewer is unavailable.

```bash
git status
git diff --stat
```

## Step 2 — push and open PR

Once the review settles, push and open the PR from the main thread.

<!-- main-thread: this block runs in the foreground -->

```bash
git push -u origin HEAD
gh pr create --fill
```
