# Method

The tool reads the JUnit XML results of several CI runs, lines up every test across the runs, and runs the checks below. Every check says what it reports, why it has the severity it has, what it can see and what it cannot, and the sentence of a saved page that it rests on. The pages are saved in [research/sources](../research/sources), and a test compares every quoted sentence with the saved text. Where the tool makes a choice that the pages do not state (a severity, a limit, a rule for a retry), the text says so.

The question behind the flaky checks is the one Martin Fowler puts in his article on non-deterministic tests: "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment." The result files of a few runs show the first half of that sentence: the same test passing in one place and failing in another. The tool cannot see the second half, the code and the environment, so it asks for help: a retry inside one run, or `--commit` for runs of the same code. Nothing is run: not a test, not a build, and nothing named in a file is fetched.

## What is read

[inputs.md](inputs.md) lists the inputs, the XML reader and the limits. In short: each run is a folder or a file; each XML file is read by the tool's own strict reader, which refuses a DOCTYPE and expands no entity; and from each `testcase` the tool takes its class name, name, time, result, Surefire retries and whether it wrote output.

### The outcome of a test in one run

A test can appear more than once in one run: a runner that retries a failed test (pytest-rerunfailures, the retries of Playwright, the Gradle test retry plugin) often writes every attempt as its own `testcase`. So the tool first sums up each test in each run:

- **flaky**: it both passed and failed (failure or error) in the run, or it passed with Surefire `flakyFailure` or `flakyError` elements, which Surefire writes for the attempts that failed before a retry passed. The Surefire page says of such a test: "Then this test will be counted as a flaky test."
- **failed** or **error**: every attempt failed, with at least one failure, or only errors. A test with Surefire `rerunFailure` elements failed on every retry, and is failed.
- **passed**: it passed and never failed. A skip next to a pass counts as passed.
- **skipped**: every attempt was skipped.

Its time in the run is the longest time of its attempts; Surefire writes one time for a test with retries, which is, in its words, "In the xml report, the running time of a flaky test will be the running time of the last successful run." A missing time is left out.

The failure rate of a run is the number of tests that failed or had an error, divided by the number of tests that ran (all but the skipped ones). A flaky test counts as one that ran and did not fail.

## Runs

### `summary` (info)

One finding for the whole report: the number of runs, the number of distinct tests and suites, and for each run its commit, its tests, the counts of passed, failed, error, skipped and flaky tests, and its failure rate. The trend compares the failure rate of the first run with that of the last: up, down or the same. It is always there, so a report says what it rests on, and it never fails a run. The basis is the pytest page on result files, "To create result files which can be read by Jenkins or other Continuous integration servers, use this invocation:", and the line of the Surefire schema that lets a suite hold its testcases, `<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">`.

### `empty-run` (error)

A run with no test result at all: its path holds no XML file, none of its files could be read, or its files hold no testcase. It is an error: a test step that did not run, or wrote its results somewhere else, must not look like a clean run. Fowler gives the reason a suite matters: "An automated regression suite can play a vital role on a software project, valuable both for reducing defects in production and essential for evolutionary design." The Surefire schema makes the count of tests a required attribute of a suite, `<xs:attribute name="tests" type="xs:string" use="required"/>`; the tool counts the testcases it read and does not trust that attribute.

## Flaky and failing

### `flaky-test` (error)

A test that is flaky by evidence the tool can trust:

- its outcome is flaky in at least one run (it failed and passed within the run, as described above), or
- two runs with the same `--commit` value disagree: it failed in one and passed (or was flaky) in the other.

The message says which evidence applies, and the history shows the outcome in every run. Fowler: "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment." Within one run the code is the same by definition, and runs of one commit share the code. Surefire counts a test that passes on a rerun as flaky. It is an error, because a flaky test that goes on passing the gate teaches people to rerun red builds without reading them: "Left uncontrolled, non-deterministic tests can completely destroy the value of an automated regression suite." Surefire offers the same choice as an option: "This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing." The tool cannot see whether the environment changed between two runs of one commit; a test that fails because a service it calls was down is still reported, and that is usually right.

### `flaky-suspect` (warning)

