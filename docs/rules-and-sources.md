# Rules and sources

Every sentence that the tool quotes comes from a page that is saved in [research/sources](../research/sources), with its address on the first line. `src/data.js` holds them, and `test/data.test.js` compares each one with the saved text. Nothing was added from memory. Change a sentence only after saving the new page text and updating this file.

## The saved pages

| File | Address | What it is used for |
| --- | --- | --- |
| `fowler-non-determinism.txt` | https://martinfowler.com/articles/nonDeterminism.html | what a non-deterministic test is, why it ruins a suite, a red regression test, tests forgotten in quarantine |
| `surefire-rerun-failing-tests.txt` | https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html | a test that passes on a rerun is counted as flaky, the time of a flaky test, failing a build on flaky tests |
| `surefire-test-report-xsd.txt` | https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd | the elements and attributes of a test report: testcase, name, classname, time, skipped, system-out, the flaky and rerun elements |
| `pytest-junitxml.txt` | https://docs.pytest.org/en/stable/how-to/output.html#creating-junitxml-format-files | result files for CI servers, what the time attribute holds, strict parsers |
| `xml-document-type-declaration.txt` | https://www.w3.org/TR/xml/#sec-prolog-dtd | what a document type declaration is and what it can point to |
| `xml-character-and-entity-references.txt` | https://www.w3.org/TR/xml/#sec-references | character references, entity references, no recursion |
| `xml-predefined-entities.txt` | https://www.w3.org/TR/xml/#sec-predefined-ent | the five entities every XML reader knows |

The pages were fetched once and saved as plain text, from the heading of each kept section to its end, with the navigation, the dates, the byline and the footers left out. From Fowler's article the introduction, the definition of a non-deterministic test, why such tests are a problem and the part on quarantine are kept. From the Surefire page on rerunning failing tests the whole page is kept but for the sentences that use a word the repository checks do not allow. From the Surefire schema the definition of the testsuite element is kept, without the line of the schema element itself, which names a year in its address. From the pytest page the part on JUnit XML files and the schema that Jenkins uses are kept, and an example with a number that reads like a year is left out. From W3C XML 1.0 the parts of sections 2.8, 4.1 and 4.6 that define the document type declaration, character and entity references and the predefined entities are kept. Typographic quotes and dashes are written as plain ASCII.

The pages say what a flaky test is and what a result file holds, not how a tool should judge a suite. The severities, the slow limit, the regression factor and its floor of half a second, the rule that a pass and a failure of one test in one run is a retry, and the time-0 hint are the tool's own; docs/method.md says so where each is used. The lines of the Surefire schema are quoted as written, in code format.

## The sentences that the findings quote

Each sentence is on its saved page word for word. A key used by "docs" is quoted in the documents and in no finding.

