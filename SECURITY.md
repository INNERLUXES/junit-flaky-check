# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "junit-flaky-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up result file that shows the problem, what you expected and what happened. Use made-up test names, messages and paths, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- a result file that makes the tool expand an entity, read a DTD, or fetch or open an external entity, a schema or any other address named in the file
- a result file that makes the tool run a test, load a module, or run a program
- a folder that makes the tool follow a symbolic link or a junction inside it, or read a file outside the paths it was given
- a file or a folder that makes the tool hang, take very long, or use unbounded memory, such as a very large file, very many files or runs, deep folders, elements nested very deep, a tag, a comment or a CDATA section that is never closed, thousands of attributes, many thousands of tests, or many references
- text from a file name, a test name, a suite name or a message that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a test or suite name such as `__proto__` that changes how objects behave inside the tool
- a file that the tool fails to read and passes over without a note
- a finding that docs/method.md says is reported, for results the tool accepts, that the report leaves out
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: what reading test results cannot show (docs/limits.md lists it), whether the tests themselves are good, the safety of the test runner that wrote the files, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
