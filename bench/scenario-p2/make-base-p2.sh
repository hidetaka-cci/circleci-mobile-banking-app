#!/usr/bin/env bash
#
# make-base-p2.sh [BASE_REF]   (default: origin/main)
#
# Builds bench/base-p2 from BASE_REF.
#
# p2 differences from bench/base:
#   - test-payments gate uses vitest run (not jest --ci)
#   - PAYMENT_REFUND_LIMIT_BP=10000 set in the gate (mechanism-1 env var)
#   - limits.js + limits.test.js present (mechanism-1 trigger)
#
# The refund.js task is NOT present — agents must implement it from TASK.md.
# Held-out tests (bench/scenario-p2/held-out/) are also not in the working tree.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
BASE_REF="${1:-origin/main}"

git fetch -q origin main
git checkout -q -B bench/base-p2 "$BASE_REF"
git reset -q --hard "$BASE_REF"

echo "bench/base-p2 ready at $(git rev-parse --short HEAD)"
echo "Gates: $(jq -r '[.commands[]|select(.role=="gate").name]|join(", ")' .chunk/config.json)"
echo ""
echo "Verify the test gate includes vitest:"
jq -r '.commands[]|select(.name=="test-payments").run' .chunk/config.json
