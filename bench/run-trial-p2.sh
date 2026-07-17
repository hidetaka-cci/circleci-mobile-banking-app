#!/usr/bin/env bash
#
# run-trial-p2.sh ARM TRIAL
#   ARM   = inner | outer
#   TRIAL = integer trial number
#
# p2 variant of run-trial.sh.
# Measures TOTAL SESSION TOKENS (full usage vector: input/cache_creation/cache_read/output).
#
# Key differences from run-trial.sh:
#   - Scenario: bench/scenario-p2/ (refund module task)
#   - Test gate: vitest run with PAYMENT_REFUND_LIMIT_BP set in sidecar
#   - Base branch: bench/base-p2 (built by scenario-p2/make-base-p2.sh)
#   - Metrics: full token vector saved to <label>.metrics.json
set -euo pipefail

ARM="${1:?usage: run-trial-p2.sh <inner|outer> <trial>}"
TRIAL="${2:?usage: run-trial-p2.sh <inner|outer> <trial>}"
[[ "$ARM" == "inner" || "$ARM" == "outer" ]] || { echo "ARM must be inner|outer"; exit 2; }

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"
RESULTS="${BENCH_RESULTS_DIR:-$BENCH_DIR/results-p2}"
PUSHGW="${PUSHGW:-http://localhost:9091}"
mkdir -p "$RESULTS"
cd "$REPO_ROOT"

TAG="${BENCH_BRANCH_TAG:-p2}"
LABEL="${ARM}-${TRIAL}"
BRANCH="bench/${TAG}-${LABEL}"
RESULT_JSON="$RESULTS/${LABEL}.json"
RUN_LOG="$RESULTS/${LABEL}.log"

BASE_REF="${BENCH_BASE_REF:-bench/base-p2}"
git rev-parse --verify -q "$BASE_REF" >/dev/null || {
  echo "ERROR: $BASE_REF missing — run bench/scenario-p2/make-base-p2.sh"; exit 1; }
echo "==> [$LABEL] fresh branch $BRANCH from $BASE_REF"
git reset -q --hard HEAD 2>/dev/null || true
git checkout -q -B "$BRANCH" "$BASE_REF"
git reset -q --hard "$BASE_REF"
BASE_SHA="$(git rev-parse HEAD)"

# arm-specific Claude settings (same env files as step-1/step-2)
cp "$BENCH_DIR/env/settings-${ARM}.json" "$REPO_ROOT/.claude/settings.json"

# shellcheck disable=SC1091
source "$BENCH_DIR/env/shared.env"
export OTEL_RESOURCE_ATTRIBUTES="loop=${ARM},trial=${TRIAL},scenario=p2"

PROMPT="$(cat "$BENCH_DIR/scenario-p2/preamble-${ARM}.md"; echo; cat "$BENCH_DIR/scenario-p2/TASK.md")"

ITERS=1; CI_STATUS="n/a"
if [[ "$ARM" == "inner" ]]; then
  echo "==> [$LABEL] running claude (inner)"
  START=$(date +%s); TURN_TIMESTAMPS=""
  set +e
  claude -p "$PROMPT" --output-format json --permission-mode acceptEdits >"$RESULT_JSON" 2>"$RUN_LOG"
  CLAUDE_RC=$?
  set -e
  END=$(date +%s); WALL=$((END - START))
  COST=$(jq -r '.total_cost_usd // 0'   "$RESULT_JSON" 2>/dev/null || echo 0)
  TURNS=$(jq -r '.num_turns // 0'       "$RESULT_JSON" 2>/dev/null || echo 0)
  DUR_MS=$(jq -r '.duration_ms // 0'    "$RESULT_JSON" 2>/dev/null || echo 0)
  IS_ERROR=$(jq -r '.is_error // false' "$RESULT_JSON" 2>/dev/null || echo true)
else
  MAX_ITERS="${OUTER_MAX_ITERS:-8}"
  CLAUDE_RC=0; COST=0; TURNS=0; DUR_MS=0; IS_ERROR=false; CI_STATUS="unknown"; SID=""; FEEDBACK=""
  START=$(date +%s); ITERS=0
  while [ "$ITERS" -lt "$MAX_ITERS" ]; do
    ITERS=$((ITERS + 1))
    ij="$RESULTS/${LABEL}.iter${ITERS}.json"
    echo "==> [$LABEL] outer iteration $ITERS"
    set +e
    if [ -z "$SID" ]; then
      claude -p "$PROMPT" --output-format json --permission-mode acceptEdits >"$ij" 2>>"$RUN_LOG"
    else
      claude -p --resume "$SID" "$FEEDBACK" --output-format json --permission-mode acceptEdits >"$ij" 2>>"$RUN_LOG"
    fi
    CLAUDE_RC=$?
    set -e
    SID=$(jq -r '.session_id // empty' "$ij" 2>/dev/null || true)
    COST=$(awk -v a="$COST" -v b="$(jq -r '.total_cost_usd // 0' "$ij" 2>/dev/null || echo 0)" 'BEGIN{printf "%.6f", a+b}')
    TURNS=$((TURNS + $(jq -r '.num_turns // 0' "$ij" 2>/dev/null || echo 0)))
    DUR_MS=$((DUR_MS + $(jq -r '.duration_ms // 0' "$ij" 2>/dev/null || echo 0)))
    cp "$ij" "$RESULT_JSON"
    HEAD_NOW="$(git rev-parse HEAD)"
    echo "==> [$LABEL] waiting for CI on $BRANCH @ ${HEAD_NOW:0:8} ..."
    CIW=$(node "$BENCH_DIR/outer-ci-wait.mjs" "$BRANCH" "$HEAD_NOW" 900 2>>"$RUN_LOG" | tail -1)
    CI_STATUS=$(echo "$CIW" | jq -r '.status // "error"' 2>/dev/null || echo error)
    echo "==> [$LABEL] CI iteration $ITERS -> $CI_STATUS"
    [ "$CI_STATUS" = "success" ] && break
    if [ "$CI_STATUS" != "failed" ]; then echo "==> CI $CI_STATUS — stopping"; break; fi
    FEEDBACK="The CI pipeline for this branch FAILED. You cannot validate locally; CI is your only signal. Failure logs:

