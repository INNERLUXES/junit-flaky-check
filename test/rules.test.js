import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, runOutcome, seconds, percent } from '../src/index.js';
import { across, check, find, problems, suite, testcase } from './helpers.js';

const CART = (cases, o) => ({ 'cart.xml': suite(cases, o) });

test('outcome of one test in one run: flaky when it passed and failed, or passed after Surefire retries', () => {
  const e = (result, flakyRetries = 0) => ({ result, flakyRetries });
  assert.equal(runOutcome([e('passed'), e('failed')]), 'flaky');
  assert.equal(runOutcome([e('error'), e('passed')]), 'flaky');
  assert.equal(runOutcome([e('passed', 1)]), 'flaky');
  assert.equal(runOutcome([e('failed'), e('error')]), 'failed');
  assert.equal(runOutcome([e('error')]), 'error');
  assert.equal(runOutcome([e('passed'), e('skipped')]), 'passed');
  assert.equal(runOutcome([e('skipped')]), 'skipped');
  assert.equal(runOutcome([e('failed', 1)]), 'failed');
});

test('median, seconds and percent as the reports write them', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(seconds(14.4), '14.4 s');
  assert.equal(seconds(0.87549), '0.875 s');
  assert.equal(seconds(0), '0 s');
  assert.equal(percent(0.125), '12.5%');
});

test('flaky-test: a Surefire flakyFailure in one run', () => {
  const r = check([CART([{ name: 'pays', flaky: 1 }]), CART([{ name: 'pays' }])]);
  const f = find(r, 'flaky-test');
  assert.equal(f.length, 1);
  assert.equal(f[0].test, 'shop.CartTest > pays');
  assert.equal(f[0].file, 'results/run-1/cart.xml');
  assert.equal(f[0].line, 3);
  assert.equal(f[0].history, 'run-1 flaky, run-2 passed');
  assert.match(f[0].message, /failed and then passed within one run \(run-1\): the report holds the failed attempts as flakyFailure/);
  assert.equal(r.runs[0].flaky, 1);
});

test('flaky-test: the same test twice in one run, failed and then passed, is a retry', () => {
  const r = check([CART([{ name: 'pays', result: 'failed' }, { name: 'pays' }])]);
  assert.deepEqual(problems(r), ['flaky-test']);
  assert.match(find(r, 'flaky-test')[0].message, /appears more than once in the run, and the results differ, so the run retried it/);
});

test('flaky-test: two runs of one commit that disagree; the same runs without commits are only a suspect', () => {
  const runs = across(['passed', 'failed', 'passed']);
  const withCommit = check(runs, { commits: ['abc', 'abc', 'def'] });
  assert.deepEqual(problems(withCommit), ['flaky-test']);
  assert.match(find(withCommit, 'flaky-test')[0].message, /On commit abc it passed in run-1 and failed in run-2\./);
  assert.equal(find(withCommit, 'flaky-test')[0].file, 'results/run-2/a.xml');
  const without = check(runs);
  assert.deepEqual(problems(without), ['flaky-suspect']);
  assert.match(find(without, 'flaky-suspect')[0].message, /passed in 2 runs \(run-1 and run-3\) and failed in 1 run \(run-2\)\. No commit was given/);
});

test('flaky-suspect: different commits may be a code change, and runs with some commits missing say so', () => {
  const runs = across(['passed', 'error']);
  assert.match(find(check(runs, { commits: ['abc', 'def'] }), 'flaky-suspect')[0].message, /of different commits \(abc and def\), so a code change may explain it/);
  assert.match(find(check(runs, { commits: ['abc', '-'] }), 'flaky-suspect')[0].message, /Some of these runs have no commit/);
});

test('flaky checks: a near miss that passes every time, or fails every time, is not flaky', () => {
  assert.deepEqual(problems(check(across(['passed', 'passed', 'passed']))), []);
  assert.deepEqual(problems(check(across(['failed', 'failed']))), ['always-failing']);
  assert.deepEqual(problems(check(across(['passed', 'skipped', 'passed']))), []);
});

test('always-failing: failed in every run where it ran, counting error as failed and leaving skipped runs out', () => {
  const r = check(across(['failed', 'error', 'skipped'], { message: 'total was 50' }));
  const f = find(r, 'always-failing');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /failed every time it ran: in 2 runs of 3; it was skipped or not run in the others\./);
  assert.equal(f[0].file, 'results/run-2/a.xml');
  assert.match(check(across(['failed'], { message: 'm' })).findings.find((x) => x.id === 'always-failing').message, /in the only run\. The last message: "m"\./);
  assert.match(find(check(across(['failed', 'failed'])), 'always-failing')[0].message, /in all 2 runs/);
});

test('always-failing: a failure with all Surefire reruns failed is still a failure, not a flaky test', () => {
  assert.deepEqual(problems(check([CART([{ name: 'x', result: 'failed', reruns: 2 }])])), ['always-failing']);
});

