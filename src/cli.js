// Command line: junit-flaky-check <run folder or file>... [options]

import { readFileSync } from 'node:fs';
import { DEFAULTS, FINDINGS, LIMITS, NOTE_KINDS, checkPaths, safeText } from './check.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const USAGE = `Usage: junit-flaky-check <run folder or file>... [options]
       junit-flaky-check --runs-in <folder> [options]

Reads the JUnit XML test results of several CI runs and reports the health of the test suite across them: flaky tests,
tests that always fail, slow tests and suites, tests that got much slower, tests skipped in every run, tests with no
time and no output, duplicate test names and empty runs. Each path is one run, in the order given: a folder of JUnit
XML files (read with its subfolders) or one file. The tool reads the files as text with its own strict XML reader: it
refuses a DOCTYPE, expands no entity, never runs a test, never follows a symbolic link inside a folder, and opens no
network connection.

Options:
  --runs-in <folder>  every subfolder of the folder is one run, in natural name order (run-2 before run-10)
  --run <label>       a name for each run, in order; give it once per run
  --commit <id>       the commit each run tested, in order; give it once per run, - for unknown. Runs of one commit
                      whose results disagree make a flaky-test; without commits it is a flaky-suspect
  --slow <seconds>    a test whose median time is above this is slow (default: ${DEFAULTS.slow})
  --regress <factor>  a test that takes more than this times its median in one run has regressed (default: ${DEFAULTS.regress})
  --top <n>           how many of the slowest tests and suites to list (default: ${DEFAULTS.top})
  --format <name>     text, markdown, json or csv (default: text)
  --fail-on <level>   exit with 1 when a finding is at this level or above: error or warning
                      (default: error); info never fails the run
  --help              show this text
  --version           show the version

Checks: ${FINDINGS.map((f) => f.id).join(', ')}; and ${NOTE_KINDS.map((n) => n.id).join(', ')} as a note.

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

function number(name, value, { min, integer }) {
  if (!/^[0-9]{1,9}(?:\.[0-9]{1,6})?$/.test(value)) throw new Error(`${name} takes a number, not ${value}`);
  const n = Number(value);
  if (integer && !Number.isInteger(n)) throw new Error(`${name} takes a whole number, not ${value}`);
  if (n < min) throw new Error(`${name} takes a number of at least ${min}, not ${value}`);
  return n;
}

export function parseArgs(argv) {
  const o = { paths: [], runsIn: null, labels: [], commits: [], slow: DEFAULTS.slow, regress: DEFAULTS.regress, top: DEFAULTS.top, format: 'text', failOn: 'error', help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--runs-in') o.runsIn = next();
    else if (a === '--run') o.labels.push(next());
    else if (a === '--commit') o.commits.push(next());
    else if (a === '--slow') o.slow = number('--slow', next(), { min: 0 });
    else if (a === '--regress') o.regress = number('--regress', next(), { min: 1 });
    else if (a === '--top') o.top = number('--top', next(), { min: 1, integer: true });
    else if (a === '-') throw new Error('reading from standard input is not supported; give a folder or a file per run');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else o.paths.push(a);
  }
  if (!o.help && !o.version) {
    if (o.runsIn && o.paths.length) throw new Error('give the runs as paths or with --runs-in, not both');
    if (!o.runsIn && !o.paths.length) throw new Error('give a folder or a file of JUnit XML results for each run, or --runs-in <folder>');
    for (const p of [...o.paths, o.runsIn].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!o.runsIn && o.labels.length && o.labels.length !== o.paths.length) throw new Error(`${o.labels.length} --run labels for ${o.paths.length} runs; give one label per run, in order`);
    if (!o.runsIn && o.commits.length && o.commits.length !== o.paths.length) throw new Error(`${o.commits.length} --commit values for ${o.paths.length} runs; give one commit per run, in order (- for unknown)`);
    if (new Set(o.labels).size !== o.labels.length) throw new Error('two runs have the same --run label');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
  }
  return o;
}

function clean(text) {
  return safeText(text, 1500);
}

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = LIMITS, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`junit-flaky-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths(o.paths, { runsIn: o.runsIn, labels: o.labels, commits: o.commits, slow: o.slow, regress: o.regress, top: o.top, failOn: o.failOn, version: VERSION, limits: { ...LIMITS, ...limits }, base });
  } catch (error) {
    io.err(`junit-flaky-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
