import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDINGS, NOTE_KINDS, USAGE, VERSION, checkPaths, csvCell, decodeText, displayPath, fileError, grouped, isXmlName, listText, main, mdCell, naturalCompare, parseArgs, parseSize, placeOf, plural, readBounded, readRuns, runFolders, sizeText, toCsv, toJson, toMarkdown, toText } from '../src/index.js';
import { across, check, cli, run, suite, withFiles } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const COMMITS = ['--commit', 'a1f3c9e', '--commit', 'a1f3c9e', '--commit', 'b7d2e40', '--commit', 'c5e8a13'];

// Runs the tool on folders of the repository, with the root of the repository as the base for relative paths.
async function inRoot(argv) {
  let o = '';
  let err = '';
  const code = await main(argv, { out: (t) => { o += t; }, err: (t) => { err += t; } }, undefined, root);
  return { code, out: o, err };
}

const broken = () => check(across(['passed', 'failed', 'failed'], { time: '0.5' }), { commits: ['abc', 'abc', 'def'] });

test('text report: the input, the runs, the settings, the areas, each finding with its place, history, quotation and fix, and the gate', () => {
  const o = toText(broken());
  const lines = o.split('\n');
  assert.equal(lines[0], 'junit-flaky-check: results');
  assert.equal(lines[1], 'runs: 3 runs, 3 XML files, 3 read, 0 not read, 1 distinct test in 1 suite');
  assert.equal(lines[2], '  run-1  commit abc         1 file read  1 test: 1 passed, 0 failed, 0 errors, 0 skipped, 0 flaky  failure rate 0.0%');
  assert.equal(lines[5], 'settings: slow above 10 s, regression above 2 times the median, top 5');
  assert.equal(lines[6], 'areas:');
  assert.match(o, /^ {2}Flaky and failing {2}fail {2}flaky-test x1$/m);
  assert.match(o, /^ {2}Hygiene {12}pass {2}no finding$/m);
  assert.match(o, /^findings: 1 error, 0 warning, 3 info$/m);
  assert.match(o, /^ {2}ERROR {4}flaky-test {2}shop\.CartTest > addsItem$/m);
  assert.match(o, /^ {11}at: results\/run-2\/a\.xml:3$/m);
  assert.match(o, /^ {11}history: run-1 passed, run-2 failed, run-3 failed$/m);
  assert.match(o, /^ {11}basis: "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment\." \(Eradicating Non-Determinism in Tests, https:\/\/martinfowler\.com\/articles\/nonDeterminism\.html\)$/m);
  assert.match(o, /^ {11}fix: Treat it as a failing test/m);
  assert.match(o, /^ {2}INFO {5}summary$/m);
  assert.match(o, /\nGATE: FAIL - 1 error\n$/);
});

test('text report: no findings and notes are said before the gate', () => {
  const r = check(across(['passed']));
  r.findings = [];
  r.counts = { error: 0, warning: 0, info: 0 };
  const o = toText(r);
  assert.match(o, /^findings: 0 error, 0 warning, 0 info\n\nno findings$/m);
  assert.match(o, /\nnote: only one run was given.*\n\nGATE: PASS \(--fail-on error\)\n$/);
});

