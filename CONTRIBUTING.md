# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a check

1. Describe the change in docs/method.md first: what the check reports, its severity, what it can see and what it cannot, and the sentence of a saved page it follows. Where the tool makes its own choice (a severity, a limit, the floor of half a second for a regression, the rule for a retry), say so and say why.
2. Add a test with the result files written inline (`suite()` and `across()` in test/helpers.js build them), small enough that the result can be worked out by hand, and a near miss that must not match.
3. Text from the input goes through `safeText` before it reaches a finding or a note, so control characters are removed and the length is capped.
4. A finding id, once released, keeps its meaning: pipelines and other tools read it from the JSON and CSV reports.
5. A thing the tool cannot see is reported as a note or a finding, never passed.

## Changing the XML reader or the JUnit reader

1. The tool reads; it never runs. A change must not read a DTD, expand an entity other than the five predefined ones and numeric references, fetch anything a file names, run a test, or follow a link inside a folder. A DOCTYPE stays refused.
2. Keep the work linear: one pass over the text, no pattern with nested repetition, and no loop over all tests inside another loop over all tests. Keep the limits on nesting, elements, attributes and names. Add a hostile test with a long input and a time check.
3. Files written with LF and with CRLF line ends must give the same report. The example runs are stored as written (`.gitattributes`), and a test reads them both ways.
4. Paths are opened with `path.resolve`, never `path.join`, so an absolute path works on every system. Paths shown in a report are relative, with forward slashes. A test that depends on the operating system (a symbolic link, a device, a name with a control character) is guarded with `process.platform`, and every other test builds its paths with `resolve()` from names with forward slashes.

## Changing the quoted sentences

The sentences in `src/data.js` come from the pages saved in `research/sources`: Martin Fowler's article on non-deterministic tests, two pages of Maven Surefire (rerunning failing tests, and the XML schema of the test report), the pytest page on JUnit XML files, and three sections of W3C XML 1.0. When a page changes, save the new text in `research/sources` (the address on the first line, plain ASCII, no date or year), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every quoted sentence with the saved text, so changing one without the other fails.

Never add a rule or a quoted sentence from memory or from a blog post. A new rule needs the page, opened and saved, and the words of the page that it rests on.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It opens no network connection and runs no program.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- The README and the documents carry no dates or years, the example result files carry no timestamp, and the examples and tests hold no number that reads like a year. Version numbers (Node 22, XML 1.0) are fine.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
