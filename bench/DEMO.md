# Do Sidecars Actually Save Time, Tokens, and Money?
### An OTEL-instrumented A/B of two AI coding agents — Inner Loop vs Outer Loop

> Presentation script for leadership + team. Speak the **plain text**; the
> `> [SHOW …]` lines are screen cues. Companion artifacts: the live Grafana
> dashboard (`http://localhost:3000/d/inner-vs-outer`) and `bench/report.md`.

---

## 1. The story — why we ran this (≈1 min)

> [SHOW: the two-loop diagram — Inner Loop (plan → code → validate → debug) on
> the left, Outer Loop (build → test → deploy) on the right.]

Every code change lives in two loops. The **inner loop** is where you actually
work — edit, validate, fix — on your machine, in seconds. The **outer loop** is
what happens after you push — CI builds, tests, scans — in minutes.

AI agents made the inner loop incredibly fast. But most validation still lives
in the outer loop, so agents race ahead, push half-finished work, and we lean on
CI to catch it — minutes later, after the agent has already moved on.

**Chunk Sidecars** move real validation *back into the inner loop*: a remote
sandbox that runs the exact same gates CI runs, but in seconds, on every agent
turn — before anything is pushed.

The claim is that this saves time, money, and tokens. **We didn't want to assert
that — we wanted to measure it.** So we ran a controlled experiment and
instrumented both agents with OpenTelemetry.

---

## 2. The experiment — a fair A/B (≈1.5 min)

> [SHOW: this section, or the "Medians" table in report.md.]

Two AI coding agents (Claude Code). **Identical** task, model, and starting
commit. We ran each **5 times** to average out the agent's natural variance.
The only thing we changed was **how each agent validates**:

- **Inner-loop agent** — a **chunk-sidecar Stop hook**. After every turn, the
  sidecar runs the full gate set (install, lint, security scan, tests, iOS
  bundle, for both mini-apps) on the working tree in seconds and feeds any
  failure straight back to the agent. It fixes and moves on — no push, no CI.

- **Outer-loop agent** — the **traditional loop**. It has *no* local validation
  (lint/test/build are switched off for it); its only signal is to **commit,
  push, wait for CircleCI, read the result, fix, and push again** until green.

Same task. Same model. Same gates. One difference: *when and where validation
happens.* That's the whole experiment.

> Honesty note: both arms ran the exact same gate set (lint + Trivy + tests +
> bundle), so the comparison stays fair.

---

## 3. What we tracked, and how we got the numbers (≈1.5 min)

> [SHOW: the Grafana dashboard — point at the panels as you talk.]

Claude Code emits **OpenTelemetry** natively. We turned it on for both agents
and tagged every datapoint with `loop=inner` or `loop=outer`, so the same
dashboard shows them side by side. The pipeline is standard:

```
Claude Code ──OTLP──▶ OpenTelemetry Collector ──▶ Prometheus ──▶ Grafana
```

From OTEL we get the **agent-side** metrics — tokens (input/output/cache),
cost in USD, and number of turns. To capture what OTEL *can't* see — real
**wall-clock time including CI waits**, and **CI compute minutes** — our
measurement scripts capture those directly (CI minutes come from the CircleCI
API) and push them alongside.

The key bit is *how each loop's run is driven*, because that's what makes the
time measurement honest:

- **Inner loop:** one agent session. The sidecar validates in-loop; the clock
  stops when the sidecar is green. The wait is **seconds**.
- **Outer loop:** our test runner orchestrates the real thing — push, then **wait
  for the actual CircleCI pipeline to finish**, feed the result back, repeat.
  So the outer-loop clock includes the **minutes** a developer really waits on
  CI. We don't simulate the wait — we pay it.

Every number is also cross-checked against Claude Code's own per-run JSON
(cost, tokens, turns), so the figures are defensible.

---

## 4. The results (≈2 min)

> [SHOW: the Headline table in report.md — read the bold column out loud.]

Across 5 runs each (medians):

| Metric | Inner (sidecar) | Outer (CI) | Outer ÷ Inner |
|---|--:|--:|:--:|
| **Wall-clock to green** | 76 s | 123 s | **1.62× slower** |
| **Cost / change** | $0.155 | $0.216 | **1.39× more** |
| **Total tokens** | 93.6K | 170.2K | **1.82× more** |
| Agent turns | 6 | 8 | 1.33× |
| **CI compute** | 2.4 min | 2.5 min | ≈ equal |
| **CI pipelines** | 1 | 1 | equal |

Three things stand out:

1. **Time:** the inner loop reached a known-good state in ~half the wall-clock
   time. The gap is exactly the CI wait the outer loop pays *even when it
   passes on the first try.*
2. **Tokens & cost:** the outer-loop agent burned **~1.8× the tokens** and
   **~1.4× the cost** for the same change — mostly because it spends extra
   turns pushing and processing CI status instead of getting a clean answer
   in-loop.
3. **CI minutes came out equal** — and that's the honest part. On this run
   *both* agents got it right first try, so each triggered exactly one
   pipeline. Which sets up the most important point…

---

## 5. What it means (≈1.5 min)

> [SHOW: stay on the Headline table.]

This was the **best possible case for the outer loop** — a simple change that
passed CI on the first attempt. Even then, the sidecar was **~1.6× faster and
~1.4× cheaper per change.**

The CI-minutes line is the lever. It was equal here *only because nobody had to
iterate.* In real work, agents and humans rarely land it first try. **Every
extra attempt in the outer loop is another full CI cycle** — another two or
three minutes of wait, another set of CI minutes billed, another batch of tokens
spent reading logs. The sidecar catches those same issues in **seconds, before
the first push** — so a change that would take the outer loop three CI rounds to
get green costs the inner loop essentially nothing extra.

So the bottom line:

> **Sidecars verifiably save time, tokens, and money *per change* — even in the
> outer loop's best case. And the advantage compounds with every iteration a
> change needs, which is most of them.**

---

## 6. Honest caveats (have these ready for Q&A)

- **Sample:** 5 trials per arm, one simple, well-specified task. Small but
  enough to read a clear median; the spread is in `report.md`.
- **First-try pass:** because the task passed CI first time, the CI-minutes
  axis is a *floor*, not a ceiling, on the sidecar's advantage.
- **One contaminated inner trial** (`inner-1`) ran ~2× high — a
  measurement-tooling artifact (a stray validation collided with it on the
  shared sidecar). We
  report **medians**, which are robust to it; it doesn't move the headline.

**Obvious next experiment:** rerun with a deliberately harder, multi-file task
that *needs* a couple of fix cycles — that's where the outer loop's CI-minutes
and wait-time penalty shows its real size.

---

## 7. The ask (≈30 s)

We set out to verify the claim, not assume it. The data says **yes** — the inner
loop is faster and cheaper for the same result, and the gap widens exactly where
real development lives: in the iterations. Let's put validation back in the inner
loop.

> [SHOW: the live dashboard one more time. Done.]

---

### Appendix — reproduce it
- Bring up the stack: `docker compose -f bench/docker-compose.yml up -d`
- Run it: `bash bench/run-bench.sh 5`  (5 inner + 5 outer, from a plain terminal)
- Read it: `bench/report.md` · Dashboard: `http://localhost:3000/d/inner-vs-outer`
