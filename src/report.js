// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools, CSV for a
// spreadsheet. Findings are grouped by area, and each one quotes the sentence of the page that it rests on.

import { AREAS, seconds } from './rules.js';
import { grouped, plural } from './size.js';

function countsLine(c) {
  return `${c.error} error, ${c.warning} warning, ${c.info} info`;
}

function gateLine(r) {
  return r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason}`;
}

// The findings of one area, for the areas that have any.
function groups(r) {
  const out = [];
  for (const a of AREAS) {
    const own = r.findings.filter((f) => f.area === a.id);
    if (own.length) out.push({ title: a.title, findings: own });
  }
  return out;
}

function runsLine(r) {
  const t = r.totals;
  return `runs: ${plural(t.runs, 'run')}, ${plural(t.files, 'XML file')}, ${grouped(t.read)} read, ${grouped(t.notRead)} not read, ${plural(t.tests, 'distinct test')} in ${plural(t.suites, 'suite')}`;
}

function settingsLine(r) {
  const s = r.settings;
  return `settings: slow above ${seconds(s.slow)}, regression above ${s.regress} times the median, top ${s.top}`;
}

// One run: its counts of distinct tests by outcome and its failure rate.
const runCounts = (x) => `${plural(x.tests, 'test')}: ${grouped(x.passed)} passed, ${grouped(x.failed)} failed, ${plural(x.error, 'error')}, ${grouped(x.skipped)} skipped, ${grouped(x.flaky)} flaky`;

// The place of a finding: file:line, the file alone, or nothing for a finding about all runs.
export const placeOf = (f) => (f.file ? (f.line ? `${f.file}:${f.line}` : f.file) : '');

// The subject of a finding: the test, the run, or both.
const subjectOf = (f) => [f.test, f.run ? `(${f.run})` : ''].filter(Boolean).join(' ');

export function toText(r) {
  const lines = [`junit-flaky-check: ${r.inputs.join(', ')}`, runsLine(r)];
  const width = Math.max(...r.runs.map((x) => x.label.length), 3);
  for (const x of r.runs) lines.push(`  ${x.label.padEnd(width)}  commit ${(x.commit ?? '-').padEnd(10)}  ${plural(x.read, 'file')} read  ${runCounts(x)}  failure rate ${x.failureRate}`);
  lines.push(settingsLine(r), 'areas:');
  for (const a of r.areas) lines.push(`  ${a.title.padEnd(17)}  ${a.result.padEnd(4)}  ${a.detail}`);
  lines.push(`findings: ${countsLine(r.counts)}`);
  if (!r.findings.length) lines.push('', 'no findings');
  for (const g of groups(r)) {
    lines.push('', `${g.title} (${plural(g.findings.length, 'finding')})`);
    for (const f of g.findings) {
      lines.push('', `  ${f.severity.toUpperCase().padEnd(7)}  ${f.id}${subjectOf(f) ? `  ${subjectOf(f)}` : ''}`);
      if (placeOf(f)) lines.push(`           at: ${placeOf(f)}`);
      if (f.history) lines.push(`           history: ${f.history}`);
      lines.push(`           ${f.message}`);
      for (const b of f.basis) lines.push(`           basis: "${b.text}" (${b.section}, ${b.source})`);
      lines.push(`           fix: ${f.fix}`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`note: ${note}`);
  lines.push('', gateLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes, pipes, square brackets, backticks, asterisks and underscores escaped, line breaks
// flattened, and <, > and & written as entities, so text from the input cannot break the table, make a link or be read
// as HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[[\]`*_]/g, (c) => `\\${c}`)
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r) {
  const lines = [`## junit-flaky-check: ${countsLine(r.counts)}`, '', `Input: ${mdCell(r.inputs.join(', '))}. ${mdCell(runsLine(r).replace(/^runs: /, 'Runs: '))}. ${mdCell(settingsLine(r).replace(/^settings: /, 'Settings: '))}.`];
  lines.push('', '| Run | Commit | Files read | Tests | Passed | Failed | Errors | Skipped | Flaky | Failure rate |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const x of r.runs) lines.push(`| ${mdCell(x.label)} | ${mdCell(x.commit ?? '-')} | ${x.read} of ${x.files} | ${x.tests} | ${x.passed} | ${x.failed} | ${x.error} | ${x.skipped} | ${x.flaky} | ${x.failureRate} |`);
  lines.push('', '| Area | Result | Detail |', '| --- | --- | --- |');
  for (const a of r.areas) lines.push(`| ${mdCell(a.title)} | ${a.result === 'fail' ? '**fail**' : mdCell(a.result)} | ${mdCell(a.detail)} |`);
  if (!r.findings.length) lines.push('', 'No findings.');
  for (const g of groups(r)) {
    lines.push('', `### ${mdCell(g.title)}`, '', '| Severity | Check | Test | Where | History | Message | Basis | Fix |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const f of g.findings) {
      const basis = f.basis.map((b) => `"${b.text}" (${b.section}, ${b.source})`).join(' ');
      lines.push(`| ${f.severity} | ${mdCell(f.id)} | ${mdCell(subjectOf(f))} | ${mdCell(placeOf(f))} | ${mdCell(f.history)} | ${mdCell(f.message)} | ${mdCell(basis)} | ${mdCell(f.fix)} |`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`- ${mdCell(note)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)}.`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

// RFC 4180 quoting, and a leading quote on cells a spreadsheet would read as a formula.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per finding.
export function toCsv(r) {
  const rows = [['severity', 'area', 'id', 'test', 'run', 'file', 'line', 'history', 'message', 'basis', 'source', 'fix']];
  for (const f of r.findings) rows.push([f.severity, f.area, f.id, f.test, f.run, f.file, String(f.line), f.history, f.message, f.basis.map((b) => b.text).join(' '), f.source, f.fix]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
