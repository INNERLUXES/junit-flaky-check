# Changes

## 1.0.0

First release.

- Reads the JUnit XML results of several CI runs: a folder or a file per run, in the order given, or every subfolder of one folder with `--runs-in`, in natural name order. Walks a folder with `lstat` and never follows a symbolic link inside it. Never runs a test and opens no network connection.
- A small strict XML reader of its own: the XML declaration (version 1.x, UTF-8 or ASCII), elements, attributes, text, CDATA sections, comments and processing instructions, in one pass. A DOCTYPE is refused with a clear reason, so no DTD is read, no external entity is fetched and no entity is expanded; only the five predefined entities and numeric references are read. A file that is not well-formed is named in a note with the line and column of the problem.
- Reads the shape that JUnit, Maven Surefire, Gradle, pytest, the Jest and Vitest reporters, Playwright and go-junit-report write: testsuites and testsuite (nested or not), testcase with name, classname and time, failure, error, skipped, system-out and system-err, and the flakyFailure, flakyError, rerunFailure and rerunError of Surefire retries.
- Runs: a summary of the runs, the tests and the counts and failure rate of each run with its trend (`summary`, info); a run with no result (`empty-run`).
- Flaky and failing: a test that passed and failed within one run or on one commit (`flaky-test`); one that passed and failed across runs with no proof of the same code (`flaky-suspect`, warning); one that failed every time it ran (`always-failing`). `--commit` names the commit of each run.
- Time: a median time above `--slow` (`slow-test`, warning); one run more than `--regress` times the median (`duration-regression`, warning); the slowest tests and suites (`slowest-tests`, `slowest-suites`, info).
- Hygiene: a test skipped in every run (`skipped-too-long`, warning); the same name twice in one run (`duplicate-test-name`, warning); a time of 0 and no output in every run (`no-assertions-signal`, info). A file that cannot be read is a note (`unreadable-file`) and never fails the run.
- Every finding has an id, a severity (error, warning, info), the test, the file and line, the history across runs, a message, a fix, and the sentence of the page it rests on, with the address.
- Every quoted sentence comes from Martin Fowler's article on non-deterministic tests, the Maven Surefire pages on reruns and on the report schema, the pytest page on JUnit XML and W3C XML 1.0, saved in `research/sources`; a test compares `src/data.js` and the documents with the saved text.
- Reports as text, Markdown, JSON and CSV; `--fail-on` for a pipeline gate; info never fails the run; exit code `2` for a usage or input error.
- Safe input: no link inside a folder is followed, at most 1,000 runs, 50,000 entries, 32 levels of folders and 10,000 XML files, files up to 32 MB and 512 MB in all, binary and UTF-16 files are not read, elements nested at most 256 deep, 500,000 elements per file, 256 attributes per element, and control characters removed from every text shown.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
