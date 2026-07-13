#!/usr/bin/env bash
#
# make-base.sh [BASE_REF]   (default: origin/main)
#
# Builds the bench/base branch from BASE_REF. Inner and outer arms share the same
# gate set on main: install + lint + Trivy + test + bundle (both mini-apps).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
BASE_REF="${1:-origin/main}"

git fetch -q origin main
git checkout -q -B bench/base "$BASE_REF"
git reset -q --hard "$BASE_REF"

echo "bench/base ready at $(git rev-parse --short HEAD) (gates: $(jq -r '[.commands[]|select(.role=="gate").name]|join(", ")' .chunk/config.json))"
