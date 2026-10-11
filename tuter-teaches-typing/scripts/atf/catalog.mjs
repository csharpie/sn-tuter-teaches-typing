/* global describe, it, expect, svc, repeatTo, LogBuilder, typeEvenly, asUser,
   lessonByOrder, passageText, attemptRecord, countRows, backdate, submitAfter,
   findLesson, LESSON, isTrue, msSince, scoresEmpty, startLesson, passLesson,
   failLesson, speedRound, speedRoundChars, tooFastLog, profileWpm, setProfileWpm,
   newCustomPassage, practiceCustom, latestAttempt, attemptCount, userRecord,
   GlideRecord, GlideRecordSecure, GlideDateTime */
/**
 * ATF test catalog (docs/ATF_TEST_SPEC.md \u00a76), the source of truth for the
 * generated tests in src/fluent/tests/*.now.ts. Run `pnpm atf:generate` after
 * editing this file.
 *
 * Each step's `run` body is plain ES5 that runs on the instance inside a
 * "Run Server Side Validation Script" step, after the ATF_HELPERS library.
 * Steps run as the named fixture user (or as the test runner when `as` is
 * omitted). `fixture: true` adds the \u00a74.2 content fixture as the first step.
 */

const SPEC = 'docs/ATF_TEST_SPEC.md';

export const USERS = {
  player_a: {
    userName: 'atf.wpm.player_a', lastName: 'Player A', role: 'user', timeZone: 'America/New_York'
  },
  player_b: {
    userName: 'atf.wpm.player_b', lastName: 'Player B', role: 'user', timeZone: 'Asia/Tokyo'
  },
  admin: {
    userName: 'atf.wpm.admin', lastName: 'Content Admin', role: 'admin', timeZone: 'Europe/London'
  },
  norole: {
    userName: 'atf.wpm.norole', lastName: 'No Role', role: null, timeZone: 'America/Los_Angeles'
  }
};

/** \u00a74.2 content fixture, run as the test runner before any impersonation. */
export function contentFixture() {
  var lessons = new GlideRecord('x_snc_ttt_lesson');
  var passages;
  var seeds;
  var i;
  var lesson;
  var passage;
  lessons.addActiveQuery();
  lessons.setValue('active', false);
  lessons.updateMultiple();
  passages = new GlideRecord('x_snc_ttt_passage');
  passages.addActiveQuery();
  passages.setValue('active', false);
  passages.updateMultiple();
  seeds = ['sad lads a', 'gash ghash', 'quiet wipe'];
  for (i = 0; i < seeds.length; i += 1) {
    lesson = new GlideRecord('x_snc_ttt_lesson');
    lesson.initialize();
    lesson.setValue('title', 'ATF L' + (i + 1));
    lesson.setValue('unit', 'home_row');
    lesson.setValue('order', i + 1);
    lesson.setValue('focus_keys', 'atf');
    lesson.setValue('text', repeatTo(seeds[i], 100));
    lesson.setValue('min_accuracy', 90);
    lesson.setValue('target_net_wpm', 10);
    lesson.setValue('active', true);
    lesson.insert();
  }
  passage = new GlideRecord('x_snc_ttt_passage');
  passage.initialize();
  passage.setValue('title', 'ATF SP1');
  passage.setValue('text', repeatTo('abel tuter teaches typing to everyone ', 3000));
  passage.setValue('active', true);
  passage.insert();
}

const pure = (id, name, description, run) => ({
  id,
  name,
  description,
  suite: 'unit',
  steps: [{ run }]
});

