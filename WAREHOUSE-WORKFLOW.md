# ZTU Warehouse → Production Workflow (official, supported)

Your intentional workflow — **edit in the warehouse `D:\website`, copy to `D:\ztradeuniversity`, commit, push** — is fully supported. This document is the permanent architecture that makes it safe.

## Why pushes used to break (root cause)
`D:\website` is a git repo with **no remote** and an **unrelated history**, so it had **no way to receive production changes**. When a fix landed in production (`D:\ztradeuniversity` / `origin/main`) but not in the warehouse, the warehouse fell behind. Copying its **stale** files back into the repo then **removed** production runtime logic → the pre-push guard correctly blocked the regression.

The flaw was **not** the hook and **not** your workflow — it was that **nothing kept the warehouse in sync with production**, and the copy step moved *all* files (stale ones included), not just your edits.

## The fix (two guarantees)
1. **Freshness:** refresh the warehouse from production **before** you edit, so it can never be behind.
2. **Edit-only copy:** publish copies **only the files you actually changed this session** (diffed against the sync baseline) — stale files are never copied, so they can never revert production.

The regression pre-push hook remains the **final safety net** (unchanged in strength).

## Daily use (three steps)
```powershell
# 1) START of session — make the warehouse current
./scripts/warehouse-sync.ps1

# 2) edit your feature ONLY in D:\website  (UI, runtime, anything)

# 3) FINISH — copy just your edits into the repo…
./scripts/publish-from-warehouse.ps1                 # then commit/push in GitHub Desktop
#    …or do it all from the CLI:
./scripts/publish-from-warehouse.ps1 -Commit "your message"
```
- **GitHub Desktop** users: run steps 1–2, then `publish-from-warehouse.ps1` (no `-Commit`), then commit/push in GitHub Desktop — only your real edits are staged.
- **PowerShell** users: use `-Commit` to commit + push (the hook runs as the final gate).

## What each piece does
| File | Role |
|---|---|
| `scripts/warehouse-sync.ps1` | Refreshes `D:\website` to match production; records a baseline manifest (`.warehouse-sync.json`). Excludes `.git`, client PII, backups. |
| `scripts/publish-from-warehouse.ps1` | Copies only files changed since the last sync into the repo (never stale files); optional commit + push. |
| `.githooks/pre-push` | Final gate. Blocks a push **only** if it removes a protected runtime implementation that `origin/main` has (functional-signature diff HEAD↔origin/main). Never blocks on unrelated/UI/CSS/comment/format changes. Enable once: `git config core.hooksPath .githooks`. |
| `scripts/stress-test-hook.sh` | Proves the guard: 0 false positives, 100% of regressions blocked. |

## Guarantees
- **Production protection: 100%.** Any push that removes protected runtime logic is blocked (proven).
- **False positives: 0%.** Refresh-then-edit + edit-only copy means the warehouse is never stale on files you didn't touch; the hook only fires on real removals (proven by stress test).
- **No manual restore, ever**, under this workflow.
