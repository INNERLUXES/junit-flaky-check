# junit-flaky-check

Reads the JUnit XML test results of several CI runs and reports the health of the test suite across them. You give it one folder of result files per run (or one file per run), in order, and it lines up every test across the runs. It reports flaky tests that passed and failed on the same commit or within the retries of one run, tests that fail every time, slow tests and the slowest suites, tests that suddenly got much slower than their median, tests skipped in every run, tests with a time of 0 and no output, the same test name twice in one run, and runs with no results at all. Every finding names the test, the file and the line, shows the result of the test in each run, and gives a sentence on how to fix it and the sentence of the page that it rests on, with its address.

A flaky test does its harm quietly. It fails, somebody presses rerun, it passes, and the build goes green. After a few weeks the team reruns every red build without reading it, and a real failure slips through with the rest. The evidence is already in the result files that every CI job writes: the same test passing in one run and failing in the next, or failing and then passing within one run because the runner retried it. This tool reads those files from the last few runs, in a second, and names the tests that cannot be trusted, before people stop looking at red builds.

- Every finding has an id, a severity (error, warning or info), the test, the file with its line, the result in each run, a plain message, a fix, and the quoted sentence of the page it rests on, with the address of the saved page.
- Nothing runs. The results are read with the tool's own small, strict XML reader: no test is run, no DTD is read, no entity is expanded beyond the five that XML predefines and numeric references, a file with a DOCTYPE is refused with a clear note, and no symbolic link inside a folder is followed. [docs/limits.md](docs/limits.md) says what reading results cannot show, starting with the main thing: the tool cannot see the code, and it cannot prove that a test is flaky without enough runs.
- Every quoted sentence comes from Martin Fowler's article on non-deterministic tests, the Maven Surefire documentation and schema, the pytest documentation or W3C XML 1.0, saved in [research/sources](research/sources); a test compares [src/data.js](src/data.js) and the documents with the saved text.
- Reports as text, Markdown, JSON and CSV, with an exit code for a pipeline gate. Info findings never fail the run.
- Plain JavaScript, no dependencies; the same files always give the same report, with LF or CRLF line ends.

```
npm test
```

```
tests 109
pass 105
fail 0
skipped 4
```

These are the summary lines that `npm test` prints at the end. The skipped tests are the ones that need a system other than Windows: a link out of the run folder and in a loop, a run folder named through a link, a link to a device, and a file name with a control character. They are guarded with `process.platform`, and run on Linux and macOS.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/junit-flaky-check.git
cd junit-flaky-check
node bin/junit-flaky-check.js --runs-in examples/runs-broken
```

Or without a clone, on the result folders of your last runs:

```
npx --yes github:INNERLUXES/junit-flaky-check results/run-1 results/run-2 results/run-3
```

`examples/` holds the made-up test results of the checkout service of a small shop, four CI runs each. `examples/runs-broken/` is wrong on purpose. The card authorisation test failed and then passed on a retry in run 2, and Surefire wrote the failed attempt as a `flakyFailure`. The payment capture test timed out in run 3 only. The discount code test fails in every run, the refund test takes about 14 seconds, the receipt email test took about four times its usual time in run 4, the shipping test for remote areas is skipped in every run, one cart test appears twice in run 3, and another cart test reports a time of 0 and no output every time. Run 4 also holds an old result file with a DOCTYPE, which the reader refuses. `examples/runs-fixed/` is the same service repaired; it passes at the strictest level.

## Usage

```
node bin/junit-flaky-check.js --runs-in examples/runs-broken --commit a1f3c9e --commit a1f3c9e --commit b7d2e40 --commit c5e8a13 --fail-on warning
```

Runs 1 and 2 tested the same commit; runs 3 and 4 each tested a new one. The report starts with what was read, each run, and the result of each area:

```
junit-flaky-check: examples/runs-broken
runs: 4 runs, 9 XML files, 8 read, 1 not read, 9 distinct tests in 2 suites
  run-1  commit a1f3c9e     2 files read  9 tests: 7 passed, 1 failed, 0 errors, 1 skipped, 0 flaky  failure rate 12.5%
  run-2  commit a1f3c9e     2 files read  9 tests: 6 passed, 1 failed, 0 errors, 1 skipped, 1 flaky  failure rate 12.5%
  run-3  commit b7d2e40     2 files read  9 tests: 6 passed, 1 failed, 1 error, 1 skipped, 0 flaky  failure rate 25.0%
  run-4  commit c5e8a13     2 files read  9 tests: 7 passed, 1 failed, 0 errors, 1 skipped, 0 flaky  failure rate 12.5%
