// Shared test helpers: result files built inline, checked in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkRuns, main } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'junit-flaky-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// One testcase. t: { name, classname, time, result: 'passed' | 'failed' | 'error' | 'skipped', flaky: n, reruns: n,
// out: text, message }. Strings are escaped as XML needs.
export function testcase(t) {
  const attrs = [`name="${esc(t.name)}"`];
  if (t.classname !== null) attrs.push(`classname="${esc(t.classname ?? 'shop.CartTest')}"`);
  if (t.time !== null) attrs.push(`time="${t.time ?? '0.01'}"`);
  const body = [];
  if (t.result === 'failed') body.push(`<failure message="${esc(t.message ?? 'expected 1 but was 2')}" type="AssertionError">trace</failure>`);
  if (t.result === 'error') body.push(`<error message="${esc(t.message ?? 'timed out')}" type="TimeoutError">trace</error>`);
  if (t.result === 'skipped') body.push('<skipped message="later"/>');
  for (let i = 0; i < (t.flaky ?? 0); i += 1) body.push('<flakyFailure message="x" type="AssertionError"><stackTrace>trace</stackTrace></flakyFailure>');
  for (let i = 0; i < (t.reruns ?? 0); i += 1) body.push('<rerunFailure message="x" type="AssertionError"><stackTrace>trace</stackTrace></rerunFailure>');
  if (t.out) body.push(`<system-out>${esc(t.out)}</system-out>`);
  return body.length ? `<testcase ${attrs.join(' ')}>${body.join('')}</testcase>` : `<testcase ${attrs.join(' ')}/>`;
}

// A whole result file with one suite holding these testcases (objects for testcase(), or strings as written).
export function suite(cases, { name = 'shop.CartTest', time } = {}) {
  const body = cases.map((c) => (typeof c === 'string' ? c : testcase(c))).join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(name)}" tests="${cases.length}"${time === undefined ? '' : ` time="${time}"`}>\n  ${body}\n</testsuite>\n`;
}

// Runs given in memory: [{ 'a.xml': text, ... }, ...], one object per run, checked with checkRuns.
export function check(runs, options = {}) {
  const read = runs.map((files, r) => ({
    path: `results/run-${r + 1}`,
    name: `run-${r + 1}`,
    files: Object.entries(files).map(([file, text]) => ({ file: `results/run-${r + 1}/${file}`, size: text.length, text, reason: null })),
    links: [],
    skipped: [],
    special: [],
    otherFiles: 0
  }));
  return checkRuns(read, { inputs: ['results'], ...options });
}

// The same test in several runs, one result per run: results is a list such as ['passed', 'failed'].
export function across(results, t = {}) {
  return results.map((result) => ({ 'a.xml': suite([{ name: 'addsItem', ...t, result }]) }));
}

export const ids = (report) => report.findings.map((f) => f.id);
export const find = (report, id) => report.findings.filter((f) => f.id === id);
// The finding ids without the ones that every report with timed results has.
export const problems = (report) => ids(report).filter((id) => !['summary', 'slowest-tests', 'slowest-suites'].includes(id));

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}
