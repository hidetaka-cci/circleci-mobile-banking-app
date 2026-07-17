#!/usr/bin/env node
// aggregate-p2.mjs — p2 benchmark aggregation.
//
// Extends aggregate.mjs with:
//   - Full token vector breakdown (input / cache_creation / cache_read / output)
//   - Misattribution annotations from *.annot.json (written by experimenter)
//
// Sources per trial <arm>-<trial>:
//   <label>.json          claude --output-format json (cost, turns, tokens)
//   <label>.metrics.json  runner (wall_seconds, commits, claude_rc)
//   <label>.ci.json       CircleCI CI data [optional]
//   <label>.annot.json    Experimenter annotations (misattrib, wrong_branch_turns) [optional]
//
// Usage:
//   BENCH_RESULTS_DIR=bench/results-p2 node bench/aggregate-p2.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS   = process.env.BENCH_RESULTS_DIR || join(BENCH_DIR, 'results-p2');
const REPORT_OUT = process.env.BENCH_REPORT_OUTPUT
  ? join(BENCH_DIR, process.env.BENCH_REPORT_OUTPUT)
  : join(BENCH_DIR, 'report-p2.md');

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((m, n) => m - n);
  if (!a.length) return NaN;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
const fmt  = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const kfmt = (n) => (Number.isFinite(n) ? (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n))) : '—');

// Sum token vectors across all iter*.json files (or fall back to label.json).
const sumTokenVec = (label) => {
  const allFiles = readdirSync(RESULTS);
  const iters    = allFiles.filter((f) => f.startsWith(`${label}.iter`) && f.endsWith('.json'));
  const sources  = iters.length ? iters : [`${label}.json`];
  let inp = 0, out = 0, cr = 0, cc = 0;
  for (const src of sources) {
    const u = (readJSON(join(RESULTS, src)) || {}).usage || {};
    inp += u.input_tokens                   ?? 0;
    out += u.output_tokens                  ?? 0;
    cr  += u.cache_read_input_tokens        ?? 0;
    cc  += u.cache_creation_input_tokens    ?? 0;
  }
  return { inp, out, cr, cc, total: inp + out + cr + cc };
};

// Collect trials.
const trials = [];
for (const f of readdirSync(RESULTS).filter((f) => f.endsWith('.metrics.json'))) {
  const label = f.replace('.metrics.json', '');
  if (label.endsWith('-0')) continue;
  const m     = readJSON(join(RESULTS, f))              || {};
  const r     = readJSON(join(RESULTS, `${label}.json`)) || {};
  const ci    = readJSON(join(RESULTS, `${label}.ci.json`)) || {};
  const annot = readJSON(join(RESULTS, `${label}.annot.json`)) || {};
  const vec   = sumTokenVec(label);
  trials.push({
    arm: m.arm, trial: m.trial,
    wall:     m.wall_seconds,
    cost:     m.cost_usd ?? r.total_cost_usd ?? NaN,
    turns:    m.turns    ?? r.num_turns       ?? 0,
    iterations: m.iterations ?? 1,
    // token vector
    tok_inp: vec.inp,
    tok_cc:  vec.cc,
    tok_cr:  vec.cr,
    tok_out: vec.out,
    total:   vec.total,
    // CI
    ci_min:    (ci.ci_seconds ?? NaN) / 60,
    pipelines: ci.ci_pipelines ?? NaN,
    is_error:  m.is_error === true || r.is_error === true,
    // misattribution annotations (experimenter-filled)
    misattrib:            annot.misattrib            ?? null,   // true/false
    wrong_branch_turns:   annot.wrong_branch_turns   ?? null,   // integer
    unrelated_file_edits: annot.unrelated_file_edits ?? null,   // integer
  });
}

const arms    = ['inner', 'outer'];
const byArm   = Object.fromEntries(arms.map((a) => [a, trials.filter((t) => t.arm === a)]));
const medOf   = (a, key) => median(byArm[a].map((t) => t[key]));
const ratioOf = (key) => { const mi = medOf('inner', key), mo = medOf('outer', key); return mi ? mo / mi : NaN; };
const qual    = (key, suffix) => {
  const r = ratioOf(key);
  if (!Number.isFinite(r)) return '—';
  if (r === 1) return 'equal';
  if (Math.abs(r - 1) <= 0.06) return `${r.toFixed(2)}× (≈equal)`;
  return `${r.toFixed(2)}× ${suffix}`;
};

