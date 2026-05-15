#!/usr/bin/env node
// Emits a Markdown summary of vitest results + v8 coverage for the GitHub
// Actions job summary. Reads:
//   - coverage/coverage-summary.json (from @vitest/coverage-v8 'json-summary' reporter)
//   - vitest-results.json (from vitest --reporter=json --outputFile)
//
// Usage:
//   node scripts/ci-summary.mjs                  # print to stdout
//   node scripts/ci-summary.mjs >> $GITHUB_STEP_SUMMARY
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const COV_PATH = resolve('coverage/coverage-summary.json');
const TESTS_PATH = resolve('vitest-results.json');

const out = [];

function w(line = '') {
  out.push(line);
}

function pct(n) {
  if (typeof n !== 'number') return '–';
  return `${n.toFixed(1)}%`;
}

function badge(n, threshold = 80) {
  if (typeof n !== 'number') return '⚪️';
  return n >= threshold ? '🟢' : n >= threshold - 5 ? '🟡' : '🔴';
}

async function renderTests() {
  if (!existsSync(TESTS_PATH)) {
    w('_No vitest results JSON found at `vitest-results.json` — was vitest run with `--reporter=json --outputFile=vitest-results.json`?_');
    return;
  }
  const raw = JSON.parse(await readFile(TESTS_PATH, 'utf8'));
  const numTotal = raw.numTotalTests ?? 0;
  const numPassed = raw.numPassedTests ?? 0;
  const numFailed = raw.numFailedTests ?? 0;
  const numSkipped = raw.numPendingTests ?? 0;
  const success = raw.success ? '🟢 passing' : '🔴 failing';
  const files = raw.testResults?.length ?? raw.numTotalTestSuites ?? 0;

  w('## ✅ Test results');
  w('');
  w(`**Status:** ${success}   ·   **Files:** ${files}   ·   **Tests:** ${numTotal} (${numPassed} passed, ${numFailed} failed, ${numSkipped} skipped)`);
  w('');

  // Per-file rundown
  if (Array.isArray(raw.testResults) && raw.testResults.length) {
    w('| File | Status | Passed | Failed | Duration |');
    w('| --- | --- | ---: | ---: | ---: |');
    for (const tr of raw.testResults) {
      const name = relative(process.cwd(), tr.name ?? tr.testFilePath ?? '');
      const status = tr.status === 'passed' ? '🟢' : '🔴';
      const p =
        tr.assertionResults?.filter((a) => a.status === 'passed').length ?? 0;
      const f =
        tr.assertionResults?.filter((a) => a.status === 'failed').length ?? 0;
      const dur =
        typeof tr.endTime === 'number' && typeof tr.startTime === 'number'
          ? `${Math.max(0, Math.round(tr.endTime - tr.startTime))} ms`
          : '–';
      w(`| \`${name}\` | ${status} | ${p} | ${f} | ${dur} |`);
    }
    w('');
  }

  // If anything failed, surface the messages.
  if (numFailed > 0) {
    w('### Failures');
    for (const tr of raw.testResults ?? []) {
      for (const ar of tr.assertionResults ?? []) {
        if (ar.status !== 'failed') continue;
        w('');
        w(`**${ar.fullName ?? ar.title}** — \`${relative(process.cwd(), tr.name ?? '')}\``);
        for (const msg of ar.failureMessages ?? []) {
          w('```');
          w(msg);
          w('```');
        }
      }
    }
    w('');
  }
}

async function renderCoverage() {
  if (!existsSync(COV_PATH)) {
    w('_No coverage summary found at `coverage/coverage-summary.json`._');
    return;
  }
  const cov = JSON.parse(await readFile(COV_PATH, 'utf8'));
  const total = cov.total ?? {};

  w('## 📊 Coverage');
  w('');
  w(`| Metric | Covered / Total | % |`);
  w('| --- | --- | --- |');
  for (const key of ['lines', 'statements', 'functions', 'branches']) {
    const m = total[key];
    if (!m) continue;
    const symbol = badge(m.pct, key === 'branches' ? 75 : 80);
    w(`| **${key}** ${symbol} | ${m.covered}/${m.total} | ${pct(m.pct)} |`);
  }
  w('');

  // Per-file breakdown for files under src/engine
  const rows = [];
  for (const [path, m] of Object.entries(cov)) {
    if (path === 'total') continue;
    if (!path.includes('/engine/')) continue;
    if (path.endsWith('.test.ts')) continue;
    const rel = relative(process.cwd(), path);
    rows.push({
      file: rel,
      lines: m.lines?.pct ?? 0,
      stmts: m.statements?.pct ?? 0,
      funcs: m.functions?.pct ?? 0,
      branches: m.branches?.pct ?? 0,
    });
  }
  if (rows.length) {
    rows.sort((a, b) => a.lines - b.lines);
    w('| File | Lines | Statements | Functions | Branches |');
    w('| --- | ---: | ---: | ---: | ---: |');
    for (const r of rows) {
      w(
        `| \`${r.file}\` | ${badge(r.lines)} ${pct(r.lines)} | ${pct(r.stmts)} | ${pct(r.funcs)} | ${pct(r.branches)} |`,
      );
    }
    w('');
  }

  w(
    `> Thresholds: lines / statements / functions **≥80%**, branches **≥75%**.`,
  );
}

await renderTests();
w('');
await renderCoverage();

process.stdout.write(out.join('\n') + '\n');
