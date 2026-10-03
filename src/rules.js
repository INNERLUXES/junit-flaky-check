// The checks. They read the test results of every run (src/junit.js), line up each test across the runs, and report
// what the results show about the health of the suite. docs/method.md gives the reason behind every finding and says
// what each check can and cannot see. Nothing here opens a file or runs a test.

import { FACTS, factPage } from './data.js';
import { grouped, listText, plural } from './size.js';

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 0, warning: 1, info: 2 };

// The defaults of the options: the slow limit in seconds, the factor of a duration regression, the length of the
// slowest lists, and the shortest time that can count as a regression (the tool's own floor against noise).
export const DEFAULTS = { slow: 10, regress: 2, top: 5, regressFloor: 0.5 };

// The areas a report is grouped by, in report order.
export const AREAS = [
  { id: 'runs', title: 'Runs' },
  { id: 'flaky', title: 'Flaky and failing' },
  { id: 'time', title: 'Time' },
  { id: 'hygiene', title: 'Hygiene' }
];

// Every finding, in report order within an area. facts are the keys of the sentences of src/data.js that the finding
// quotes; the page of the first one is the finding's source.
export const FINDINGS = [
  { id: 'summary', severity: 'info', area: 'runs', what: 'The runs, the tests, the counts of passed, failed, error, skipped and flaky tests in each run, and the trend of the failure rate', facts: ['pytestCreate', 'schemaTestcase'] },
  { id: 'empty-run', severity: 'error', area: 'runs', what: 'A run with no test result at all: no XML file, no readable file, or files with no testcase', facts: ['schemaTests', 'regressionSuite'] },
  { id: 'flaky-test', severity: 'error', area: 'flaky', what: 'A test that passed and failed within one run (a retry, or Surefire flakyFailure), or in two runs of the same commit', facts: ['nonDeterministic', 'countedFlaky'] },
  { id: 'flaky-suspect', severity: 'warning', area: 'flaky', what: 'A test that passed in some runs and failed in others, when no two of those runs are known to be of the same commit', facts: ['nonDeterministic', 'rerunAndPass'] },
  { id: 'always-failing', severity: 'error', area: 'flaky', what: 'A test that failed in every run where it ran', facts: ['regressionRed', 'ignoredFailure'] },
  { id: 'slow-test', severity: 'warning', area: 'time', what: 'A test whose median time across the runs is above the slow limit (10 seconds, or --slow)', facts: ['schemaTime', 'pytestTime'] },
  { id: 'duration-regression', severity: 'warning', area: 'time', what: 'A test that took more than --regress times (2) its median time in one run, with at least three timed runs', facts: ['pytestTime', 'schemaTime'] },
  { id: 'slowest-tests', severity: 'info', area: 'time', what: 'The slowest tests by median time, always listed (--top, 5)', facts: ['schemaTime'] },
  { id: 'slowest-suites', severity: 'info', area: 'time', what: 'The slowest suites by median time, always listed (--top, 5)', facts: ['schemaSuiteTime'] },
  { id: 'skipped-too-long', severity: 'warning', area: 'hygiene', what: 'A test that was skipped in every run, with at least two runs', facts: ['forgotten', 'schemaSkipped'] },
  { id: 'duplicate-test-name', severity: 'warning', area: 'hygiene', what: 'The same class name and test name more than once in one run, with the same result each time', facts: ['schemaName', 'schemaClassname'] },
  { id: 'no-assertions-signal', severity: 'info', area: 'hygiene', what: 'A test that passed with a time of 0 and no output in every run where it ran; a weak hint, best effort', facts: ['schemaSystemOut', 'schemaTime'] }
];

// What the tool says in a note, never as a finding: a file it could not read. It never fails the run.
export const NOTE_KINDS = [
  { id: 'unreadable-file', severity: 'note', what: 'An XML file that could not be read: not well-formed, a DOCTYPE, an entity that is not predefined, not UTF-8, binary, over the size limit, or a root that is not testsuites or testsuite', facts: ['doctypeFirst', 'pytestStrict'] }
];

const BY_ID = Object.fromEntries(FINDINGS.map((f) => [f.id, f]));
export const ORDER = Object.fromEntries(FINDINGS.map((f, i) => [f.id, i]));
export const BY_ID_SEVERITY = Object.fromEntries(FINDINGS.map((f) => [f.id, f.severity]));
export const AREA_ORDER = Object.fromEntries(AREAS.map((a, i) => [a.id, i]));

