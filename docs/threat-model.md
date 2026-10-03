# Threat model

## What the tool touches

- It reads the XML files named on the command line, and the XML files inside the folders named there. Nothing outside those paths is opened.
- Inside a folder it follows no symbolic link and no junction. A path named on the command line may itself be a link, because the person who runs the tool named it.
- It does not open anything a result file names: not a DTD, a schema, an external entity, a file path in an attribute, or an address in a message. An address in a file is text.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, runs no program, and never runs a test.

## What the input may hold

Result files often come from somewhere else: a pull request from a fork, a build of a branch nobody has reviewed, an artifact downloaded from another job, or a folder a test can write to while it runs. A test that is under the control of an attacker can write anything into its own result file. The tool treats every file as possibly hostile.

The XML can try the classic attacks on XML readers. The billion laughs: a DOCTYPE that declares entities that expand into each other, so that a few hundred bytes become gigabytes. An external entity: a DOCTYPE that declares an entity with a `SYSTEM` address, such as a file on the machine or an address on the network, so that a reader puts the content of a secret file into the report, or calls out to a host. A parameter entity that loads a remote DTD. A reference to an entity that was never declared, in the hope that the reader looks it up somewhere. Numbers past the last code point, or references to characters XML forbids.

The structure can try to exhaust the reader: a huge file of gigabytes, elements nested a hundred thousand deep, a start tag with thousands of attributes, hundreds of thousands of elements, a tag, a quote, a comment or a CDATA section that is not closed before the end of the file, long runs of `<` or `&`. A folder can hold symbolic links that point outside it, at a device, or back at a parent folder in a link loop, millions of files, folders nested thousands deep, or a binary file with an `.xml` name. Tens of thousands of tests across many runs can make a careless check do work that grows with the square of the input.

A test name, a suite name, a failure message or a file name can hold control and direction characters, start with `=` so that a spreadsheet runs it, hold markup that a Markdown table would render, or be `__proto__`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| The billion laughs expands a few bytes into gigabytes | There is no DTD support: a DOCTYPE is refused at its first byte, before anything is declared. No entity can be declared, so none can expand. A test runs the attack and checks that it is refused in well under a second and that the report stays small |
| An external entity reads a secret file into the report, or calls out to a host | The DOCTYPE that would declare it is refused; a reference to any name but the five predefined entities is refused; no module for the network or for opening files is imported by the reader. A test declares an external entity that points at a secret file, and checks that its content is in no report |
| A remote DTD is loaded through a parameter entity | Refused with the DOCTYPE; the reader never fetches anything |
| A reference to an undeclared entity is looked up somewhere | Refused: only `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric references are read |
| References to references grow the text with every pass | Every reference is decoded once into one character, and the result is never read again; `&amp;amp;` becomes `&amp;`, never `&` |
| A test in the results runs, or a command in a name is run | Nothing is run or evaluated; names and messages are text. A test puts code in a test name and checks that no file appears |
| A symbolic link leads the tool to files outside the folder, such as a home folder | Every entry is looked at with `lstat`; a link is listed by name and never followed. A test links to a folder outside with a failing result in it, and checks that it is not read |
| A link loop, or a link to a parent, makes the walk run for ever | Links are not followed, so there is no loop. The walk keeps its own list of folders and needs no recursion |
| Folders nested thousands deep, millions of files or thousands of runs exhaust the stack, the memory or the time | The walk is a loop with a list, and more than 32 levels, 50,000 entries, 10,000 XML files or 1,000 runs refuse the input with exit code `2` |
| A huge file, or many large files, exhaust memory | Only XML files are read; one over 32 MB is not read and is named; all files read may hold at most 512 MB. Other files are never opened |
| A pipe or a device named like a result file makes the tool hang | The type is looked at with `lstat` before a file is opened, and again on the open file; anything that is not a regular file is never read |
| A binary or UTF-16 file with an `.xml` name is read as text | A null byte in the first 8,000 bytes, or the byte order mark of UTF-16, marks the file as not readable; it is named in a note |
| Elements nested a hundred thousand deep overflow a stack | The reader keeps an explicit stack and refuses a file past 256 levels; the JUnit reader walks suites with a loop and a list |
| A tag, a quote, a comment or a CDATA section that is not closed makes the reader scan again and again | The reader reads once and never goes back; each search for an end runs once from where it is, and a file that ends inside one is refused with the place |
| Thousands of attributes or hundreds of thousands of elements exhaust memory | At most 256 attributes on an element and 500,000 elements in a file; past either the file is refused. Only 4,096 characters of the text of one element are kept |
| A very long line or a crafted near miss makes a pattern run for a very long time | Every pattern is anchored or has bounded repeats, with no nested repetition. Tests run long near misses and check the time |
| Tens of thousands of tests make the work grow with the square of the input | Tests are kept in a map by name; each test is looked at once per run. A test checks the time on three runs of 20,000 tests each |
| Thousands of findings of one kind make the report huge | A check lists its first 200 findings in a fixed order, counts the rest in the totals and the gate, and says so in a note |
| A test or suite named `__proto__` or `constructor` changes how objects behave | Attributes and tests are kept in maps; a test checks that no prototype changes |
| A name or a message rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators, the byte order mark and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| A test name breaks the Markdown table in the job summary, makes a link, or hides text as an HTML tag | Pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks, `<`, `>` and `&` are escaped in every table cell |
| A CSV report runs a formula when opened in a spreadsheet | Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`; every cell is quoted as RFC 4180 says |
| The argument names a URL, so the tool becomes a fetcher | Arguments that look like addresses are refused; reading from standard input is refused |

## Out of scope

Whether the tests are good, or the suite is stable beyond the runs given: that needs the code and more runs ([limits.md](limits.md)). The safety of the test runner that wrote the files, and of the job that downloads them. The correctness of the pages the tool quotes.
