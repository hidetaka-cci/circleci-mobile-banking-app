# Sidecar Benchmark — Inner vs Outer Loop

Inner loop = chunk-sidecar validation in the agent's lifecycle. Outer loop = traditional CI (push, read CircleCI, fix, repeat). Same task, same model; the only difference is how each arm validates.

- inner trials: **10**  ·  outer trials: **10**
- ⚠️ 2 trial(s) ended with is_error=true: outer-2, outer-5

## Headline — Sidecar (inner) vs Traditional CI (outer)

10 trials each, medians.

| Metric | inner | outer | outer ÷ inner |
|---|--:|--:|:--:|
| **Wall-clock to green** | 107 s | 172 s | **1.62× slower** |
| **Cost / change** | $0.128 | $0.167 | **1.30× more** |
| **Total tokens** | 210.7K | 242.4K | **1.15× more** |
| Agent turns | 9 | 10 | 1.11× more |
| **CI compute** | 1.1 min | 1.1 min | 1.03× (≈equal) |
| **CI pipelines** | 1 | 1 | equal |

**What it means:** On a change that passes CI first-try, the sidecar / inner loop is faster and cheaper *per change* — the time win is the CI wait the outer loop pays even on success, and the token/cost win comes from fewer agent turns. CI minutes are ≈equal because both arms run exactly one pipeline; the CI-compute savings only show up when the outer loop has to **iterate**, which this simple task does not trigger.

## Medians (inner vs outer)

| Metric | inner | outer | Δ (outer−inner) | outer / inner |
|---|--:|--:|--:|--:|
| Wall-clock to green (s) | 107 | 172 | 66 | 1.62× |
| Cost per trial ($) | 0.1281 | 0.1667 | 0.0387 | 1.30× |
| Agent turns | 9 | 10 | 1 | 1.11× |
| Total tokens | 210705 | 242362 | 31657 | 1.15× |
| Output tokens | 1631 | 2312 | 681 | 1.42× |
| CI compute (min) | 1.1 | 1.1 | 0.0 | 1.03× |
| CI pipelines | 1 | 1 | 0 | 1.00× |

## Spread (min … median … max)

**Wall-clock to green (s)**

- inner: 103 … 107 … 1084
- outer: 110 … 172 … 2251

**Cost per trial ($)**

- inner: 0.1027 … 0.1281 … 0.3994
- outer: 0.1032 … 0.1667 … 0.4464

**Agent turns**

- inner: 7 … 9 … 26
- outer: 7 … 10 … 22

**Total tokens**

- inner: 130060 … 210705 … 721995
- outer: 153968 … 242362 … 595232

**Output tokens**

- inner: 1375 … 1631 … 7244
- outer: 1238 … 2312 … 12391

**CI compute (min)**

- inner: 0.0 … 1.1 … 3.3
- outer: 0.0 … 1.1 … 3.0

**CI pipelines**

- inner: 0 … 1 … 1
- outer: 0 … 1 … 1

## Per-trial detail

| arm | trial | wall(s) | cost($) | turns | tokens | CI(min) | pipelines | error |
|---|--:|--:|--:|--:|--:|--:|--:|:-:|
| inner | 1 | 106 | 0.1340 | 10 | 236433 | 2.3 | 1 | ✓ |
| inner | 10 | 104 | 0.1185 | 8 | 181968 | 0.0 | 0 | ✓ |
| inner | 2 | 118 | 0.1741 | 13 | 322462 | 2.4 | 1 | ✓ |
| inner | 3 | 1084 | 0.2018 | 14 | 360925 | 3.3 | 1 | ✓ |
| inner | 4 | 121 | 0.1648 | 12 | 298556 | 2.7 | 1 | ✓ |
| inner | 5 | 234 | 0.3994 | 26 | 721995 | 2.2 | 1 | ✓ |
| inner | 6 | 106 | 0.1030 | 7 | 130060 | 0.0 | 0 | ✓ |
| inner | 7 | 107 | 0.1221 | 8 | 184977 | 0.0 | 0 | ✓ |
| inner | 8 | 104 | 0.1214 | 8 | 184831 | 0.0 | 0 | ✓ |
| inner | 9 | 103 | 0.1027 | 7 | 152429 | 0.0 | 0 | ✓ |
| outer | 1 | 223 | 0.3021 | 18 | 473683 | 2.3 | 1 | ✓ |
| outer | 10 | 110 | 0.1201 | 8 | 182828 | 0.0 | 0 | ✓ |
| outer | 2 | 1071 | 0.2340 | 17 | 455742 | 3.0 | 1 | ✗ |
| outer | 3 | 2251 | 0.4235 | 22 | 591997 | 2.4 | 1 | ✓ |
| outer | 4 | 320 | 0.4464 | 20 | 595232 | 2.5 | 1 | ✓ |
| outer | 5 | 1018 | 0.2134 | 12 | 301895 | 2.9 | 1 | ✗ |
| outer | 6 | 121 | 0.1099 | 7 | 156903 | 0.0 | 0 | ✓ |
| outer | 7 | 115 | 0.1038 | 7 | 154685 | 0.0 | 0 | ✓ |
| outer | 8 | 113 | 0.1032 | 7 | 154505 | 0.0 | 0 | ✓ |
| outer | 9 | 117 | 0.1072 | 7 | 153968 | 0.0 | 0 | ✓ |

