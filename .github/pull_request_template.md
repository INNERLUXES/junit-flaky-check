## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check, the XML reader or the JUnit reader is described in docs/method.md or docs/inputs.md, says what the check can and cannot see, and has a test with the result file written inline and a near miss that must not match
- [ ] A change to a quoted sentence follows the saved page: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] Text from the input goes through `safeText` before it reaches a finding, a note or an error message
- [ ] The reader still refuses a DOCTYPE, expands no entity but the five predefined ones and numeric references, fetches nothing, follows no symbolic link inside a folder, opens no connection and runs no program or test
- [ ] Work stays linear in the size of the input: no pattern with nested repetition, no loop over all tests inside a loop over all tests, and a hostile test with a time check
- [ ] A thing the tool cannot see is reported as a note or a finding, never as passed
- [ ] A test that depends on the operating system (a path, a backslash, a link, a file name, a line end) is guarded with `process.platform` or builds its path with `resolve()` from forward-slash names
- [ ] No real person, company, address or key in fixtures or examples, no calendar year in the README or the documents, no timestamp in the examples, and no number that reads like a year in the examples or the tests
- [ ] The commit messages of this pull request follow Conventional Commits