test('markdown report: the summary line, the run table, the area table, a table per area, the notes and the gate in bold', () => {
  const o = toMarkdown(broken());
  assert.match(o, /^## junit-flaky-check: 1 error, 0 warning, 3 info$/m);
  assert.match(o, /^Input: results\. Runs: 3 runs/m);
  assert.match(o, /^\| run-1 \| abc \| 1 of 1 \| 1 \| 1 \| 0 \| 0 \| 0 \| 0 \| 0\.0% \|$/m);
  assert.match(o, /^\| Flaky and failing \| \*\*fail\*\* \| flaky-test x1 \|$/m);
  assert.match(o, /^\| Severity \| Check \| Test \| Where \| History \| Message \| Basis \| Fix \|$/m);
  assert.match(o, /\| shop\.CartTest &gt; addsItem \|/);
  assert.match(o, /\*\*Gate failed:\*\* 1 error\./);
  assert.match(toMarkdown(check(across(['passed', 'passed']))), /\*\*Gate passed\*\* \(--fail-on error\)\./);
  assert.equal(mdCell('x\r\ny'), 'x y');
  assert.equal(mdCell('a_b|c'), 'a\\_b\\|c');
});

test('json report: the whole report, with the settings, the totals, the runs, every finding with its basis, the files not read, the notes and the gate', () => {
  const r = JSON.parse(toJson(check(across(['passed', 'failed']), { version: '9.9.9' })));
  assert.deepEqual(Object.keys(r), ['tool', 'version', 'inputs', 'settings', 'totals', 'runs', 'areas', 'findings', 'unreadable', 'notes', 'counts', 'gate']);
  assert.equal(r.tool, 'junit-flaky-check');
  assert.equal(r.version, '9.9.9');
  assert.deepEqual(r.settings, { slow: 10, regress: 2, top: 5 });
  assert.deepEqual(Object.keys(r.totals), ['runs', 'files', 'read', 'notRead', 'tests', 'suites']);
  assert.deepEqual(Object.keys(r.runs[0]), ['label', 'commit', 'path', 'files', 'read', 'notRead', 'tests', 'passed', 'failed', 'error', 'skipped', 'flaky', 'failureRate']);
  assert.deepEqual(r.areas.map((a) => a.id), ['runs', 'flaky', 'time', 'hygiene']);
  assert.deepEqual(Object.keys(r.findings[0]), ['id', 'severity', 'area', 'test', 'run', 'file', 'line', 'history', 'message', 'fix', 'basis', 'source']);
  assert.deepEqual(Object.keys(r.findings[0].basis[0]), ['text', 'section', 'source']);
  assert.deepEqual(r.gate, { failOn: 'error', pass: true, reason: '' });
});

test('csv report: RFC 4180, one row per finding, CRLF line ends, quotes doubled, and a leading quote on a cell a spreadsheet would run', () => {
  const o = toCsv(broken());
  const lines = o.split('\r\n');
  assert.equal(lines[0], 'severity,area,id,test,run,file,line,history,message,basis,source,fix');
  assert.equal(lines.at(-1), '');
  assert.ok(lines[1].startsWith('info,runs,summary,,,,0,'));
  assert.ok(lines[2].startsWith('error,flaky,flaky-test,shop.CartTest > addsItem,,results/run-2/a.xml,3,'));
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@a'), "'@a");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(placeOf({ file: 'a.xml', line: 3 }), 'a.xml:3');
  assert.equal(placeOf({ file: 'a.xml', line: 0 }), 'a.xml');
  assert.equal(placeOf({ file: '', line: 0 }), '');
});

test('the usage text lists every check, the note, the options and the exit codes', () => {
  for (const f of [...FINDINGS, ...NOTE_KINDS]) assert.ok(USAGE.includes(f.id), f.id);
  assert.match(USAGE, /Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error\./);
  for (const o of ['--runs-in <folder>', '--run <label>', '--commit <id>', '--slow <seconds>', '--regress <factor>', '--top <n>', '--format <name>', '--fail-on <level>']) assert.ok(USAGE.includes(o), o);
  assert.match(USAGE, /info never fails the run/);
  assert.match(USAGE, /refuses a DOCTYPE, expands no entity, never runs a test/);
});

test('arguments: every option, several paths, and the errors for a missing value, an unknown option, no path, a URL, numbers and counts', () => {
  assert.deepEqual(parseArgs(['r1', 'r2', '--run', 'a', '--run', 'b', '--commit', 'x', '--commit', '-', '--slow', '2.5', '--regress', '3', '--top', '7', '--format', 'json', '--fail-on', 'warning']), { paths: ['r1', 'r2'], runsIn: null, labels: ['a', 'b'], commits: ['x', '-'], slow: 2.5, regress: 3, top: 7, format: 'json', failOn: 'warning', help: false, version: false });
  assert.equal(parseArgs(['--runs-in', 'results', '--commit', 'a', '--commit', 'b', '--commit', 'c']).runsIn, 'results');
  for (const [argv, message] of [
    [['--format'], /--format needs a value/],
    [['x', '--bad'], /unknown argument --bad/],
    [[], /give a folder or a file of JUnit XML results for each run/],
    [['https://example.test/results.xml'], /never fetches a URL/],
    [['--runs-in', 'https://example.test/'], /never fetches a URL/],
    [['-'], /standard input is not supported/],
    [['x', '--format', 'xml'], /unknown format xml/],
    [['x', '--fail-on', 'info'], /--fail-on takes error or warning, not info/],
    [['x', '--runs-in', 'y'], /not both/],
    [['x', 'y', '--run', 'a'], /1 --run labels for 2 runs/],
    [['x', 'y', '--commit', 'a'], /1 --commit values for 2 runs/],
    [['x', 'y', '--run', 'a', '--run', 'a'], /the same --run label/],
    [['x', '--slow', 'ten'], /--slow takes a number, not ten/],
    [['x', '--slow', '-1'], /--slow needs a value|--slow takes a number/],
    [['x', '--regress', '0.5'], /--regress takes a number of at least 1/],
    [['x', '--top', '2.5'], /--top takes a whole number/],
    [['x', '--top', '0'], /--top takes a number of at least 1/]
  ]) {
    assert.throws(() => parseArgs(argv), message, argv.join(' '));
  }
});

test('lists, numbers and sizes as the reports write them', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(plural(1, 'file'), '1 file');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
  assert.equal(parseSize('2M'), 2097152);
  assert.equal(parseSize('x'), null);
  assert.equal(sizeText(1024), '1 KB');
  assert.equal(isXmlName('TEST-a.XML'), true);
  assert.equal(isXmlName('a.xml.txt'), false);
});