A test that passed in at least one run and failed in another, when no two of those runs are known to be of the same commit, and it is not a `flaky-test`. Without `--commit` the tool cannot tell a test that is flaky from one that a change broke or fixed, so it is a warning. The message says why: no commits were given, some runs have none, or the runs that disagree are of different commits, so "a code change may explain it". Fowler: "Such tests fail, then you re-run them and they pass." The fix is to give the commits, or to rerun the test on one commit. A test that passed in the old runs and fails in all the new ones is often a real break, not a flaky test; the history shows that pattern.

### `always-failing` (error)

A test that failed or had an error in every run where it ran, at least once. Runs where it was skipped or absent are left out, and the message says so. It is an error: Fowler, "When a regression test goes red, you know you've got an immediate problem, often because a bug has crept into the system without you realizing." and "Once you start ignoring a regression test failure, then that test is useless and you might as well throw it away." With one run, every failing test is reported here, and the message says it was the only run. The message quotes the last failure message, cut to 160 characters.

## Time

The time of a test is the `time` attribute of its testcase, in seconds. The pytest page notes: "JUnit XML specification seems to indicate that "time" attribute should report total test execution times, including setup and teardown (1, 2)." Different runners measure it differently, so the tool compares a test only with itself and with a fixed limit, never one runner with another. The Surefire schema has it as `<xs:attribute name="time" type="xs:float" use="required"/>`.

### `slow-test` (warning)

A test whose median time, across the runs where it ran and has a time, is above the slow limit: 10 seconds, or `--slow`. The median, not the slowest run, so that one slow run is left to `duration-regression`. The message gives the median, the number of runs and the slowest run. It is a warning: a slow test is not wrong, but it makes every run slower and is often close to a timeout. The limit is the tool's own default.

### `duration-regression` (warning)

A test that took more than `--regress` times (2) its median time in one run, with at least three timed runs and a slowest time of at least half a second. Three runs, so that the median means something; half a second, so that a test of 10 milliseconds that took 30 is not reported. Both are the tool's own choices. One finding per test, at its slowest run. It is a warning: one slow run can be a busy machine, but it can also be a wait that ran to its timeout or a retry inside the test.

### `slowest-tests` (info)

The slowest tests by median time, at most `--top` (5), always listed when any test has a time. It never fails a run; it shows where the time of the suite goes.

### `slowest-suites` (info)

The slowest suites by median time across the runs, at most `--top` (5). The time of a suite is its `time` attribute, `<xs:attribute name="time" type="xs:float"/>` in the Surefire schema, or the sum of the times of its testcases when it has none; suites of the same name in one run are added up. It never fails a run.

## Hygiene

### `skipped-too-long` (warning)

A test that appears in every run and was skipped in every one, with at least two runs. Fowler warns about tests that are put aside: "A danger here is that tests keep getting thrown into quarantine and forgotten, which means your bug detection system is eroding." A skipped test is the same: it checks nothing, and nobody looks at it. The schema element is `<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">`. It is a warning, because a skip can be right for a while; the tool cannot see why it was skipped, or since when.

### `duplicate-test-name` (warning)

The same class name and name more than once in one run, when the results do not include both a pass and a failure (that case is a retry, and a `flaky-test`). Two tests that share a name cannot be told apart across runs: a flaky one hides behind a stable one. The Surefire schema names a test by `<xs:attribute name="name" type="xs:string" use="required"/>` and `<xs:attribute name="classname" type="xs:string"/>`. It is a warning: the copies may be retries that all ended the same way, which the message says.

### `no-assertions-signal` (info)

A test that passed with a time of exactly 0 and wrote no output (`<xs:element name="system-out" type="xs:string" minOccurs="0"/>` and its sibling `system-err`) in every run where it appears. This is a weak hint that the test may check nothing, such as a test body that was commented out. Many fast tests also report a time of 0, because the runner rounds, so it is info and never fails a run. A missing time does not count as 0. The tool cannot see the code, and docs/limits.md says so.

## Notes

### `unreadable-file` (note)

An XML file that could not be read: not well-formed, a DOCTYPE, an entity that is not one of the five predefined ones, an encoding other than UTF-8, UTF-16, binary data, over the size limit, or a root that is not `testsuites` or `testsuite`. The note names the file, the run, and the line and column of the problem. The pytest page warns that "However, some parsers are quite strict about the elements and attributes that are allowed." The reader of this tool is strict about entities and DTDs on purpose: XML 1.0 says that "The document type declaration MUST appear before the first element in the document.", and a result file has no need of one. A note never fails a run. A run whose files are all unreadable has no results, and that is an `empty-run`, which does.
