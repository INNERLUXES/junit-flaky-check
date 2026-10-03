import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDINGS, NOTE_KINDS, parseXml, readJunit } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-testing';
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;

// Every file of the examples, with forward slashes.
async function exampleFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('examples');
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'junit-flaky-check');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/junit-flaky-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['junit-flaky-check'], 'bin/junit-flaky-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
});

test('README: the closing Background section links to the software testing page with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[software testing services for QA and automation](${HOMEPAGE})`));
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
});

test('README and documents: no date and no calendar year anywhere', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
  }
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"junit-flaky-check security"/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|hours|within a (?:day|week)|\bdays\b|we will|guarantee/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems and two Node versions, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('release workflow: a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/junit-flaky-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/runs-broken\/\*\* -text$/m);
  assert.match(attributes, /^examples\/runs-fixed\/\*\* -text$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /ui-markup-a11y-check|design-token-check|research-repro-check|requirements-check|security-headers-check/i, file);
  }
});

test('docs: every finding id of the tool is described in docs/method.md and in the README table', async () => {
  const method = await read('docs/method.md');
  const readme = await read('README.md');
  for (const f of [...FINDINGS, ...NOTE_KINDS]) {
    assert.ok(method.includes(`### \`${f.id}\` (${f.severity})`), `docs/method.md: ${f.id}`);
    assert.ok(readme.includes(`| \`${f.id}\` | ${f.severity} |`), `README: ${f.id}`);
  }
});

test('docs: the documents of the set are all there and linked from the README', async () => {
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md']) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/decisions/0001-read-the-results-never-run-the-tests.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  const limits = await read('docs/limits.md');
  for (const t of [/cannot see the code/, /enough runs/, /time of 0/, /commit/, /retr/]) assert.match(limits, t);
  assert.match(await read('docs/secure-defaults.md'), /NIST SP 800-218/);
  const threats = await read('docs/threat-model.md');
  for (const t of ['billion laughs', 'external entit', 'huge file', 'nested', 'not closed', 'link loop']) assert.match(threats, new RegExp(t, 'i'), t);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src reads only what it is given: the only imports of the file system are in src/files.js and the version in src/cli.js', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') {
      assert.match(text, /from 'node:fs\/promises'/);
      assert.match(text, /lstat\(child\)/, 'entries inside a folder are looked at without following links');
      assert.doesNotMatch(text, /realpath|readlink/, 'a link is never resolved');
    } else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('src/xml.js has no DTD support to switch on: no entity table but the five, no fetch, no file access', async () => {
  const text = await read('src/xml.js');
  assert.doesNotMatch(text, /resolveEntity|loadDtd|new URL\(|<!ENTITY/);
  assert.match(text, /PREDEFINED_ENTITIES/);
  assert.match(text, /startsWith\('<!DOCTYPE', i\)\) throw new XmlError/);
});

test('tests: a test file that makes a link or names a device guards it with process.platform', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link or a device`);
      guarded += 1;
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/t\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('research/sources: the saved pages are plain text files with LF line ends', async () => {
  const files = await readdir(resolve(root, 'research/sources'));
  assert.equal(files.length, 7);
  for (const f of files) {
    const text = await read(`research/sources/${f}`);
    assert.ok(!text.includes('\r'), f);
    assert.ok(text.startsWith('Source: https://'), f);
    assert.ok(text.endsWith('\n'), f);
  }
});

test('the examples are made up: no address, no token-shaped string, no number that reads like a year, no timestamp, ASCII, LF line ends', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}`);
  const files = await exampleFiles();
  assert.ok(files.length >= 20);
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, tokenShape, f);
    assert.doesNotMatch(text, YEAR, f);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    if (!f.startsWith('examples/output/')) {
      assert.doesNotMatch(text, /https?:\/\/|@[a-z0-9-]+\.[a-z]/i, f);
      assert.doesNotMatch(text, /timestamp=|hostname=/, f);
      assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
});

test('the example runs: four runs each, the same files, and every file but the refused one is a JUnit result', async () => {
  const names = async (dir) => (await readdir(resolve(root, dir))).sort();
  assert.deepEqual(await names('examples/runs-broken'), ['run-1', 'run-2', 'run-3', 'run-4']);
  assert.deepEqual(await names('examples/runs-fixed'), await names('examples/runs-broken'));
  for (const f of (await exampleFiles()).filter((x) => x.startsWith('examples/runs-'))) {
    const text = await read(f);
    if (f.endsWith('LegacyTest.xml')) {
      assert.throws(() => parseXml(text), /DOCTYPE/);
      continue;
    }
    assert.ok(readJunit(parseXml(text), f).cases.length >= 4, f);
  }
});