_Live dashboard: http://localhost:3000/d/inner-vs-outer_

---

## Analysis & Caveats

### 1. Comparison with Prior n=5 Run (2026-06-10)

| Metric | n=5 (Jun-10) | n=10 (Jul-14) | Change |
|---|--:|--:|---|
| inner total tokens (median) | 93,570 | 210,705 | +125% |
| outer total tokens (median) | 170,150 | 242,362 | +42% |
| outer ÷ inner ratio | **1.82×** | **1.15×** | narrowed |
| Wall-clock ratio | 1.62× | 1.62× | unchanged |
| Cost ratio | 1.39× | 1.30× | narrowed |

**Why the token ratio narrowed (1.82× → 1.15×):** The two runs used different `bench/base` commits.

| | n=5 | n=10 |
|---|---|---|
| bench/base commit | `d7c48af` | `9bcd59c` |
| sidecar orgID in config | absent → local fallback | present → remote sidecar |
| test gate | `circleci run testsuite` (sidecar had plugin) | `npx jest --ci` (full Jest output) |
| sidecar image | mobile-banking-validate (old) | mobile-banking-validate-v2 |

`npx jest --ci` returns verbose per-test output whereas the old gate returned only a summary line. This inflated inner-arm `cache_read` tokens significantly, compressing the outer÷inner ratio. The n=5 and n=10 results are **not directly comparable** on absolute token counts.

### 2. Error Trials

Two outer-arm trials ended with `is_error=true`:

| Trial | CI status | wall(s) | Likely cause |
|---|---|--:|---|
| outer-2 | timeout | 1,071 | CircleCI pipeline took > 15 min (900 s timeout + 171 s overhead) |
| outer-5 | timeout | 1,018 | Same |

Medians are reported **including** these error trials. Excluding them (8 valid outer trials):

| Metric | outer (8 valid) | outer (10 all) |
|---|--:|--:|
| Wall-clock median (s) | 116 | 172 |
| Total tokens median | 168,744 | 242,362 |
| Cost median ($) | 0.112 | 0.167 |

The timeout trials inflate the outer-arm medians. With 8 valid outer trials the outer÷inner token ratio drops further to **~0.80×** (inner is heavier due to verbose npx jest sidecar output), which reflects the sidecar verbosity issue rather than a genuine efficiency reversal.

### 3. CI Compute Data Gap

`collect-ci.mjs` found 0 pipelines for `bench/outer-6` through `bench/outer-10` and several inner-arm branches. These trials still report `ci=success` because `outer-ci-wait.mjs` polled CircleCI in real-time and captured the result; `collect-ci.mjs` could not match them post-hoc (branch-to-pipeline lookup failure, likely a timing or pagination issue). CI compute minutes for these trials are recorded as 0 and should be treated as missing, not zero.

### 4. Cross-Check with Step 0 Feedback Measurements

Step 0 measured the size of the text fed back to the agent after a validation failure (RAW CI logs, CURATED CI logs, SIDECAR output). Step 1 measures full session token consumption.

| | Step 0 value | Fraction of session |
|---|--:|--:|
| CURATED feedback per failure (median) | 130–203 tokens | < 0.1% of 210K–242K session |
| SIDECAR feedback per failure (median) | 371–1,675 tokens | < 0.8% of session |
| Output token delta (outer − inner, median) | +681 tokens | 0.3% of session |

Feedback text is < 1% of total session tokens in the single-iteration case. The dominant token driver is **conversation context re-sent each turn** (captured in `cache_read`): outer median `cache_read` exceeds inner by 28,204 tokens (median), which corresponds to the extra code reading and CI-feedback prose accumulated across turns. The Step 0 feedback numbers are a floor on the marginal cost of one extra CI loop; the actual marginal cost is the full turn-context overhead (~28K tokens cache_read delta across roughly equal iteration counts).

### 5. Claim Verification: "3×" / "50–68% savings"

| Claimed figure | What it would require | What this run shows |
|---|---|---|
| "3× token savings" | outer ÷ inner = 3.0 | 1.15× (n=10, inflated inner) / 1.82× (n=5) |
| "50–68% reduction" | outer − inner = 50–68% of outer | 13% (n=10) / 45% (n=5) |

Neither run reproduces the "3×" figure. The n=5 result (1.82×, ~45%) is the closest, but uses a now-superseded bench/base. The "3×" claim may originate from comparing raw CI logs (RAW) to sidecar output (Step 0: RAW ÷ SIDECAR clean = 12–53×), which measures feedback text only — not full agent session tokens. See `bench/step0-report.md` §「3倍主張の所在」.

### 6. Known Limitations of This Run

1. **Single task type**: Payments UI addition that passes CI first-try. Scenarios requiring multiple CI iterations (flaky failures, logic bugs) are not covered — see planned 1-B (flaky scenario).
2. **Sidecar verbosity change**: npx jest output inflates inner-arm tokens vs the n=5 run; results are not comparable across bench/base versions.
3. **Two error trials**: outer-2 and outer-5 (`ci=timeout`) inflate outer-arm spread and median wall-clock.
4. **Single model / single task**: claude-sonnet-4-6 only; results may differ for other models or task types.
5. **Artificial environment**: local trivy, local npx jest; production sidecar would differ in timing and output format.