test('exit code 0: runs with no finding at the level, and --help and --version', async () => {
  const files = { 'r1/a.xml': suite([{ name: 'a' }]), 'r2/a.xml': suite([{ name: 'a' }]) };
  assert.equal((await run(files, ['r1', 'r2', '--fail-on', 'warning'])).code, 0);
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  const version = await cli(['--version']);
  assert.equal(version.out, `${VERSION}\n`);
  assert.equal(VERSION, JSON.parse(await read('package.json')).version);
});

test('exit code 1: an error fails the default gate, a warning fails only --fail-on warning, and info never fails', async () => {
  const fail = { 'r1/a.xml': suite([{ name: 'a', result: 'failed' }]) };
  assert.equal((await run(fail, ['r1'])).code, 1);
  const warn = { 'r1/a.xml': suite([{ name: 'a' }]), 'r2/a.xml': suite([{ name: 'a', result: 'failed' }]) };
  assert.equal((await run(warn, ['r1', 'r2'])).code, 0);
  assert.equal((await run(warn, ['r1', 'r2', '--fail-on', 'warning'])).code, 1);
  const info = await run({ 'r1/a.xml': suite([{ name: 'a', time: '0' }]) }, ['r1', '--fail-on', 'warning']);
  assert.equal(info.code, 0);
  assert.match(info.out, /INFO {5}no-assertions-signal/);
});

test('exit code 2: a path that does not exist, a file that is not XML, --runs-in with no subfolder, counts that do not match, a bad argument', async () => {
  const missing = await run({}, ['nope']);
  assert.equal(missing.code, 2);
  assert.equal(missing.err, 'junit-flaky-check: nope: no such file or folder\n');
  assert.match((await run({ 'a.txt': 'x' }, ['a.txt'])).err, /a\.txt: not an XML file/);
  assert.match((await run({ 'results/a.xml': 'x' }, ['--runs-in', 'results'])).err, /results: holds no subfolder/);
  assert.match((await run({ 'a.xml': 'x' }, ['--runs-in', 'a.xml'])).err, /a\.xml: not a folder/);
  assert.match((await run({}, ['--runs-in', 'none'])).err, /none: no such folder/);
  const counts = await run({ 'results/r1/a.xml': suite([{ name: 'a' }]), 'results/r2/a.xml': suite([{ name: 'a' }]) }, ['--runs-in', 'results', '--commit', 'x']);
  assert.equal(counts.code, 2);
  assert.match(counts.err, /1 --commit values for 2 runs/);
  assert.match((await run({ 'results/r1/a.xml': suite([{ name: 'a' }]) }, ['--runs-in', 'results', '--run', 'a', '--run', 'b'])).err, /2 --run labels for 1 run;/);
  const bad = await run({}, ['--fail-on']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /Usage: junit-flaky-check/);
});