test('slow-test: the median above the limit; one slow run alone is not slow; --slow changes the limit', () => {
  const runs = [12, 11, 1].map((t) => CART([{ name: 'refunds', time: String(t) }]));
  const r = check(runs);
  const f = find(r, 'slow-test');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /takes 11 s at the median of 3 runs, above the limit of 10 s; the slowest was 12 s in run-1\./);
  assert.equal(f[0].history, 'run-1 12 s, run-2 11 s, run-3 1 s');
  assert.deepEqual(find(check([1, 1, 30].map((t) => CART([{ name: 'r', time: String(t) }]))), 'slow-test'), []);
  assert.deepEqual(find(check(runs, { slow: 12 }), 'slow-test'), []);
  assert.equal(find(check([CART([{ name: 'r', time: '10' }])]), 'slow-test').length, 0, 'exactly at the limit is not above it');
});

test('duration-regression: one run more than 2 times the median, with three timed runs and at least half a second', () => {
  const runs = [1, 1.1, 0.9, 3].map((t) => CART([{ name: 'mail', time: String(t) }]));
  const f = find(check(runs), 'duration-regression');
  assert.equal(f.length, 1);
  assert.equal(f[0].run, 'run-4');
  assert.match(f[0].message, /took 3 s in run-4, 2\.9 times its median of 1\.05 s across 4 runs; the limit is 2 times\./);
  assert.deepEqual(find(check(runs, { regress: 3 }), 'duration-regression'), []);
  assert.deepEqual(find(check(runs.slice(2)), 'duration-regression'), [], 'two runs are not enough');
  assert.deepEqual(find(check([0.01, 0.01, 0.2].map((t) => CART([{ name: 'm', time: String(t) }]))), 'duration-regression'), [], 'below half a second is noise');
  assert.deepEqual(find(check([0, 0, 0, 2].map((t) => CART([{ name: 'm', time: String(t) }]))), 'duration-regression'), [], 'a median of 0 has no ratio');
});

test('slowest-tests and slowest-suites: always there with timed results, in order, cut to --top', () => {
  const r = check([{ 'a.xml': suite([{ name: 'a', time: '3', classname: null }, { name: 'b', time: '1', classname: null }], { name: 'S1', time: '4' }), 'b.xml': suite([{ name: 'c', time: '2', classname: null }], { name: 'S2' }) }], { top: 2 });
  assert.match(find(r, 'slowest-tests')[0].message, /The 2 slowest tests by median time across the runs: S1 > a \(3 s\); S2 > c \(2 s\)\./);
  assert.match(find(r, 'slowest-suites')[0].message, /S1 \(4 s\); S2 \(2 s\)/);
  assert.equal(find(r, 'slowest-tests')[0].severity, 'info');
  const untimed = check([CART([{ name: 'a', time: null }])]);
  assert.deepEqual(find(untimed, 'slowest-tests'), []);
});

test('skipped-too-long: skipped in every run, with two runs or more; skipped in one run only is fine', () => {
  const f = find(check(across(['skipped', 'skipped', 'skipped'])), 'skipped-too-long');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /was skipped in all 3 runs\./);
  assert.deepEqual(find(check(across(['skipped'])), 'skipped-too-long'), []);
  assert.deepEqual(find(check(across(['skipped', 'passed'])), 'skipped-too-long'), []);
  const missing = check([CART([{ name: 'addsItem', result: 'skipped' }]), CART([{ name: 'other' }])]);
  assert.deepEqual(find(missing, 'skipped-too-long'), [], 'absent from a run is not skipped in it');
});

test('duplicate-test-name: the same name twice in one run with the same result; a different class name is a different test', () => {
  const r = check([CART([{ name: 'adds' }, { name: 'adds' }, { name: 'adds', classname: 'shop.OtherTest' }])]);
  const f = find(r, 'duplicate-test-name');
  assert.equal(f.length, 1);
  assert.equal(f[0].run, 'run-1');
  assert.equal(f[0].line, 4);
  assert.match(f[0].message, /appears 2 times in run-1, with the result passed each time\./);
  assert.match(find(check([CART([{ name: 'x', result: 'failed' }, { name: 'x', result: 'error' }])]), 'duplicate-test-name')[0].message, /with the results failed and error/);
});

test('no-assertions-signal: a time of 0 and no output in every run; output, a real time or a missing time do not count', () => {
  const zero = check(across(['passed', 'passed'], { time: '0' }));
  assert.equal(find(zero, 'no-assertions-signal').length, 1);
  assert.equal(find(zero, 'no-assertions-signal')[0].severity, 'info');
  assert.equal(zero.gate.pass, true);
  assert.deepEqual(find(check(across(['passed', 'passed'], { time: '0', out: 'ok' })), 'no-assertions-signal'), []);
  assert.deepEqual(find(check([CART([{ name: 'a', time: '0' }]), CART([{ name: 'a', time: '0.2' }])]), 'no-assertions-signal'), []);
  assert.deepEqual(find(check(across(['passed'], { time: null })), 'no-assertions-signal'), []);
  assert.deepEqual(find(check(across(['failed'], { time: '0' })), 'no-assertions-signal'), []);
});

