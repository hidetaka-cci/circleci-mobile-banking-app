# Sidecar Benchmark — Inner vs Outer Loop

Inner loop = chunk-sidecar validation in the agent's lifecycle. Outer loop = traditional CI (push, read CircleCI, fix, repeat). Same task, same model; the only difference is how each arm validates.

- inner trials: **5**  ·  outer trials: **5**

## Headline — Sidecar (inner) vs Traditional CI (outer)

5 trials each, medians.

| Metric | inner | outer | outer ÷ inner |
|---|--:|--:|:--:|
| **Wall-clock to green** | 186 s | 397 s | **2.13× slower** |
| **Cost / change** | $0.286 | $0.569 | **1.99× more** |
| **Total tokens** | 482.3K | 699.9K | **1.45× more** |
| Agent turns | 18 | 23 | 1.28× more |
| **CI compute** | 10.0 min | 14.6 min | 1.46× more |
| **CI pipelines** | 4 | 6 | 1.50× more |

**What it means:** On a change that passes CI first-try, the sidecar / inner loop is faster and cheaper *per change* — the time win is the CI wait the outer loop pays even on success, and the token/cost win comes from fewer agent turns. CI minutes are ≈equal because both arms run exactly one pipeline; the CI-compute savings only show up when the outer loop has to **iterate**, which this simple task does not trigger.

## Medians (inner vs outer)

| Metric | inner | outer | Δ (outer−inner) | outer / inner |
|---|--:|--:|--:|--:|
| Wall-clock to green (s) | 186 | 397 | 211 | 2.13× |
| Cost per trial ($) | 0.2862 | 0.5693 | 0.2831 | 1.99× |
| Agent turns | 18 | 23 | 5 | 1.28× |
| Total tokens | 482349 | 699943 | 217594 | 1.45× |
| Output tokens | 5672 | 11698 | 6026 | 2.06× |
| CI compute (min) | 10.0 | 14.6 | 4.6 | 1.46× |
| CI pipelines | 4 | 6 | 2 | 1.50× |

## Spread (min … median … max)

**Wall-clock to green (s)**

- inner: 143 … 186 … 254
- outer: 272 … 397 … 468

**Cost per trial ($)**

- inner: 0.2043 … 0.2862 … 0.3920
- outer: 0.3446 … 0.5693 … 0.6571

**Agent turns**

- inner: 13 … 18 … 22
- outer: 21 … 23 … 28

**Total tokens**

- inner: 331059 … 482349 … 588509
- outer: 551721 … 699943 … 823539

**Output tokens**

- inner: 3626 … 5672 … 9398
- outer: 4197 … 11698 … 15622

**CI compute (min)**

- inner: 8.2 … 10.0 … 23.3
- outer: 12.4 … 14.6 … 20.1

**CI pipelines**

- inner: 3 … 4 … 9
- outer: 5 … 6 … 8

## Per-trial detail

| arm | trial | wall(s) | cost($) | turns | tokens | CI(min) | pipelines | error |
|---|--:|--:|--:|--:|--:|--:|--:|:-:|
| inner | 1 | 186 | 0.2862 | 18 | 482349 | 23.3 | 9 | ✓ |
| inner | 2 | 143 | 0.2043 | 13 | 331059 | 9.7 | 3 | ✓ |
| inner | 3 | 237 | 0.3624 | 22 | 588509 | 8.2 | 3 | ✓ |
| inner | 4 | 181 | 0.2589 | 17 | 445860 | 10.0 | 4 | ✓ |
| inner | 5 | 254 | 0.3920 | 19 | 548517 | 13.0 | 5 | ✓ |
| outer | 1 | 437 | 0.6571 | 28 | 823539 | 20.1 | 8 | ✓ |
| outer | 2 | 272 | 0.3446 | 21 | 551721 | 12.7 | 5 | ✓ |
| outer | 3 | 468 | 0.6348 | 22 | 699943 | 14.6 | 6 | ✓ |
| outer | 4 | 371 | 0.4780 | 23 | 682212 | 15.2 | 6 | ✓ |
| outer | 5 | 397 | 0.5693 | 25 | 753566 | 12.4 | 5 | ✓ |

_Live dashboard: http://localhost:3000/d/inner-vs-outer_

---

## Analysis & Caveats

### 1. Methodology: Flaky Injection

`BENCH_INJECT_FLAKY=1` intercepts the outer arm's CI result after iteration 1 and overrides `success → failed` with the message:
> "Transient infrastructure timeout (network error starting the test runner). This is NOT a code defect — do not change the application code. Simply amend your last commit with --no-edit and push."

The inner arm is **not affected** — it validates locally via the chunk sidecar and never touches CI. All 5 inner trials therefore have `iters=1`. All 5 outer trials have `iters=2` (confirmed by distinct SHA for each iteration in the harness log).

