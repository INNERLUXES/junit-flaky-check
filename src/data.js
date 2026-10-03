// The names, lists and sentences the checks rest on. Each sentence comes from a page that is saved, with its address on
// the first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a sentence
// here only after saving the new page text and updating docs/rules-and-sources.md. The checks in src/ use these
// constants and never write a quoted sentence of their own.

const SUREFIRE = 'https://maven.apache.org/surefire/maven-surefire-plugin/';
const XML = 'https://www.w3.org/TR/xml/';

export const SOURCES = [
  { id: 'fowler', file: 'fowler-non-determinism.txt', url: 'https://martinfowler.com/articles/nonDeterminism.html', label: 'Martin Fowler, Eradicating Non-Determinism in Tests' },
  { id: 'surefire-rerun', file: 'surefire-rerun-failing-tests.txt', url: `${SUREFIRE}examples/rerun-failing-tests.html`, label: 'Maven Surefire, Rerun Failing Tests' },
  { id: 'surefire-xsd', file: 'surefire-test-report-xsd.txt', url: `${SUREFIRE}xsd/surefire-test-report.xsd`, label: 'Maven Surefire, XML schema of the test report' },
  { id: 'pytest', file: 'pytest-junitxml.txt', url: 'https://docs.pytest.org/en/stable/how-to/output.html#creating-junitxml-format-files', label: 'pytest documentation, Creating JUnitXML format files' },
  { id: 'xml-doctype', file: 'xml-document-type-declaration.txt', url: `${XML}#sec-prolog-dtd`, label: 'W3C XML 1.0, 2.8 Prolog and Document Type Declaration' },
  { id: 'xml-references', file: 'xml-character-and-entity-references.txt', url: `${XML}#sec-references`, label: 'W3C XML 1.0, 4.1 Character and Entity References' },
  { id: 'xml-predefined', file: 'xml-predefined-entities.txt', url: `${XML}#sec-predefined-ent`, label: 'W3C XML 1.0, 4.6 Predefined Entities' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// Sentences quoted in the findings and the documents. Every text is on its saved page word for word
// (test/data.test.js compares them), and holds no year. The lines of the Surefire schema are quoted as written.
export const FACTS = {
  regressionSuite: { source: 'fowler', section: 'Eradicating Non-Determinism in Tests', text: 'An automated regression suite can play a vital role on a software project, valuable both for reducing defects in production and essential for evolutionary design.' },
  destroyValue: { source: 'fowler', section: 'Eradicating Non-Determinism in Tests', text: 'Left uncontrolled, non-deterministic tests can completely destroy the value of an automated regression suite.' },
  nonDeterministic: { source: 'fowler', section: 'Eradicating Non-Determinism in Tests', text: 'A test is non-deterministic when it passes sometimes and fails sometimes, without any noticeable change in the code, tests, or environment.' },
  rerunAndPass: { source: 'fowler', section: 'Eradicating Non-Determinism in Tests', text: 'Such tests fail, then you re-run them and they pass.' },
  seeminglyRandom: { source: 'fowler', section: 'Eradicating Non-Determinism in Tests', text: 'Test failures for such tests are seemingly random.' },
  regressionRed: { source: 'fowler', section: 'Why non-deterministic tests are a problem', text: "When a regression test goes red, you know you've got an immediate problem, often because a bug has crept into the system without you realizing." },
  ignoredFailure: { source: 'fowler', section: 'Why non-deterministic tests are a problem', text: 'Once you start ignoring a regression test failure, then that test is useless and you might as well throw it away.' },
  quarantine: { source: 'fowler', section: 'Quarantine', text: 'Place any non-deterministic test in a quarantined area.' },
  forgotten: { source: 'fowler', section: 'Quarantine', text: 'A danger here is that tests keep getting thrown into quarantine and forgotten, which means your bug detection system is eroding.' },
  rerunBecauseFlaky: { source: 'surefire-rerun', section: 'Rerun Failing Tests', text: 'During development, you may re-run failing tests because they are flaky.' },
  countedFlaky: { source: 'surefire-rerun', section: 'Output flaky re-run information on the screen', text: 'Then this test will be counted as a flaky test.' },
  flakyTime: { source: 'surefire-rerun', section: 'Output flaky re-run information in test report xml', text: 'In the xml report, the running time of a flaky test will be the running time of the last successful run.' },
  failOnFlake: { source: 'surefire-rerun', section: 'Re-run and fail the build upon flaky test count', text: 'This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing.' },
  schemaTestcase: { source: 'surefire-xsd', section: 'testsuite', text: '<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">' },
  schemaTests: { source: 'surefire-xsd', section: 'testsuite', text: '<xs:attribute name="tests" type="xs:string" use="required"/>' },
  schemaSuiteTime: { source: 'surefire-xsd', section: 'testsuite', text: '<xs:attribute name="time" type="xs:float"/>' },
  schemaName: { source: 'surefire-xsd', section: 'testcase', text: '<xs:attribute name="name" type="xs:string" use="required"/>' },
  schemaClassname: { source: 'surefire-xsd', section: 'testcase', text: '<xs:attribute name="classname" type="xs:string"/>' },
  schemaTime: { source: 'surefire-xsd', section: 'testcase', text: '<xs:attribute name="time" type="xs:float" use="required"/>' },
  schemaSkipped: { source: 'surefire-xsd', section: 'testcase', text: '<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">' },
  schemaFlakyFailure: { source: 'surefire-xsd', section: 'testcase', text: '<xs:element name="flakyFailure" minOccurs="0" maxOccurs="unbounded">' },
  schemaSystemOut: { source: 'surefire-xsd', section: 'testcase', text: '<xs:element name="system-out" type="xs:string" minOccurs="0"/>' },
  pytestCreate: { source: 'pytest', section: 'Creating JUnitXML format files', text: 'To create result files which can be read by Jenkins or other Continuous integration servers, use this invocation:' },
  pytestTime: { source: 'pytest', section: 'Creating JUnitXML format files', text: 'JUnit XML specification seems to indicate that "time" attribute should report total test execution times, including setup and teardown (1, 2).' },
  pytestStrict: { source: 'pytest', section: 'record_xml_attribute', text: 'However, some parsers are quite strict about the elements and attributes that are allowed.' },
  doctypeFirst: { source: 'xml-doctype', section: '2.8 Prolog and Document Type Declaration', text: 'The document type declaration MUST appear before the first element in the document.' },
  doctypeExternal: { source: 'xml-doctype', section: '2.8 Prolog and Document Type Declaration', text: 'The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both.' },
  legalCharacter: { source: 'xml-references', section: 'Well-formedness constraint: Legal Character', text: 'Characters referred to using character references MUST match the production for Char.' },
  noRecursion: { source: 'xml-references', section: 'Well-formedness constraint: No Recursion', text: 'A parsed entity MUST NOT contain a recursive reference to itself, either directly or indirectly.' },
  predefinedKnown: { source: 'xml-predefined', section: '4.6 Predefined Entities', text: 'All XML processors MUST recognize these entities whether they are declared or not.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;

// The five predefined entities of XML; no other name is ever expanded.
export const PREDEFINED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// Folders that hold tools, caches or copies of packages, not test results. They are not entered; a note names them.
export const SKIP_FOLDERS = ['.git', '.hg', '.svn', 'node_modules', '.cache'];

// The file ending of a JUnit XML file.
export const isXmlName = (name) => /\.xml$/i.test(name);

// The elements of a testcase that the tool reads (Surefire writes the flaky and rerun ones when it retries a test).
export const RESULT_ELEMENTS = ['failure', 'error', 'skipped', 'flakyFailure', 'flakyError', 'rerunFailure', 'rerunError', 'system-out', 'system-err'];