let md = `# p2 Benchmark — Total-Token Cost: Sidecar vs CI-Only\n\n`;
md += `**Hypothesis:** sidecar (inner) reduces total tokens vs push-to-CI (outer) via\n`;
md += `(H1) fewer wrong-branch turns from env misattribution and\n`;
md += `(H2) earlier error discovery in warm-cache turns.\n\n`;
md += `- inner trials: **${byArm.inner.length}**  ·  outer trials: **${byArm.outer.length}**\n`;
const errs = trials.filter((t) => t.is_error);
if (errs.length) {
  md += `- ⚠️ ${errs.length} trial(s) is_error=true: ${errs.map((t) => `${t.arm}-${t.trial}`).join(', ')}\n`;
}

// Headline token comparison.
md += `\n## Headline — Token Vector (inner vs outer, medians)\n\n`;
md += `| Metric | inner | outer | outer ÷ inner |\n|---|--:|--:|:--:|\n`;
for (const [label, key, suffix] of [
  ['**Total tokens**',       'total',   'more'],
  ['  cache_read',           'tok_cr',  'more'],
  ['  cache_creation',       'tok_cc',  'more'],
  ['  input',                'tok_inp', 'more'],
  ['  output',               'tok_out', 'more'],
  ['Wall-clock (s)',          'wall',    'slower'],
  ['Agent turns',             'turns',   'more'],
]) {
  md += `| ${label} | ${kfmt(medOf('inner', key))} | ${kfmt(medOf('outer', key))} | **${qual(key, suffix)}** |\n`;
}

// Misattribution summary (when annotations are present).
const annotated = trials.filter((t) => t.misattrib !== null);
if (annotated.length) {
  md += `\n## Misattribution (H1)\n\n`;
  md += `| arm | n | misattrib rate | median wrong-branch turns | median unrelated edits |\n`;
  md += `|---|--:|--:|--:|--:|\n`;
  for (const a of arms) {
    const sub = byArm[a].filter((t) => t.misattrib !== null);
    const rate = sub.length ? (sub.filter((t) => t.misattrib).length / sub.length * 100).toFixed(0) + '%' : '—';
    const wbt  = fmt(median(sub.map((t) => t.wrong_branch_turns).filter((v) => v !== null)), 0);
    const ue   = fmt(median(sub.map((t) => t.unrelated_file_edits).filter((v) => v !== null)), 0);
    md += `| ${a} | ${sub.length} | ${rate} | ${wbt} | ${ue} |\n`;
  }
} else {
  md += `\n> **Misattribution annotations** not yet filled in. `;
  md += `After each trial, write \`<label>.annot.json\` (see rubric in bench/scenario-p2/RUBRIC.md).\n`;
}

// Per-trial detail.
md += `\n## Per-trial detail\n\n`;
md += `| arm | trial | wall(s) | cost($) | turns | total tok | cr | cc | inp | out | error |\n`;
md += `|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|\n`;
for (const t of trials.sort((a, b) => (a.arm + a.trial).localeCompare(b.arm + b.trial))) {
  md += `| ${t.arm} | ${t.trial} | ${fmt(t.wall, 0)} | ${fmt(t.cost, 4)} | ${t.turns} `;
  md += `| ${kfmt(t.total)} | ${kfmt(t.tok_cr)} | ${kfmt(t.tok_cc)} | ${kfmt(t.tok_inp)} | ${kfmt(t.tok_out)} `;
  md += `| ${t.is_error ? '✗' : '✓'} |\n`;
}

// Preserve manual Analysis section.
const ANALYSIS_MARKER = '\n---\n\n## Analysis';
if (existsSync(REPORT_OUT)) {
  const existing = readFileSync(REPORT_OUT, 'utf8');
  const cut = existing.indexOf(ANALYSIS_MARKER);
  if (cut !== -1) md += existing.slice(cut);
}
const dir = REPORT_OUT.slice(0, REPORT_OUT.lastIndexOf('/'));
if (dir) mkdirSync(dir, { recursive: true });
writeFileSync(REPORT_OUT, md);
console.log(`aggregate-p2: wrote ${REPORT_OUT.split('/').slice(-2).join('/')} (${trials.length} trials)`);
