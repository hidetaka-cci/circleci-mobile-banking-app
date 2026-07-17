#!/usr/bin/env bash
#
# run-bench-p2.sh [N_TRIALS]   (default: 10)
#
# Runs N trials for each arm (inner + outer) of the p2 benchmark.
# Results go to bench/results-p2/.
#
# Prerequisites:
#   1. bench/scenario-p2/make-base-p2.sh must have been run (creates bench/base-p2)
#   2. BENCH_BASE_REF=bench/base-p2 (default in run-trial-p2.sh)
#   3. CIRCLE_TOKEN set (for outer CI polling)
#
# Usage examples:
#   bash bench/run-bench-p2.sh          # 10 inner + 10 outer
#   bash bench/run-bench-p2.sh 5        # 5 inner + 5 outer
#   bash bench/run-bench-p2.sh 1 inner  # 1 inner only (dry run)
set -euo pipefail

N="${1:-10}"
ONLY_ARM="${2:-}"  # optional: inner | outer

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"
cd "$REPO_ROOT"

export BENCH_RESULTS_DIR="${BENCH_RESULTS_DIR:-$BENCH_DIR/results-p2}"
export BENCH_BASE_REF="${BENCH_BASE_REF:-bench/base-p2}"
export BENCH_BRANCH_TAG="${BENCH_BRANCH_TAG:-p2}"
mkdir -p "$BENCH_RESULTS_DIR"

if [ -z "$ONLY_ARM" ] || [ "$ONLY_ARM" = "inner" ]; then
  echo "==> Running $N inner trials"
  for i in $(seq 1 "$N"); do
    bash "$BENCH_DIR/run-trial-p2.sh" inner "$i"
    echo "==> inner-$i complete"
  done
fi

if [ -z "$ONLY_ARM" ] || [ "$ONLY_ARM" = "outer" ]; then
  echo "==> Running $N outer trials"
  for i in $(seq 1 "$N"); do
    bash "$BENCH_DIR/run-trial-p2.sh" outer "$i"
    echo "==> outer-$i complete"
  done
fi

echo "==> All trials complete. Aggregating..."
BENCH_RESULTS_DIR="$BENCH_RESULTS_DIR" node "$BENCH_DIR/aggregate-p2.mjs"
echo "==> Done. See bench/report-p2.md"
