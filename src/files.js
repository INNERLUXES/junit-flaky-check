// Reading the input: one folder or one file per CI run. A folder is walked with lstat, so a symbolic link (or a Windows
// junction) inside it is listed and never followed: a link cannot lead the tool out of the folder or round in a loop.
// Only files ending in .xml are read, each one only when it is a regular file under the size limit, with the size taken
// from the open file.

import { lstat, open, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { SKIP_FOLDERS, isXmlName } from './data.js';

export const FILE_LIMITS = {
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntries: 50000,
  maxDepth: 32,
  maxXmlFiles: 10000,
  maxRuns: 1000
};

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The whole file, or an error when it is not a regular file or is over the limit. The file is opened once and its type
// and size are taken from the open handle, so a file swapped for a link or a pipe after the walk is refused.
export async function readBounded(path, maxBytes = FILE_LIMITS.maxFileBytes) {
  let handle;
  try {
    handle = await open(resolve(path), 'r');
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown
// absolute, also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// A file holds binary data when its first 8,000 bytes hold a null byte.
export const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

// UTF-8 text without a leading byte order mark. A file that starts with the byte order mark of UTF-16 is refused with a
// reason, because the tool reads UTF-8 only.
export function decodeText(buffer) {
  if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) throw fileError('file', 'is UTF-16; only UTF-8 is read');
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Folder names in natural order: run-2 before run-10.
export function naturalCompare(a, b) {
  const pa = a.match(/\d+|\D+/g) ?? [];
  const pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      const sx = x.replace(/^0+/, '');
      const sy = y.replace(/^0+/, '');
      if (sx.length !== sy.length) return sx.length < sy.length ? -1 : 1;
      if (sx !== sy) return sx < sy ? -1 : 1;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length || (a < b ? -1 : a > b ? 1 : 0);
}

// Reads one file that was named or found, into { file, size, text, reason }.
async function readOne(full, shown, size, limits, budget) {
  const file = { file: shown, size, text: null, reason: null };
  if (size > limits.maxFileBytes) {
    file.reason = `${size.toLocaleString('en-US')} bytes is over the ${megabytes(limits.maxFileBytes)} limit`;
    return file;
  }
  if (budget.total + size > limits.maxTotalBytes) throw fileError(shown, `the XML files to read hold more than ${megabytes(limits.maxTotalBytes)}`);
  try {
    const buffer = await readBounded(full, limits.maxFileBytes);
    budget.total += buffer.length;
    if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) file.reason = 'is UTF-16; only UTF-8 is read';
    else if (isBinary(buffer)) file.reason = 'holds binary data (a null byte)';
    else file.text = decodeText(buffer);
  } catch (error) {
    file.reason = error.reason ?? error.message;
  }
  return file;
}

// Walks the folder of one run: the XML files with their text, the symbolic links that were not followed, the folders
// that were skipped and the entries that are neither files nor folders. More entries, more depth, more XML files or
// more bytes than the limits is an error: the input is refused rather than half read.
async function walkFolder(full, shown, limits, budget, out) {
  const pending = [{ dir: full, rel: '', depth: 0 }];
  while (pending.length) {
    const { dir, rel, depth } = pending.pop();
    let names;
    try {
      names = (await readdir(dir)).sort();
    } catch (error) {
      out.special.push({ path: rel ? `${shown}/${rel}` : shown, reason: `folder cannot be read (${error.code ?? error.message})` });
      continue;
    }
    const folders = [];
    for (const name of names) {
      budget.entries += 1;
      if (budget.entries > limits.maxEntries) throw fileError(shown, `the runs hold more than ${limits.maxEntries.toLocaleString('en-US')} files and folders; give the result folders of the runs only`);
      const childRel = rel ? `${rel}/${name}` : name;
      const childShown = shown === '.' ? childRel : `${shown}/${childRel}`;
      const child = resolve(dir, name);
      let st;
      try {
        st = await lstat(child);
      } catch (error) {
        out.special.push({ path: childShown, reason: `cannot be read (${error.code ?? error.message})` });
        continue;
      }
      if (st.isSymbolicLink()) out.links.push(childShown);
      else if (st.isDirectory()) {
        if (SKIP_FOLDERS.includes(name)) {
          out.skipped.push(childShown);
          continue;
        }
        if (depth + 1 > limits.maxDepth) throw fileError(shown, `has folders nested more than ${limits.maxDepth} deep (${childRel.slice(0, 120)}...)`);
        folders.push({ dir: child, rel: childRel, depth: depth + 1 });
      } else if (st.isFile()) {
        if (!isXmlName(name)) {
          out.otherFiles += 1;
          continue;
        }
        budget.xml += 1;
        if (budget.xml > limits.maxXmlFiles) throw fileError(shown, `the runs hold more than ${limits.maxXmlFiles.toLocaleString('en-US')} XML files`);
        out.files.push(await readOne(child, childShown, st.size, limits, budget));
      } else out.special.push({ path: childShown, reason: 'not a regular file or folder' });
    }
    // Folders are walked in name order: the last pushed is taken first.
    for (const f of folders.reverse()) pending.push(f);
  }
}

// Reads the files of one run from a folder or one file. A path named on the command line may itself be a symbolic link,
// because the person who runs the tool named it; inside a folder no link is followed.
async function readRun(path, base, limits, budget) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  const out = { path: shown, name: basename(full), files: [], links: [], skipped: [], special: [], otherFiles: 0 };
  let info;
  try {
    info = await stat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such file or folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (info.isDirectory()) await walkFolder(full, shown, limits, budget, out);
  else if (info.isFile()) {
    if (!isXmlName(full)) throw fileError(shown, 'not an XML file; give files ending in .xml, or a folder of them');
    budget.xml += 1;
    if (budget.xml > limits.maxXmlFiles) throw fileError(shown, `more than ${limits.maxXmlFiles.toLocaleString('en-US')} XML files`);
    out.files.push(await readOne(full, shown, info.size, limits, budget));
  } else throw fileError(shown, 'not a file or a folder');
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  out.files.sort((a, b) => order(a.file, b.file));
  out.links.sort(order);
  out.skipped.sort(order);
  return out;
}

// Reads every run, in the order given. Each path is one run: a folder of JUnit XML files or one file.
export async function readRuns(paths, base = process.cwd(), limits = FILE_LIMITS) {
  if (paths.length > limits.maxRuns) throw fileError(`${paths.length} runs`, `more than ${limits.maxRuns.toLocaleString('en-US')} runs`);
  const budget = { total: 0, entries: 0, xml: 0 };
  const runs = [];
  for (const path of paths) runs.push(await readRun(path, base, limits, budget));
  return runs;
}

// The subfolders of a folder, one per run, in natural name order (run-2 before run-10). The folders of tools and
// caches, and symbolic links, are left out. Returns { shown, paths }.
export async function runFolders(folder, base = process.cwd(), limits = FILE_LIMITS) {
  const full = resolve(base, folder);
  const shown = displayPath(full, base);
  let info;
  try {
    info = await stat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (!info.isDirectory()) throw fileError(shown, 'not a folder; --runs-in takes a folder with one subfolder per run');
  const names = await readdir(full);
  if (names.length > limits.maxEntries) throw fileError(shown, `holds more than ${limits.maxEntries.toLocaleString('en-US')} entries`);
  const runs = [];
  for (const name of names) {
    if (SKIP_FOLDERS.includes(name)) continue;
    const st = await lstat(resolve(full, name));
    if (st.isDirectory()) runs.push(name);
  }
  if (!runs.length) throw fileError(shown, 'holds no subfolder; --runs-in takes a folder with one subfolder per run');
  return { shown, paths: runs.sort(naturalCompare).map((n) => (shown === '.' ? n : `${shown}/${n}`)) };
}