test('runs: --runs-in takes subfolders in natural order, skips tool folders and files, and labels come from the folder names', async () => {
  const files = { 'results/run-10/a.xml': suite([{ name: 'a', result: 'failed' }]), 'results/run-2/a.xml': suite([{ name: 'a' }]), 'results/run-1/a.xml': suite([{ name: 'a' }]), 'results/node_modules/x.xml': 'x', 'results/notes.txt': 'x' };
  await withFiles(files, async (dir) => {
    const found = await runFolders('results', dir);
    assert.deepEqual(found, { shown: 'results', paths: ['results/run-1', 'results/run-2', 'results/run-10'] });
    const report = await checkPaths([], { runsIn: 'results', base: dir });
    assert.deepEqual(report.inputs, ['results']);
    assert.deepEqual(report.runs.map((r) => r.label), ['run-1', 'run-2', 'run-10']);
    assert.match(report.findings.find((f) => f.id === 'flaky-suspect').history, /run-10 failed$/);
  });
  assert.ok(naturalCompare('run-2', 'run-10') < 0);
  assert.ok(naturalCompare('run-02', 'run-2') > 0 || naturalCompare('run-02', 'run-2') < 0);
  assert.equal(naturalCompare('a', 'a'), 0);
  assert.ok(naturalCompare('b', 'a1') > 0);
});

test('runs: a folder is walked with its subfolders in name order, other files are counted, a file can be a run, paths use forward slashes', async () => {
  const files = { 'r1/build/TEST-b.xml': suite([{ name: 'b' }]), 'r1/TEST-a.xml': suite([{ name: 'a' }]), 'r1/report.html': 'x', 'r1/.git/x.xml': 'x', 'one.xml': suite([{ name: 'a' }]) };
  await withFiles(files, async (dir) => {
    const runs = await readRuns(['r1', 'one.xml'], dir);
    assert.deepEqual(runs[0].files.map((f) => f.file), ['r1/TEST-a.xml', 'r1/build/TEST-b.xml']);
    assert.equal(runs[0].otherFiles, 1);
    assert.deepEqual(runs[0].skipped, ['r1/.git']);
    assert.deepEqual(runs[1].files.map((f) => f.file), ['one.xml']);
    const report = await checkPaths(['r1', 'one.xml'], { base: dir });
    assert.deepEqual(report.inputs, ['r1', 'one.xml']);
    assert.ok(report.notes.some((n) => /r1: 1 folder of tools or caches was not entered: r1\/\.git/.test(n)));
    assert.ok(report.notes.some((n) => /1 file not ending in \.xml was not read/.test(n)));
  });
  for (const [format, pattern] of [['text', /r1\/a\.xml:3/], ['markdown', /r1\/a\.xml:3/], ['json', /"file": "r1\/a\.xml"/], ['csv', /,r1\/a\.xml,3,/]]) {
    const r = await run({ 'r1/a.xml': suite([{ name: 'a', result: 'failed' }]) }, ['r1', '--format', format]);
    assert.equal(r.code, 1, format);
    assert.match(r.out, pattern, format);
  }
});

test('runs: two runs whose folders have the same name are told apart by their paths', async () => {
  const files = { 'monday/results/a.xml': suite([{ name: 'a' }]), 'tuesday/results/a.xml': suite([{ name: 'a' }]) };
  const r = await run(files, ['monday/results', 'tuesday/results', '--format', 'json']);
  assert.deepEqual(JSON.parse(r.out).runs.map((x) => x.label), ['monday/results', 'tuesday/results']);
});

