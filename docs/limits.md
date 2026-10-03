# Limits

## Results only

The tool reads the result files that test runners write, and nothing else. It never runs a test, never reads the code, and never opens the build log. A clean report means that none of the checks below found anything in the runs it was given; it does not mean that the tests are good or that the suite is stable. [decisions/0001-read-the-results-never-run-the-tests.md](decisions/0001-read-the-results-never-run-the-tests.md) says why it reads results and does not run tests.

## What the checks cannot see

- **The code.** The tool cannot see the code of the tests or of the product. It does not know what a test checks, whether it asserts anything, whether two tests share state, or why a test failed beyond the first line of its message. Every finding is about results, and the fix is found in the code.
- **Flakiness without enough runs.** The tool cannot prove that a test is flaky without enough runs. A test that passed in all the runs it was given may still be flaky; four green runs say little about a test that fails one time in fifty. Give it more runs to see more. With one run only, a test can be flaky only by a retry inside that run, and every failing test is reported as `always-failing`.
- **Whether the code changed.** Without `--commit`, the tool cannot tell a test that is flaky from one that a change broke or fixed, so a test that passed and failed across runs is only a `flaky-suspect`. With `--commit`, two runs of one commit can still differ in their environment (a service that was down, a slow machine, a different time of day); the tool reports the test as flaky, which is usually right, but it cannot see the cause.
- **Retries that leave no trace.** A retry is seen only when the runner writes it: Surefire's `flakyFailure` and `flakyError` elements, or the same test written twice in one run with different results. A runner that retries a test and writes only the last attempt hides the failure, and the tool sees a pass.
- **Real breaks and real fixes.** A test that passed in the old runs and fails in the new ones may be a real break; a test that failed and then passed may be a real fix. The history in each finding shows the order of the results, and only people can say which it is.
- **The time-0 hint.** `no-assertions-signal` is best effort. A time of 0 and no output is how a test that checks nothing looks, but it is also how many fast tests look, because the runner rounds the time. The tool cannot see the assertions, so it is info and never fails a run.
- **Times from different runners.** The time of a test is what its runner wrote: some count setup and teardown, some do not. The tool compares a test only with its own times and with a fixed limit. A slow machine makes every test slow; the median across runs evens out one slow run, not a slow pool of machines.
- **Names.** A test is the pair of its class name and its name. A test that was renamed is two tests to the tool. Parameterized tests with a changing value in their name (a random seed, a time) never line up across runs. Two different tests with the same name in one run are reported as a duplicate, and their results are mixed.
- **Skips.** The tool sees that a test was skipped, and the message if there is one, but not why, not since when, and not whether the skip is still needed.
- **Formats that differ.** The tool reads the common shape of JUnit XML (inputs.md lists it). Elements it does not know, such as properties, attachments or the extra attributes of some runners, are ignored. A file with a DOCTYPE, an entity of its own or an encoding other than UTF-8 is not read at all, and is named in a note.

A finding is a review item, and a clean report is a good start, not a proof. The checks find the tests that the results show to be untrustworthy, early and on every run, so that people can spend their time on the ones that need a fix.

## Size and counts

- An input with more than 1,000 runs, more than 50,000 files and folders, folders nested more than 32 deep, or more than 10,000 XML files is refused with exit code `2`.
- An XML file over 32 MB is not read and is named in a note; together the files read may hold at most 512 MB, or the input is refused.
- A file that is UTF-16, or has a null byte in its first 8,000 bytes, is not read.
- Elements nested more than 256 deep, more than 500,000 elements in one file, more than 256 attributes on one element, or a name longer than 256 characters make the file unreadable, and a note says so.
- Only the first 4,096 characters of the text of one element are kept.
- A check that finds more than 200 things lists the first 200 in a fixed order, counts the rest in the totals and the gate, and says so in a note.
- Text from the input shown in a report is cut to a fixed length: 300 characters for a test name, 160 for a failure message, 2,000 for a message.

Every limit is reported, as a note or a refusal with exit code `2`, so a cut is never silent.
