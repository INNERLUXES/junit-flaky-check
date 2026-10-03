// Reads the JUnit XML files of every run, reads each one with the strict reader of src/xml.js and the JUnit reader of
// src/junit.js, runs the checks of src/rules.js and returns one report: the runs, the areas with their result, the
// findings grouped by area, the files that could not be read, notes and the gate. docs/method.md gives the reason
// behind every finding. The tool reads the files it is given, runs no test and opens no connection.

import { FILE_LIMITS, readRuns, runFolders } from './files.js';
import { XML_LIMITS, parseXml, xmlProblem } from './xml.js';
import { readJunit } from './junit.js';
import { AREAS, AREA_ORDER, BY_ID_SEVERITY, DEFAULTS, FINDINGS, NOTE_KINDS, ORDER, RANK, SEVERITIES, analyse, meetsThreshold, percent, safeText } from './rules.js';
import { grouped, listText, plural } from './size.js';

export const LIMITS = { ...FILE_LIMITS, ...XML_LIMITS, maxListedPerFinding: 200 };
export { AREAS, DEFAULTS, FINDINGS, NOTE_KINDS, ORDER, RANK, SEVERITIES, meetsThreshold, safeText };

// The name of each run: the label given, else the name of its folder or file, else its path when two names are the same.
function runLabels(read, labels) {
  if (labels?.length) return labels.map((l) => safeText(l, 80));
  const names = read.map((r) => r.name);
  return read.map((r) => safeText(names.filter((n) => n === r.name).length > 1 ? r.path : r.name, 120));
}

