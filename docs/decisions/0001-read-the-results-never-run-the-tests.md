# 1. Read the results, never run the tests

## Context

The tool needs to say which tests of a suite cannot be trusted: the flaky ones, the ones that always fail, the slow ones, the forgotten skips. The fullest way to find a flaky test is to run it many times on the same code and watch it pass and fail. Tools exist for that, and a team that suspects a test should use them.

That run is slow and heavy, and it is not safe on code nobody has reviewed. It needs the build, the services the tests call, and the time to run each test dozens of times. It runs whatever the tests hold.

Every CI run already writes the evidence in its JUnit XML files: the result of every test, its time, the retries the runner made, and whether it wrote any output. Fowler gives the definition the tool works from: "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment." The results of a few runs show when a test passes sometimes and fails sometimes. And the Surefire documentation shows that runners already write retries into the results, and count them: "Then this test will be counted as a flaky test."

Result files are also a classic place for an attack on an XML reader. They come from test code, which may come from an unreviewed branch, and a general XML library that reads a DTD can be made to expand entities without end or read a secret file into its output.

## Decision

The tool reads the JUnit XML results of several runs and never runs a test. It has its own small, strict XML reader with no DTD support: a DOCTYPE is refused, only the five predefined entities and numeric references are read, and nothing named in a file is ever fetched. So it needs no dependency, no build and no network. It reads only files that end in `.xml`, follows no link inside a folder, and opens no network connection.

A test is flaky only on evidence of the same code: a pass and a failure within one run, or in two runs of the same commit (`--commit`). A pass and a failure across runs with no such proof is a suspect, a warning, because a code change may explain it.

Every sentence it quotes comes from a page saved with its address in research/sources: Martin Fowler's article on non-deterministic tests, the Maven Surefire pages on reruns and on the report schema, the pytest page on JUnit XML files and three sections of W3C XML 1.0. A test compares the code and the documents with the saved text. Where the tool makes its own choice (a severity, the slow limit, the regression factor and its floor, the time-0 hint), the documents say so.

A thing the tool cannot read is reported, not passed: a file it refuses is named in a note with the place of the problem, and a run with no result is an error.

## Consequences

The check runs in a second on Linux, macOS or Windows with only Node: no build, no services, no account and no network, and no result file can make it run code, expand an entity or reach out to a host. It can run after every pipeline on the results of the last few runs, and it points at the test, the file and the line.

The cost is that it sees only results. It cannot see the code, it cannot prove a test is flaky without enough runs, and without commits it cannot tell flakiness from a change; docs/limits.md lists these. A suite that passes can still hold tests that check nothing. The tool is a step that finds the tests worth a closer look, before the reruns on one commit and the reading of the code that fix them.
