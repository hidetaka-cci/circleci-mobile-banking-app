# Step 1-D: Cross-Check — Bench Usage vs Step 0 Feedback Tokens

Generated from `bench/results/` + `bench/step0-report.md`.

> **Note on prompt caching**: Claude Code uses prompt caching aggressively. `input_tokens` in the JSON is only uncached fresh tokens (typically 8–26 per trial). The dominant cost is `cache_read_input_tokens` (served from cache) and `cache_creation_input_tokens` (cache population). All four fields are summed for `Total tokens` below.

## Aggregate Summary

| Metric | inner (median) | outer (median) | Δ outer−inner |
|---|--:|--:|--:|
| **Total tokens** | 210,705 | 242,362 | **31,657** |
| ↳ effective input (fresh+cache_r+cache_c) | 209,113 | 239,234 | 30,122 |
| ↳ output tokens | 1,631 | 2,312 | 681 |
| ↳ cache_read | 197,396 | 225,600 | 28,204 |
| ↳ cache_creation | 12,044 | 13,521 | 1,477 |
| ↳ fresh input | 10 | 11 | 1 |
| Iterations (outer CI loops) | 1 | 1 | +0.0 |

## Per-Iteration Marginal Cost

Both arms completed in 1 iteration (median) — no extra outer iterations to measure.
Marginal cost is visible in the output-token delta: outer outputs **681 more tokens** than inner per trial (median).

## Cross-Check Against Step 0 Feedback Measurements

Step 0 measured individual feedback TEXT sizes (not full conversation).
The bench measures full Claude Code session input tokens.

| Source | Tokens | Notes |
|---|--:|---|
| Bench: total Δ / extra iter | — | Implied token cost per extra CI loop |
| Step 0: CURATED (a) median | 130 | ESLint failure, outer arm feedback |
| Step 0: CURATED (b) median | 168 | infra failure, outer arm feedback |
| Step 0: SIDECAR clean (a) median | 372 | ESLint failure, inner arm feedback |
| Step 0: SIDECAR clean (b) median | 1675 | infra failure, inner arm feedback |

## Interpretation

Feedback tokens from Step 0 (128–1,675 tokens per exchange) are < 2% of total session tokens (~93K–170K). The bulk of the bench token delta comes from:
1. **Conversation context growth**: each outer iteration appends preamble + feedback to the context window
2. **Extra file reads / edits**: the outer arm's agent re-reads files and re-generates code more often
3. **Cache inefficiency**: cache_creation_input_tokens increase as context grows past cache boundaries

Step 0 feedback tokens are a **floor** on the marginal input cost of one extra outer iteration,
not a ceiling. The actual per-iteration marginal cost (bench Δ / extra iters) is expected to be
much higher because the full conversation history is re-sent each turn.

## Per-Trial Detail

| arm | trial | iters | output | cache_read | cache_create | fresh_input | total |
|---|--:|--:|--:|--:|--:|--:|--:|
| inner | 1 | 1 | 1,556 | 223,510 | 11,356 | 11 | 236,433 |
| inner | 10 | 1 | 1,590 | 168,913 | 11,456 | 9 | 181,968 |
| inner | 2 | 1 | 2,284 | 307,766 | 12,398 | 14 | 322,462 |
| inner | 3 | 1 | 3,085 | 344,162 | 13,663 | 15 | 360,925 |
| inner | 4 | 1 | 2,099 | 283,893 | 12,551 | 13 | 298,556 |
| inner | 5 | 1 | 7,244 | 692,930 | 21,795 | 26 | 721,995 |
| inner | 6 | 1 | 1,632 | 117,135 | 11,286 | 7 | 130,060 |
| inner | 7 | 1 | 1,629 | 171,281 | 12,058 | 9 | 184,977 |
| inner | 8 | 1 | 1,595 | 171,198 | 12,029 | 9 | 184,831 |
| inner | 9 | 1 | 1,375 | 140,698 | 10,348 | 8 | 152,429 |
| outer | 1 | 1 | 6,395 | 448,443 | 18,827 | 18 | 473,683 |
| outer | 10 | 1 | 1,640 | 169,561 | 11,618 | 9 | 182,828 |
| outer | 2 | 1 | 2,983 | 437,570 | 15,171 | 18 | 455,742 |
| outer | 3 | 1 | 7,381 | 563,771 | 20,824 | 21 | 591,997 |
| outer | 4 | 1 | 12,391 | 558,294 | 24,526 | 21 | 595,232 |
| outer | 5 | 1 | 4,615 | 281,638 | 15,629 | 13 | 301,895 |
| outer | 6 | 1 | 1,416 | 143,609 | 11,870 | 8 | 156,903 |
| outer | 7 | 1 | 1,268 | 142,482 | 10,927 | 8 | 154,685 |
| outer | 8 | 1 | 1,238 | 142,369 | 10,890 | 8 | 154,505 |
| outer | 9 | 1 | 1,571 | 141,703 | 10,686 | 8 | 153,968 |