// Builds the report from runs already read: [{ path, name, files: [{ file, size, text, reason }], links, skipped,
// special, otherFiles }]. options: inputs (the paths shown), labels, commits, slow, regress, top, failOn, version, limits.
export function checkRuns(read, options = {}) {
  const limits = { ...LIMITS, ...(options.limits ?? {}) };
  const failOn = options.failOn ?? 'error';
  const settings = { slow: options.slow ?? DEFAULTS.slow, regress: options.regress ?? DEFAULTS.regress, top: options.top ?? DEFAULTS.top, regressFloor: DEFAULTS.regressFloor };
  const labels = runLabels(read, options.labels);
  const commits = options.commits ?? [];
  const unreadable = [];
  const notes = [];
  const runs = read.map((run, r) => {
    const cases = [];
    const suites = [];
    let bad = 0;
    for (const f of run.files) {
      let reason = f.reason;
      if (reason === null) {
        try {
          const doc = parseXml(f.text, limits);
          const result = readJunit(doc, f.file);
          cases.push(...result.cases);
          suites.push(...result.suites);
          for (const n of result.notes) notes.push(`${safeText(f.file, 200)}: ${n}`);
        } catch (error) {
          reason = xmlProblem(error, f.text);
        }
      }
      if (reason !== null) {
        bad += 1;
        unreadable.push({ run: labels[r], file: safeText(f.file, 400), reason: safeText(reason, 400) });
      }
    }
    if (run.links?.length) notes.push(`${labels[r]}: ${plural(run.links.length, 'symbolic link')} ${run.links.length === 1 ? 'was' : 'were'} not followed: ${listText(run.links.map((l) => safeText(l, 160)), 5)}`);
    if (run.skipped?.length) notes.push(`${labels[r]}: ${plural(run.skipped.length, 'folder')} of tools or caches ${run.skipped.length === 1 ? 'was' : 'were'} not entered: ${listText(run.skipped.map((l) => safeText(l, 160)), 5)}`);
    if (run.special?.length) notes.push(`${labels[r]}: ${plural(run.special.length, 'entry', 'entries')} ${run.special.length === 1 ? 'is' : 'are'} not a regular file or folder, or could not be read: ${listText(run.special.map((u) => `${safeText(u.path, 160)} (${safeText(u.reason, 80)})`), 5)}`);
    const commit = commits[r] && commits[r] !== '-' ? safeText(commits[r], 80) : null;
    return { label: labels[r], commit, path: safeText(run.path, 400), cases, suites, files: run.files.length, unreadable: bad, otherFiles: run.otherFiles ?? 0 };
  });

  const { findings: all, runStats, tests, suites } = analyse(runs, settings);

  // Order, and the cap per kind.
  const runIndex = Object.fromEntries(runs.map((r, i) => [r.label, i]));
  all.sort((a, b) => AREA_ORDER[a.area] - AREA_ORDER[b.area] || ORDER[a.id] - ORDER[b.id] || (a.test < b.test ? -1 : a.test > b.test ? 1 : 0) || (runIndex[a.run] ?? -1) - (runIndex[b.run] ?? -1));
  const omitted = {};
  const findings = [];
  const perId = {};
  for (const f of all) {
    perId[f.id] = (perId[f.id] ?? 0) + 1;
    if (perId[f.id] <= limits.maxListedPerFinding) findings.push(f);
    else omitted[f.id] = (omitted[f.id] ?? 0) + 1;
  }

  const allNotes = [];
  for (const u of unreadable) allNotes.push(`unreadable-file: ${u.file} (${u.run}): ${u.reason}`);
  allNotes.push(...notes);
  if (runs.length === 1) allNotes.push('only one run was given: a test that passes and fails across runs, a duration regression and a test skipped in every run need more runs to be seen');
  else if (runs.length === 2) allNotes.push('two runs were given: a duration regression needs at least three timed runs of a test to be seen');
  const other = runs.reduce((n, r) => n + r.otherFiles, 0);
  if (other) allNotes.push(`${plural(other, 'file')} not ending in .xml ${other === 1 ? 'was' : 'were'} not read`);
  for (const [id, n] of Object.entries(omitted)) allNotes.push(`${grouped(n)} more findings of ${id} are counted but not listed`);

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  for (const [id, n] of Object.entries(omitted)) counts[BY_ID_SEVERITY[id]] += n;

  const areas = AREAS.map((a) => {
    const own = findings.filter((f) => f.area === a.id);
    const worst = own.length ? own.reduce((w, f) => (RANK[f.severity] < RANK[w] ? f.severity : w), 'info') : null;
    const result = worst === 'error' ? 'fail' : worst === 'warning' ? 'warn' : worst === 'info' ? 'info' : 'pass';
    const detail = own.length ? [...new Set(own.map((f) => f.id))].map((id) => `${id} x${own.filter((f) => f.id === id).length + (omitted[id] ?? 0)}`).join(', ') : 'no finding';
    return { id: a.id, title: a.title, result, detail: safeText(detail, 400), findings: own.length };
  });

  const eCount = meetsThreshold('error', failOn) ? counts.error : 0;
  const wCount = meetsThreshold('warning', failOn) ? counts.warning : 0;
  const reason = [eCount ? plural(eCount, 'error') : null, wCount ? plural(wCount, 'warning') : null].filter(Boolean).join(', ');
  const files = runs.reduce((n, r) => n + r.files, 0);

  return {
    tool: 'junit-flaky-check',
    version: options.version ?? '0.0.0',
    inputs: (options.inputs ?? ['.']).map((p) => safeText(p, 300)),
    settings: { slow: settings.slow, regress: settings.regress, top: settings.top },
    totals: { runs: runs.length, files, read: files - unreadable.length, notRead: unreadable.length, tests, suites },
    runs: runs.map((r, i) => ({ label: r.label, commit: r.commit, path: r.path, files: r.files, read: r.files - r.unreadable, notRead: r.unreadable, ...runStats[i], failureRate: percent(runStats[i].failureRate) })),
    areas,
    findings,
    unreadable,
    notes: allNotes.map((n) => safeText(n, 1200)),
    counts,
    gate: { failOn, pass: eCount + wCount === 0, reason }
  };
}

// Reads the runs (a folder or a file each, or the subfolders of runsIn) and builds the report. The paths in the report
// are relative to base, with forward slashes.
export async function checkPaths(paths, options = {}) {
  const base = options.base ?? process.cwd();
  const limits = { ...LIMITS, ...(options.limits ?? {}) };
  const folder = options.runsIn ? await runFolders(options.runsIn, base, limits) : null;
  const runPaths = folder ? folder.paths : paths;
  if (options.labels?.length && options.labels.length !== runPaths.length) throw new Error(`${options.labels.length} --run labels for ${plural(runPaths.length, 'run')}; give one label per run, in order`);
  if (options.commits?.length && options.commits.length !== runPaths.length) throw new Error(`${options.commits.length} --commit values for ${plural(runPaths.length, 'run')}; give one commit per run, in order (- for unknown)`);
  const read = await readRuns(runPaths, base, limits);
  return checkRuns(read, { ...options, limits, inputs: folder ? [folder.shown] : read.map((r) => r.path) });
}