test('empty-run: no XML file, no readable file, or no testcase; it fails the gate', () => {
  const r = check([CART([{ name: 'a' }]), {}, { 'bad.xml': '<testsuite>' }, { 'none.xml': '<testsuite name="s"/>' }]);
  const f = find(r, 'empty-run');
  assert.deepEqual(f.map((x) => x.run), ['run-2', 'run-3', 'run-4']);
  assert.match(f[0].message, /run-2 has no test result: the path holds no XML file\./);
  assert.match(f[1].message, /none of its 1 XML file could be read/);
  assert.match(f[2].message, /its 1 readable XML file holds no testcase/);
  assert.equal(r.gate.pass, false);
});

test('unreadable-file: a note that never fails the run, with the place of the problem', () => {
  const r = check([{ 'good.xml': suite([{ name: 'a' }]), 'bad.xml': '<!DOCTYPE x><testsuite/>' }], { failOn: 'warning' });
  assert.equal(r.gate.pass, true);
  assert.deepEqual(r.unreadable, [{ run: 'run-1', file: 'results/run-1/bad.xml', reason: 'line 1, column 1: the file has a DOCTYPE; the reader refuses document type declarations, so no DTD is read, no external entity is fetched and no entity is expanded. A JUnit result file needs none: remove the DOCTYPE line' }]);
  assert.ok(r.notes[0].startsWith('unreadable-file: results/run-1/bad.xml (run-1): line 1, column 1: the file has a DOCTYPE'));
  assert.equal(r.totals.notRead, 1);
  const root = check([{ 'good.xml': suite([{ name: 'a' }]), 'other.xml': '<coverage/>' }]);
  assert.match(root.unreadable[0].reason, /the root element is <coverage>/);
});

test('summary: runs, distinct tests, suites, the counts of each run and the trend of the failure rate', () => {
  const r = check([CART([{ name: 'a' }, { name: 'b' }]), CART([{ name: 'a', result: 'failed' }, { name: 'b', result: 'skipped' }])], { commits: ['abc', 'def'] });
  const s = find(r, 'summary')[0];
  assert.match(s.message, /^2 runs, 2 distinct tests in 1 suite\. run-1 \(commit abc\): 2 tests, 2 passed, 0 failed, 0 errors, 0 skipped, 0 flaky, failure rate 0\.0%; run-2 \(commit def\): 2 tests, 0 passed, 1 failed, 0 errors, 1 skipped, 0 flaky, failure rate 100\.0%\. The failure rate went up from 0\.0% in run-1 to 100\.0% in run-2\.$/);
  assert.equal(s.history, 'run-1 0.0%, run-2 100.0%');
  assert.match(find(check(across(['passed'])), 'summary')[0].message, /With one run there is no trend\./);
  assert.match(find(check(across(['failed', 'passed'])), 'summary')[0].message, /went down from 100\.0% in run-1 to 0\.0% in run-2/);
  assert.match(find(check(across(['passed', 'passed'])), 'summary')[0].message, /the same in the first and the last run \(0\.0%\)/);
});

test('notes: one run and two runs say which checks need more runs', () => {
  assert.ok(check(across(['passed'])).notes.some((n) => /^only one run was given/.test(n)));
  assert.ok(check(across(['passed', 'passed'])).notes.some((n) => /^two runs were given: a duration regression needs at least three/.test(n)));
  assert.ok(!check(across(['passed', 'passed', 'passed'])).notes.some((n) => /runs? (?:was|were) given/.test(n)));
});

test('labels: --run labels name the runs; the same folder name twice falls back to the path', () => {
  const r = check(across(['passed', 'failed']), { labels: ['monday', 'tuesday'] });
  assert.deepEqual(r.runs.map((x) => x.label), ['monday', 'tuesday']);
  assert.match(find(r, 'flaky-suspect')[0].history, /^monday passed, tuesday failed$/);
});

test('the gate: errors fail by default, warnings only with --fail-on warning, info never', () => {
  assert.equal(check(across(['failed'])).gate.pass, false);
  const warn = across(['passed', 'failed']);
  assert.equal(check(warn).gate.pass, true);
  assert.deepEqual(check(warn, { failOn: 'warning' }).gate, { failOn: 'warning', pass: false, reason: '1 warning' });
  assert.equal(check(across(['passed'], { time: '0' }), { failOn: 'warning' }).gate.pass, true);
});

test('a test written by hand inline reads the same as one built by the helper', () => {
  const r = check([{ 'a.xml': `<testsuite name="s">${testcase({ name: 'x', classname: 'c', result: 'failed' })}</testsuite>` }]);
  assert.equal(find(r, 'always-failing')[0].test, 'c > x');
});
