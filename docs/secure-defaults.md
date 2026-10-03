# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **Never runs a test.** The tool reads result files as text. It never runs a test, a build or a script, never evaluates anything it reads, and never puts a test name, a path or a message on a command line. Results can be checked before anyone trusts the branch that made them.
- **No DTD, no entity expansion.** The XML reader refuses a DOCTYPE, so no DTD is read, no external entity is fetched or opened, and no entity can expand into another. Only the five predefined entities and numeric references are read, once each, into one character each. There is no option to turn DTD support on, because there is no DTD support.
- **No network.** The tool reads the files it is given and sends nothing anywhere. It never fetches a schema, a DTD or an address named in a file, does not check for updates, and refuses an argument that looks like an address. It can run in a locked-down job with no outbound access at all.
- **No dependencies.** Node 22 or newer and nothing else, so a check does not add a supply chain of its own. There is no XML library and no `node_modules` to install before it runs.
- **Never follows a link.** Inside a folder, every entry is looked at with `lstat`. A symbolic link or a junction is listed and never followed, so it cannot lead the tool to files outside the folder or round in a loop.
- **Reads only what it needs.** Only files that end in `.xml` are read. Other files are counted and never opened. A path written in a result file is text; it is never opened.
- **Regular files only, bounded.** Each file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over 32 MB is not read. The number of runs, entries, folder levels and XML files, and the total bytes read, are capped, and past a cap the input is refused.
- **A bounded reader.** The XML reader reads the text once, from left to right, and never goes back. Every pattern is anchored or bounded, with no nested repetition. Nesting, elements, attributes, names and the text kept per element are capped, and past a cap the file is refused, not read in part.
- **Nothing is guessed.** A file not read, a testcase with no name, a time that is not a number, a replaced character, a link not followed and a limit reached are named in a note. A run with no result is an error, so an empty run does not pass.
- **Clean output.** Text from the input has control characters, line separators and direction controls removed and its length capped before it reaches a report or an error message, so a hostile file name, test name or message cannot rewrite the terminal or reorder what a reader sees. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`. CSV cells are quoted as RFC 4180 says, and a cell that a spreadsheet would read as a formula gets a leading `'`.
- **No prototype tricks.** Attributes are kept in maps, tests in a map keyed by text, and findings in arrays, so a test named `__proto__` is just data.
- **The gate is on.** Without any option, an error (a flaky test, a test that always fails, an empty run) makes the run exit with `1`.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Running it safely on results you do not know

1. A result file is data, and the tool treats it as data. Still, run it as a user with read access to the results and nothing else; it needs no account, no key and no network.
2. Read the notes and the summary: they say what was not read and why, so a pass is not taken for more than it is.
3. A report quotes test names and failure messages. A failure message can hold data from a test environment; keep that in mind before you post a report in a public place.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline, with `ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS, with hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
