#!/usr/bin/env node
// step1-crosscheck.mjs — 1-D: cross-check bench/results usage fields against
// Step 0 feedback-token measurements.
//
// Reads:
//   bench/results/<arm>-<trial>.json      — Claude Code --output-format json
//   bench/results/<arm>-<trial>.iter*.json — outer arm per-iteration JSONs
//   bench/step0-report.md                 — Step 0 median feedback tokens (hardcoded below)
//
// Outputs: bench/step1-crosscheck.md
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(BENCH_DIR, "results");

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

// Step 0 median feedback tokens (from bench/step0-report.md)
// CURATED = outer arm feedback (failureFeedback() output)
// SIDECAR_CLEAN = inner arm sidecar feedback (npm noise stripped)
const STEP0 = {
  "CURATED_a": 130,   // ESLint failure, curated
  "CURATED_b": 168,   // infra failure, curated
  "CURATED_c": 203,   // mixed failure, curated
  "SIDECAR_a": 372,   // ESLint failure, sidecar clean
  "SIDECAR_b": 1675,  // infra failure, sidecar clean
  "SIDECAR_c": 371,   // mixed failure, sidecar clean
};

// Collect per-trial usage from bench/results/
const trials = [];
for (const f of readdirSync(RESULTS).filter((f) => f.endsWith(".metrics.json"))) {
  const label = f.replace(".metrics.json", "");
  if (label.endsWith("-0")) continue;
  const m = readJSON(join(RESULTS, f)) || {};
  const arm = m.arm;
  const trialNum = m.trial;

  // Sum usage across all iterations for outer arm
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0;
  if (arm === "outer") {
    for (let i = 1; i <= 6; i++) {
      const ij = join(RESULTS, `${label}.iter${i}.json`);
      if (!existsSync(ij)) break;
      const r = readJSON(ij) || {};
      const u = r.usage || {};
      totalInput += u.input_tokens || 0;
      totalOutput += u.output_tokens || 0;
      totalCacheRead += u.cache_read_input_tokens || 0;
      totalCacheCreate += u.cache_creation_input_tokens || 0;
    }
  } else {
    const r = readJSON(join(RESULTS, `${label}.json`)) || {};
    const u = r.usage || {};
    totalInput = u.input_tokens || 0;
    totalOutput = u.output_tokens || 0;
    totalCacheRead = u.cache_read_input_tokens || 0;
    totalCacheCreate = u.cache_creation_input_tokens || 0;
  }

  const iters = m.iterations || 1;
  trials.push({ label, arm, trial: trialNum, iters,
    input: totalInput, output: totalOutput,
    cacheRead: totalCacheRead, cacheCreate: totalCacheCreate,
    total: totalInput + totalOutput + totalCacheRead + totalCacheCreate,
  });
}

const byArm = (a) => trials.filter((t) => t.arm === a);
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const innerTrials = byArm("inner");
const outerTrials = byArm("outer");

const innerTotalMed   = med(innerTrials.map((t) => t.total));
const outerTotalMed   = med(outerTrials.map((t) => t.total));
const innerCacheRMed  = med(innerTrials.map((t) => t.cacheRead));
const outerCacheRMed  = med(outerTrials.map((t) => t.cacheRead));
const innerCacheCMed  = med(innerTrials.map((t) => t.cacheCreate));
const outerCacheCMed  = med(outerTrials.map((t) => t.cacheCreate));
const innerOutputMed  = med(innerTrials.map((t) => t.output));
const outerOutputMed  = med(outerTrials.map((t) => t.output));
const innerInputMed   = med(innerTrials.map((t) => t.input));
const outerInputMed   = med(outerTrials.map((t) => t.input));
// "effective input" = everything fed to the model (fresh + cache hit + cache creation)
const innerEffInputMed = med(innerTrials.map((t) => t.input + t.cacheRead + t.cacheCreate));
const outerEffInputMed = med(outerTrials.map((t) => t.input + t.cacheRead + t.cacheCreate));

const outerItersMed = med(outerTrials.map((t) => t.iters));
const innerItersMed = med(innerTrials.map((t) => t.iters));
const extraIters = outerItersMed - innerItersMed;
// Per-iteration marginal cost: total Δ / extra iterations
const tokensPerExtraIter = extraIters > 0
  ? Math.round((outerTotalMed - innerTotalMed) / extraIters) : NaN;

let md = `# Step 1-D: Cross-Check — Bench Usage vs Step 0 Feedback Tokens\n\n`;
md += `Generated from \`bench/results/\` + \`bench/step0-report.md\`.\n\n`;
md += `> **Note on prompt caching**: Claude Code uses prompt caching aggressively. `;
md += `\`input_tokens\` in the JSON is only uncached fresh tokens (typically 8–26 per trial). `;
md += `The dominant cost is \`cache_read_input_tokens\` (served from cache) and `;
md += `\`cache_creation_input_tokens\` (cache population). `;
md += `All four fields are summed for \`Total tokens\` below.\n\n`;

