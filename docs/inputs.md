# Inputs

The tool takes the JUnit XML results of one or more CI runs. Each path on the command line is one run, in the order given: a folder of result files or one result file. With `--runs-in <folder>`, every subfolder of that folder is one run instead. The tool reads the files as text. It never runs a test, never fetches anything a file names, and never reads from standard input. A path named on the command line may itself be a symbolic link, because the person who runs the tool named it; inside a folder, no link is followed.

## The runs

- A folder is one run. It is walked with its subfolders, and every file in it that ends in `.xml` (in any case) is read, so a Gradle `build/test-results/test` folder or a Surefire `target/surefire-reports` folder works as it is. Other files (HTML reports, logs, screenshots) are counted and never opened.
- A file ending in `.xml` is a run of its own. Any other file named on the command line is refused with exit code `2`.
- `--runs-in <folder>` takes every subfolder of the folder as a run, in natural name order: `run-2` comes before `run-10`. Files directly in that folder, links and the folders of tools are left out. A folder with no subfolder is refused.
- The runs keep the order given. The order matters for the history in a finding and for the trend of the failure rate; give the oldest run first.
- A run is named by `--run <label>` (once per run, in order), or else by the name of its folder or file, or by its path when two runs have the same name.
- `--commit <id>` gives the commit each run tested, once per run, in order, with `-` for one that is not known. Two runs of the same commit whose results disagree make a test a `flaky-test`. The values are only compared with each other; the tool never looks them up.
- A path that does not exist, an argument that looks like an address (`https://...`), or a number of labels or commits that does not match the number of runs is refused with exit code `2`. A run whose path holds no XML file is not refused: it is an `empty-run`, so an empty run never passes a gate.

## The walk

- Every entry inside a folder is looked at with `lstat`. A symbolic link (or a Windows junction) is listed by its name and never followed, whether it points to a file, a folder, a device or back to a parent; a note lists every link.
- Folders of tools and caches are not entered: `.git`, `.hg`, `.svn`, `node_modules` and `.cache`. A note names the ones it met.
- An entry that is neither a file, a folder nor a link (a pipe, a socket, a device) is listed in a note and never opened.
- At most 1,000 runs, 50,000 files and folders in all, folders nested at most 32 deep, and 10,000 XML files. Past any limit the input is refused with exit code `2`, rather than read in part.

## Reading a file

- Each file is opened once, and its type and size are taken from the open file. A file over 32 MB is not read and is named in a note; all files read together may hold at most 512 MB, or the input is refused.
- A file that starts with the byte order mark of UTF-16 is not read, and neither is a file whose first 8,000 bytes hold a null byte; a note names them.
- Text is read as UTF-8, and a leading byte order mark is dropped. LF, CRLF and a lone CR all end a line, so a file written on Windows and one written on Linux give the same report, with the same lines.

## The XML reader

The tool has its own small XML reader, written for result files and nothing else. It reads the text once, from left to right, and stops at the first thing that is not well-formed:

- **The declaration.** An optional `<?xml ...?>` at the very start, with version 1.x. When it names an encoding, the encoding must be UTF-8 or ASCII; any other is refused, because the tool reads UTF-8 only.
- **Elements and attributes.** Start tags, end tags and empty tags. An attribute needs `=` and a value in double or single quotes; the same attribute twice on one element, a `<` inside a value, or an end tag that does not match its start tag is refused. Tabs and line breaks in a value are read as spaces, as XML says.
- **Text and CDATA.** Text between tags, and CDATA sections as they are written. Only the first 4,096 characters of the text of one element are kept, which is more than the checks need: they look at a failure message and at whether a test wrote any output.
- **Comments and processing instructions** are skipped.
- **References.** The five predefined entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and numeric references (`&#65;`, `&#x41;`) are decoded, once, each into one character. Any other `&name;` is refused: XML says that "All XML processors MUST recognize these entities whether they are declared or not.", and the tool recognizes nothing else. A numeric reference to a character that XML does not allow, such as `&#27;` that some runners write for the colors of a terminal, is read as the replacement character and counted in a note, rather than refused, so one bad character in a log does not hide a whole suite. XML 1.0 asks for more here: "Characters referred to using character references MUST match the production for Char."; the tool is lenient on this one point on purpose.
- **No DTD.** A `<!DOCTYPE` anywhere is refused with a clear reason. The standard explains what a DOCTYPE can do: "The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both." The tool wants neither, and no JUnit writer needs one, so a DTD is never read, no external entity is fetched, and no entity can expand into another. Any other `<!` that is not a comment or a CDATA section is refused too.
- **Limits.** Elements nested at most 256 deep, at most 500,000 elements and 256 attributes per element, and names of at most 256 characters. Past a limit the file is refused and named in a note.

A refused file is an `unreadable-file` note with the line and column of the problem. It never fails the run by itself, but a run whose files are all refused has no results and is an `empty-run`.

## The JUnit reader

From the tree of a file the tool takes:

- The root, which must be `testsuites` or `testsuite`; any other root is refused as an unreadable file.
- Every `testsuite`, nested or not, with its `name` and `time`. When a suite has no `time`, the times of its testcases are added up.
- Every `testcase` directly inside a `testsuite` or `testsuites`: its `name` (required; a testcase with no name is counted in a note and left out), its `classname` (or else the name of the nearest suite), its `time` in seconds (a comma as the decimal mark is read as a point; a missing time, or one that is not a number, is left out of the time checks and counted in a note), and the line where it starts.
- Its result: `failure` makes it failed, else `error` makes it error, else `skipped` makes it skipped, else it passed. The `message` of the first failure or error, or the first line of its text, is kept for the message of a finding.
- The retries of Maven Surefire: `flakyFailure` and `flakyError` mean that it failed and then passed on a retry; `rerunFailure` and `rerunError` mean that every retry failed too.
- Whether it wrote any output: a `system-out` or `system-err` of the testcase with text other than white space.

The identity of a test is its class name and its name together. The same identity twice in one run is either a retry (when the results differ) or a duplicate (when they do not); docs/method.md has the rule. Other attributes, such as `timestamp`, `hostname`, `file`, `line` and `assertions`, and the `properties` of a suite, are read by the reader and not used.