// Control characters (C0 and C1), the line and paragraph separators and the Unicode direction controls, built from
// their code points so that this file holds only ASCII.
const span = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const UNSAFE_CHARACTERS = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${[0x200e, 0x200f, 0x2028, 0x2029, 0xfeff].map((c) => String.fromCharCode(c)).join('')}${span(0x202a, 0x202e)}${span(0x2066, 0x2069)}]`, 'g');

// Text from the input: control, line separator and direction characters replaced by a space, length capped.
export function safeText(value, max = 300) {
  const s = String(value).slice(0, max * 4).replace(UNSAFE_CHARACTERS, ' ');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

export function meetsThreshold(severity, failOn) {
  return RANK[severity] <= RANK[failOn];
}

// A number of seconds for a report: at most three decimals, no trailing zeros.
export const seconds = (n) => `${Number(n.toFixed(3))} s`;
export const percent = (rate) => `${(rate * 100).toFixed(1)}%`;

// The median of a list of numbers; the mean of the two middle ones for an even count.
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const FAILED = new Set(['failed', 'error']);

// The outcome of one test in one run, from every time it appears in that run: flaky when it both passed and failed
// (a retry), or passed after Surefire retries; else failed, error, passed or skipped.
export function runOutcome(execs) {
  const passed = execs.some((e) => e.result === 'passed');
  const failed = execs.some((e) => FAILED.has(e.result));
  if ((passed && failed) || execs.some((e) => e.result === 'passed' && e.flakyRetries > 0)) return 'flaky';
  if (execs.some((e) => e.result === 'failed')) return 'failed';
  if (execs.some((e) => e.result === 'error')) return 'error';
  if (passed) return 'passed';
  return 'skipped';
}

// Builds one finding with its quotations.
function finding(id, fields) {
  const def = BY_ID[id];
  const basis = def.facts.map((k) => ({ text: FACTS[k].text, section: FACTS[k].section, source: factPage(k) }));
  return {
    id,
    severity: def.severity,
    area: def.area,
    test: safeText(fields.test ?? '', 300),
    run: safeText(fields.run ?? '', 120),
    file: safeText(fields.file ?? '', 400),
    line: fields.line ?? 0,
    history: safeText(fields.history ?? '', 1500),
    message: safeText(fields.message, 2000),
    fix: safeText(fields.fix, 600),
    basis,
    source: basis[0].source
  };
}

const FIX = {
  summary: 'Nothing to fix; this is what the tool read. A clean report means none of the checks found anything in these runs, not that the tests are good.',
  'empty-run': 'Check that the test step ran and wrote its results where the pipeline collects them, and that the path given is the folder of that run. An empty run is a failed run, not a clean one.',
  'flaky-test': 'Treat it as a failing test, not a passing one: find the cause (state shared between tests, waits and timing, test order, the clock, a remote service), fix it, or move it out of the main suite until it is fixed. A retry hides the problem; it does not fix it.',
  'flaky-suspect': 'Give the commit of each run with --commit, so that runs of one commit that disagree are reported as flaky. If the code did not change between these runs, rerun the test on one commit to confirm, then treat it as flaky.',
  'always-failing': 'Fix the code or the test, or delete the test if it no longer checks anything that matters. A test that always fails teaches people to ignore a red build.',
  'slow-test': 'Find where the time goes: sleeps and fixed waits, real network or database calls, large fixtures, or one test that checks too much. Split it, fake the slow part, or move it to a slower suite on purpose. Raise --slow if this time is expected.',
  'duration-regression': 'Compare that run with the others: a slower service, a wait that ran to its timeout, a retry inside the test, or a change in the code under test. A test that is much slower in one run is often close to a timeout.',
  'slowest-tests': 'Nothing to fix; the list shows where the time of the suite goes.',
  'slowest-suites': 'Nothing to fix; the list shows where the time of the suite goes.',
  'skipped-too-long': 'Run it again or delete it. A skipped test checks nothing; if it waits on a known problem, say which one in the skip message and review it on a fixed schedule.',
  'duplicate-test-name': 'Give each test a name that is unique within its class or suite. If the copies are retries that all ended the same way, there is nothing to fix.',
  'no-assertions-signal': 'Open the test and check that it asserts something. If it does, there is nothing to fix; fast tests often report a time of 0.'
};

const WORD = { passed: 'passed', failed: 'failed', error: 'error', skipped: 'skipped', flaky: 'flaky' };

// Analyses the runs. runs: [{ label, commit, cases, suites, files, unreadable }]; options: slow, regress, top,
// regressFloor. Returns { findings, runStats, tests, suites }.
export function analyse(runs, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const R = runs.length;
  const label = (r) => runs[r].label;
  const tests = new Map();
  for (let r = 0; r < R; r += 1) {
    for (const c of runs[r].cases) {
      let t = tests.get(c.key);
      if (!t) {
        t = { key: c.key, label: c.label, slots: new Array(R).fill(null) };
        tests.set(c.key, t);
      }
      (t.slots[r] ??= { execs: [] }).execs.push(c);
    }
  }
  // The outcome, time, output and place of each test in each run.
  for (const t of tests.values()) {
    for (const s of t.slots) {
      if (!s) continue;
      s.outcome = runOutcome(s.execs);
      const times = s.execs.map((e) => e.time).filter((x) => x !== null);
      s.time = times.length ? Math.max(...times) : null;
      s.output = s.execs.some((e) => e.output);
      const failing = s.execs.find((e) => FAILED.has(e.result) || e.flakyRetries > 0);
      s.at = failing ?? s.execs[0];
      s.message = s.execs.find((e) => e.message)?.message ?? '';
      const passed = s.execs.some((e) => e.result === 'passed');
      const failed = s.execs.some((e) => FAILED.has(e.result));
      s.duplicate = s.execs.length > 1 && !(passed && failed);
    }
  }

  const runStats = runs.map((run, r) => {
    const st = { passed: 0, failed: 0, error: 0, skipped: 0, flaky: 0 };
    for (const t of tests.values()) if (t.slots[r]) st[t.slots[r].outcome] += 1;
    const tests_ = st.passed + st.failed + st.error + st.skipped + st.flaky;
    const ran = tests_ - st.skipped;
    return { tests: tests_, ...st, failureRate: ran ? (st.failed + st.error) / ran : 0 };
  });

  const findings = [];
  const add = (id, fields) => findings.push(finding(id, fields));
  const historyOf = (t) => t.slots.map((s, r) => `${label(r)} ${s ? WORD[s.outcome] : 'not run'}`).join(', ');
  const place = (s) => ({ file: s.at.file, line: s.at.line });
  const runsText = (list) => listText(list.map((x) => label(x.r)), 6);

  const sorted = [...tests.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  for (const t of sorted) {
    const slots = t.slots.map((s, r) => (s ? { ...s, r } : null));
    const present = slots.filter(Boolean);
    const ran = present.filter((s) => s.outcome !== 'skipped');
    const failedRuns = ran.filter((s) => FAILED.has(s.outcome));
    const passedRuns = ran.filter((s) => s.outcome === 'passed' || s.outcome === 'flaky');
    const flakyRuns = present.filter((s) => s.outcome === 'flaky');
    const history = historyOf(t);

    // Runs of one commit that disagree.
    const byCommit = new Map();
    for (const s of ran) {
      const commit = runs[s.r].commit;
      if (!commit) continue;
      if (!byCommit.has(commit)) byCommit.set(commit, []);
      byCommit.get(commit).push(s);
    }
    const sameCommit = [...byCommit.entries()].filter(([, list]) => list.some((s) => FAILED.has(s.outcome)) && list.some((s) => s.outcome === 'passed' || s.outcome === 'flaky'));

    if (flakyRuns.length || sameCommit.length) {
      const parts = [];
      if (flakyRuns.length) {
        const surefire = flakyRuns.some((s) => s.execs.some((e) => e.flakyRetries > 0));
        parts.push(`It failed and then passed within ${flakyRuns.length === 1 ? 'one run' : `${flakyRuns.length} runs`} (${runsText(flakyRuns)})${surefire ? ': the report holds the failed attempts as flakyFailure or flakyError, which Surefire writes when a retry passes' : ': the test appears more than once in the run, and the results differ, so the run retried it'}.`);
      }
      for (const [commit, list] of sameCommit) {
        const f = list.filter((s) => FAILED.has(s.outcome));
        const p = list.filter((s) => !FAILED.has(s.outcome));
        parts.push(`On commit ${safeText(commit, 60)} it passed in ${runsText(p)} and failed in ${runsText(f)}.`);
      }
      const at = flakyRuns[0] ?? sameCommit[0][1].find((s) => FAILED.has(s.outcome));
      add('flaky-test', { test: t.label, ...place(at), history, message: `${t.label} is flaky: the same test, on the same code, both passed and failed. ${parts.join(' ')}`, fix: FIX['flaky-test'] });
    } else if (failedRuns.length && passedRuns.length) {
      const commits = failedRuns.concat(passedRuns).sort((a, b) => a.r - b.r).map((s) => runs[s.r].commit);
      const known = commits.filter(Boolean);
      let why;
      if (!known.length) why = 'No commit was given for these runs (--commit), so the tool cannot tell whether the code changed between them.';
      else if (known.length < commits.length) why = 'Some of these runs have no commit (--commit), so the tool cannot tell whether the code changed between them.';
      else why = `The runs that disagree are of different commits (${listText([...new Set(known)].map((c) => safeText(c, 40)), 6)}), so a code change may explain it.`;
      add('flaky-suspect', { test: t.label, ...place(failedRuns[0]), history, message: `${t.label} passed in ${plural(passedRuns.length, 'run')} (${runsText(passedRuns)}) and failed in ${plural(failedRuns.length, 'run')} (${runsText(failedRuns)}). ${why}`, fix: FIX['flaky-suspect'] });
    } else if (ran.length && failedRuns.length === ran.length) {
      const last = failedRuns.at(-1);
      const note = ran.length === R ? (R === 1 ? 'in the only run' : `in all ${R} runs`) : `in ${plural(ran.length, 'run')} of ${R}; it was skipped or not run in the others`;
      const msg = last.message ? ` The last message: "${safeText(last.message, 160)}".` : '';
      add('always-failing', { test: t.label, ...place(last), history, message: `${t.label} failed every time it ran: ${note}.${msg}`, fix: FIX['always-failing'] });
    }

    if (R >= 2 && present.length === R && present.every((s) => s.outcome === 'skipped')) {
      const last = present.at(-1);
      add('skipped-too-long', { test: t.label, file: last.at.file, line: last.at.line, history, message: `${t.label} was skipped in all ${R} runs. A test that is always skipped checks nothing, and it is easy to forget.`, fix: FIX['skipped-too-long'] });
    }

    for (const s of present.filter((x) => x.duplicate)) {
      const second = s.execs[1];
      const results = [...new Set(s.execs.map((e) => e.result))];
      const resultText = results.length === 1 ? `with the result ${results[0]} each time` : `with the results ${listText(results)}`;
      add('duplicate-test-name', { test: t.label, run: label(s.r), file: second.file, line: second.line, history: '', message: `${t.label} appears ${s.execs.length} times in ${label(s.r)}, ${resultText}. Two tests share a class name and a name, or a tool wrote every retry; tests with the same name cannot be told apart across runs.`, fix: FIX['duplicate-test-name'] });
    }

    const timed = ran.filter((s) => s.time !== null);
    const med = median(timed.map((s) => s.time));
    if (timed.length && med > o.slow) {
      const worst = timed.reduce((w, s) => (s.time > w.time ? s : w));
      add('slow-test', { test: t.label, file: worst.at.file, line: worst.at.line, history: timed.map((s) => `${label(s.r)} ${seconds(s.time)}`).join(', '), message: `${t.label} takes ${seconds(med)} at the median of ${plural(timed.length, 'run')}, above the limit of ${seconds(o.slow)}; the slowest was ${seconds(worst.time)} in ${label(worst.r)}.`, fix: FIX['slow-test'] });
    }
    if (timed.length >= 3 && med > 0) {
      const worst = timed.reduce((w, s) => (s.time > w.time ? s : w));
      if (worst.time >= o.regressFloor && worst.time > o.regress * med) {
        add('duration-regression', { test: t.label, run: label(worst.r), file: worst.at.file, line: worst.at.line, history: timed.map((s) => `${label(s.r)} ${seconds(s.time)}`).join(', '), message: `${t.label} took ${seconds(worst.time)} in ${label(worst.r)}, ${(worst.time / med).toFixed(1)} times its median of ${seconds(med)} across ${plural(timed.length, 'run')}; the limit is ${o.regress} times.`, fix: FIX['duration-regression'] });
      }
    }

    if (present.length && present.every((s) => s.outcome === 'passed' && s.time === 0 && !s.output)) {
      const last = present.at(-1);
      add('no-assertions-signal', { test: t.label, file: last.at.file, line: last.at.line, history, message: `${t.label} passed with a time of 0 and wrote no output in ${present.length === 1 ? 'the only run where it appears' : `all ${present.length} runs where it appears`}. That can mean a test that checks nothing, or one that is simply fast; the result file cannot tell them apart.`, fix: FIX['no-assertions-signal'] });
    }
  }

  // Empty runs.
  for (let r = 0; r < R; r += 1) {
    if (runs[r].cases.length) continue;
    const run = runs[r];
    const why = !run.files ? 'the path holds no XML file' : run.unreadable === run.files ? `none of its ${plural(run.files, 'XML file')} could be read` : `its ${plural(run.files - run.unreadable, 'readable XML file')} ${run.files - run.unreadable === 1 ? 'holds' : 'hold'} no testcase`;
    add('empty-run', { run: label(r), file: run.path, line: 0, message: `${label(r)} has no test result: ${why}. A run with no result says nothing about the tests, and must not pass a gate.`, fix: FIX['empty-run'] });
  }

  // The slowest tests and suites, always listed when there are timed results.
  const timedTests = [];
  for (const t of tests.values()) {
    const times = t.slots.filter((s) => s && s.outcome !== 'skipped' && s.time !== null).map((s) => s.time);
    if (times.length) timedTests.push({ label: t.label, median: median(times), runs: times.length });
  }
  const bySlow = (a, b) => b.median - a.median || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  if (timedTests.length) {
    const top = timedTests.sort(bySlow).slice(0, o.top);
    add('slowest-tests', { history: top.map((x, i) => `${i + 1}. ${x.label} ${seconds(x.median)}`).join(', '), message: `The ${plural(top.length, 'slowest test')} by median time across the runs: ${top.map((x) => `${x.label} (${seconds(x.median)}${x.runs > 1 ? `, ${x.runs} runs` : ''})`).join('; ')}.`, fix: FIX['slowest-tests'] });
  }
  const suites = new Map();
  for (const run of runs) {
    const own = new Map();
    for (const s of run.suites) if (s.time !== null) own.set(s.name, (own.get(s.name) ?? 0) + s.time);
    for (const [name, time] of own) {
      if (!suites.has(name)) suites.set(name, []);
      suites.get(name).push(time);
    }
  }
  const timedSuites = [...suites.entries()].map(([name, times]) => ({ label: name || '(unnamed suite)', median: median(times), runs: times.length }));
  if (timedSuites.length) {
    const top = timedSuites.sort(bySlow).slice(0, o.top);
    add('slowest-suites', { history: top.map((x, i) => `${i + 1}. ${x.label} ${seconds(x.median)}`).join(', '), message: `The ${plural(top.length, 'slowest suite')} by median time across the runs: ${top.map((x) => `${x.label} (${seconds(x.median)})`).join('; ')}.`, fix: FIX['slowest-suites'] });
  }

  // The summary.
  const rates = runStats.map((s) => s.failureRate);
  let trend;
  if (R < 2) trend = 'With one run there is no trend.';
  else {
    const first = percent(rates[0]);
    const last = percent(rates[R - 1]);
    if (first === last) trend = `The failure rate is the same in the first and the last run (${first}).`;
    else trend = `The failure rate went ${rates[R - 1] > rates[0] ? 'up' : 'down'} from ${first} in ${label(0)} to ${last} in ${label(R - 1)}.`;
  }
  const perRun = runStats.map((s, r) => `${label(r)}${runs[r].commit ? ` (commit ${safeText(runs[r].commit, 40)})` : ''}: ${plural(s.tests, 'test')}, ${grouped(s.passed)} passed, ${grouped(s.failed)} failed, ${plural(s.error, 'error')}, ${grouped(s.skipped)} skipped, ${grouped(s.flaky)} flaky, failure rate ${percent(s.failureRate)}`);
  const suiteNames = new Set(runs.flatMap((run) => run.suites.map((s) => s.name)));
  add('summary', { history: rates.map((x, r) => `${label(r)} ${percent(x)}`).join(', '), message: `${plural(R, 'run')}, ${plural(tests.size, 'distinct test')} in ${plural(suiteNames.size, 'suite')}. ${perRun.join('; ')}. ${trend}`, fix: FIX.summary });

  return { findings, runStats, tests: tests.size, suites: suiteNames.size };
}
