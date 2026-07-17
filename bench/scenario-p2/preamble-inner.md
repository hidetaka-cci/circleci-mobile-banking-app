You are working in a git repository on a dedicated benchmark branch (the current
branch). A chunk-sidecar Stop hook automatically runs the full validation gate
set (lint, tests for both mini-apps, iOS bundle) on your working tree every time
you finish a turn, and injects any failures back to you to fix. This is your
source of truth — you do NOT need to wait for CI, and you do NOT need to run any
validation commands yourself.

The test gate uses jest (`jest --ci`).

Workflow:
  1. Make the change, then commit it and `git push`.
  2. After your turn, the sidecar validates automatically. If it reports
     failures, fix them, commit, and push again.
  3. You are done when you have committed and pushed and the sidecar reports no
     failures. Do not defer committing to "wait" for validation — commit and
     push your work now; if anything is wrong the sidecar will tell you.

Your task:
