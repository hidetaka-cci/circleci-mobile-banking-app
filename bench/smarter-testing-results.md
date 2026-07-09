# Smarter Testing vs. Full Suite — Sidecar Timings

Measured wall-clock of CircleCI Smarter Testing (test impact analysis, run via
`circleci run testsuite --local`) against running the whole suite (`npx jest`),
for both miniapps, executed on the `chunk` sidecar.

**Date:** 2026-07-09
**Executed on (proven remote):** e2b sidecar — Linux 6.1.158 x86_64, 4 cores,
`/home/user/workspace/circleci-mobile-banking-app` (not the local macOS host).

## Headline

At real-world suite sizes Smarter Testing wins decisively; at trivially small
suites it *loses* to plain `npx jest` because the selection path carries a fixed
overhead that exceeds the tests it saves.

- **SMART cost is ~flat** — fixed selection overhead (~2–2.5s) + only the
  impacted atoms.
- **FULL cost scales linearly** with the number of test atoms.
- Crossover in this config (4 cores, ~400ms/atom) is **~13–15 atoms**; the lead
  widens with every atom added beyond that.

## Results

### Scaled suite — 45 atoms/app (40 generated ~400ms atoms + 5 originals)

| Miniapp   | FULL (`npx jest`) | SMART — 1 file changed        | SMART — no change        |
|-----------|-------------------|-------------------------------|--------------------------|
| payments  | **7.31s**         | **2.82s** (1 sel / 44 skipped) | **0.86s** (0 sel / 45)  |
| transfers | **7.17s**         | **2.52s** (1 sel / 44 skipped) | **0.86s** (0 sel / 45)  |

Speedup vs. whole suite: **~2.6–2.8×** (one file changed), **~8.4×** (no change).
One-time seeding (`--analyze-tests=all`, in-band coverage): ~85s/app.

### Small suite — 5 atoms/app (the real project tests, 22 tests total)

| Miniapp   | FULL (`npx jest`) | SMART — 1 file changed        | SMART — no change        |
|-----------|-------------------|-------------------------------|--------------------------|
| payments  | 1.55s             | 2.30s (2 sel / 3 skipped)      | 0.88s (0 sel / 5)       |
| transfers | 1.49s             | 2.20s (2 sel / 3 skipped)      | 0.81s (0 sel / 5)       |

Here SMART (1 file changed) is **slower** than FULL — the selection overhead
outweighs skipping three sub-100ms tests.

### Crossover, side by side

| Suite size | FULL | SMART (1 changed) | Winner                          |
|------------|------|-------------------|---------------------------------|
| 5 atoms    | 1.5s | 2.3s              | full — overhead dominates       |
| 45 atoms   | 7.3s | 2.8s              | **smart**                       |

## Full-pipeline context

Smart-vs-full only affects the `test` gate; every other gate is identical. On the
original suite the surrounding gates dominate wall-clock, so test selection barely
moves the pipeline total:

| Gate            | payments | transfers |
|-----------------|----------|-----------|
| install (`npm ci`) | 11.30s | 9.79s   |
| lint            | 0.51s    | 0.49s     |
| scan (trivy)    | 0.43s    | 0.32s     |
| test            | 0.9–2.3s | 0.8–2.2s  |
| bundle (ios)    | 4.38s    | 4.61s     |

`npm ci` (~10s) + bundle (~4.5s) are ~85% of the pipeline. Smarter Testing pays off
in wall-clock only once the test step is a large enough share of the total.

## Caveats

- **The scaled-suite absolute numbers are synthetic.** 40 of the 45 atoms are
  artificial: a trivial module + a test whose only cost is a fixed
  `await sleep(400ms)` — there is no real logic, and the 400ms is a stand-in for a
  non-trivial test's runtime (without it each atom is ~0ms and skipping saves
  nothing measurable). So the raw seconds in the scaled table should **not** be
  read as representative of a real 45-test suite. What *is* real and transferable
  is the **shape**: FULL grows linearly with atom count while SMART stays ~flat
  (fixed overhead + impacted atoms), which is what puts the crossover at ~13–15
  atoms in this config. The 5 originals are the only real tests.
- `--run-tests=all` is **not supported** by the testsuite CLI version on the
  sidecar (`unknown flag`), so the whole-suite baseline is plain `npx jest` — which
  is also the pre-Smarter-Testing real-world baseline.
- `--local` in *run* mode does not build/refresh impact data and does not read the
  committed `.circleci/impact-*.json` files; the local map must be seeded first
  with `--analyze-tests=all` (or `=impacted` per run to keep it fresh).
- Numbers are single-run wall-clock (jest warmed once beforehand); treat as
  indicative, not statistically rigorous.

## Reproduce

Generation + seeding + timing were driven on the sidecar via `chunk sidecar exec`.
The scaling harness (generates N heavy atoms, commits them on the sidecar, seeds
the impact map, then times FULL vs SMART for both miniapps):

```sh
# see the version used for these numbers: N=40 SLEEP_MS=400
N=40 SLEEP_MS=400 bash scale-bench.sh   # writes /tmp/scale-bench.txt
```

Each generated atom is an independent module + 1:1 test (`src/lib/gen/modI.js` ←
`__tests__/gen/modI.test.js`) so changing one module selects exactly one atom.
Generated files were committed only in the sidecar's local repo (not pushed); a
`chunk sidecar sync` resets them away.