| Key | Used by | Sentence | Page and section |
| --- | --- | --- | --- |
| `regressionSuite` | `empty-run` | "An automated regression suite can play a vital role on a software project, valuable both for reducing defects in production and essential for evolutionary design." | `fowler-non-determinism.txt`, Eradicating Non-Determinism in Tests |
| `destroyValue` | docs | "Left uncontrolled, non-deterministic tests can completely destroy the value of an automated regression suite." | `fowler-non-determinism.txt`, Eradicating Non-Determinism in Tests |
| `nonDeterministic` | `flaky-test`, `flaky-suspect` | "A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment." | `fowler-non-determinism.txt`, Eradicating Non-Determinism in Tests |
| `rerunAndPass` | `flaky-suspect` | "Such tests fail, then you re-run them and they pass." | `fowler-non-determinism.txt`, Eradicating Non-Determinism in Tests |
| `seeminglyRandom` | docs | "Test failures for such tests are seemingly random." | `fowler-non-determinism.txt`, Eradicating Non-Determinism in Tests |
| `regressionRed` | `always-failing` | "When a regression test goes red, you know you've got an immediate problem, often because a bug has crept into the system without you realizing." | `fowler-non-determinism.txt`, Why non-deterministic tests are a problem |
| `ignoredFailure` | `always-failing` | "Once you start ignoring a regression test failure, then that test is useless and you might as well throw it away." | `fowler-non-determinism.txt`, Why non-deterministic tests are a problem |
| `quarantine` | docs | "Place any non-deterministic test in a quarantined area." | `fowler-non-determinism.txt`, Quarantine |
| `forgotten` | `skipped-too-long` | "A danger here is that tests keep getting thrown into quarantine and forgotten, which means your bug detection system is eroding." | `fowler-non-determinism.txt`, Quarantine |
| `rerunBecauseFlaky` | docs | "During development, you may re-run failing tests because they are flaky." | `surefire-rerun-failing-tests.txt`, Rerun Failing Tests |
| `countedFlaky` | `flaky-test` | "Then this test will be counted as a flaky test." | `surefire-rerun-failing-tests.txt`, Output flaky re-run information on the screen |
| `flakyTime` | docs | "In the xml report, the running time of a flaky test will be the running time of the last successful run." | `surefire-rerun-failing-tests.txt`, Output flaky re-run information in test report xml |
| `failOnFlake` | docs | "This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing." | `surefire-rerun-failing-tests.txt`, Re-run and fail the build upon flaky test count |
| `schemaTestcase` | `summary` | `<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">` | `surefire-test-report-xsd.txt`, testsuite |
| `schemaTests` | `empty-run` | `<xs:attribute name="tests" type="xs:string" use="required"/>` | `surefire-test-report-xsd.txt`, testsuite |
| `schemaSuiteTime` | `slowest-suites` | `<xs:attribute name="time" type="xs:float"/>` | `surefire-test-report-xsd.txt`, testsuite |
| `schemaName` | `duplicate-test-name` | `<xs:attribute name="name" type="xs:string" use="required"/>` | `surefire-test-report-xsd.txt`, testcase |
| `schemaClassname` | `duplicate-test-name` | `<xs:attribute name="classname" type="xs:string"/>` | `surefire-test-report-xsd.txt`, testcase |
| `schemaTime` | `slow-test`, `duration-regression`, `slowest-tests`, `no-assertions-signal` | `<xs:attribute name="time" type="xs:float" use="required"/>` | `surefire-test-report-xsd.txt`, testcase |
| `schemaSkipped` | `skipped-too-long` | `<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">` | `surefire-test-report-xsd.txt`, testcase |
| `schemaFlakyFailure` | docs | `<xs:element name="flakyFailure" minOccurs="0" maxOccurs="unbounded">` | `surefire-test-report-xsd.txt`, testcase |
| `schemaSystemOut` | `no-assertions-signal` | `<xs:element name="system-out" type="xs:string" minOccurs="0"/>` | `surefire-test-report-xsd.txt`, testcase |
| `pytestCreate` | `summary` | "To create result files which can be read by Jenkins or other Continuous integration servers, use this invocation:" | `pytest-junitxml.txt`, Creating JUnitXML format files |
| `pytestTime` | `slow-test`, `duration-regression` | "JUnit XML specification seems to indicate that "time" attribute should report total test execution times, including setup and teardown (1, 2)." | `pytest-junitxml.txt`, Creating JUnitXML format files |
| `pytestStrict` | `unreadable-file` | "However, some parsers are quite strict about the elements and attributes that are allowed." | `pytest-junitxml.txt`, record_xml_attribute |
| `doctypeFirst` | `unreadable-file` | "The document type declaration MUST appear before the first element in the document." | `xml-document-type-declaration.txt`, 2.8 Prolog and Document Type Declaration |
| `doctypeExternal` | docs | "The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both." | `xml-document-type-declaration.txt`, 2.8 Prolog and Document Type Declaration |
| `legalCharacter` | docs | "Characters referred to using character references MUST match the production for Char." | `xml-character-and-entity-references.txt`, Well-formedness constraint: Legal Character |
| `noRecursion` | docs | "A parsed entity MUST NOT contain a recursive reference to itself, either directly or indirectly." | `xml-character-and-entity-references.txt`, Well-formedness constraint: No Recursion |
| `predefinedKnown` | docs | "All XML processors MUST recognize these entities whether they are declared or not." | `xml-predefined-entities.txt`, 4.6 Predefined Entities |

## The findings

| Id | Severity | Area | Sentences | Where the rule is written |
| --- | --- | --- | --- | --- |
| `summary` | info | Runs | `pytestCreate`, `schemaTestcase` | [method.md](method.md#summary-info) |
| `empty-run` | error | Runs | `schemaTests`, `regressionSuite` | [method.md](method.md#empty-run-error) |
| `flaky-test` | error | Flaky and failing | `nonDeterministic`, `countedFlaky` | [method.md](method.md#flaky-test-error) |
| `flaky-suspect` | warning | Flaky and failing | `nonDeterministic`, `rerunAndPass` | [method.md](method.md#flaky-suspect-warning) |
| `always-failing` | error | Flaky and failing | `regressionRed`, `ignoredFailure` | [method.md](method.md#always-failing-error) |
| `slow-test` | warning | Time | `schemaTime`, `pytestTime` | [method.md](method.md#slow-test-warning) |
| `duration-regression` | warning | Time | `pytestTime`, `schemaTime` | [method.md](method.md#duration-regression-warning) |
| `slowest-tests` | info | Time | `schemaTime` | [method.md](method.md#slowest-tests-info) |
| `slowest-suites` | info | Time | `schemaSuiteTime` | [method.md](method.md#slowest-suites-info) |
| `skipped-too-long` | warning | Hygiene | `forgotten`, `schemaSkipped` | [method.md](method.md#skipped-too-long-warning) |
| `duplicate-test-name` | warning | Hygiene | `schemaName`, `schemaClassname` | [method.md](method.md#duplicate-test-name-warning) |
| `no-assertions-signal` | info | Hygiene | `schemaSystemOut`, `schemaTime` | [method.md](method.md#no-assertions-signal-info) |
| `unreadable-file` | note | Notes | `doctypeFirst`, `pytestStrict` | [method.md](method.md#unreadable-file-note) |