export const TESTS = [
  // ============================================================ WPM-SC scoring (pure)
  pure(
    'SC-01',
    'Clean run scores 50 WPM',
    'Calls WpmAttemptService.score() with a 250-character passage typed correctly and evenly over 60 s, and asserts 50 WPM, 50 AWPM, 100% accuracy and no errors (B8 #1).',
    function sc01() {
      describe('score(): clean run', function scoreCleanRun() {
        it('scores 50 WPM with no errors', function scores50WpmWithNoErrors() {
          var passage = repeatTo('the quick brown fox ', 250);
          var r = svc().score(passage, typeEvenly(passage, 60000), LESSON);
          expect(r.elapsedMs).toBe(60000);
          expect(r.typedChars).toBe(250);
          expect(r.keystrokes).toBe(250);
          expect(r.missedKeystrokes).toBe(0);
          expect(r.errors).toBe(0);
          expect(r.grossWpm).toBe(50);
          expect(r.netWpm).toBe(50);
          expect(r.accuracy).toBe(100);
          expect(r.complete).toBe(true);
        });
      });
    }
  ),
  pure(
    'SC-02',
    'Corrected and uncorrected errors',
    'Scores a 300-character passage with 2 corrected and 4 uncorrected misses over 120 s, and asserts 302 keystrokes, 4 errors, 30 WPM, 28 AWPM and 98% accuracy (B8 #2).',
    function sc02() {
      describe('score(): corrected and uncorrected errors', function scoreCorrectedAndUncorrectedErrors() {
        it('counts corrected misses against accuracy only', function countsCorrectedMissesAgainstAccuracyOnly() {
          var p = repeatTo('typing tests are fun ', 300);
          var b = new LogBuilder();
          var i;
          var r;
          for (i = 0; i < p.length; i += 1) {
            if (i === 20 || i === 60) {
              b.miss(p.charAt(i)).back(1).type(p.charAt(i));
            } else if (i === 100 || i === 140 || i === 180 || i === 220) {
              b.miss(p.charAt(i));
            } else {
              b.type(p.charAt(i));
            }
          }
          r = svc().score(p, b.buildEven(120000), LESSON);
          expect(r.keystrokes).toBe(302);
          expect(r.missedKeystrokes).toBe(6);
          expect(r.typedChars).toBe(300);
          expect(r.errors).toBe(4);
          expect(r.grossWpm).toBe(30);
          expect(r.netWpm).toBe(28);
          expect(r.accuracy).toBe(98);
        });
      });
    }
  ),
  pure(
    'SC-03',
    'Reference example scores 22 WPM and 21 AWPM',
    'Scores the reference example (550 characters over 5 minutes with 36 corrected and 5 uncorrected misses) and asserts 22 WPM, 21 AWPM, 5 errors and 93% accuracy (B8 #3).',
    function sc03() {
      describe('score(): reference example', function scoreReferenceExample() {
        it('matches the reference numbers', function matchesTheReferenceNumbers() {
          var p = repeatTo('abel teaches typing ', 550);
          var corrected = {};
          var k;
          var uncorrected;
          var b;
          var i;
          var r;
          for (k = 0; k <= 35; k += 1) {
            corrected[7 + 15 * k] = true;
          }
          uncorrected = {
            10: true, 110: true, 210: true, 310: true, 410: true
          };
          b = new LogBuilder();
          for (i = 0; i < p.length; i += 1) {
            if (corrected[i]) {
              b.miss(p.charAt(i)).back(1).type(p.charAt(i));
            } else if (uncorrected[i]) {
              b.miss(p.charAt(i));
            } else {
              b.type(p.charAt(i));
            }
          }
          r = svc().score(p, b.buildEven(300000), LESSON);
          expect(r.keystrokes).toBe(586);
          expect(r.missedKeystrokes).toBe(41);
          expect(r.typedChars).toBe(550);
          expect(r.errors).toBe(5);
          expect(r.grossWpm).toBe(22);
          expect(r.netWpm).toBe(21);
          expect(r.accuracy).toBe(93);
        });
      });
    }
  ),
  pure(
    'SC-04',
    'One-second minimum',
    'Scores "hello" typed in 400 ms and asserts the formulas use a one-second minimum: 60 WPM and 60 AWPM.',
    function sc04() {
      describe('score(): one-second minimum', function scoreOneSecondMinimum() {
        it('uses at least 1,000 ms for minutes', function usesAtLeast1000Ms() {
          var r = svc().score('hello', typeEvenly('hello', 400), LESSON);
          expect(r.elapsedMs).toBe(400);
          expect(r.grossWpm).toBe(60);
          expect(r.netWpm).toBe(60);
        });
      });
    }
  ),
  pure(
    'SC-05',
    'AWPM never negative',
    'Scores ten wrong characters over 60 s and asserts 10 errors, 2 WPM, 0 AWPM (not negative) and 0% accuracy.',
    function sc05() {
      describe('score(): AWPM floor', function scoreAwpmFloor() {
        it('never goes below zero', function neverGoesBelowZero() {
          var b = new LogBuilder();
          var p = 'abcdefghij';
          var i;
          var r;
          for (i = 0; i < p.length; i += 1) {
            b.miss(p.charAt(i));
          }
          r = svc().score(p, b.buildEven(60000), LESSON);
          expect(r.errors).toBe(10);
          expect(r.grossWpm).toBe(2);
          expect(r.netWpm).toBe(0);
          expect(r.accuracy).toBe(0);
        });
      });
    }
  ),
  pure(
    'SC-06',
    'Timed mode ignores late keystrokes',
    'Scores a 60 s speed test whose log runs to 72 s and asserts that only the 250 keystrokes within 60 s count, for 50 WPM (B8 #8).',
    function sc06() {
      describe('score(): timed limit', function scoreTimedLimit() {
        it('discards keystrokes after the limit', function discardsKeystrokesAfterTheLimit() {
          var sp1 = repeatTo('abel tuter teaches typing to everyone ', 3000);
          var r = svc().score(
            sp1,
            typeEvenly(sp1.substring(0, 300), 72000),
            { mode: 'speed_test', durationSeconds: 60 }
          );
          expect(r.keystrokes).toBe(250);
          expect(r.typedChars).toBe(250);
          expect(r.elapsedMs).toBe(60000);
          expect(r.grossWpm).toBe(50);
        });
      });
    }
  ),
  pure(
    'SC-07',
    'Timed mode uses the full duration',
    'Scores 100 characters typed in the first 30 s of a 60 s test and asserts elapsed 60,000 ms and 20 WPM.',
    function sc07() {
      describe('score(): timed duration', function scoreTimedDuration() {
        it('divides by the whole duration', function dividesByTheWholeDuration() {
          var sp1 = repeatTo('abel tuter teaches typing to everyone ', 3000);
          var r = svc().score(
            sp1,
            typeEvenly(sp1.substring(0, 100), 30000),
            { mode: 'speed_test', durationSeconds: 60 }
          );
          expect(r.elapsedMs).toBe(60000);
          expect(r.grossWpm).toBe(20);
        });
      });
    }
  ),
  pure(
    'SC-08',
    'Timed mode with no keystrokes',
    'Scores an empty log in timed mode and asserts 0 keystrokes, 0% accuracy, 0 WPM and complete false.',
    function sc08() {
      describe('score(): idle timed round', function scoreIdleTimedRound() {
        it('scores nothing', function scoresNothing() {
          var sp1 = repeatTo('abel tuter teaches typing to everyone ', 3000);
          var r = svc().score(sp1, { v: 1, events: [] }, { mode: 'speed_test', durationSeconds: 60 });
          expect(r.keystrokes).toBe(0);
          expect(r.accuracy).toBe(0);
          expect(r.grossWpm).toBe(0);
          expect(r.complete).toBe(false);
        });
      });
    }
  ),
  pure(
    'SC-09',
    'Deletes on an empty buffer are ignored',
    'Replays two deletes before typing "abc" and asserts 3 keystrokes, 3 typed characters, no errors and 100% accuracy.',
    function sc09() {
      describe('score(): leading deletes', function scoreLeadingDeletes() {
        it('ignores deletes with nothing to delete', function ignoresDeletesWithNothingToDelete() {
          var r = svc().score('abc', new LogBuilder().back(2).type('abc').buildEven(3000), LESSON);
          expect(r.keystrokes).toBe(3);
          expect(r.typedChars).toBe(3);
          expect(r.errors).toBe(0);
          expect(r.accuracy).toBe(100);
        });
      });
    }
  ),
  pure(
    'SC-10',
    'Events after completion are ignored',
    'Types "abcdef" against the passage "abc" and asserts scoring stops at the third character, with elapsed 400 ms.',
    function sc10() {
      describe('score(): completion', function scoreCompletion() {
        it('ignores events after the passage is complete', function ignoresEventsAfterThePassageIs() {
          var log = new LogBuilder().type('abcdef').buildGaps(function gapAt(i) {
            return i * 200;
          });
          var r = svc().score('abc', log, LESSON);
          expect(r.typedChars).toBe(3);
          expect(r.keystrokes).toBe(3);
          expect(r.elapsedMs).toBe(400);
        });
      });
    }
  ),
  pure(
    'SC-11',
    'Per-key statistics',
    'Scores "Ab a" with one missed space and asserts per-key hits and misses use the lowercased expected character, with "space" for the space bar.',
    function sc11() {
      describe('score(): per-key stats', function scorePerKeyStats() {
        it('records hits and misses by expected key', function recordsHitsAndMissesByExpected() {
          var log = new LogBuilder().type('Ab').miss(' ').type('a')
            .buildEven(1000);
          var r = svc().score('Ab a', log, LESSON);
          expect(r.perKey.a.hits).toBe(2);
          expect(r.perKey.a.misses).toBe(0);
          expect(r.perKey.b.hits).toBe(1);
          expect(r.perKey.space.hits).toBe(0);
          expect(r.perKey.space.misses).toBe(1);
          expect(r.errors).toBe(1);
        });
      });
    }
  ),
  pure(
    'SC-12',
    'Rounding to one decimal',
    'Scores 251 characters in 60 s and asserts gross WPM 50.2.',
    function sc12() {
      describe('score(): rounding', function scoreRounding() {
        it('rounds WPM to one decimal place', function roundsWpmToOneDecimalPlace() {
          var p = repeatTo('round me ', 251);
          expect(svc().score(p, typeEvenly(p, 60000), LESSON).grossWpm).toBe(50.2);
        });
      });
    }
  ),
  pure(
    'SC-13',
    'Passing requires every condition',
    'Scores a 100-character lesson typed at 40 WPM with 100% accuracy, then changes one input at a time (accuracy minimum, AWPM target, incomplete passage, speed-test mode) and asserts only the base case passes.',
    function sc13() {
      describe('score(): pass conditions', function scorePassConditions() {
        var p = repeatTo('sad lads a', 100);
        var log = typeEvenly(p, 30000);
        it('passes the base case', function passesTheBaseCase() {
          expect(svc().score(p, log, LESSON).passed).toBe(true);
        });
        it('fails when accuracy is below the minimum', function failsWhenAccuracyIsBelowThe() {
          expect(svc().score(p, log, { mode: 'lesson', minAccuracy: 101, targetNetWpm: 10 }).passed).toBe(false);
        });
        it('fails when AWPM is below the target', function failsWhenAwpmIsBelowThe() {
          expect(svc().score(p, log, { mode: 'lesson', minAccuracy: 90, targetNetWpm: 41 }).passed).toBe(false);
        });
        it('fails when the passage is incomplete', function failsWhenThePassageIsIncomplete() {
          expect(svc().score(p, typeEvenly(p.substring(0, 99), 30000), LESSON).passed).toBe(false);
        });
        it('never passes outside lesson mode', function neverPassesOutsideLessonMode() {
          expect(svc().score(p, log, { mode: 'speed_test', minAccuracy: 90, targetNetWpm: 10 }).passed).toBe(false);
        });
      });
    }
  ),

  // ============================================================ WPM-LV log validation (pure)
  pure(
    'LV-01',
    'Valid log',
    'Passes a well-formed three-event log to validateLog() and asserts it returns null.',
    function lv01() {
      describe('validateLog(): valid', function validatelogValid() {
        it('accepts a well-formed log', function acceptsAWellFormedLog() {
          expect(svc().validateLog(typeEvenly('abc', 1000))).toBeNull();
        });
      });
    }
  ),
  pure(
    'LV-02',
    'Wrong version',
    'Passes logs with v 2 and with no v to validateLog() and asserts both are rejected as invalid_log.',
    function lv02() {
      describe('validateLog(): version', function validatelogVersion() {
        it('rejects other versions', function rejectsOtherVersions() {
          expect(svc().validateLog({ v: 2, events: [[0, 'i', 'a']] })).toBe('invalid_log');
          expect(svc().validateLog({ events: [[0, 'i', 'a']] })).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-03',
    'Offsets decrease',
    'Passes a log whose offsets go 0, 500, 400 to validateLog() and asserts invalid_log.',
    function lv03() {
      describe('validateLog(): ordering', function validatelogOrdering() {
        it('rejects decreasing offsets', function rejectsDecreasingOffsets() {
          expect(svc().validateLog({ v: 1, events: [[0, 'i', 'a'], [500, 'i', 'b'], [400, 'i', 'c']] })).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-04',
    'First offset, negative and non-integer offsets',
    'Passes logs that start above 0, use a negative offset, or use a fractional offset, and asserts each is invalid_log.',
    function lv04() {
      describe('validateLog(): offsets', function validatelogOffsets() {
        it('requires integer offsets starting at 0', function requiresIntegerOffsetsStartingAt0() {
          expect(svc().validateLog({ v: 1, events: [[5, 'i', 'a']] })).toBe('invalid_log');
          expect(svc().validateLog({ v: 1, events: [[-1, 'i', 'a']] })).toBe('invalid_log');
          expect(svc().validateLog({ v: 1, events: [[0, 'i', 'a'], [10.5, 'i', 'b']] })).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-05',
    'Multi-character or missing insert',
    'Passes inserts with two characters, no character and an empty character, and asserts each is invalid_log.',
    function lv05() {
      describe('validateLog(): insert characters', function validatelogInsertCharacters() {
        it('requires exactly one character per insert', function requiresExactlyOneCharacterPerInsert() {
          expect(svc().validateLog({ v: 1, events: [[0, 'i', 'ab']] })).toBe('invalid_log');
          expect(svc().validateLog({ v: 1, events: [[0, 'i']] })).toBe('invalid_log');
          expect(svc().validateLog({ v: 1, events: [[0, 'i', '']] })).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-06',
    'Unknown event type or a delete with a character',
    'Passes an unknown event type and a delete that carries a character, and asserts each is invalid_log.',
    function lv06() {
      describe('validateLog(): event types', function validatelogEventTypes() {
        it('accepts only i and d events', function acceptsOnlyIAndDEvents() {
          expect(svc().validateLog({ v: 1, events: [[0, 'x', 'a']] })).toBe('invalid_log');
          expect(svc().validateLog({ v: 1, events: [[0, 'i', 'a'], [10, 'd', 'a']] })).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-07',
    'Size limit',
    'Passes logs of exactly 20,000 and 20,001 events and asserts the first is valid and the second is invalid_log.',
    function lv07() {
      describe('validateLog(): size limit', function validatelogSizeLimit() {
        function big(n) {
          var events = [];
          var i;
          for (i = 0; i < n; i += 1) {
            events.push([i, 'i', 'a']);
          }
          return { v: 1, events: events };
        }
        it('accepts 20,000 events and rejects 20,001', function accepts20000EventsAndRejects() {
          expect(svc().validateLog(big(20000))).toBeNull();
          expect(svc().validateLog(big(20001))).toBe('invalid_log');
        });
      });
    }
  ),
  pure(
    'LV-08',
    'Not an object',
    'Passes null, a string and an object without events to validateLog() and asserts each is invalid_log.',
    function lv08() {
      describe('validateLog(): shape', function validatelogShape() {
        it('rejects non-log values', function rejectsNonLogValues() {
          expect(svc().validateLog(null)).toBe('invalid_log');
          expect(svc().validateLog('{"v":1,"events":[]}')).toBe('invalid_log');
          expect(svc().validateLog({ v: 1 })).toBe('invalid_log');
        });
      });
    }
  ),

  // ============================================================ WPM-CO coach (pure)
  pure(
    'CO-01',
    'Flagged wins over everything',
    'Calls chooseCoach() for a flagged result with 100% accuracy and asserts rule 1, "Let\'s try that again" and an empty summary.',
    function co01() {
      describe('chooseCoach(): rule 1', function choosecoachRule1() {
        it('uses rule 1 for flagged attempts', function usesRule1ForFlaggedAttempts() {
          var c = svc().chooseCoach({
            flagged: true, passed: false, accuracy: 100, personalBest: false
          }, LESSON);
          expect(c.rule).toBe(1);
          expect(c.headline).toBe("Let's try that again");
          expect(c.summary).toBe('');
        });
      });
    }
  ),
  pure(
    'CO-02',
    'New personal best',
    'Calls chooseCoach() for a passed personal best and asserts rule 2 with "New personal best!" and "Ready for the next lesson?".',
    function co02() {
      describe('chooseCoach(): rule 2', function choosecoachRule2() {
        it('celebrates a passed personal best', function celebratesAPassedPersonalBest() {
          var c = svc().chooseCoach({
            passed: true, personalBest: true, accuracy: 100, netWpm: 40, grossWpm: 40, errors: 0
          }, LESSON);
          expect(c.rule).toBe(2);
          expect(c.headline).toBe('New personal best!');
          expect(c.advice).toBe('Ready for the next lesson?');
        });
      });
    }
  ),
  pure(
    'CO-03',
    'Passed',
    'Calls chooseCoach() for a passed attempt that is not a personal best and asserts rule 3 with "Good job!".',
    function co03() {
      describe('chooseCoach(): rule 3', function choosecoachRule3() {
        it('says good job for a pass', function saysGoodJobForAPass() {
          var c = svc().chooseCoach({
            passed: true, personalBest: false, accuracy: 95, netWpm: 30, grossWpm: 30, errors: 1
          }, LESSON);
          expect(c.rule).toBe(3);
          expect(c.headline).toBe('Good job!');
          expect(c.advice).toBe('Ready for the next lesson?');
        });
      });
    }
  ),
  pure(
    'CO-04',
    'Accuracy rule comes before speed',
    'Calls chooseCoach() for a failed attempt below both the accuracy minimum and the AWPM target and asserts rule 4, whose advice names 90%.',
    function co04() {
      describe('chooseCoach(): rule 4', function choosecoachRule4() {
        it('asks for accuracy first', function asksForAccuracyFirst() {
          var c = svc().chooseCoach({
            passed: false, accuracy: 85, netWpm: 5, grossWpm: 10, errors: 5
          }, LESSON);
          expect(c.rule).toBe(4);
          expect(c.headline).toBe('Slow down a little');
          expect(c.advice).toContain('90%');
        });
      });
    }
  ),
  pure(
    'CO-05',
    'Speed below target',
    'Calls chooseCoach() for a failed attempt with good accuracy but AWPM below target and asserts rule 5, whose advice names 10 AWPM.',
    function co05() {
      describe('chooseCoach(): rule 5', function choosecoachRule5() {
        it('asks for a steadier rhythm', function asksForASteadierRhythm() {
          var c = svc().chooseCoach({
            passed: false, accuracy: 95, netWpm: 5, grossWpm: 5, errors: 0
          }, LESSON);
          expect(c.rule).toBe(5);
          expect(c.headline).toBe('Almost there');
          expect(c.advice).toContain('10 AWPM');
        });
      });
    }
  ),
  pure(
    'CO-06',
    'Speed test',
    'Calls chooseCoach() in speed-test mode with and without a personal best and asserts rule 6 both times, with the matching headline.',
    function co06() {
      describe('chooseCoach(): rule 6', function choosecoachRule6() {
        it('uses rule 6 without pass criteria', function usesRule6WithoutPassCriteria() {
          var best = svc().chooseCoach({
            personalBest: true, accuracy: 97, grossWpm: 40, netWpm: 39, errors: 1
          }, { mode: 'speed_test' });
          var plain = svc().chooseCoach({
            personalBest: false, accuracy: 97, grossWpm: 40, netWpm: 39, errors: 1
          }, { mode: 'speed_test' });
          expect(best.rule).toBe(6);
          expect(best.headline).toBe('New personal best!');
          expect(plain.rule).toBe(6);
          expect(plain.headline).toBe('Nice work!');
        });
      });
    }
  ),
  pure(
    'CO-07',
    'Exact summary sentence',
    'Calls chooseCoach() with 93% accuracy, 22 WPM, 5 errors and 21 AWPM and asserts the exact B5 summary sentence (B8 #3).',
    function co07() {
      describe('chooseCoach(): summary', function choosecoachSummary() {
        it('explains the numbers exactly', function explainsTheNumbersExactly() {
          var c = svc().chooseCoach({
            accuracy: 93, grossWpm: 22, errors: 5, netWpm: 21, passed: true
          }, LESSON);
          expect(c.summary).toBe('Your accuracy was 93% and your typing speed was 22 WPM. You made 5 errors in this lesson, so your adjusted speed was 21 AWPM.');
        });
      });
    }
  ),

  // ============================================================ WPM-LC lifecycle
  {
    id: 'LC-01',
    name: 'Start takes a snapshot',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'As Player A, starts lesson L1 and asserts one in-progress attempt owned by A with L1\'s text and title as the snapshot, a start time within 5 s, and empty score fields.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('startAttempt(): snapshot', function startattemptSnapshot() {
          it('stores an in-progress attempt with a snapshot', function storesAnInProgressAttemptWith() {
            var lesson = lessonByOrder(1);
            var res = svc().startAttempt({ mode: 'lesson', lessonId: lesson.sys_id });
            var gr = attemptRecord(res.attempt.sysId);
            expect(attemptCount('atf.wpm.player_a')).toBe(1);
            expect(gr.getValue('user')).toBe(asUser('atf.wpm.player_a'));
            expect(gr.getValue('state')).toBe('in_progress');
            expect(gr.getValue('passage_text')).toBe(lesson.text);
            expect(gr.getValue('passage_title')).toBe(lesson.title);
            expect(msSince(gr.getValue('started_on'))).toBeLessThan(5000);
            expect(scoresEmpty(gr)).toBe(true);
          });
        });
      }
    }]
  },
  {
    id: 'LC-02',
    name: 'Starting abandons earlier attempts',
    suite: 'integration',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Player A starts two attempts, Player B starts one, then A starts a third; asserts A\'s first two are abandoned, the third is in progress and B\'s is untouched (B8 #9).',
    steps: [
      {
        as: 'player_a',
        jasmine: false,
        run: function run() {
          startLesson(1);
          startLesson(1);
        }
      },
      {
        as: 'player_b',
        jasmine: false,
        run: function run() {
          startLesson(1);
        }
      },
      {
        as: 'player_a',
        run: function run() {
          describe('startAttempt(): abandons earlier attempts', function startattemptAbandonsEarlierAttempts() {
            it('leaves only the newest attempt in progress', function leavesOnlyTheNewestAttemptIn() {
              var third = startLesson(1).attempt.sysId;
              expect(attemptRecord(third).getValue('state')).toBe('in_progress');
              expect(attemptCount('atf.wpm.player_a', 'state=abandoned')).toBe(2);
              expect(attemptCount('atf.wpm.player_a', 'state=in_progress')).toBe(1);
              expect(attemptCount('atf.wpm.player_b', 'state=in_progress')).toBe(1);
            });
          });
        }
      }
    ]
  },
  {
    id: 'LC-03',
    name: 'Speed-test passage choice',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Starts a 60 s speed test with SP1 as the only active passage and asserts its text is the snapshot; then deactivates SP1 and asserts the next start returns no_passages without creating a row.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('startAttempt(): speed-test passage', function startattemptSpeedTestPassage() {
          it('snapshots an active passage, and refuses when there is none', function snapshotsAnActivePassageAndRefuses() {
            var first = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            var sp1;
            var before;
            var second;
            expect(attemptRecord(first.attempt.sysId).getValue('passage_text')).toBe(passageText('ATF SP1'));
            sp1 = new GlideRecord('x_snc_ttt_passage');
            sp1.addQuery('title', 'ATF SP1');
            sp1.query();
            sp1.next();
            sp1.setValue('active', false);
            sp1.update();
            before = attemptCount('atf.wpm.player_a');
            second = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            expect(second.errorCode).toBe('no_passages');
            expect(attemptCount('atf.wpm.player_a')).toBe(before);
          });
        });
      }
    }]
  },
  {
    id: 'LC-04',
    name: 'Speed-test text is hidden until start',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Calls getSessionConfig() for a 60 s speed test and asserts the config carries no passage text.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getSessionConfig(): speed test', function getsessionconfigSpeedTest() {
          it('does not reveal the passage', function doesNotRevealThePassage() {
            var cfg = svc().getSessionConfig({ mode: 'speed_test', durationSeconds: 60 });
            expect(cfg.errorCode).toBeUndefined();
            expect(cfg.passage && cfg.passage.text ? cfg.passage.text : '').toBe('');
          });
        });
      }
    }]
  },
  {
    id: 'LC-05',
    name: 'Completed lesson attempt stores scores',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Passes L1 at 40 WPM and asserts the attempt is completed with 40.0 WPM, 100% accuracy and passed, and that one attempt_key row exists per distinct key.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): lesson', function submitattemptLesson() {
          it('stores a completed, scored attempt', function storesACompletedScoredAttempt() {
            var lesson = lessonByOrder(1);
            var start = svc().startAttempt({ mode: 'lesson', lessonId: lesson.sys_id });
            var res = submitAfter(start.attempt.sysId, typeEvenly(lesson.text, 30000), 'complete');
            var gr;
            expect(res.result.state).toBe('completed');
            gr = attemptRecord(start.attempt.sysId);
            expect(gr.getValue('state')).toBe('completed');
            expect(gr.getValue('completed_on')).toBeTruthy();
            expect(parseFloat(gr.getValue('gross_wpm'))).toBe(40);
            expect(parseInt(gr.getValue('accuracy'), 10)).toBe(100);
            expect(isTrue(gr.getValue('passed'))).toBe(true);
            expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + start.attempt.sysId)).toBe(5);
          });
        });
      }
    }]
  },
  {
    id: 'LC-06',
    name: 'Exit part-way',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Submits the first 40 characters of L1 with ended exit and asserts the attempt is abandoned with empty scores and no attempt_key rows.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): exit', function submitattemptExit() {
          it('abandons without scoring', function abandonsWithoutScoring() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res = submitAfter(start.attempt.sysId, typeEvenly(lesson.text.substring(0, 40), 12000), 'exit');
            var gr;
            expect(res.result.state).toBe('abandoned');
            gr = attemptRecord(start.attempt.sysId);
            expect(gr.getValue('state')).toBe('abandoned');
            expect(scoresEmpty(gr)).toBe(true);
            expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + start.attempt.sysId)).toBe(0);
          });
        });
      }
    }]
  },
  {
    id: 'LC-07',
    name: 'Part-way submission claiming complete',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Submits only 40 characters of L1 with ended complete and asserts invalid_log and a rejected attempt.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): false completion', function submitattemptFalseCompletion() {
          it('rejects an incomplete "complete"', function rejectsAnIncompleteComplete() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res = submitAfter(start.attempt.sysId, typeEvenly(lesson.text.substring(0, 40), 12000), 'complete');
            expect(res.errorCode).toBe('invalid_log');
            expect(attemptRecord(start.attempt.sysId).getValue('state')).toBe('rejected');
          });
        });
      }
    }]
  },
  {
    id: 'LC-08',
    name: 'Timing check rejects a too-long log',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Backdates an attempt by 10 s and submits a log whose last offset is 20 s; asserts invalid_timing, a rejected attempt and empty scores (B8 #6).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): timing', function submitattemptTiming() {
          it('rejects a log longer than the server-measured time', function rejectsALogLongerThanThe() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res;
            var gr;
            backdate(start.attempt.sysId, 10);
            res = svc().submitAttempt({ attemptId: start.attempt.sysId, log: typeEvenly(lesson.text, 20000), ended: 'complete' });
            expect(res.errorCode).toBe('invalid_timing');
            gr = attemptRecord(start.attempt.sysId);
            expect(gr.getValue('state')).toBe('rejected');
            expect(scoresEmpty(gr)).toBe(true);
          });
        });
      }
    }]
  },
  {
    id: 'LC-09',
    name: 'Timing tolerance',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Backdates an attempt by 30 s and submits a complete log ending at 31.5 s; asserts it is accepted within the 2,000 ms tolerance.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): tolerance', function submitattemptTolerance() {
          it('accepts a log within 2 s of the server time', function acceptsALogWithin2S() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res;
            backdate(start.attempt.sysId, 30);
            res = svc().submitAttempt({ attemptId: start.attempt.sysId, log: typeEvenly(lesson.text, 31500), ended: 'complete' });
            expect(res.errorCode).toBeUndefined();
            expect(attemptRecord(start.attempt.sysId).getValue('state')).toBe('completed');
          });
        });
      }
    }]
  },
  {
    id: 'LC-10',
    name: 'Expired attempt',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Backdates an attempt by 61 minutes and submits a valid log; asserts expired and an abandoned attempt.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): expiry', function submitattemptExpiry() {
          it('expires attempts older than 60 minutes', function expiresAttemptsOlderThan60Minutes() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res;
            backdate(start.attempt.sysId, 3660);
            res = svc().submitAttempt({ attemptId: start.attempt.sysId, log: typeEvenly(lesson.text, 30000), ended: 'complete' });
            expect(res.errorCode).toBe('expired');
            expect(attemptRecord(start.attempt.sysId).getValue('state')).toBe('abandoned');
          });
        });
      }
    }]
  },
  {
    id: 'LC-11',
    name: 'Not found',
    suite: 'integration',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Asserts not_found when Player B submits A\'s attempt (leaving it unchanged), for a malformed id, and for a second submission of the same attempt.',
    steps: [
      {
        as: 'player_a',
        jasmine: false,
        run: function run() {
          startLesson(1);
        }
      },
      {
        as: 'player_b',
        run: function run() {
          describe('submitAttempt(): someone else\'s attempt', function submitattemptSomeoneElseSAttempt() {
            it('is not found and leaves the attempt unchanged', function isNotFoundAndLeavesThe() {
              var theirs = latestAttempt('atf.wpm.player_a');
              var lesson = lessonByOrder(1);
              var res;
              backdate(theirs.getUniqueValue(), 40);
              res = svc().submitAttempt({ attemptId: theirs.getUniqueValue(), log: typeEvenly(lesson.text, 30000), ended: 'complete' });
              expect(res.errorCode).toBe('not_found');
              expect(attemptRecord(theirs.getUniqueValue()).getValue('state')).toBe('in_progress');
            });
            it('rejects a malformed id', function rejectsAMalformedId() {
              expect(svc().submitAttempt({ attemptId: 'not-a-sys-id', log: { v: 1, events: [] }, ended: 'exit' }).errorCode).toBe('not_found');
            });
          });
        }
      },
      {
        as: 'player_a',
        run: function run() {
          describe('submitAttempt(): twice', function submitattemptTwice() {
            it('only accepts the first submission', function onlyAcceptsTheFirstSubmission() {
              var lesson = lessonByOrder(1);
              var start = startLesson(1);
              var log = typeEvenly(lesson.text, 30000);
              expect(submitAfter(start.attempt.sysId, log, 'complete').errorCode).toBeUndefined();
              expect(svc().submitAttempt({ attemptId: start.attempt.sysId, log: log, ended: 'complete' }).errorCode).toBe('not_found');
            });
          });
        }
      }
    ]
  },
  {
    id: 'LC-12',
    name: 'Abandon',
    suite: 'integration',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Player A abandons their own attempt (abandoned); Player B tries to abandon A\'s next attempt and gets not_found while it stays in progress.',
    steps: [
      {
        as: 'player_a',
        run: function run() {
          describe('abandonAttempt(): own attempt', function abandonattemptOwnAttempt() {
            it('abandons it', function abandonsIt() {
              var start = startLesson(1);
              var result = svc().abandonAttempt({ attemptId: start.attempt.sysId });
              expect(result.errorCode).toBeUndefined();
              expect(attemptRecord(start.attempt.sysId).getValue('state')).toBe('abandoned');
              startLesson(1);
            });
          });
        }
      },
      {
        as: 'player_b',
        run: function run() {
          describe('abandonAttempt(): someone else\'s attempt', function abandonattemptSomeoneElseSAttempt() {
            it('is not found', function isNotFound() {
              var theirs = new GlideRecord('x_snc_ttt_attempt');
              theirs.addQuery('user', asUser('atf.wpm.player_a'));
              theirs.addQuery('state', 'in_progress');
              theirs.query();
              theirs.next();
              expect(svc().abandonAttempt({ attemptId: theirs.getUniqueValue() }).errorCode).toBe('not_found');
              expect(attemptRecord(theirs.getUniqueValue()).getValue('state')).toBe('in_progress');
            });
          });
        }
      }
    ]
  },
  {
    id: 'LC-13',
    name: 'Idle speed test',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Submits a 60 s speed test with no keystrokes and ended timeout; asserts it is abandoned, unscored, and returns a null profileWpm.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): idle speed test', function submitattemptIdleSpeedTest() {
          it('abandons a round with no keystrokes', function abandonsARoundWithNoKeystrokes() {
            var start = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            var res = submitAfter(start.attempt.sysId, { v: 1, events: [] }, 'timeout');
            var gr;
            expect(res.result.state).toBe('abandoned');
            expect(res.result.profileWpm).toBeNull();
            gr = attemptRecord(start.attempt.sysId);
            expect(gr.getValue('state')).toBe('abandoned');
            expect(scoresEmpty(gr)).toBe(true);
          });
        });
      }
    }]
  },

  // ============================================================ WPM-FL flagging
  {
    id: 'FL-01',
    name: 'Uniform intervals are flagged',
    suite: 'integration',
    description: 'Scores L1\'s text typed in 10-character bursts (5 ms apart, 3 s between bursts) and asserts it is flagged as uniform_intervals (B8 #7).',
    steps: [{
      run: function run() {
        describe('score(): uniform intervals', function scoreUniformIntervals() {
          it('flags 90% of intervals under 15 ms', function flags90OfIntervalsUnder15() {
            var text = repeatTo('sad lads a', 100);
            var log = new LogBuilder().type(text).buildGaps(function gapAt(i) {
              return Math.floor(i / 10) * 3045 + (i % 10) * 5;
            });
            var r = svc().score(text, log, LESSON);
            expect(r.flagged).toBe(true);
            expect(r.flagReason).toBe('uniform_intervals');
          });
        });
      }
    }]
  },
  {
    id: 'FL-02',
    name: 'Too fast is flagged',
    suite: 'integration',
    description: 'Scores L1\'s text with a constant 20 ms gap (a 50-character window at 612 WPM) and asserts it is flagged as too_fast.',
    steps: [{
      run: function run() {
        describe('score(): too fast', function scoreTooFast() {
          it('flags a window faster than 250 WPM', function flagsAWindowFasterThan250() {
            var text = repeatTo('sad lads a', 100);
            var r = svc().score(text, tooFastLog(text), LESSON);
            expect(r.flagged).toBe(true);
            expect(r.flagReason).toBe('too_fast');
          });
        });
      }
    }]
  },
  {
    id: 'FL-03',
    name: 'Both conditions report uniform intervals',
    suite: 'integration',
    description: 'Scores L1\'s text with a constant 5 ms gap, which fails both checks, and asserts flagReason uniform_intervals.',
    steps: [{
      run: function run() {
        describe('score(): both flags', function scoreBothFlags() {
          it('prefers uniform_intervals', function prefersUniformIntervals() {
            var text = repeatTo('sad lads a', 100);
            var log = new LogBuilder().type(text).buildGaps(function gapAt(i) {
              return i * 5;
            });
            expect(svc().score(text, log, LESSON).flagReason).toBe('uniform_intervals');
          });
        });
      }
    }]
  },
  {
    id: 'FL-04',
    name: 'Normal typing is not flagged',
    suite: 'integration',
    description: 'Scores L1\'s text with gaps cycling 180, 240 and 300 ms and asserts it is not flagged.',
    steps: [{
      run: function run() {
        describe('score(): normal rhythm', function scoreNormalRhythm() {
          it('does not flag human typing', function doesNotFlagHumanTyping() {
            var text = repeatTo('sad lads a', 100);
            var gaps = [180, 240, 300];
            var offsets = [0];
            var i;
            var log;
            for (i = 1; i < text.length; i += 1) {
              offsets.push(offsets[i - 1] + gaps[(i - 1) % 3]);
            }
            log = new LogBuilder().type(text).buildGaps(function gapAt(index) {
              return offsets[index];
            });
            expect(svc().score(text, log, LESSON).flagged).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'FL-05',
    name: 'Effects of a flagged attempt',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Submits L1 with the too-fast log as Player A and asserts a completed, flagged, not-passed, not-personal-best attempt with no key rows, coach rule 1, and L2 still locked.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('submitAttempt(): flagged', function submitattemptFlagged() {
          it('is stored but never counts', function isStoredButNeverCounts() {
            var lesson = lessonByOrder(1);
            var start = startLesson(1);
            var res = submitAfter(start.attempt.sysId, tooFastLog(lesson.text), 'complete');
            var gr = attemptRecord(start.attempt.sysId);
            expect(gr.getValue('state')).toBe('completed');
            expect(isTrue(gr.getValue('flagged'))).toBe(true);
            expect(isTrue(gr.getValue('passed'))).toBe(false);
            expect(isTrue(gr.getValue('personal_best'))).toBe(false);
            expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + start.attempt.sysId)).toBe(0);
            expect(res.result.coach.rule).toBe(1);
            expect(findLesson(svc().getLessonMap(), lessonByOrder(2).sys_id).status).toBe('locked');
          });
        });
      }
    }]
  },

  // ============================================================ WPM-LS lessons and unlocking
  {
    id: 'LS-01',
    name: 'New player lesson map',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Calls getLessonMap() for a new player and asserts L1 available, L2 and L3 locked, 0 of 3 completed and L1 as the next lesson.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getLessonMap(): new player', function getlessonmapNewPlayer() {
          it('opens only the first lesson', function opensOnlyTheFirstLesson() {
            var map = svc().getLessonMap();
            expect(findLesson(map, lessonByOrder(1).sys_id).status).toBe('available');
            expect(findLesson(map, lessonByOrder(2).sys_id).status).toBe('locked');
            expect(findLesson(map, lessonByOrder(3).sys_id).status).toBe('locked');
            expect(map.completedCount).toBe(0);
            expect(map.totalCount).toBe(3);
            expect(map.nextLessonId).toBe(lessonByOrder(1).sys_id);
          });
        });
      }
    }]
  },
  {
    id: 'LS-02',
    name: 'Passing unlocks the next lesson',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Passes L1 and asserts the map shows L1 passed, L2 available and L3 locked, and that the result names L2 as the unlocked next lesson (B8 #4).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getLessonMap(): after a pass', function getlessonmapAfterAPass() {
          it('unlocks the next lesson only', function unlocksTheNextLessonOnly() {
            var res = passLesson(1);
            var map = svc().getLessonMap();
            expect(findLesson(map, lessonByOrder(1).sys_id).status).toBe('passed');
            expect(findLesson(map, lessonByOrder(2).sys_id).status).toBe('available');
            expect(findLesson(map, lessonByOrder(3).sys_id).status).toBe('locked');
            expect(res.result.nextLessonId).toBe(lessonByOrder(2).sys_id);
            expect(res.result.nextLessonUnlocked).toBe(true);
          });
        });
      }
    }]
  },
  {
    id: 'LS-03',
    name: 'Failing does not unlock',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Fails L1 on accuracy (85%) and asserts L1 stays available, L2 stays locked, and the result is not passed with nextLessonUnlocked false (B8 #4).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getLessonMap(): after a fail', function getlessonmapAfterAFail() {
          it('keeps the next lesson locked', function keepsTheNextLessonLocked() {
            var res = failLesson(1);
            var map = svc().getLessonMap();
            expect(findLesson(map, lessonByOrder(1).sys_id).status).toBe('available');
            expect(findLesson(map, lessonByOrder(2).sys_id).status).toBe('locked');
            expect(res.result.passed).toBe(false);
            expect(res.result.nextLessonUnlocked).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'LS-04',
    name: 'Locked lesson for a player',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Player A tries to start locked lesson L2 and gets locked, with no attempt row created.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('startAttempt(): locked lesson', function startattemptLockedLesson() {
          it('refuses to start', function refusesToStart() {
            expect(svc().startAttempt({ mode: 'lesson', lessonId: lessonByOrder(2).sys_id }).errorCode).toBe('locked');
            expect(attemptCount('atf.wpm.player_a')).toBe(0);
          });
        });
      }
    }]
  },
  {
    id: 'LS-05',
    name: 'Locked lesson for an admin',
    suite: 'integration',
    fixture: true,
    users: ['admin'],
    description: 'The content admin starts lesson L3, which is locked for players, and gets an in-progress attempt.',
    steps: [{
      as: 'admin',
      run: function run() {
        describe('startAttempt(): admin', function startattemptAdmin() {
          it('can play any lesson', function canPlayAnyLesson() {
            var res = svc().startAttempt({ mode: 'lesson', lessonId: lessonByOrder(3).sys_id });
            expect(res.errorCode).toBeUndefined();
            expect(attemptRecord(res.attempt.sysId).getValue('state')).toBe('in_progress');
          });
        });
      }
    }]
  },
  {
    id: 'LS-06',
    name: 'Inactive lessons are skipped',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Deactivates L2, passes L1, and asserts L2 is absent from the map, L3 is available and the total is 2.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getLessonMap(): inactive lesson', function getlessonmapInactiveLesson() {
          it('skips it when unlocking', function skipsItWhenUnlocking() {
            var l2 = lessonByOrder(2);
            var l3 = lessonByOrder(3);
            var gr = new GlideRecord('x_snc_ttt_lesson');
            var map;
            gr.get(l2.sys_id);
            gr.setValue('active', false);
            gr.update();
            passLesson(1);
            map = svc().getLessonMap();
            expect(findLesson(map, l2.sys_id)).toBeNull();
            expect(findLesson(map, l3.sys_id).status).toBe('available');
            expect(map.totalCount).toBe(2);
          });
        });
      }
    }]
  },
  {
    id: 'LS-07',
    name: 'Best scores on the map',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Passes L1 at 20 and 25 AWPM and fails it once; asserts the map shows best 25 AWPM and 100% accuracy, ignoring the failed attempt.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('getLessonMap(): best scores', function getlessonmapBestScores() {
          it('shows the best passed scores', function showsTheBestPassedScores() {
            var lesson;
            passLesson(1, 60000);
            passLesson(1, 48000);
            failLesson(1);
            lesson = findLesson(svc().getLessonMap(), lessonByOrder(1).sys_id);
            expect(lesson.bestNetWpm).toBe(25);
            expect(lesson.bestAccuracy).toBe(100);
          });
        });
      }
    }]
  },
  {
    id: 'LS-08',
    name: 'Custom practice never unlocks',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Player A practices a custom passage with L1\'s text perfectly and asserts L2 is still locked.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('custom practice', function customPractice() {
          it('does not unlock lessons', function doesNotUnlockLessons() {
            var passageId = newCustomPassage('L1 copy', lessonByOrder(1).text);
            expect(practiceCustom(passageId).result.state).toBe('completed');
            expect(findLesson(svc().getLessonMap(), lessonByOrder(2).sys_id).status).toBe('locked');
          });
        });
      }
    }]
  },
  {
    id: 'LS-09',
    name: 'Other players do not unlock your lessons',
    suite: 'integration',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Player B passes L1; asserts Player A\'s L2 is still locked.',
    steps: [
      {
        as: 'player_b',
        jasmine: false,
        run: function run() {
          passLesson(1);
        }
      },
      {
        as: 'player_a',
        run: function run() {
          describe('getLessonMap(): isolation', function getlessonmapIsolation() {
            it('only counts your own passes', function onlyCountsYourOwnPasses() {
              expect(findLesson(svc().getLessonMap(), lessonByOrder(2).sys_id).status).toBe('locked');
            });
          });
        }
      }
    ]
  },

  // ============================================================ WPM-PB personal best
  {
    id: 'PB-01',
    name: 'First attempt is never a personal best',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Player A\'s first L1 attempt at 20 AWPM is stored with personal_best false.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('personal best: first attempt', function personalBestFirstAttempt() {
          it('is not a personal best', function isNotAPersonalBest() {
            expect(passLesson(1, 60000).result.personalBest).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'PB-02',
    name: 'Beating, then tying',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Attempts at 20, 25 and 25 AWPM give personal_best false, true, false: a tie does not count.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('personal best: beating and tying', function personalBestBeatingAndTying() {
          it('needs a strictly higher AWPM', function needsAStrictlyHigherAwpm() {
            expect(passLesson(1, 60000).result.personalBest).toBe(false);
            expect(passLesson(1, 48000).result.personalBest).toBe(true);
            expect(passLesson(1, 48000).result.personalBest).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'PB-03',
    name: 'Scoped to the speed-test duration',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Speed tests of 60 s at 22, 60 s at 25 and 120 s at 30 WPM give personal_best false, true, false: the first 120 s round has nothing to beat.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('personal best: per duration', function personalBestPerDuration() {
          it('compares only rounds of the same length', function comparesOnlyRoundsOfTheSame() {
            expect(speedRound(60, 22).result.personalBest).toBe(false);
            expect(speedRound(60, 25).result.personalBest).toBe(true);
            expect(speedRound(120, 30).result.personalBest).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'PB-04',
    name: 'Flagged attempts do not count',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'An attempt at 25 AWPM, a flagged attempt (about 612 AWPM), then 30 AWPM give personal_best false, false, true: the flagged attempt does not raise the bar.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('personal best: flagged attempts', function personalBestFlaggedAttempts() {
          it('ignores flagged attempts', function ignoresFlaggedAttempts() {
            var lesson;
            var flagged;
            var res;
            expect(passLesson(1, 48000).result.personalBest).toBe(false);
            lesson = lessonByOrder(1);
            flagged = startLesson(1);
            res = submitAfter(flagged.attempt.sysId, tooFastLog(lesson.text), 'complete');
            expect(res.result.flagged).toBe(true);
            expect(res.result.personalBest).toBe(false);
            expect(passLesson(1, 40000).result.personalBest).toBe(true);
          });
        });
      }
    }]
  },

  // ============================================================ WPM-PW profile WPM
  {
    id: 'PW-01',
    name: 'Latest and best over four rounds',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Four 60 s rounds at 22, 31, 25 and 31 WPM leave latest/best at 22/22, 31/31, 25/31 and 31/31 on Player A\'s user record, with isNewBest true, true, false, false (B8 #12).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: latest and best', function profileWpmLatestAndBest() {
          it('tracks the latest and the best round', function tracksTheLatestAndTheBest() {
            var expected = [
              [22, 22, 22, true],
              [31, 31, 31, true],
              [25, 25, 31, false],
              [31, 31, 31, false]
            ];
            var i;
            var res;
            var p;
            for (i = 0; i < expected.length; i += 1) {
              res = speedRound(60, expected[i][0]);
              p = profileWpm('atf.wpm.player_a');
              expect(res.result.profileWpm.saved).toBe(true);
              expect(parseInt(p.latest, 10)).toBe(expected[i][1]);
              expect(parseInt(p.best, 10)).toBe(expected[i][2]);
              expect(res.result.profileWpm.isNewBest).toBe(expected[i][3]);
            }
          });
        });
      }
    }]
  },
  {
    id: 'PW-02',
    name: 'Rounds that do not update the profile',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'With latest 40 and best 50, a lesson, a custom passage, an exited, rejected, flagged or early-timeout speed test all leave both values unchanged, and every scored case returns a null profileWpm (B8 #13).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: non-qualifying rounds', function profileWpmNonQualifyingRounds() {
          function unchanged() {
            var p = profileWpm('atf.wpm.player_a');
            expect(parseInt(p.latest, 10)).toBe(40);
            expect(parseInt(p.best, 10)).toBe(50);
          }
          it('ignores lessons, custom passages and unfinished or unverified tests', function ignoresLessonsCustomPassagesAndUnfinished() {
            var sp1 = passageText('ATF SP1');
            var custom;
            var exited;
            var rejected;
            var flagged;
            var flaggedRes;
            var early;
            var earlyRes;
            setProfileWpm('atf.wpm.player_a', 40, 50);

            expect(passLesson(1).result.profileWpm).toBeNull();
            unchanged();

            custom = newCustomPassage('Custom', repeatTo('practice makes progress ', 120));
            expect(practiceCustom(custom).result.profileWpm).toBeNull();
            unchanged();

            exited = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            expect(submitAfter(exited.attempt.sysId, typeEvenly(sp1.substring(0, 100), 30000), 'exit').result.profileWpm).toBeNull();
            unchanged();

            rejected = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            backdate(rejected.attempt.sysId, 10);
            expect(svc().submitAttempt({ attemptId: rejected.attempt.sysId, log: typeEvenly(sp1.substring(0, 100), 20000), ended: 'timeout' }).errorCode).toBe('invalid_timing');
            unchanged();

            flagged = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            flaggedRes = submitAfter(flagged.attempt.sysId, tooFastLog(sp1.substring(0, 100)), 'timeout');
            expect(flaggedRes.result.flagged).toBe(true);
            expect(flaggedRes.result.profileWpm).toBeNull();
            unchanged();

            early = svc().startAttempt({ mode: 'speed_test', durationSeconds: 60 });
            backdate(early.attempt.sysId, 30);
            earlyRes = svc().submitAttempt({ attemptId: early.attempt.sysId, log: typeEvenly(sp1.substring(0, 100), 25000), ended: 'timeout' });
            expect(earlyRes.result.profileWpm).toBeNull();
            unchanged();
          });
        });
      }
    }]
  },
  {
    id: 'PW-03',
    name: 'User record otherwise untouched',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'Records Player A\'s sys_updated_on and sys_mod_count, runs one timed round, and asserts both are unchanged while the WPM columns changed.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: no side effects', function profileWpmNoSideEffects() {
          it('does not touch system fields', function doesNotTouchSystemFields() {
            var before = userRecord('atf.wpm.player_a');
            var updatedOn = before.getValue('sys_updated_on');
            var modCount = before.getValue('sys_mod_count');
            var after;
            speedRound(60, 22);
            after = userRecord('atf.wpm.player_a');
            expect(after.getValue('sys_updated_on')).toBe(updatedOn);
            expect(after.getValue('sys_mod_count')).toBe(modCount);
            expect(parseInt(after.getValue('x_snc_ttt_words_per_minute_latest'), 10)).toBe(22);
          });
        });
      }
    }]
  },
  {
    id: 'PW-04',
    name: 'Only the session user is updated',
    suite: 'integration',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Player A completes a timed round at 22 WPM; asserts Player B\'s latest and best stay empty.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: session user only', function profileWpmSessionUserOnly() {
          it('leaves other users alone', function leavesOtherUsersAlone() {
            var b;
            speedRound(60, 22);
            b = profileWpm('atf.wpm.player_b');
            expect(b.latest || '').toBe('');
            expect(b.best || '').toBe('');
          });
        });
      }
    }]
  },
  {
    id: 'PW-05',
    name: 'Rounding',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'A 120 s round at 22.5 WPM stores latest 23; after setting best to 31, a round at 30.6 WPM stores latest 31 and leaves best 31 with isNewBest false (a tie after rounding).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: rounding', function profileWpmRounding() {
          it('rounds before comparing', function roundsBeforeComparing() {
            var res;
            var p;
            speedRoundChars(120, 225);
            expect(parseInt(profileWpm('atf.wpm.player_a').latest, 10)).toBe(23);
            setProfileWpm('atf.wpm.player_a', 23, 31);
            res = speedRoundChars(120, 306);
            p = profileWpm('atf.wpm.player_a');
            expect(parseInt(p.latest, 10)).toBe(31);
            expect(parseInt(p.best, 10)).toBe(31);
            expect(res.result.profileWpm.isNewBest).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'PW-06',
    name: 'Empty best',
    suite: 'integration',
    fixture: true,
    users: ['player_a'],
    description: 'A first-ever round of one character in 60 s (0.2 WPM) stores latest 0 and best 0 with isNewBest true: an empty best means no previous round, not zero.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('profile WPM: empty best', function profileWpmEmptyBest() {
          it('treats an empty best as no previous round', function treatsAnEmptyBestAsNo() {
            var res = speedRoundChars(60, 1);
            var p = profileWpm('atf.wpm.player_a');
            expect(parseInt(p.latest, 10)).toBe(0);
            expect(parseInt(p.best, 10)).toBe(0);
            expect(res.result.profileWpm.isNewBest).toBe(true);
          });
        });
      }
    }]
  },

  // ============================================================ WPM-SE security
  {
    id: 'SE-01',
    name: 'Forged attempt is neutralized',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'As Player A, inserts an attempt through GlideRecordSecure claiming user B, completed, 200 AWPM, passed and yesterday\'s start; asserts it is stored as A\'s in-progress attempt with no scores, started now (B8 #5).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_attempt_guard', function brAttemptGuard() {
          it('neutralizes forged scores', function neutralizesForgedScores() {
            var gr = new GlideRecordSecure('x_snc_ttt_attempt');
            var yesterday;
            var id;
            var saved;
            gr.initialize();
            gr.setValue('mode', 'lesson');
            gr.setValue('lesson', lessonByOrder(1).sys_id);
            gr.setValue('user', asUser('atf.wpm.player_b'));
            gr.setValue('state', 'completed');
            gr.setValue('net_wpm', 200);
            gr.setValue('passed', true);
            yesterday = new GlideDateTime();
            yesterday.addDaysUTC(-1);
            gr.setValue('started_on', yesterday.getValue());
            id = gr.insert();
            expect(id).toBeTruthy();
            saved = attemptRecord(id);
            expect(saved.getValue('user')).toBe(asUser('atf.wpm.player_a'));
            expect(saved.getValue('state')).toBe('in_progress');
            expect(saved.getValue('net_wpm') || '').toBe('');
            expect(isTrue(saved.getValue('passed'))).toBe(false);
            expect(msSince(saved.getValue('started_on'))).toBeLessThan(5000);
          });
        });
      }
    }]
  },
  {
    id: 'SE-02',
    name: 'Players cannot update attempts',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Player A completes L1, then tries to set net_wpm to 200 through GlideRecordSecure; asserts canWrite is false and the stored value is unchanged (B8 #5).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('attempt write ACL', function attemptWriteAcl() {
          it('denies players', function deniesPlayers() {
            var start = startLesson(1);
            var gr;
            submitAfter(start.attempt.sysId, typeEvenly(lessonByOrder(1).text, 30000), 'complete');
            gr = new GlideRecordSecure('x_snc_ttt_attempt');
            expect(gr.get(start.attempt.sysId)).toBe(true);
            expect(gr.canWrite()).toBe(false);
            gr.setValue('net_wpm', 200);
            gr.update();
            expect(parseFloat(attemptRecord(start.attempt.sysId).getValue('net_wpm'))).toBe(40);
          });
        });
      }
    }]
  },
  {
    id: 'SE-03',
    name: 'Players cannot delete attempts',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Player A tries to delete their own completed attempt and its attempt_key rows through GlideRecordSecure; asserts canDelete is false and every row remains (B8 #5).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('attempt delete ACL', function attemptDeleteAcl() {
          it('denies players', function deniesPlayers() {
            var start = startLesson(1);
            var keysBefore;
            var gr;
            var key;
            submitAfter(start.attempt.sysId, typeEvenly(lessonByOrder(1).text, 30000), 'complete');
            keysBefore = countRows('x_snc_ttt_attempt_key', 'attempt=' + start.attempt.sysId);
            gr = new GlideRecordSecure('x_snc_ttt_attempt');
            gr.get(start.attempt.sysId);
            expect(gr.canDelete()).toBe(false);
            gr.deleteRecord();
            key = new GlideRecordSecure('x_snc_ttt_attempt_key');
            key.addQuery('attempt', start.attempt.sysId);
            key.setLimit(1);
            key.query();
            expect(key.next()).toBe(true);
            expect(key.canDelete()).toBe(false);
            key.deleteRecord();
            expect(attemptRecord(start.attempt.sysId)).not.toBeNull();
            expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + start.attempt.sysId)).toBe(keysBefore);
          });
        });
      }
    }]
  },
  {
    id: 'SE-04',
    name: 'Isolation between players',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'Player A completes L1 and creates a custom passage; as Player B, every query for A\'s attempts, key rows and passages (by sys_id and by user) returns nothing (B8 #10).',
    steps: [
      {
        as: 'player_a',
        jasmine: false,
        run: function run() {
          passLesson(1);
          newCustomPassage('Private', repeatTo('only for me to practice ', 80));
        }
      },
      {
        as: 'player_b',
        run: function run() {
          describe('read ACLs', function readAcls() {
            it('hide another player\'s data', function hideAnotherPlayerSData() {
              var a = asUser('atf.wpm.player_a');
              var attemptId = latestAttempt('atf.wpm.player_a').getUniqueValue();
              var passage = new GlideRecord('x_snc_ttt_custom_passage');
              var tables;
              var i;
              var gr;
              passage.addQuery('user', a);
              passage.query();
              passage.next();

              expect(new GlideRecordSecure('x_snc_ttt_attempt').get(attemptId)).toBe(false);
              expect(new GlideRecordSecure('x_snc_ttt_custom_passage').get(passage.getUniqueValue())).toBe(false);
              tables = ['x_snc_ttt_attempt', 'x_snc_ttt_attempt_key', 'x_snc_ttt_custom_passage'];
              for (i = 0; i < tables.length; i += 1) {
                gr = new GlideRecordSecure(tables[i]);
                gr.addQuery('user', a);
                gr.setLimit(10);
                gr.query();
                expect(gr.next()).toBe(false);
              }
            });
          });
        }
      }
    ]
  },
  {
    id: 'SE-05',
    name: 'flag_reason is admin-only',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'admin'],
    description: 'Flags an attempt for Player A, then reads flag_reason as A (not readable, empty) and as the content admin (readable, too_fast).',
    steps: [
      {
        as: 'player_a',
        run: function run() {
          describe('flag_reason field ACL (player)', function flagReasonFieldAclPlayer() {
            it('is hidden from the player', function isHiddenFromThePlayer() {
              var start = startLesson(1);
              var gr;
              submitAfter(start.attempt.sysId, tooFastLog(lessonByOrder(1).text), 'complete');
              gr = new GlideRecordSecure('x_snc_ttt_attempt');
              gr.get(start.attempt.sysId);
              expect(gr.flag_reason.canRead()).toBe(false);
              expect(gr.getValue('flag_reason') || '').toBe('');
            });
          });
        }
      },
      {
        as: 'admin',
        run: function run() {
          describe('flag_reason field ACL (admin)', function flagReasonFieldAclAdmin() {
            it('is visible to admins', function isVisibleToAdmins() {
              var gr = new GlideRecordSecure('x_snc_ttt_attempt');
              gr.get(latestAttempt('atf.wpm.player_a').getUniqueValue());
              expect(gr.flag_reason.canRead()).toBe(true);
              expect(gr.getValue('flag_reason')).toBe('too_fast');
            });
          });
        }
      }
    ]
  },
  {
    id: 'SE-06',
    name: 'Profile WPM columns',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'player_b', 'admin'],
    description: 'Checks read and write on the profile WPM columns: A can read but not write their own, A cannot read B\'s, the content admin can read but not write B\'s, and A\'s attempt to set their best to 999 is ignored (B8 #14).',
    steps: [
      {
        as: 'player_a',
        run: function run() {
          describe('profile WPM ACLs (player)', function profileWpmAclsPlayer() {
            it('allow reading only your own, and no writes', function allowReadingOnlyYourOwnAnd() {
              var mine;
              var theirs;
              setProfileWpm('atf.wpm.player_a', 20, 30);
              setProfileWpm('atf.wpm.player_b', 21, 31);
              mine = new GlideRecordSecure('sys_user');
              mine.get(asUser('atf.wpm.player_a'));
              expect(mine.x_snc_ttt_words_per_minute_latest.canRead()).toBe(true);
              expect(mine.x_snc_ttt_words_per_minute_best.canRead()).toBe(true);
              expect(mine.x_snc_ttt_words_per_minute_latest.canWrite()).toBe(false);
              expect(mine.x_snc_ttt_words_per_minute_best.canWrite()).toBe(false);
              theirs = new GlideRecordSecure('sys_user');
              theirs.get(asUser('atf.wpm.player_b'));
              expect(theirs.x_snc_ttt_words_per_minute_latest.canRead()).toBe(false);
              expect(theirs.x_snc_ttt_words_per_minute_best.canRead()).toBe(false);
              mine.setValue('x_snc_ttt_words_per_minute_best', 999);
              mine.update();
              expect(parseInt(profileWpm('atf.wpm.player_a').best, 10)).toBe(30);
            });
          });
        }
      },
      {
        as: 'admin',
        run: function run() {
          describe('profile WPM ACLs (admin)', function profileWpmAclsAdmin() {
            it('allow admins to read but not write', function allowAdminsToReadButNot() {
              var theirs = new GlideRecordSecure('sys_user');
              theirs.get(asUser('atf.wpm.player_b'));
              expect(theirs.x_snc_ttt_words_per_minute_best.canRead()).toBe(true);
              expect(theirs.x_snc_ttt_words_per_minute_best.canWrite()).toBe(false);
            });
          });
        }
      }
    ]
  },
  {
    id: 'SE-07',
    name: 'No role',
    suite: 'security',
    fixture: true,
    users: ['norole'],
    description: 'As a user without x_snc_ttt.user, every service method returns no_role, a lesson query returns no rows, and no attempt rows are created (B8 #11).',
    steps: [{
      as: 'norole',
      run: function run() {
        describe('role checks', function roleChecks() {
          it('refuse users without the role', function refuseUsersWithoutTheRole() {
            var s = svc();
            var lessonId = lessonByOrder(1).sys_id;
            var lessons;
            expect(s.getSessionConfig({ mode: 'lesson', lessonId: lessonId }).errorCode).toBe('no_role');
            expect(s.startAttempt({ mode: 'lesson', lessonId: lessonId }).errorCode).toBe('no_role');
            expect(s.submitAttempt({ attemptId: lessonId, log: { v: 1, events: [] }, ended: 'exit' }).errorCode).toBe('no_role');
            expect(s.abandonAttempt({ attemptId: lessonId }).errorCode).toBe('no_role');
            expect(s.getLessonMap().errorCode).toBe('no_role');
            lessons = new GlideRecordSecure('x_snc_ttt_lesson');
            lessons.setLimit(5);
            lessons.query();
            expect(lessons.next()).toBe(false);
            expect(attemptCount('atf.wpm.norole')).toBe(0);
          });
        });
      }
    }]
  },
  {
    id: 'SE-08',
    name: 'Owner reassignment is admin-only',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'player_b', 'admin'],
    description: 'Player A cannot reassign their custom passage to B (user stays A); the content admin can reassign another of A\'s passages.',
    steps: [
      {
        as: 'player_a',
        run: function run() {
          describe('custom passage user field (player)', function customPassageUserFieldPlayer() {
            it('cannot be reassigned by the owner', function cannotBeReassignedByTheOwner() {
              var first = newCustomPassage('First', repeatTo('first passage text here ', 60));
              var gr;
              var check;
              newCustomPassage('Second', repeatTo('second passage text here ', 60));
              gr = new GlideRecordSecure('x_snc_ttt_custom_passage');
              gr.get(first);
              gr.setValue('user', asUser('atf.wpm.player_b'));
              gr.update();
              check = new GlideRecord('x_snc_ttt_custom_passage');
              check.get(first);
              expect(check.getValue('user')).toBe(asUser('atf.wpm.player_a'));
            });
          });
        }
      },
      {
        as: 'admin',
        run: function run() {
          describe('custom passage user field (admin)', function customPassageUserFieldAdmin() {
            it('can be reassigned by an admin', function canBeReassignedByAnAdmin() {
              var second = new GlideRecordSecure('x_snc_ttt_custom_passage');
              var check;
              second.addQuery('title', 'Second');
              second.addQuery('user', asUser('atf.wpm.player_a'));
              second.query();
              expect(second.next()).toBe(true);
              second.setValue('user', asUser('atf.wpm.player_b'));
              second.update();
              check = new GlideRecord('x_snc_ttt_custom_passage');
              check.get(second.getUniqueValue());
              expect(check.getValue('user')).toBe(asUser('atf.wpm.player_b'));
            });
          });
        }
      }
    ]
  },
  {
    id: 'SE-09',
    name: 'Players see only active content',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Deactivates L3; as Player A, a GlideRecordSecure lesson query returns only L1 and L2.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('lesson read ACL', function lessonReadAcl() {
          it('hides inactive lessons', function hidesInactiveLessons() {
            var l3 = new GlideRecord('x_snc_ttt_lesson');
            var gr;
            var titles;
            l3.get(lessonByOrder(3).sys_id);
            l3.setValue('active', false);
            l3.update();
            gr = new GlideRecordSecure('x_snc_ttt_lesson');
            gr.orderBy('order');
            gr.setLimit(50);
            gr.query();
            titles = [];
            while (gr.next()) {
              titles.push(gr.getValue('title'));
            }
            expect(titles.join(',')).toBe('ATF L1,ATF L2');
          });
        });
      }
    }]
  },
  {
    id: 'SE-10',
    name: 'Players cannot edit content',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'As Player A, inserting a lesson, updating L1\'s text and deleting SP1 are all denied and the content is unchanged.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('content ACLs', function contentAcls() {
          it('deny players', function denyPlayers() {
            var before = countRows('x_snc_ttt_lesson', '');
            var lesson = new GlideRecordSecure('x_snc_ttt_lesson');
            var l1;
            var edit;
            var sp1;
            lesson.initialize();
            expect(lesson.canCreate()).toBe(false);
            lesson.setValue('title', 'Sneaky');
            lesson.setValue('order', 99);
            lesson.setValue('text', repeatTo('sneaky lesson text ', 80));
            lesson.insert();
            expect(countRows('x_snc_ttt_lesson', '')).toBe(before);

            l1 = lessonByOrder(1);
            edit = new GlideRecordSecure('x_snc_ttt_lesson');
            edit.get(l1.sys_id);
            expect(edit.canWrite()).toBe(false);
            edit.setValue('text', repeatTo('changed text here ', 80));
            edit.update();
            expect(lessonByOrder(1).text).toBe(l1.text);

            sp1 = new GlideRecordSecure('x_snc_ttt_passage');
            sp1.addQuery('title', 'ATF SP1');
            sp1.query();
            expect(sp1.next()).toBe(true);
            expect(sp1.canDelete()).toBe(false);
            sp1.deleteRecord();
            expect(passageText('ATF SP1')).toBeTruthy();
          });
        });
      }
    }]
  },
  {
    id: 'SE-11',
    name: 'Admin can manage attempts',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'admin'],
    description: 'The content admin reads Player A\'s attempt, updates its net_wpm and deletes it; deleting also removes its attempt_key rows (cascade).',
    steps: [
      {
        as: 'player_a',
        jasmine: false,
        run: function run() {
          passLesson(1);
        }
      },
      {
        as: 'admin',
        run: function run() {
          describe('admin attempt ACLs', function adminAttemptAcls() {
            it('allow read, write and delete', function allowReadWriteAndDelete() {
              var id = latestAttempt('atf.wpm.player_a').getUniqueValue();
              var gr = new GlideRecordSecure('x_snc_ttt_attempt');
              expect(gr.get(id)).toBe(true);
              expect(gr.canWrite()).toBe(true);
              gr.setValue('net_wpm', 12.5);
              gr.update();
              expect(parseFloat(attemptRecord(id).getValue('net_wpm'))).toBe(12.5);
              expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + id)).toBeGreaterThan(0);
              expect(gr.canDelete()).toBe(true);
              gr.deleteRecord();
              expect(attemptRecord(id)).toBeNull();
              expect(countRows('x_snc_ttt_attempt_key', 'attempt=' + id)).toBe(0);
            });
          });
        }
      }
    ]
  },

  // ============================================================ WPM-DI data integrity
  {
    id: 'DI-01',
    name: 'Text normalization',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Saves a custom passage starting with curly quotes, a tab, an em dash, double spaces and an ellipsis; asserts the stored text starts with "\\"Hello\\" - world... " and has no tabs, line breaks or double spaces (C2.1).',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_text_normalize', function brTextNormalize() {
          it('normalizes to plain ASCII with single spaces', function normalizesToPlainAsciiWithSingle() {
            var raw = '\u201cHello\u201d\t\u2014  world\u2026\nThe quick brown fox jumps over the lazy dog again and again.';
            var id = newCustomPassage('Normalize', raw);
            var gr = new GlideRecord('x_snc_ttt_custom_passage');
            var text;
            gr.get(id);
            text = gr.getValue('text');
            expect(text.indexOf('"Hello" - world... ')).toBe(0);
            expect(/[\t\n]| {2}/.test(text)).toBe(false);
          });
        });
      }
    }]
  },
  {
    id: 'DI-02',
    name: 'Non-keyboard characters are rejected',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Tries to save a custom passage containing "caf\u00e9"; asserts no record is stored and the rule\'s message is "Only characters on a standard US keyboard are supported."',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_text_normalize: characters', function brTextNormalizeCharacters() {
          it('rejects characters outside printable ASCII', function rejectsCharactersOutsidePrintableAscii() {
            var text = repeatTo('caf\u00e9 au lait is lovely ', 60);
            var id = newCustomPassage('Accents', text);
            expect(id).toBeFalsy();
            expect(countRows('x_snc_ttt_custom_passage', 'title=Accents')).toBe(0);
            expect(svc().normalizeText(text, 'custom').message).toBe('Only characters on a standard US keyboard are supported.');
          });
        });
      }
    }]
  },
  {
    id: 'DI-03',
    name: 'Custom passage length limits',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Saves custom passages of 49, 50, 2,000 and 2,001 characters plus 2,000 characters with trailing spaces; asserts only 50, 2,000 and the trimmed 2,000 are accepted.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_text_normalize: custom lengths', function brTextNormalizeCustomLengths() {
          it('accepts 50 to 2,000 characters', function accepts50To2000Characters() {
            var trimmed;
            var gr;
            expect(newCustomPassage('n49', repeatTo('abcd', 49))).toBeFalsy();
            expect(newCustomPassage('n50', repeatTo('abcd', 50))).toBeTruthy();
            expect(newCustomPassage('n2000', repeatTo('abcd', 2000))).toBeTruthy();
            expect(newCustomPassage('n2001', repeatTo('abcd', 2001))).toBeFalsy();
            trimmed = newCustomPassage('n2000s', repeatTo('abcd', 2000) + '   ');
            expect(trimmed).toBeTruthy();
            gr = new GlideRecord('x_snc_ttt_custom_passage');
            gr.get(trimmed);
            expect(gr.getValue('text').length).toBe(2000);
          });
        });
      }
    }]
  },
  {
    id: 'DI-04',
    name: 'Speed-test passage minimum',
    suite: 'security',
    fixture: true,
    users: ['admin'],
    description: 'As the content admin, saves speed-test passages of 2,999 and 3,000 characters; asserts the first is rejected and the second accepted.',
    steps: [{
      as: 'admin',
      run: function run() {
        describe('br_text_normalize: passage length', function brTextNormalizePassageLength() {
          it('needs at least 3,000 characters', function needsAtLeast3000Characters() {
            function save(n) {
              var gr = new GlideRecordSecure('x_snc_ttt_passage');
              gr.initialize();
              gr.setValue('title', 'Length ' + n);
              gr.setValue('text', repeatTo('abcd', n));
              gr.setValue('active', false);
              return gr.insert();
            }
            expect(save(2999)).toBeFalsy();
            expect(save(3000)).toBeTruthy();
          });
        });
      }
    }]
  },
  {
    id: 'DI-05',
    name: 'Custom passage limit',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'The test runner inserts 100 custom passages for Player A; as A, a 101st insert is rejected and the count stays 100.',
    steps: [
      {
        jasmine: false,
        run: function run() {
          var a = asUser('atf.wpm.player_a');
          var i;
          var gr;
          for (i = 0; i < 100; i += 1) {
            gr = new GlideRecord('x_snc_ttt_custom_passage');
            gr.initialize();
            gr.setValue('user', a);
            gr.setValue('title', 'Bulk ' + i);
            gr.setValue('text', repeatTo('bulk practice passage ', 60));
            gr.insert();
          }
        }
      },
      {
        as: 'player_a',
        run: function run() {
          describe('br_custom_owner_limit', function brCustomOwnerLimit() {
            it('rejects the 101st passage', function rejectsThe101stPassage() {
              var a = asUser('atf.wpm.player_a');
              expect(countRows('x_snc_ttt_custom_passage', 'user=' + a)).toBe(100);
              expect(newCustomPassage('One too many', repeatTo('one more passage ', 60))).toBeFalsy();
              expect(countRows('x_snc_ttt_custom_passage', 'user=' + a)).toBe(100);
            });
          });
        }
      }
    ]
  },
  {
    id: 'DI-06',
    name: 'Lesson order is unique among active lessons',
    suite: 'security',
    fixture: true,
    users: ['admin'],
    description: 'As the content admin, inserts an active lesson with order 1 (rejected, L1 uses it) and an inactive one with order 1 (accepted).',
    steps: [{
      as: 'admin',
      run: function run() {
        describe('br_lesson_order_unique', function brLessonOrderUnique() {
          function save(active) {
            var gr = new GlideRecordSecure('x_snc_ttt_lesson');
            gr.initialize();
            gr.setValue('title', 'Order test');
            gr.setValue('unit', 'home_row');
            gr.setValue('order', 1);
            gr.setValue('text', repeatTo('order test text ', 80));
            gr.setValue('min_accuracy', 90);
            gr.setValue('target_net_wpm', 0);
            gr.setValue('active', active);
            return gr.insert();
          }
          it('rejects a duplicate active order and allows an inactive one', function rejectsADuplicateActiveOrderAnd() {
            expect(save(true)).toBeFalsy();
            expect(save(false)).toBeTruthy();
          });
        });
      }
    }]
  },
  {
    id: 'DI-07',
    name: 'Attempt mode must match its reference',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'As Player A, inserting a lesson attempt with no lesson and a custom attempt with no custom passage are both rejected.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_attempt_guard: references', function brAttemptGuardReferences() {
          function insert(mode) {
            var gr = new GlideRecordSecure('x_snc_ttt_attempt');
            gr.initialize();
            gr.setValue('mode', mode);
            return gr.insert();
          }
          it('requires the matching reference', function requiresTheMatchingReference() {
            expect(insert('lesson')).toBeFalsy();
            expect(insert('custom')).toBeFalsy();
            expect(attemptCount('atf.wpm.player_a')).toBe(0);
          });
        });
      }
    }]
  },
  {
    id: 'DI-08',
    name: 'Owner forced on custom passages',
    suite: 'security',
    fixture: true,
    users: ['player_a', 'player_b'],
    description: 'As Player A, inserts a custom passage naming Player B as the owner; asserts it is stored with user A.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('br_custom_owner_limit: owner', function brCustomOwnerLimitOwner() {
          it('forces the creator as owner', function forcesTheCreatorAsOwner() {
            var gr = new GlideRecordSecure('x_snc_ttt_custom_passage');
            var id;
            var check;
            gr.initialize();
            gr.setValue('user', asUser('atf.wpm.player_b'));
            gr.setValue('title', 'Owner test');
            gr.setValue('text', repeatTo('owner test passage ', 60));
            id = gr.insert();
            check = new GlideRecord('x_snc_ttt_custom_passage');
            check.get(id);
            expect(check.getValue('user')).toBe(asUser('atf.wpm.player_a'));
          });
        });
      }
    }]
  },
  {
    id: 'DI-09',
    name: 'Deleting a custom passage keeps history',
    suite: 'security',
    fixture: true,
    users: ['player_a'],
    description: 'Player A practices a custom passage and deletes it; asserts the attempt remains with an empty custom_passage and its title and text snapshot unchanged.',
    steps: [{
      as: 'player_a',
      run: function run() {
        describe('custom passage cascade', function customPassageCascade() {
          it('clears the reference but keeps the snapshot', function clearsTheReferenceButKeepsThe() {
            var text = repeatTo('history should survive deletes ', 90);
            var id = newCustomPassage('Keep me', text);
            var stored = new GlideRecord('x_snc_ttt_custom_passage');
            var storedText;
            var res;
            var attemptId;
            var gr;
            var attempt;
            stored.get(id);
            storedText = stored.getValue('text');
            res = practiceCustom(id);
            expect(res.result.state).toBe('completed');
            attemptId = latestAttempt('atf.wpm.player_a').getUniqueValue();
            gr = new GlideRecordSecure('x_snc_ttt_custom_passage');
            gr.get(id);
            gr.deleteRecord();
            attempt = attemptRecord(attemptId);
            expect(attempt).not.toBeNull();
            expect(attempt.getValue('custom_passage') || '').toBe('');
            expect(attempt.getValue('passage_title')).toBe('Keep me');
            expect(attempt.getValue('passage_text')).toBe(storedText);
          });
        });
      }
    }]
  }
];

export const SUITES = {
  unit: { key: 'unit', name: 'WPM \u2014 Unit', description: 'Scoring, log validation and coach messages (SC, LV, CO). Fast: no users or records.' },
  integration: { key: 'integration', name: 'WPM \u2014 Integration', description: 'Attempt lifecycle, flagging, lessons, personal best and profile WPM (LC, FL, LS, PB, PW).' },
  security: { key: 'security', name: 'WPM \u2014 Security and integrity', description: 'ACLs and business rules (SE, DI).' }
};

export const SOURCE = SPEC;