test('files: a path shown relative with forward slashes, or absolute outside the base; a bounded read; text without a byte order mark', async () => {
  assert.equal(displayPath(resolve('/base/sub/a.xml'), resolve('/base')), 'sub/a.xml');
  assert.equal(displayPath(resolve('/base'), resolve('/base')), '.');
  assert.ok(!displayPath(resolve('/other/a.xml'), resolve('/base')).startsWith('..'));
  assert.deepEqual([fileError('x', 'gone').message, fileError('x', 'gone').reason], ['x: gone', 'gone']);
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.throws(() => decodeText(Buffer.from([0xff, 0xfe, 0x3c, 0x00])), /UTF-16/);
  await withFiles({ 'a.xml': 'hello', 'big.xml': 'x'.repeat(100) }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.xml'))).toString(), 'hello');
    await assert.rejects(readBounded(resolve(dir, 'big.xml'), 10), /100 bytes is over the 10 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'none.xml')), /no such file/);
    await assert.rejects(readBounded(dir), /not a regular file|cannot be read/);
  });
});

test('the example runs: the broken ones fail as the README shows, the fixed ones pass at --fail-on warning', async () => {
  const b = await inRoot(['--runs-in', 'examples/runs-broken', ...COMMITS, '--fail-on', 'warning']);
  assert.equal(b.code, 1);
  assert.match(b.out, /^findings: 2 error, 5 warning, 4 info$/m);
  for (const f of FINDINGS.filter((x) => x.id !== 'empty-run')) assert.match(b.out, new RegExp(` ${f.id}(?: |\\n)`), `the broken runs show ${f.id}`);
  assert.match(b.out, /note: unreadable-file: /);
  const f = await inRoot(['--runs-in', 'examples/runs-fixed', ...COMMITS, '--fail-on', 'warning']);
  assert.equal(f.code, 0);
  assert.match(f.out, /^findings: 0 error, 0 warning, 3 info$/m);
  const noCommits = await inRoot(['--runs-in', 'examples/runs-broken']);
  assert.match(noCommits.out, /No commit was given for these runs/);
});

test('the example output in the repository is what the tool prints now', async () => {
  const args = ['--runs-in', 'examples/runs-broken', ...COMMITS, '--fail-on', 'warning'];
  assert.equal(await read('examples/output/runs-broken.txt'), (await inRoot(args)).out);
  assert.equal(await read('examples/output/runs-fixed.txt'), (await inRoot(['--runs-in', 'examples/runs-fixed', ...COMMITS, '--fail-on', 'warning'])).out);
  for (const [format, file] of [['markdown', 'runs-broken.md'], ['json', 'runs-broken.json'], ['csv', 'runs-broken.csv']]) {
    assert.equal(await read(`examples/output/${file}`), (await inRoot([...args, '--format', format])).out, file);
  }
  assert.deepEqual((await readdir(resolve(root, 'examples/output'))).sort(), ['runs-broken.csv', 'runs-broken.json', 'runs-broken.md', 'runs-broken.txt', 'runs-fixed.txt']);
});

test('the example runs give the same report with CRLF line ends as with LF', async () => {
  const files = {};
  for (const r of await readdir(resolve(root, 'examples/runs-broken'))) {
    for (const name of await readdir(resolve(root, 'examples/runs-broken', r))) files[`${r}/${name}`] = await read(`examples/runs-broken/${r}/${name}`);
  }
  assert.ok(Object.values(files).every((t) => !t.includes('\r')), 'the example files are stored with LF');
  const crlf = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.split('\n').join('\r\n')]));
  const a = await run(files, ['--runs-in', '.', ...COMMITS, '--format', 'json']);
  const b = await run(crlf, ['--runs-in', '.', ...COMMITS, '--format', 'json']);
  const strip = (o) => JSON.parse(o).findings.map((f) => [f.id, f.test, f.file, f.line, f.message]);
  assert.deepEqual(strip(b.out), strip(a.out));
  assert.ok(strip(a.out).length >= 11);
});