settings: slow above 10 s, regression above 2 times the median, top 5
areas:
  Runs               info  summary x1
  Flaky and failing  fail  flaky-test x1, flaky-suspect x1, always-failing x1
  Time               warn  slow-test x1, duration-regression x1, slowest-tests x1, slowest-suites x1
  Hygiene            warn  skipped-too-long x1, duplicate-test-name x1, no-assertions-signal x1
findings: 2 error, 5 warning, 4 info
```

Then every finding follows, grouped by area. One of them:

```
  ERROR    flaky-test  shop.checkout.PaymentTest > authorisesCard
           at: examples/runs-broken/run-2/TEST-shop.checkout.PaymentTest.xml:6
           history: run-1 passed, run-2 flaky, run-3 passed, run-4 passed
           shop.checkout.PaymentTest > authorisesCard is flaky: the same test, on the same code, both passed and failed. It failed and then passed within one run (run-2): the report holds the failed attempts as flakyFailure or flakyError, which Surefire writes when a retry passes.
           basis: "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment." (Eradicating Non-Determinism in Tests, https://martinfowler.com/articles/nonDeterminism.html)
           basis: "Then this test will be counted as a flaky test." (Output flaky re-run information on the screen, https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html)
           fix: Treat it as a failing test, not a passing one: find the cause (state shared between tests, waits and timing, test order, the clock, a remote service), fix it, or move it out of the main suite until it is fixed. A retry hides the problem; it does not fix it.
```

The whole report is in [examples/output/runs-broken.txt](examples/output/runs-broken.txt). It ends with a note about the refused file and `GATE: FAIL - 2 errors, 5 warnings`, and the exit code is `1`: errors fail the run by default, and the warnings fail it too here, because of `--fail-on warning`. The `info` findings (the summary, the slowest tests and suites, and the test with no time and no output) and the note never fail a run.

The repaired service passes, also with `--fail-on warning`:

```
node bin/junit-flaky-check.js --runs-in examples/runs-fixed --commit a1f3c9e --commit a1f3c9e --commit b7d2e40 --commit c5e8a13 --fail-on warning
```

```
junit-flaky-check: examples/runs-fixed
runs: 4 runs, 8 XML files, 8 read, 0 not read, 9 distinct tests in 2 suites
  run-1  commit a1f3c9e     2 files read  9 tests: 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky  failure rate 0.0%
  run-2  commit a1f3c9e     2 files read  9 tests: 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky  failure rate 0.0%
  run-3  commit b7d2e40     2 files read  9 tests: 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky  failure rate 0.0%
  run-4  commit c5e8a13     2 files read  9 tests: 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky  failure rate 0.0%
settings: slow above 10 s, regression above 2 times the median, top 5
areas:
  Runs               info  summary x1
  Flaky and failing  pass  no finding
  Time               info  slowest-tests x1, slowest-suites x1
  Hygiene            pass  no finding
findings: 0 error, 0 warning, 3 info

Runs (1 finding)

  INFO     summary
           history: run-1 0.0%, run-2 0.0%, run-3 0.0%, run-4 0.0%
           4 runs, 9 distinct tests in 2 suites. run-1 (commit a1f3c9e): 9 tests, 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky, failure rate 0.0%; run-2 (commit a1f3c9e): 9 tests, 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky, failure rate 0.0%; run-3 (commit b7d2e40): 9 tests, 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky, failure rate 0.0%; run-4 (commit c5e8a13): 9 tests, 9 passed, 0 failed, 0 errors, 0 skipped, 0 flaky, failure rate 0.0%. The failure rate is the same in the first and the last run (0.0%).
           basis: "To create result files which can be read by Jenkins or other Continuous integration servers, use this invocation:" (Creating JUnitXML format files, https://docs.pytest.org/en/stable/how-to/output.html#creating-junitxml-format-files)
           basis: "<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">" (testsuite, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)
           fix: Nothing to fix; this is what the tool read. A clean report means none of the checks found anything in these runs, not that the tests are good.

Time (2 findings)

  INFO     slowest-tests
           history: 1. shop.checkout.PaymentTest > refundsOrder 2.25 s, 2. shop.checkout.PaymentTest > authorisesCard 1.25 s, 3. shop.checkout.PaymentTest > sendsReceiptEmail 0.835 s, 4. shop.checkout.PaymentTest > capturesPayment 0.61 s, 5. shop.checkout.CartTest > calculatesShippingForRemoteArea 0.06 s
           The 5 slowest tests by median time across the runs: shop.checkout.PaymentTest > refundsOrder (2.25 s, 4 runs); shop.checkout.PaymentTest > authorisesCard (1.25 s, 4 runs); shop.checkout.PaymentTest > sendsReceiptEmail (0.835 s, 4 runs); shop.checkout.PaymentTest > capturesPayment (0.61 s, 4 runs); shop.checkout.CartTest > calculatesShippingForRemoteArea (0.06 s, 4 runs).
           basis: "<xs:attribute name="time" type="xs:float" use="required"/>" (testcase, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)
           fix: Nothing to fix; the list shows where the time of the suite goes.

  INFO     slowest-suites
           history: 1. shop.checkout.PaymentTest 4.965 s, 2. shop.checkout.CartTest 0.192 s
           The 2 slowest suites by median time across the runs: shop.checkout.PaymentTest (4.965 s); shop.checkout.CartTest (0.192 s).
           basis: "<xs:attribute name="time" type="xs:float"/>" (testsuite, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)
           fix: Nothing to fix; the list shows where the time of the suite goes.

GATE: PASS (--fail-on warning)
```

The discount test passes, the shipping test runs again, the refund test fakes its slow service, the authorisation and capture tests wait for the card service properly, and the duplicate is gone. Passing means that none of the checks found anything in these runs. It does not mean that the tests are good: a test that checks nothing passes every time.

```
junit-flaky-check <run folder or file>... [options]
junit-flaky-check --runs-in <folder> [options]
```

```
--runs-in <folder>  every subfolder of the folder is one run, in natural name order (run-2 before run-10)
--run <label>       a name for each run, in order; give it once per run
--commit <id>       the commit each run tested, in order; give it once per run, - for unknown
--slow <seconds>    a test whose median time is above this is slow (default: 10)
--regress <factor>  a test that takes more than this times its median in one run has regressed (default: 2)
--top <n>           how many of the slowest tests and suites to list (default: 5)
--format <name>     text, markdown, json or csv (default: text)
--fail-on <level>   exit with 1 when a finding is at this level or above: error or warning
                    (default: error); info never fails the run
--help              show the usage
--version           show the version
```

Each path is one run, in the order given: a folder of JUnit XML files (read with its subfolders, so a Gradle `build/test-results` folder works as it is) or one XML file. Without `--commit` the tool cannot know whether the code changed between two runs, so a test that passed in one run and failed in another is a `flaky-suspect` (warning). With `--commit`, two runs of the same commit that disagree make it a `flaky-test` (error). Paths in the report are relative to the folder you run the command in, with forward slashes on every system.

## What is read

[docs/inputs.md](docs/inputs.md) has the details. Folders are walked without following links, and only files ending in `.xml` are read; other files are counted and never opened.

| Part of the file | What the tool takes from it |
| --- | --- |
| `testsuites` and `testsuite` | the root, the name and the `time` of each suite; suites may nest |
| `testcase` | `name`, `classname` (or the name of its suite), `time`, and the line where it starts |
| `failure`, `error`, `skipped` | the result of the test, and the message of the first failure |
| `flakyFailure`, `flakyError`, `rerunFailure`, `rerunError` | the retries that Maven Surefire writes into one testcase |
| `system-out`, `system-err` | only whether the test wrote any output |
| a DOCTYPE, or an entity that is not predefined | refused: the file is named in a note and not read |

The format is written by JUnit, Maven Surefire, Gradle, pytest (`--junitxml`), the JUnit reporters of Jest and Vitest, Playwright and go-junit-report. Attributes the tool does not use, such as `timestamp`, `hostname` or `file`, are ignored.

## The checks

| Id | Severity | What it reports |
| --- | --- | --- |
| `flaky-test` | error | A test that passed and failed within one run (a retry), or in two runs of the same commit |
| `always-failing` | error | A test that failed in every run where it ran |
| `empty-run` | error | A run with no test result at all |
| `flaky-suspect` | warning | A test that passed in some runs and failed in others, with no proof that the code was the same |
| `slow-test` | warning | A median time above the slow limit (10 seconds) |
| `duration-regression` | warning | One run more than 2 times slower than the median of the test, with at least three timed runs |
| `skipped-too-long` | warning | A test skipped in every run, with at least two runs |
| `duplicate-test-name` | warning | The same class name and name more than once in one run, with the same result |
| `summary` | info | The runs, the tests, the counts of each run and the trend of the failure rate |
| `slowest-tests` | info | The slowest tests by median time |
| `slowest-suites` | info | The slowest suites by median time |
| `no-assertions-signal` | info | A test that passed with a time of 0 and no output in every run; a weak hint |
| `unreadable-file` | note | A file that could not be read; named in a note, never fails the run |

[docs/method.md](docs/method.md) gives each check, its exact rule, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with the saved page it comes from.

## Where the facts come from

| Fact | Source |
| --- | --- |
| What a non-deterministic test is, and why it ruins a suite | Martin Fowler, Eradicating Non-Determinism in Tests, https://martinfowler.com/articles/nonDeterminism.html |
| A test that passes on a retry is counted as flaky | Maven Surefire, Rerun Failing Tests, https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html |
| The elements and attributes of a test report | Maven Surefire, XML schema of the test report, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd |
| What the time attribute holds | pytest, Creating JUnitXML format files, https://docs.pytest.org/en/stable/how-to/output.html#creating-junitxml-format-files |
| The document type declaration | W3C XML 1.0, https://www.w3.org/TR/xml/#sec-prolog-dtd |
| Character and entity references | W3C XML 1.0, https://www.w3.org/TR/xml/#sec-references |
| The five predefined entities | W3C XML 1.0, https://www.w3.org/TR/xml/#sec-predefined-ent |

## Formats

- `text`: for a terminal: the input, the runs with their counts, the settings, the areas with their result, then the findings grouped by area, each with its id, the test, file:line, the history across runs, the message, the quotation and the fix.
- `markdown`: the same for a pull request comment or the job summary, with a table of the runs. Pipes, square brackets, backticks, asterisks, underscores, line breaks and angle brackets from the input are escaped, so a test name cannot break a table, make a link or be read as HTML.
- `json`: the whole report: the inputs, the settings, the totals, every run with its counts, the areas, every finding with id, severity, area, test, run, file, line, history, message, fix, basis and source, the files not read, the notes and the gate.
- `csv`: one row per finding, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

[examples/output](examples/output) holds the broken runs in every format.

To put the report in the job summary of a GitHub Actions run, download the result files of the last runs into one folder per run (for example with `gh run download`), then:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  # download the test results of the last runs into results/<run>/ here
  - name: Test suite health report
    run: npx --yes github:INNERLUXES/junit-flaky-check --runs-in results --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Test suite health gate
    run: npx --yes github:INNERLUXES/junit-flaky-check --runs-in results
```

It needs no secrets and no network beyond the download; a Linux runner is enough. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.

## Exit codes

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error, such as a flaky test, a test that always fails or an empty run), `2` a usage or input error (a path that does not exist, a file that is not XML, labels or commits that do not match the number of runs, an input over the limits of entries, depth, files or bytes, an unknown option).

## Limits

The tool reads results; it never sees the code and never runs a test. It cannot prove that a test is flaky without enough runs: two runs that agree prove nothing, and a test that failed once in four runs may be flaky or may have met a real bug that was fixed. Without `--commit` it cannot tell a code change from flakiness. The time-0 hint is best effort: many fast tests report 0. A finding is a review item, and a clean report is a good start, not a proof. [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

- How test suites are built and kept trustworthy, from test plans to automation in the pipeline, with checks like this one on every run: [software testing services for QA and automation](https://innerluxes.dev/software-testing).

## License

MIT