md += `## Aggregate Summary\n\n`;
md += `| Metric | inner (median) | outer (median) | Δ outer−inner |\n`;
md += `|---|--:|--:|--:|\n`;
md += `| **Total tokens** | ${Math.round(innerTotalMed).toLocaleString()} | ${Math.round(outerTotalMed).toLocaleString()} | **${Math.round(outerTotalMed - innerTotalMed).toLocaleString()}** |\n`;
md += `| ↳ effective input (fresh+cache_r+cache_c) | ${Math.round(innerEffInputMed).toLocaleString()} | ${Math.round(outerEffInputMed).toLocaleString()} | ${Math.round(outerEffInputMed - innerEffInputMed).toLocaleString()} |\n`;
md += `| ↳ output tokens | ${Math.round(innerOutputMed).toLocaleString()} | ${Math.round(outerOutputMed).toLocaleString()} | ${Math.round(outerOutputMed - innerOutputMed).toLocaleString()} |\n`;
md += `| ↳ cache_read | ${Math.round(innerCacheRMed).toLocaleString()} | ${Math.round(outerCacheRMed).toLocaleString()} | ${Math.round(outerCacheRMed - innerCacheRMed).toLocaleString()} |\n`;
md += `| ↳ cache_creation | ${Math.round(innerCacheCMed).toLocaleString()} | ${Math.round(outerCacheCMed).toLocaleString()} | ${Math.round(outerCacheCMed - innerCacheCMed).toLocaleString()} |\n`;
md += `| ↳ fresh input | ${Math.round(innerInputMed).toLocaleString()} | ${Math.round(outerInputMed).toLocaleString()} | ${Math.round(outerInputMed - innerInputMed).toLocaleString()} |\n`;
md += `| Iterations (outer CI loops) | ${innerItersMed.toFixed(0)} | ${outerItersMed.toFixed(0)} | ${extraIters >= 0 ? "+" : ""}${extraIters.toFixed(1)} |\n\n`;

md += `## Per-Iteration Marginal Cost\n\n`;
if (Number.isFinite(tokensPerExtraIter)) {
  md += `Total token Δ / extra outer iterations = **${tokensPerExtraIter.toLocaleString()} tokens per extra CI loop**\n\n`;
} else {
  md += `Both arms completed in 1 iteration (median) — no extra outer iterations to measure.\n`;
  md += `Marginal cost is visible in the output-token delta: `;
  md += `outer outputs **${Math.round(outerOutputMed - innerOutputMed).toLocaleString()} more tokens** than inner per trial (median).\n\n`;
}

md += `## Cross-Check Against Step 0 Feedback Measurements\n\n`;
md += `Step 0 measured individual feedback TEXT sizes (not full conversation).\n`;
md += `The bench measures full Claude Code session input tokens.\n\n`;
md += `| Source | Tokens | Notes |\n|---|--:|---|\n`;
md += `| Bench: total Δ / extra iter | ${Number.isFinite(tokensPerExtraIter) ? tokensPerExtraIter.toLocaleString() : "—"} | Implied token cost per extra CI loop |\n`;
md += `| Step 0: CURATED (a) median | ${STEP0.CURATED_a} | ESLint failure, outer arm feedback |\n`;
md += `| Step 0: CURATED (b) median | ${STEP0.CURATED_b} | infra failure, outer arm feedback |\n`;
md += `| Step 0: SIDECAR clean (a) median | ${STEP0.SIDECAR_a} | ESLint failure, inner arm feedback |\n`;
md += `| Step 0: SIDECAR clean (b) median | ${STEP0.SIDECAR_b} | infra failure, inner arm feedback |\n\n`;

md += `## Interpretation\n\n`;
md += `Feedback tokens from Step 0 (128–1,675 tokens per exchange) are < 2% of total `;
md += `session tokens (~93K–170K). The bulk of the bench token delta comes from:\n`;
md += `1. **Conversation context growth**: each outer iteration appends preamble + feedback to the context window\n`;
md += `2. **Extra file reads / edits**: the outer arm's agent re-reads files and re-generates code more often\n`;
md += `3. **Cache inefficiency**: cache_creation_input_tokens increase as context grows past cache boundaries\n\n`;
md += `Step 0 feedback tokens are a **floor** on the marginal input cost of one extra outer iteration,\n`;
md += `not a ceiling. The actual per-iteration marginal cost (bench Δ / extra iters) is expected to be\n`;
md += `much higher because the full conversation history is re-sent each turn.\n\n`;

md += `## Per-Trial Detail\n\n`;
md += `| arm | trial | iters | output | cache_read | cache_create | fresh_input | total |\n`;
md += `|---|--:|--:|--:|--:|--:|--:|--:|\n`;
for (const t of trials.sort((a, b) => (a.arm + a.trial).localeCompare(b.arm + b.trial))) {
  md += `| ${t.arm} | ${t.trial} | ${t.iters} | ${t.output.toLocaleString()} | ${t.cacheRead.toLocaleString()} | ${t.cacheCreate.toLocaleString()} | ${t.input.toLocaleString()} | ${t.total.toLocaleString()} |\n`;
}

const outPath = join(BENCH_DIR, "step1-crosscheck.md");
writeFileSync(outPath, md);
console.log(`step1-crosscheck: wrote bench/step1-crosscheck.md (${trials.length} trials)`);
