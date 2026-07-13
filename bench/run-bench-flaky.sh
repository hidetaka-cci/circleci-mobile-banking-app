#!/usr/bin/env bash
#
# run-bench-flaky.sh [N]
#   N = trials per arm (default 5)
#
# Runs the flaky-scenario benchmark: same as run-bench.sh, but the outer arm has
# iteration 1 artificially overridden to "failed" (simulating a transient CI
# infrastructure timeout) even when CI actually passes.
#
# Purpose: measure the extra token / wall-clock / cost overhead the outer arm
# pays when a single flaky CI failure forces an extra iteration.
#
# The inner arm is unaffected — local sidecar validation is not subject to the
# injected failure, so it completes in a single pass.
#
# Output: bench/report-flaky.md (separate from the normal report.md)
#
# Env vars forwarded from the calling shell:
#   CIRCLE_TOKEN / CIRCLECI_TOKEN   for CI-minute collection
#   OUTER_MAX_ITERS                 per-arm iteration cap (default 6)
set -euo pipefail

N="${1:-5}"
BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Activate flaky injection for the outer arm's iteration 1
export BENCH_INJECT_FLAKY=1
# Ensure the outer loop has enough budget for the extra flaky retry
export OUTER_MAX_ITERS="${OUTER_MAX_ITERS:-6}"
# Write results to a separate report file
export BENCH_REPORT_OUTPUT="report-flaky.md"

fail() { echo "PREFLIGHT FAILED: $*" >&2; exit 1; }

echo "=== preflight (flaky scenario) ==="
curl -fsS -o /dev/null http://localhost:9091/-/healthy 2>/dev/null || fail "pushgateway down — run: docker compose -f bench/docker-compose.yml up -d"
curl -fsS -o /dev/null http://localhost:9090/-/ready   2>/dev/null || fail "prometheus down — run: docker compose -f bench/docker-compose.yml up -d"
chunk sidecar current >/dev/null 2>&1 || fail "no active chunk sidecar — run: chunk sidecar current / create one"
DIRTY="$(git status --porcelain --untracked-files=no)"
[[ -z "$DIRTY" ]] || fail "uncommitted tracked changes present; commit/stash first:\n$DIRTY"
[[ -n "${CIRCLE_TOKEN:-${CIRCLECI_TOKEN:-}}" ]] || echo "WARN: no CIRCLE_TOKEN — CI-minute collection will be skipped"

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git config push.autoSetupRemote true

echo "=== building bench/base (flaky scenario uses same base) ==="
bash "$BENCH_DIR/scenario/make-base.sh"
export BENCH_BASE_REF=bench/base

cleanup() {
  cp "$BENCH_DIR/env/settings-inner.json" "$REPO_ROOT/.claude/settings.json" 2>/dev/null || true
  git checkout -q "$START_BRANCH" 2>/dev/null || true
  git checkout -q -- .claude/settings.json 2>/dev/null || true
  echo "=== restored branch $START_BRANCH and settings ==="
}
trap cleanup EXIT

# Swap TASK.md for the flaky-scenario version
TASK_BAK="$BENCH_DIR/scenario/TASK.md.bak-flaky-$$"
cp "$BENCH_DIR/scenario/TASK.md" "$TASK_BAK"
cp "$BENCH_DIR/scenario/TASK-flaky.md" "$BENCH_DIR/scenario/TASK.md"
# Restore TASK.md on exit in addition to the standard cleanup
cleanup_task() {
  cp "$TASK_BAK" "$BENCH_DIR/scenario/TASK.md" 2>/dev/null || true
  rm -f "$TASK_BAK"
}
trap 'cleanup_task; cleanup' EXIT

echo "=== running $N trials per arm — FLAKY scenario (outer arm iter-1 forced failed) ==="
for i in $(seq 1 "$N"); do
  bash "$BENCH_DIR/run-trial.sh" inner "$i"
  bash "$BENCH_DIR/run-trial.sh" outer "$i"
done

echo "=== collecting CircleCI minutes ==="
node "$BENCH_DIR/collect-ci.mjs" || echo "WARN: CI collection failed; re-run: node bench/collect-ci.mjs"

echo "=== aggregating -> bench/report-flaky.md ==="
node "$BENCH_DIR/aggregate.mjs"

echo "=== DONE. Report: bench/report-flaky.md ==="