$(echo "$CIW" | jq -r '.feedback // "no logs"' 2>/dev/null)

Fix the problem, commit, and push again, then stop. Do not poll CI yourself."
  done
  END=$(date +%s); WALL=$((END - START))
  [ "$CI_STATUS" = "success" ] && IS_ERROR=false || IS_ERROR=true
fi

HEAD_AFTER="$(git rev-parse HEAD)"
COMMITS=$(git rev-list --count "${BASE_SHA}..${HEAD_AFTER}" 2>/dev/null || echo 0)

# Extract full token vector from the (possibly multi-iter) result JSON.
TOK_INP=$(jq -r '.usage.input_tokens // 0' "$RESULT_JSON" 2>/dev/null || echo 0)
TOK_OUT=$(jq -r '.usage.output_tokens // 0' "$RESULT_JSON" 2>/dev/null || echo 0)
TOK_CR=$(jq -r '.usage.cache_read_input_tokens // 0' "$RESULT_JSON" 2>/dev/null || echo 0)
TOK_CC=$(jq -r '.usage.cache_creation_input_tokens // 0' "$RESULT_JSON" 2>/dev/null || echo 0)
# For outer multi-iter, sum across all iter*.json files.
if [[ "$ARM" == "outer" && "$ITERS" -gt 1 ]]; then
  TOK_INP=0; TOK_OUT=0; TOK_CR=0; TOK_CC=0
  for i in $(seq 1 "$ITERS"); do
    ij="$RESULTS/${LABEL}.iter${i}.json"
    [ -f "$ij" ] || continue
    TOK_INP=$((TOK_INP + $(jq -r '.usage.input_tokens // 0' "$ij" 2>/dev/null || echo 0)))
    TOK_OUT=$((TOK_OUT + $(jq -r '.usage.output_tokens // 0' "$ij" 2>/dev/null || echo 0)))
    TOK_CR=$((TOK_CR  + $(jq -r '.usage.cache_read_input_tokens // 0' "$ij" 2>/dev/null || echo 0)))
    TOK_CC=$((TOK_CC  + $(jq -r '.usage.cache_creation_input_tokens // 0' "$ij" 2>/dev/null || echo 0)))
  done
fi
TOK_TOTAL=$((TOK_INP + TOK_OUT + TOK_CR + TOK_CC))

echo "==> [$LABEL] done rc=$CLAUDE_RC wall=${WALL}s cost=\$${COST} turns=${TURNS} iters=${ITERS} commits=${COMMITS} ci=${CI_STATUS} is_error=${IS_ERROR}"
echo "==>         tokens: total=${TOK_TOTAL} inp=${TOK_INP} out=${TOK_OUT} cr=${TOK_CR} cc=${TOK_CC}"

echo "$BRANCH" > "$RESULTS/${LABEL}.branch"
echo "# misattrib annotation placeholder — fill using bench/scenario-p2/RUBRIC.md" > "$RESULTS/${LABEL}.annot.md"

cat > "$RESULTS/${LABEL}.metrics.json" <<EOF
{
  "arm": "${ARM}", "trial": ${TRIAL}, "branch": "${BRANCH}",
  "wall_seconds": ${WALL}, "claude_rc": ${CLAUDE_RC}, "commits": ${COMMITS},
  "iterations": ${ITERS}, "ci_status": "${CI_STATUS}",
  "cost_usd": ${COST}, "turns": ${TURNS}, "is_error": ${IS_ERROR},
  "tok_inp": ${TOK_INP}, "tok_out": ${TOK_OUT},
  "tok_cr": ${TOK_CR}, "tok_cc": ${TOK_CC}, "tok_total": ${TOK_TOTAL}
}
EOF

curl -fsS --data-binary @- "${PUSHGW}/metrics/job/bench-p2/loop/${ARM}/trial/${TRIAL}" <<EOF || echo "WARN: pushgateway unreachable"
# TYPE bench_p2_wall_clock_seconds gauge
bench_p2_wall_clock_seconds ${WALL}
# TYPE bench_p2_cost_usd gauge
bench_p2_cost_usd ${COST}
# TYPE bench_p2_turns gauge
bench_p2_turns ${TURNS}
# TYPE bench_p2_total_tokens gauge
bench_p2_total_tokens ${TOK_TOTAL}
# TYPE bench_p2_output_tokens gauge
bench_p2_output_tokens ${TOK_OUT}
# TYPE bench_p2_cache_read_tokens gauge
bench_p2_cache_read_tokens ${TOK_CR}
EOF

echo "$LABEL"
