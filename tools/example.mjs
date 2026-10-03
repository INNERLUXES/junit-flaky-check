// Runs the README examples, checks that they report what the README shows, and writes the reports of both example
// sets of runs to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const COMMITS = ['--commit', 'a1f3c9e', '--commit', 'a1f3c9e', '--commit', 'b7d2e40', '--commit', 'c5e8a13'];

// Runs the tool on folders of the repository; the paths shown in the report are relative to the root of the repository.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, undefined, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const brokenArgs = ['--runs-in', 'examples/runs-broken', ...COMMITS, '--fail-on', 'warning'];
const broken = await run(brokenArgs);
process.stdout.write(broken.out);
expect('broken runs', broken, 1, [
  'runs: 4 runs, 9 XML files, 8 read, 1 not read, 9 distinct tests in 2 suites',
  'findings: 2 error, 5 warning, 4 info',
  'ERROR    flaky-test  shop.checkout.PaymentTest > authorisesCard',
  'WARNING  flaky-suspect  shop.checkout.PaymentTest > capturesPayment',
  'ERROR    always-failing  shop.checkout.CartTest > appliesDiscountCode',
  'WARNING  slow-test  shop.checkout.PaymentTest > refundsOrder',
  'WARNING  duration-regression  shop.checkout.PaymentTest > sendsReceiptEmail (run-4)',
  'INFO     slowest-tests',
  'INFO     slowest-suites',
  'WARNING  skipped-too-long  shop.checkout.CartTest > calculatesShippingForRemoteArea',
  'WARNING  duplicate-test-name  shop.checkout.CartTest > addsItemToCart (run-3)',
  'INFO     no-assertions-signal  shop.checkout.CartTest > keepsCartAfterLogin',
  'note: unreadable-file: examples/runs-broken/run-4/TEST-shop.checkout.LegacyTest.xml (run-4): line 2, column 1: the file has a DOCTYPE',
  'GATE: FAIL - 2 errors, 5 warnings'
], ['GATE: PASS']);

process.stdout.write('\n');
const fixed = await run(['--runs-in', 'examples/runs-fixed', ...COMMITS, '--fail-on', 'warning']);
process.stdout.write(fixed.out);
expect('fixed runs with --fail-on warning', fixed, 0, ['findings: 0 error, 0 warning, 3 info', 'INFO     slowest-tests', 'GATE: PASS (--fail-on warning)'], ['ERROR', 'WARNING ', 'unreadable-file']);

// The README shows the fixed run as it is printed, and the head of the broken run.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(fixed.out)) problems.push('README: the sample output of the fixed runs differs from a real run');
const head = broken.out.split('\n\nRuns (')[0];
if (!readme.includes(head)) problems.push('README: the head of the sample output of the broken runs differs from a real run');

// The broken runs in every format, and the fixed runs as text.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/runs-broken.txt'), broken.out);
for (const [format, name] of [['markdown', 'runs-broken.md'], ['json', 'runs-broken.json'], ['csv', 'runs-broken.csv']]) {
  const r = await run([...brokenArgs, '--format', format]);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}
await writeFile(resolve(root, 'examples/output/runs-fixed.txt'), fixed.out);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
