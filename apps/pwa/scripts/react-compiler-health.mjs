#!/usr/bin/env node
/**
 * Report how much of the PWA React Compiler is actually optimizing.
 *
 * The compiler is already wired into `vite.config.ts`, so this runs on every
 * build — but it is silent about what it *skipped*. A component it cannot
 * analyse is simply left unoptimized, with no error and no log line, so the
 * only way to know the real coverage is to ask the plugin directly.
 *
 * Run it before and after a refactor to see whether the change actually bought
 * any coverage. `--verbose` lists every bailout with its file and line.
 *
 *   node scripts/react-compiler-health.mjs [--verbose]
 */
import * as babel from '@babel/core';
import fs from 'node:fs';
import path from 'node:path';

const verbose = process.argv.includes('--verbose');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

let optimized = 0;
let bailed = 0;
let parseFailures = 0;
const reasons = new Map();
const sites = [];

for (const file of walk('src')) {
  const events = [];
  try {
    babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
      plugins: [['babel-plugin-react-compiler', { logger: { logEvent: (_n, e) => events.push(e) } }]],
      configFile: false,
      babelrc: false,
    });
  } catch {
    parseFailures++;
    continue;
  }

  for (const event of events) {
    if (event.kind === 'CompileSuccess') {
      optimized++;
      continue;
    }
    if (event.kind !== 'CompileError' && event.kind !== 'CompileSkip') continue;
    bailed++;
    const reason = String(event.detail?.reason ?? event.detail?.description ?? event.kind);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    sites.push(`${file}:${event.detail?.loc?.start?.line ?? '?'}  ${reason}`);
  }
}

const total = optimized + bailed;
const pct = total ? ((optimized / total) * 100).toFixed(1) : '0.0';
console.log(`React Compiler coverage: ${optimized}/${total} components and hooks optimized (${pct}%)`);
console.log(`Bailed out: ${bailed}${parseFailures ? `   (files that would not parse: ${parseFailures})` : ''}\n`);

if (bailed) {
  console.log('Bailout reasons, most common first:');
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(4)}  ${reason}`);
  }
}

if (verbose && sites.length) {
  console.log('\nEvery bailout site:');
  for (const site of sites.sort()) console.log('  ' + site);
}
