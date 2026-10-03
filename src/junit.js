// Reads the test results out of the tree of one JUnit XML file: the suites with their time, and every testcase with its
// class name, name, time, result, retries and whether it wrote any output. It reads the common shape that JUnit, Maven
// Surefire, Gradle, pytest, the Jest and Vitest reporters, Playwright and go-junit-report write: a testsuites or
// testsuite root, testsuite elements (nested or not), testcase elements with failure, error, skipped, system-out and
// system-err, and the flakyFailure, flakyError, rerunFailure and rerunError elements of Surefire retries.

export const RESULT_KINDS = ['passed', 'failed', 'error', 'skipped'];

// A time in seconds as a number, or null when the attribute is missing or is not a number. A comma as the decimal mark
// (written by some tools in some locales) is read as a point.
export function parseTime(value) {
  if (value === undefined || value === null) return null;
  let s = String(value).trim();
  if (/^[0-9]{1,12},[0-9]{1,12}$/.test(s)) s = s.replace(',', '.');
  if (!/^[0-9]{1,12}(?:\.[0-9]{0,12})?(?:[eE][-+]?[0-9]{1,3})?$|^\.[0-9]{1,12}$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// The key of a test: its class name and its name. Two testcases with the same key are the same test.
export const testKey = (classname, name) => `${classname}\u0000${name}`;

// The name of a test as a report shows it.
export const testLabel = (classname, name) => (classname ? `${classname} > ${name}` : name);

const firstLine = (t) => t.trim().split(/\r?\n|\r/)[0] ?? '';

// Reads the results of one file. doc is the tree of src/xml.js; file is the path shown in the report. Returns
// { suites: [{ name, time }], cases: [...], notes: [] }. Throws an Error with a reason when the root element is not
// testsuites or testsuite.
export function readJunit(doc, file) {
  const root = doc.root;
  if (root.name !== 'testsuites' && root.name !== 'testsuite') throw new Error(`the root element is <${root.name}>, not <testsuites> or <testsuite>`);
  const suites = [];
  const cases = [];
  let unnamed = 0;
  let badTime = 0;
  // An explicit stack: suites may nest as deep as the reader allows, with no recursion.
  const pending = [{ el: root, suite: root.name === 'testsuite' ? root.attrs.get('name') ?? '' : '' }];
  while (pending.length) {
    const { el, suite } = pending.pop();
    if (el.name === 'testsuite') {
      const own = { name: el.attrs.get('name') ?? '', time: parseTime(el.attrs.get('time')), sum: 0, file };
      suites.push(own);
      el.suite = own;
    }
    for (let k = el.children.length - 1; k >= 0; k -= 1) {
      const child = el.children[k];
      if (child.name === 'testsuite') pending.push({ el: child, suite: child.attrs.get('name') ?? suite });
      else if (child.name === 'testcase' && (el.name === 'testsuite' || el.name === 'testsuites')) {
        const c = readCase(child, suite, file);
        if (!c) {
          unnamed += 1;
          continue;
        }
        if (c.badTime) badTime += 1;
        delete c.badTime;
        if (el.suite && c.time !== null) el.suite.sum += c.time;
        cases.push(c);
      }
    }
  }
  // Cases were taken from the end of each element; put them back in file order.
  cases.sort((a, b) => a.offset - b.offset);
  const notes = [];
  if (unnamed) notes.push(`${unnamed} testcase ${unnamed === 1 ? 'element has' : 'elements have'} no name attribute and ${unnamed === 1 ? 'was' : 'were'} not counted`);
  if (badTime) notes.push(`${badTime} testcase ${badTime === 1 ? 'element has' : 'elements have'} a time that is missing or not a number; ${badTime === 1 ? 'it is' : 'they are'} left out of the time checks`);
  if (doc.replaced) notes.push(`${doc.replaced} numeric ${doc.replaced === 1 ? 'reference names a character' : 'references name characters'} that XML does not allow, read as the replacement character`);
  return { suites: suites.map((s) => ({ name: s.name, time: s.time ?? s.sum, file: s.file })), cases, notes };
}

function readCase(el, suite, file) {
  const name = el.attrs.get('name');
  if (name === undefined || name === '') return null;
  const classname = el.attrs.get('classname') ?? suite ?? '';
  const rawTime = el.attrs.get('time');
  const time = parseTime(rawTime);
  const count = { failure: 0, error: 0, skipped: 0, flakyFailure: 0, flakyError: 0, rerunFailure: 0, rerunError: 0 };
  let output = false;
  let message = '';
  for (const child of el.children) {
    if (Object.hasOwn(count, child.name)) count[child.name] += 1;
    if ((child.name === 'system-out' || child.name === 'system-err') && child.hasText) output = true;
    if ((child.name === 'failure' || child.name === 'error') && !message) message = child.attrs.get('message') || firstLine(child.text);
  }
  const result = count.failure ? 'failed' : count.error ? 'error' : count.skipped ? 'skipped' : 'passed';
  return {
    key: testKey(classname, name),
    classname,
    name,
    label: testLabel(classname, name),
    suite: suite ?? '',
    file,
    line: el.line,
    offset: el.offset,
    time,
    badTime: rawTime !== undefined && time === null ? true : rawTime === undefined,
    result,
    // Retries written into one testcase: Surefire's flakyFailure and flakyError mean that it failed and then passed.
    flakyRetries: count.flakyFailure + count.flakyError,
    failedRetries: count.rerunFailure + count.rerunError,
    output,
    message
  };
}