### 2. Key Result: Per-Extra-Iteration Marginal Cost

Each outer trial produced two Claude sessions. Separating them:

| | iter-1 (normal work) | iter-2 (flaky retry) |
|---|--:|--:|
| Token median | ~600K | **123K** |
| Cost median | ~$0.44 | **$0.130** |
| Turns median | 21 | **3** |

The **marginal cost of one transient CI failure** is approximately **123K tokens / $0.13 / 3 turns** (median).

The iter-2 token budget is almost entirely context re-transmission (`cache_read` of the prior 20-25 turn conversation), not fresh reasoning. The agent receives the "transient infra" message, amends the commit, pushes, and stops in 3 turns.

### 3. Comparison with Normal (1-C)

| Scenario | bench/base | inner tokens (med) | outer tokens (med) | outer÷inner | outer iters |
|---|---|--:|--:|:--:|--:|
| Normal (n=10, Jul-14) | `9bcd59c` | 210,705 | 242,362 | 1.15× | 1 |
| Flaky (n=5, Jul-14) | `aced27c` | 482,349 | 699,943 | 1.45× | 2 |
| **Flaky − Normal (outer delta)** | | — | **+457,581** | | +1 |

> ⚠️ **The two runs used different `bench/base` commits.** Inner-arm tokens differ by 2.3× (482K vs 211K) not because of flaky injection but because `aced27c` includes TASK-flaky.md (extra instructions) and a different bench/base state. The scenarios are **not directly comparable** on absolute token counts. The reliable measurement is the **per-extra-iteration marginal cost** from §2 above, which isolates iter-2 from iter-1.

| Metric | Normal outer (n=10 med) | Flaky outer iter-2 only (med) | Δ (marginal) |
|---|--:|--:|--:|
| Tokens | 242,362 | 123,171 | — (different context size) |
| Cost ($) | 0.167 | 0.130 | — |
| Turns | 10 | 3 | — |
| Wall-clock (s) | 172 | ~200 (CI wait) | +200 s per flaky failure |

The wall-clock cost of one flaky CI failure is approximately **+200 seconds** (one full CI run ≈ 2-3 min wait + agent response ≈ 3 turns × ~5 s).

### 4. CI Compute Data Gap (Branch Reuse)

`collect-ci.mjs` queries by branch name. The flaky run reuses the same branch names (`bench/inner-1`, `bench/outer-1`, etc.) as the n=10 run. The pipeline lookup therefore returns **all historical pipelines** for those branches, inflating the reported CI minutes and pipeline counts.

Actual expected CI pipelines for the flaky run:
- **inner arm:** 0 pipelines (validates locally, never pushes to CI)
- **outer arm:** 2 pipelines per trial (iter-1 + iter-2)

Reported values (contaminated by n=10 history):
- inner-1: 9 pipelines (should be 0)
- outer-1: 8 pipelines (should be 2)

**CI compute data in this report is unreliable.** Real-time CI status from `outer-ci-wait.mjs` is correct (all 5 outer trials: iter-1 success, iter-2 success after flaky inject).

### 5. Cross-Check with Step 0 Feedback Measurements

The marginal cost of one extra CI loop (iter-2 median = 123K tokens) can be compared to the feedback TEXT size measured in Step 0:

| Source | Tokens | % of 123K marginal cost |
|---|--:|--:|
| Injected flaky feedback (this run) | ~40 tokens | 0.03% |
| Step 0 CURATED feedback (median) | 130–203 tokens | 0.1–0.2% |
| Step 0 SIDECAR feedback (median) | 371–1,675 tokens | 0.3–1.4% |
| **Actual iter-2 marginal cost (median)** | **123,171 tokens** | 100% |

Feedback text is < 2% of the actual per-iteration token cost. The dominant component is **context re-transmission**: the 20-25 turn conversation from iter-1 is re-sent in full as `cache_read` at the start of iter-2. Step 0 feedback tokens are the floor on marginal cost, not the ceiling.

### 6. Known Limitations

1. **n=5 only**: 5 trials per arm is insufficient for stable medians; spread is large.
2. **Different bench/base**: `aced27c` vs `9bcd59c` makes direct token comparison with the n=10 run unreliable.
3. **TASK-flaky.md is longer**: Extra instructions about transient failures inflate tokens for both arms.
4. **Outer arm turn count (21-28)**: Higher than the n=10 normal outer (median 10). The flaky retry instruction caused the agent to do more work in iter-1 as well (possibly rechecking code more thoroughly before pushing). This inflates iter-1 costs.
5. **CI compute data contaminated**: Branch-reuse causes collect-ci to report inflated pipeline counts; these values should not be used.
6. **Single injected failure type**: Only "transient infra timeout" tested; a failing test would produce much more feedback text and a different agent trajectory.
