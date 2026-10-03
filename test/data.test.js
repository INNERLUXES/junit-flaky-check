import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, FINDINGS, NOTE_KINDS, PREDEFINED_ENTITIES, RESULT_ELEMENTS, SKIP_FOLDERS, SOURCES, factPage, source } from '../src/index.js';

// These tests read the saved pages again and compare them with src/data.js: every sentence that a finding or a
// document quotes.

const text = async (id) => readFile(new URL(`../research/sources/${source(id).file}`, import.meta.url), 'utf8');
// Text compared without line breaks or runs of white space.
const flat = (t) => t.replace(/\s+/g, ' ').trim();
const has = (page, needle) => flat(page).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ope', 'nai'].join('')}|${['gene', 'rated'].join('')}|${['assis', 'tants?'].join('')}|${['g', 'pt'].join('')}|${['l', 'lms?'].join('')})\\b`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;

test('sources: every saved page has its address on the first line, as listed in src/data.js, and holds text', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.equal(page.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(page.length > 1000, `${s.file} holds the page text`);
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9/._-]*(?:#[a-z-]+)?$/);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(new URL('../research/sources/', import.meta.url))).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: Martin Fowler on non-determinism, two Maven Surefire pages, pytest and three sections of W3C XML 1.0', () => {
  const hosts = SOURCES.map((s) => new URL(s.url).host);
  assert.deepEqual([...new Set(hosts)].sort(), ['docs.pytest.org', 'martinfowler.com', 'maven.apache.org', 'www.w3.org']);
  assert.equal(SOURCES.filter((s) => s.url.startsWith('https://www.w3.org/TR/xml/#')).length, 3);
  assert.equal(SOURCES.filter((s) => s.url.includes('/surefire/')).length, 2);
});

test('sources: no saved page holds a year, a mention of a tool that wrote it, a control byte, a carriage return or a character that is not ASCII', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.doesNotMatch(page, YEAR, s.file);
    assert.doesNotMatch(page, WRITTEN, s.file);
    assert.doesNotMatch(page, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!page.includes('\r'), s.file);
    assert.ok([...page].every((c) => c.charCodeAt(0) < 128), s.file);
  }
});

test('the saved pages show what the reader and the checks rely on: the result elements, the retries, the five entities, the DOCTYPE', async () => {
  const xsd = await text('surefire-xsd');
  for (const name of RESULT_ELEMENTS) assert.ok(xsd.includes(`<xs:element name="${name}"`), name);
  assert.ok(has(await text('surefire-rerun'), '<flakyFailure message="exception message" type="assertion exception">'));
  assert.ok(has(await text('surefire-rerun'), 'Tests run: 2, Failures: 0, Errors: 0, Skipped: 0, Flakes: 1'));
  const predefined = await text('xml-predefined');
  for (const name of Object.keys(PREDEFINED_ENTITIES)) assert.ok(predefined.includes(`<!ENTITY ${name} `), name);
  assert.ok(has(await text('xml-doctype'), '<!DOCTYPE greeting SYSTEM "hello.dtd">'));
  assert.ok(has(await text('pytest'), 'pytest --junit-xml=path'));
  assert.ok(has(await text('fowler'), 'Place any non-deterministic test in a quarantined area.'));
});

test('facts: every quoted sentence is on its saved page, word for word, with its section, no year and no mention of a tool that wrote it', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), key);
    assert.ok(has(await text(fact.source), fact.text), `${key}: "${fact.text}"`);
    assert.ok(has(await text(fact.source), fact.section), `${key}: the section ${fact.section} is on the page`);
    assert.doesNotMatch(fact.text, YEAR, key);
    assert.doesNotMatch(fact.text, WRITTEN, key);
    assert.ok(fact.text.length <= 360, `${key} is short`);
    if (fact.source === 'surefire-xsd') assert.match(fact.text, /^<xs:[a-z]+ .*>$/, `${key} is one whole line of the schema`);
    else assert.match(fact.text, /[.:)]$/, `${key} is a whole sentence`);
    assert.equal(factPage(key), source(fact.source).url);
  }
});

