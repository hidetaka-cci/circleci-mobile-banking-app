#!/usr/bin/env bash
ROOT="$HOME/workspace/circleci-mobile-banking-app"
N=${N:-40}
SLEEP_MS=${SLEEP_MS:-400}
R=/tmp/scale-bench.txt
: > "$R"
now(){ date +%s.%N; }
dur(){ awk "BEGIN{printf \"%.2f\", $2-$1}"; }

echo "cores(nproc)=$(nproc 2>/dev/null || echo '?')  generated_atoms=$N  per-atom-sleep=${SLEEP_MS}ms" >> "$R"
echo "" >> "$R"

for app in payments transfers; do
  D="$ROOT/miniapps/$app"; cd "$D" || continue
  echo "## $app" >> "$R"

  # --- generate N independent heavy modules + test atoms (1:1 mapping) ---
  mkdir -p src/lib/gen __tests__/gen
  for i in $(seq 1 $N); do
    printf 'module.exports = function mod%s(x){ return (x||0) + %s; };\n' "$i" "$i" > "src/lib/gen/mod$i.js"
    printf "const mod%s = require('../../src/lib/gen/mod%s');\nconst sleep=(ms)=>new Promise(r=>setTimeout(r,ms));\ntest('mod%s', async ()=>{ await sleep(%s); expect(mod%s(1)).toBe(1+%s); });\n" "$i" "$i" "$i" "$SLEEP_MS" "$i" "$i" > "__tests__/gen/mod$i.test.js"
  done
  git add src/lib/gen __tests__/gen >/dev/null 2>&1
  git -c user.email=b@l -c user.name=bench commit -q -m "bench($app): $N heavy atoms" >/dev/null 2>&1
  echo "generated $N atoms (+5 originals)" >> "$R"

  # --- seed local impact data ---
  s=$(now); circleci run testsuite "ci tests" --local --analyze-tests=all >/tmp/seed-$app.log 2>&1; e=$(now)
  echo "seed (analyze all):                          $(dur $s $e)s" >> "$R"

  # --- FULL suite (plain jest, all atoms) ---
  npx jest >/dev/null 2>&1   # warm
  s=$(now); npx jest >/dev/null 2>&1; e=$(now)
  echo "FULL suite (npx jest, all atoms):            $(dur $s $e)s" >> "$R"

  # --- SMART: change ONE module ---
  echo '// change' >> src/lib/gen/mod1.js
  s=$(now); out=$(circleci run testsuite "ci tests" --local 2>&1); e=$(now)
  sel=$(echo "$out" | grep -oE 'Selected [0-9]+ test atoms, Skipped [0-9]+' | tail -1)
  echo "SMART (1 module changed):                    $(dur $s $e)s  [$sel]" >> "$R"
  git checkout -- src/lib/gen/mod1.js

  # --- SMART: no change ---
  s=$(now); out=$(circleci run testsuite "ci tests" --local 2>&1); e=$(now)
  sel=$(echo "$out" | grep -oE 'Selected [0-9]+ test atoms, Skipped [0-9]+' | tail -1)
  echo "SMART (no change):                           $(dur $s $e)s  [$sel]" >> "$R"

  echo "" >> "$R"
done
echo "=== DONE ===" >> "$R"
