import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, parseXml, readJunit, testKey, testLabel } from '../src/index.js';
import { suite } from './helpers.js';

const read = (text) => readJunit(parseXml(text), 'a.xml');

test('junit: a Surefire file, with properties, results, retries and output', () => {
  const r = read(suite([
    { name: 'a', time: '0.5', out: 'hello' },
    { name: 'b', result: 'failed', message: 'expected 1' },
    { name: 'c', result: 'error' },
    { name: 'd', result: 'skipped' },
    { name: 'e', flaky: 2 },
    { name: 'f', result: 'failed', reruns: 2 }
  ], { time: '1.5' }));
  assert.deepEqual(r.cases.map((c) => [c.name, c.result]), [['a', 'passed'], ['b', 'failed'], ['c', 'error'], ['d', 'skipped'], ['e', 'passed'], ['f', 'failed']]);
  assert.equal(r.cases[0].output, true);
  assert.equal(r.cases[0].time, 0.5);
  assert.equal(r.cases[0].label, 'shop.CartTest > a');
  assert.equal(r.cases[1].message, 'expected 1');
  assert.equal(r.cases[4].flakyRetries, 2);
  assert.equal(r.cases[5].failedRetries, 2);
  assert.deepEqual(r.suites, [{ name: 'shop.CartTest', time: 1.5, file: 'a.xml' }]);
  assert.equal(r.cases[0].line, 3);
});

test('junit: testsuites with nested suites; the class name falls back to the nearest suite; suite time is summed when missing', () => {
  const r = read('<testsuites><testsuite name="outer"><testsuite name="inner"><testcase name="x" time="1"/><testcase name="y" time="2"/></testsuite><testcase name="z" classname="own" time="0.5"/></testsuite></testsuites>');
  assert.deepEqual(r.cases.map((c) => c.label), ['inner > x', 'inner > y', 'own > z']);
  assert.deepEqual(r.suites.map((s) => [s.name, s.time]), [['outer', 0.5], ['inner', 3]]);
});

test('junit: the shapes of pytest, Jest, go-junit-report and Playwright', () => {
  const pytest = read('<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="0" failures="1" skipped="0" tests="2" time="0.050"><testcase classname="tests.test_cart" name="test_total" file="tests/test_cart.py" line="4" time="0.001"/><testcase classname="tests.test_cart" name="test_coupon" time="0.002"><failure message="assert 50 == 45">tests/test_cart.py:9: AssertionError</failure></testcase></testsuite></testsuites>');
  assert.deepEqual(pytest.cases.map((c) => [c.label, c.result]), [['tests.test_cart > test_total', 'passed'], ['tests.test_cart > test_coupon', 'failed']]);
  const jest = read('<testsuites name="jest tests" tests="1" failures="0" errors="0" time="1.2"><testsuite name="cart" errors="0" failures="0" skipped="0" time="1.1" tests="1"><testcase classname="cart adds an item" name="cart adds an item" time="0.004"></testcase></testsuite></testsuites>');
  assert.equal(jest.cases[0].label, 'cart adds an item > cart adds an item');
  const go = read('<testsuites><testsuite tests="1" failures="0" time="0.010" name="example/shop"><properties><property name="go.version" value="go1.22"></property></properties><testcase classname="shop" name="TestTotal" time="0.000"></testcase></testsuite></testsuites>');
  assert.equal(go.cases[0].time, 0);
  const playwright = read('<testsuites id="" name="" tests="1" failures="0" skipped="0" errors="0" time="3.2"><testsuite name="checkout.spec.ts" timestamp="x" hostname="chromium" tests="1" failures="0" skipped="0" time="3.1" errors="0"><testcase name="pays with a card" classname="checkout.spec.ts" time="3.1"><system-out>\n<![CDATA[step one]]>\n</system-out></testcase></testsuite></testsuites>');
  assert.equal(playwright.cases[0].output, true);
});

test('junit: a root that is not testsuites or testsuite is refused', () => {
  assert.throws(() => read('<report><testcase name="x"/></report>'), /the root element is <report>, not <testsuites> or <testsuite>/);
});

test('junit: a testcase with no name is not counted, a bad time is noted, a testcase outside a suite is only read in testsuites', () => {
  const r = read('<testsuite name="s"><testcase classname="c"/><testcase name="" /><testcase name="t" time="soon"/><testcase name="u"/></testsuite>');
  assert.deepEqual(r.cases.map((c) => [c.name, c.time]), [['t', null], ['u', null]]);
  assert.ok(r.notes.includes('2 testcase elements have no name attribute and were not counted'));
  assert.ok(r.notes.includes('2 testcase elements have a time that is missing or not a number; they are left out of the time checks'));
  const nested = read('<testsuites><testcase name="direct"/><testsuite name="s"><testcase name="in"/><properties><testcase name="hidden"/></properties></testsuite></testsuites>');
  assert.deepEqual(nested.cases.map((c) => c.name), ['direct', 'in']);
});

test('junit: replaced characters in a file are noted', () => {
  const r = readJunit(parseXml('<testsuite name="s"><testcase name="t"><system-out>&#27;[31m</system-out></testcase></testsuite>'), 'a.xml');
  assert.ok(r.notes.some((n) => /1 numeric reference names a character that XML does not allow/.test(n)));
});

test('time: seconds as numbers, a comma as the decimal mark, and anything else is null', () => {
  assert.equal(parseTime('1.5'), 1.5);
  assert.equal(parseTime('0'), 0);
  assert.equal(parseTime(' 2 '), 2);
  assert.equal(parseTime('0,25'), 0.25);
  assert.equal(parseTime('.5'), 0.5);
  assert.equal(parseTime('1e-3'), 0.001);
  for (const bad of ['', '-1', 'abc', '1,234.5', 'NaN', 'Infinity', '1.2.3', undefined, null]) assert.equal(parseTime(bad), null, String(bad));
});

test('keys and labels: class name and name make the key; the label shows both, or the name alone', () => {
  assert.notEqual(testKey('a.b', 'c'), testKey('a', 'b.c'));
  assert.equal(testLabel('shop.CartTest', 'adds'), 'shop.CartTest > adds');
  assert.equal(testLabel('', 'adds'), 'adds');
});