test('facts: every finding and note quotes sentences of src/data.js, and every source page is quoted at least once', () => {
  for (const f of [...FINDINGS, ...NOTE_KINDS]) {
    assert.ok(['error', 'warning', 'info', 'note'].includes(f.severity), f.id);
    assert.match(f.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, f.id);
    assert.ok(f.what.length > 20, f.id);
    assert.ok(f.facts.length >= 1 && f.facts.length <= 2, f.id);
    for (const k of f.facts) assert.ok(FACTS[k], `${f.id}: ${k}`);
  }
  const quoted = new Set(Object.values(FACTS).map((f) => f.source));
  for (const s of SOURCES) assert.ok(quoted.has(s.id), s.id);
  assert.deepEqual(FINDINGS.filter((f) => f.severity === 'error').map((f) => f.id), ['empty-run', 'flaky-test', 'always-failing']);
  assert.deepEqual(FINDINGS.filter((f) => f.severity === 'warning').map((f) => f.id), ['flaky-suspect', 'slow-test', 'duration-regression', 'skipped-too-long', 'duplicate-test-name']);
  assert.deepEqual(FINDINGS.filter((f) => f.severity === 'info').map((f) => f.id), ['summary', 'slowest-tests', 'slowest-suites', 'no-assertions-signal']);
  assert.deepEqual(NOTE_KINDS.map((n) => n.id), ['unreadable-file']);
});

test('lists: the predefined entities are the five of XML, and the lists have no duplicates', () => {
  assert.deepEqual(PREDEFINED_ENTITIES, { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
  for (const list of [SKIP_FOLDERS, RESULT_ELEMENTS]) assert.equal(new Set(list).size, list.length);
});

test('src writes no quoted sentence outside src/data.js', async () => {
  for (const file of ['rules.js', 'check.js', 'xml.js', 'junit.js', 'report.js', 'cli.js', 'files.js']) {
    const code = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const fact of Object.values(FACTS)) if (fact.text.length > 40) assert.ok(!code.includes(fact.text.slice(0, 40)), `${file} writes "${fact.text.slice(0, 40)}" itself`);
  }
});

test('docs: every sentence that the documents quote from a saved page is on a saved page', async () => {
  const pages = (await Promise.all(SOURCES.map((s) => text(s.id)))).map(flat).join(' ');
  let checked = 0;
  for (const file of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/inputs.md', 'docs/limits.md', 'docs/threat-model.md', 'docs/decisions/0001-read-the-results-never-run-the-tests.md', 'README.md']) {
    const doc = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const prose = file === 'README.md' ? doc.replace(/```[\s\S]*?```/g, '') : doc.replace(/`[^`\n]*`/g, '');
    for (const m of prose.matchAll(/"([^"\n]{40,400})"/g)) {
      assert.ok(pages.includes(flat(m[1])), `${file}: ${m[1]}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `${checked} quotes checked`);
});

test('docs: docs/rules-and-sources.md names every saved page, every quoted sentence, every finding and the note', async () => {
  const doc = await readFile(new URL('../docs/rules-and-sources.md', import.meta.url), 'utf8');
  for (const s of SOURCES) {
    assert.ok(doc.includes(s.file), s.file);
    assert.ok(doc.includes(s.url), s.url);
  }
  for (const [key, fact] of Object.entries(FACTS)) assert.ok(doc.includes(`| \`${key}\` |`) && doc.includes(fact.text), key);
  for (const f of [...FINDINGS, ...NOTE_KINDS]) {
    assert.ok(doc.includes(`| \`${f.id}\` | ${f.severity} |`), f.id);
    assert.ok(doc.includes(`(method.md#${f.id}-${f.severity})`), f.id);
    for (const k of f.facts) assert.ok(new RegExp(`\\| \`${k}\` \\| [^|]*\`${f.id}\``).test(doc), `${k} is used by ${f.id}`);
  }
});
