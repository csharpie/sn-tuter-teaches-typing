// Local checks for WpmAttemptService's pure methods (validateLog, score,
// chooseCoach, normalizeText), mirroring the WPM-SC / LV / FL / CO / DI cases
// in docs/ATF_TEST_SPEC.md. The ATF suites remain the source of truth on an
// instance; this runs the same script include file under Node with a stubbed
// `gs` and `Class`, so scoring changes get fast feedback without a deploy.
//
// Run with: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ATF_HELPERS } from '../src/fluent/tests/atf-helpers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceSource = fs.readFileSync(
  path.join(root, 'src/fluent/scripts/WpmAttemptService.server.js'),
  'utf8',
);

const sandbox = {
  Class: {
    create() {
      return function ScriptInclude(...args) {
        this.initialize(...args);
      };
    },
  },
  gs: {
    getMessage(message, params) {
      return String(message).replace(/\{(\d+)\}/g, (match, index) => (params && params[index] !== undefined ? String(params[index]) : match));
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(serviceSource, sandbox);
// The ATF helper library is shared with the instance tests; only its pure
// log builders are used here.
vm.runInContext(ATF_HELPERS, sandbox);
const {
  repeatTo, wrongFor, LogBuilder, typeEvenly,
} = sandbox;
const svc = () => new sandbox.WpmAttemptService();

const LESSON_OPTS = { mode: 'lesson', minAccuracy: 90, targetNetWpm: 10 };
const L1_TEXT = repeatTo('sad lads a', 100);
const SP1_TEXT = repeatTo('abel tuter teaches typing to everyone ', 3000);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------- helpers

test('helpers: fixture texts end on a non-space character', () => {
  assert.equal(L1_TEXT.length, 100);
  assert.equal(L1_TEXT.at(-1), 'a');
  assert.equal(repeatTo('gash ghash', 100).at(-1), 'h');
  assert.equal(repeatTo('quiet wipe', 100).at(-1), 'e');
  assert.equal(SP1_TEXT.at(-1), 'n');
  assert.equal(wrongFor('x'), 'z');
  assert.equal(wrongFor('a'), 'x');
});

// ---------------------------------------------------------------- WPM-SC

test('SC-01 clean run scores 50 WPM', () => {
  const passage = repeatTo('the quick brown fox ', 250);
  const r = svc().score(passage, typeEvenly(passage, 60000), LESSON_OPTS);
  assert.equal(r.elapsedMs, 60000);
  assert.equal(r.typedChars, 250);
  assert.equal(r.keystrokes, 250);
  assert.equal(r.missedKeystrokes, 0);
  assert.equal(r.errors, 0);
  assert.equal(r.grossWpm, 50);
  assert.equal(r.netWpm, 50);
  assert.equal(r.accuracy, 100);
  assert.equal(r.complete, true);
});

test('SC-02 corrected and uncorrected errors', () => {
  const p = repeatTo('typing tests are fun ', 300);
  const b = new LogBuilder();
  for (let i = 0; i < p.length; i += 1) {
    if (i === 20 || i === 60) b.miss(p[i]).back(1).type(p[i]);
    else if ([100, 140, 180, 220].includes(i)) b.miss(p[i]);
    else b.type(p[i]);
  }
  const r = svc().score(p, b.buildEven(120000), LESSON_OPTS);
  assert.equal(r.keystrokes, 302);
  assert.equal(r.missedKeystrokes, 6);
  assert.equal(r.typedChars, 300);
  assert.equal(r.errors, 4);
  assert.equal(r.grossWpm, 30);
  assert.equal(r.netWpm, 28);
  assert.equal(r.accuracy, 98);
});

test('SC-03 reference example (22 WPM, 21 AWPM, 93%)', () => {
  const p = repeatTo('abel teaches typing ', 550);
  const corrected = new Set();
  for (let k = 0; k <= 35; k += 1) corrected.add(7 + 15 * k);
  const uncorrected = new Set([10, 110, 210, 310, 410]);
  const b = new LogBuilder();
  for (let i = 0; i < p.length; i += 1) {
    if (corrected.has(i)) b.miss(p[i]).back(1).type(p[i]);
    else if (uncorrected.has(i)) b.miss(p[i]);
    else b.type(p[i]);
  }
  const r = svc().score(p, b.buildEven(300000), LESSON_OPTS);
  assert.equal(r.keystrokes, 586);
  assert.equal(r.missedKeystrokes, 41);
  assert.equal(r.typedChars, 550);
  assert.equal(r.errors, 5);
  assert.equal(r.grossWpm, 22);
  assert.equal(r.netWpm, 21);
  assert.equal(r.accuracy, 93);
});

test('SC-04 one-second minimum', () => {
  const r = svc().score('hello', typeEvenly('hello', 400), LESSON_OPTS);
  assert.equal(r.elapsedMs, 400);
  assert.equal(r.grossWpm, 60);
  assert.equal(r.netWpm, 60);
});

test('SC-05 AWPM never negative', () => {
  const b = new LogBuilder();
  [...'abcdefghij'].forEach((ch) => b.miss(ch));
  const r = svc().score('abcdefghij', b.buildEven(60000), LESSON_OPTS);
  assert.equal(r.errors, 10);
  assert.equal(r.grossWpm, 2);
  assert.equal(r.netWpm, 0);
  assert.equal(r.accuracy, 0);
});

test('SC-06 timed mode ignores late keystrokes', () => {
  const opts = { mode: 'speed_test', durationSeconds: 60 };
  const r = svc().score(
    SP1_TEXT,
    typeEvenly(SP1_TEXT.substring(0, 300), 72000),
    opts,
  );
  assert.equal(r.keystrokes, 250);
  assert.equal(r.typedChars, 250);
  assert.equal(r.elapsedMs, 60000);
  assert.equal(r.grossWpm, 50);
});

test('SC-07 timed mode uses the full duration', () => {
  const opts = { mode: 'speed_test', durationSeconds: 60 };
  const r = svc().score(
    SP1_TEXT,
    typeEvenly(SP1_TEXT.substring(0, 100), 30000),
    opts,
  );
  assert.equal(r.elapsedMs, 60000);
  assert.equal(r.grossWpm, 20);
});

test('SC-08 timed mode, no keystrokes', () => {
  const opts = { mode: 'speed_test', durationSeconds: 60 };
  const r = svc().score(SP1_TEXT, { v: 1, events: [] }, opts);
  assert.equal(r.keystrokes, 0);
  assert.equal(r.accuracy, 0);
  assert.equal(r.grossWpm, 0);
  assert.equal(r.complete, false);
});

test('SC-09 deletes on an empty buffer are ignored', () => {
  const log = new LogBuilder().back(2).type('abc').buildEven(3000);
  const r = svc().score('abc', log, LESSON_OPTS);
  assert.equal(r.keystrokes, 3);
  assert.equal(r.typedChars, 3);
  assert.equal(r.errors, 0);
  assert.equal(r.accuracy, 100);
});

test('SC-10 events after completion are ignored', () => {
  const log = new LogBuilder().type('abcdef').buildGaps((i) => i * 200);
  const r = svc().score('abc', log, LESSON_OPTS);
  assert.equal(r.typedChars, 3);
  assert.equal(r.keystrokes, 3);
  assert.equal(r.elapsedMs, 400);
});

test('SC-11 per-key stats', () => {
  const log = new LogBuilder().type('Ab').miss(' ').type('a')
    .buildEven(1000);
  const r = svc().score('Ab a', log, LESSON_OPTS);
  assert.deepEqual(plain(r.perKey), {
    a: { hits: 2, misses: 0 },
    b: { hits: 1, misses: 0 },
    space: { hits: 0, misses: 1 },
  });
  assert.equal(r.errors, 1);
});

test('SC-12 rounding to one decimal', () => {
  const p = repeatTo('round me ', 251);
  const r = svc().score(p, typeEvenly(p, 60000), LESSON_OPTS);
  assert.equal(r.grossWpm, 50.2);
});

test('SC-13 passing requires every condition', () => {
  const log = typeEvenly(L1_TEXT, 30000);
  assert.equal(svc().score(L1_TEXT, log, LESSON_OPTS).passed, true);
  assert.equal(
    svc().score(L1_TEXT, log, { ...LESSON_OPTS, minAccuracy: 101 }).passed,
    false,
  );
  assert.equal(
    svc().score(L1_TEXT, log, { ...LESSON_OPTS, targetNetWpm: 41 }).passed,
    false,
  );
  const partial = typeEvenly(L1_TEXT.substring(0, 99), 30000);
  assert.equal(svc().score(L1_TEXT, partial, LESSON_OPTS).passed, false);
  assert.equal(
    svc().score(L1_TEXT, log, { ...LESSON_OPTS, mode: 'speed_test' }).passed,
    false,
  );
});

// ---------------------------------------------------------------- WPM-LV

test('LV-01..08 log validation', () => {
  const s = svc();
  assert.equal(s.validateLog(typeEvenly('abc', 1000)), null);
  assert.equal(s.validateLog({ v: 2, events: [] }), 'invalid_log');
  assert.equal(s.validateLog({ events: [] }), 'invalid_log');
  const ev = (events) => ({ v: 1, events });
  assert.equal(
    s.validateLog(ev([[0, 'i', 'a'], [500, 'i', 'b'], [400, 'i', 'c']])),
    'invalid_log',
  );
  assert.equal(s.validateLog(ev([[5, 'i', 'a']])), 'invalid_log');
  assert.equal(s.validateLog(ev([[-1, 'i', 'a']])), 'invalid_log');
  assert.equal(
    s.validateLog(ev([[0, 'i', 'a'], [10.5, 'i', 'b']])),
    'invalid_log',
  );
  assert.equal(s.validateLog(ev([[0, 'i', 'ab']])), 'invalid_log');
  assert.equal(s.validateLog(ev([[0, 'i']])), 'invalid_log');
  assert.equal(s.validateLog(ev([[0, 'i', '']])), 'invalid_log');
  assert.equal(s.validateLog(ev([[0, 'x', 'a']])), 'invalid_log');
  assert.equal(s.validateLog(ev([[0, 'i', 'a'], [10, 'd', 'a']])), 'invalid_log');
  const big = (n) => ev(Array.from({ length: n }, (_, i) => [i, 'i', 'a']));
  assert.equal(s.validateLog(big(20000)), null);
  assert.equal(s.validateLog(big(20001)), 'invalid_log');
  assert.equal(s.validateLog(null), 'invalid_log');
  assert.equal(s.validateLog('{"v":1,"events":[]}'), 'invalid_log');
  assert.equal(s.validateLog({ v: 1 }), 'invalid_log');
});

// ---------------------------------------------------------------- WPM-FL

test('FL-01 uniform intervals', () => {
  const log = new LogBuilder()
    .type(L1_TEXT)
    .buildGaps((i) => Math.floor(i / 10) * 3045 + (i % 10) * 5);
  const r = svc().score(L1_TEXT, log, LESSON_OPTS);
  assert.equal(r.flagged, true);
  assert.equal(r.flagReason, 'uniform_intervals');
});

test('FL-02 too fast', () => {
  const log = new LogBuilder().type(L1_TEXT).buildGaps((i) => i * 20);
  const r = svc().score(L1_TEXT, log, LESSON_OPTS);
  assert.equal(r.flagged, true);
  assert.equal(r.flagReason, 'too_fast');
  assert.equal(r.passed, false);
});

test('FL-03 both conditions report uniform_intervals', () => {
  const log = new LogBuilder().type(L1_TEXT).buildGaps((i) => i * 5);
  assert.equal(svc().score(L1_TEXT, log, LESSON_OPTS).flagReason, 'uniform_intervals');
});

test('FL-04 normal typing is not flagged', () => {
  const cycle = [180, 240, 300];
  let t = 0;
  const offsets = [0];
  for (let i = 1; i < L1_TEXT.length; i += 1) {
    t += cycle[(i - 1) % 3];
    offsets.push(t);
  }
  const log = new LogBuilder().type(L1_TEXT).buildGaps((i) => offsets[i]);
  assert.equal(svc().score(L1_TEXT, log, LESSON_OPTS).flagged, false);
});

test('LS fixtures: pass and fail logs score as the spec expects', () => {
  const pass = svc().score(L1_TEXT, typeEvenly(L1_TEXT, 30000), LESSON_OPTS);
  assert.equal(pass.netWpm, 40);
  assert.equal(pass.passed, true);
  const b = new LogBuilder();
  for (let i = 0; i < L1_TEXT.length; i += 1) {
    if (i >= 5 && i <= 75 && i % 5 === 0) b.miss(L1_TEXT[i]);
    else b.type(L1_TEXT[i]);
  }
  const fail = svc().score(L1_TEXT, b.buildEven(30000), LESSON_OPTS);
  assert.equal(fail.accuracy, 85);
  assert.equal(fail.netWpm, 10);
  assert.equal(fail.passed, false);
});

// ---------------------------------------------------------------- WPM-CO

test('CO-01 flagged wins over everything', () => {
  const c = svc().chooseCoach(
    {
      flagged: true, passed: false, accuracy: 100, personalBest: false,
    },
    LESSON_OPTS,
  );
  assert.equal(c.rule, 1);
  assert.equal(c.headline, "Let's try that again");
  assert.equal(c.summary, '');
});

test('CO-02..05 lesson rules', () => {
  const s = svc();
  let c = s.chooseCoach({ passed: true, personalBest: true }, LESSON_OPTS);
  assert.equal(c.rule, 2);
  assert.equal(c.headline, 'New personal best!');
  assert.equal(c.advice, 'Ready for the next lesson?');
  c = s.chooseCoach({ passed: true, personalBest: false }, LESSON_OPTS);
  assert.equal(c.rule, 3);
  assert.equal(c.headline, 'Good job!');
  c = s.chooseCoach({ passed: false, accuracy: 85, netWpm: 5 }, LESSON_OPTS);
  assert.equal(c.rule, 4);
  assert.equal(c.headline, 'Slow down a little');
  assert.match(c.advice, /90%/);
  c = s.chooseCoach({ passed: false, accuracy: 95, netWpm: 5 }, LESSON_OPTS);
  assert.equal(c.rule, 5);
  assert.equal(c.headline, 'Almost there');
  assert.match(c.advice, /10 AWPM/);
});

test('CO-06 speed test', () => {
  const ctx = { mode: 'speed_test' };
  const best = svc().chooseCoach({ personalBest: true }, ctx);
  const plainRun = svc().chooseCoach({ personalBest: false }, ctx);
  assert.equal(best.rule, 6);
  assert.equal(best.headline, 'New personal best!');
  assert.equal(plainRun.rule, 6);
  assert.equal(plainRun.headline, 'Nice work!');
});

test('CO-07 exact summary sentence', () => {
  const c = svc().chooseCoach(
    {
      accuracy: 93, grossWpm: 22, errors: 5, netWpm: 21, passed: true,
    },
    LESSON_OPTS,
  );
  assert.equal(
    c.summary,
    'Your accuracy was 93% and your typing speed was 22 WPM. You made 5 errors in this lesson, so your adjusted speed was 21 AWPM.',
  );
});

// ---------------------------------------------------------------- WPM-DI (pure part)

test('DI-01 normalization', () => {
  const tail = 'The quick brown fox jumps over the lazy dog again and again.';
  const r = svc().normalizeText(`\u201cHello\u201d\t\u2014  world\u2026\n${tail}`, 'custom');
  assert.ok(r.text.startsWith('"Hello" - world... '));
  assert.doesNotMatch(r.text, /[\t\n]| {2}/);
});

test('DI-02 non-keyboard characters rejected', () => {
  const r = svc().normalizeText(repeatTo('caf\u00e9 au lait ', 60), 'custom');
  assert.equal(r.errorCode, 'invalid_characters');
  assert.equal(r.message, 'Only characters on a standard US keyboard are supported.');
});

test('DI-03 / DI-04 length limits', () => {
  const s = svc();
  assert.equal(s.normalizeText(repeatTo('abcd', 49), 'custom').errorCode, 'too_short');
  assert.equal(s.normalizeText(repeatTo('abcd', 50), 'custom').text.length, 50);
  assert.equal(s.normalizeText(repeatTo('abcd', 2000), 'custom').text.length, 2000);
  assert.equal(s.normalizeText(repeatTo('abcd', 2001), 'custom').errorCode, 'too_long');
  assert.equal(
    s.normalizeText(`${repeatTo('abcd', 2000)}   `, 'custom').text.length,
    2000,
  );
  assert.equal(s.normalizeText(repeatTo('abcd', 2999), 'passage').errorCode, 'too_short');
  assert.equal(s.normalizeText(repeatTo('abcd', 3000), 'passage').text.length, 3000);
});
