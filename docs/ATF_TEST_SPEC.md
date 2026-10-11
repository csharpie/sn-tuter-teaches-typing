# Words Per Minute — ATF Test Specification

| | |
| --- | --- |
| Application | Words Per Minute (widget: *Abel Tuter Teaches Typing*) |
| Scope | `x_snc_wpm` |
| Tests for | [`APPLICATION_SPEC.md`](APPLICATION_SPEC.md) v1.0 |
| Framework | ServiceNow Automated Test Framework (ATF), defined in Fluent (`src/fluent/tests/`) |
| Status | v1.0 draft |

This document specifies the ATF tests for the application. Section numbers such as **C4.3** or **B8 #12** refer to `APPLICATION_SPEC.md`.

---

## 1. Scope and approach

### 1.1 What ATF covers

ATF runs on the instance, so it tests everything on the server side:

- **Scoring:** keystroke-log validation, replay, formulas, flagging and coach messages (C4, B5). These are tested by calling the pure methods of `WpmAttemptService` with fixed inputs.
- **Attempt lifecycle:** start, submit, abandon, expiry, timing checks and lesson unlocking (C4.4, C4.5, C5.1, C5.2).
- **Profile WPM:** the latest and best columns on `sys_user` (C2.2).
- **Security:** every ACL in C3, tested by impersonating users and using `GlideRecordSecure`.
- **Data integrity:** every business rule in C10 and the text normalization in C2.1.

### 1.2 What ATF does not cover

ATF's client-side steps support classic forms and Service Portal, not AIUX pages, so browser behavior is tested manually (§8). This includes the typing UI, countdown, live gauge, paste blocking, focus handling, accessibility, route ACLs and the `pagehide` beacon.

The widget server scripts are not tested directly. C4.6 requires them to be thin adapters that call one `WpmAttemptService` method each, so testing the service covers the rules. A code review **MUST** reject widget server scripts that contain business logic.

### 1.3 Principles

1. **Independent tests.** Each test creates its own users and content, and relies on ATF rollback to remove them. No test depends on another test or on run order.
2. **No seed data.** Tests never rely on the seeded lessons or passages. Tests that need lessons deactivate the seeded ones first (rollback restores them).
3. **Deterministic time.** Scores never depend on how fast the test runs. Keystroke offsets are fixed numbers, and attempts that need elapsed server time get a backdated `started_on` (§4.4).
4. **Real security.** ACL tests run as an impersonated user with `GlideRecordSecure` or with the step's "enforce security" option on. Never assert security as the test runner.
5. **English messages.** Test users have `preferred_language = en`, so tests can assert exact message text.

---

## 2. Conventions

| Item | Convention |
| --- | --- |
| Test ID | `WPM-<area>-<nn>`, for example `WPM-SC-01`. Areas: `SC` scoring, `LV` log validation, `LC` lifecycle, `FL` flagging, `LS` lessons, `PB` personal best, `CO` coach, `PW` profile WPM, `SE` security, `DI` data integrity. |
| ATF test name | `<ID> <short description>`, for example `WPM-SC-01 Clean run scores 50 WPM`. |
| Fluent `$id` | `Now.ID['atf_wpm_sc_01']` |
| Files | One file per area: `src/fluent/tests/scoring.now.ts`, `lifecycle.now.ts`, and so on. Shared helpers go in `src/fluent/tests/helpers.ts`. |
| Assertions | Jasmine `expect(...)` inside "Run Server Side Validation Script" steps. Each `it(...)` asserts one behavior. |
| Failure on server errors | `failOnServerError: true` on every test. A test that expects a rejection checks for the specific error message, not for the absence of errors. |

---

## 3. Testable surface

The tests call the `WpmAttemptService` methods defined in **C4.6**:

| Method | Tested by |
| --- | --- |
| `validateLog`, `score`, `chooseCoach` (pure) | SC, LV, FL, CO, called by the test runner with no impersonation |
| `getSessionConfig`, `startAttempt`, `submitAttempt`, `abandonAttempt`, `getLessonMap` | LC, FL, LS, PB, PW, SE, called while impersonating a test user |

Tables, ACLs and business rules are also tested directly with record steps and scripts (SE, DI).

---

## 4. Fixtures

### 4.1 Users

Each test that needs users creates them with ATF's **Create a User** step. Names are reused safely because rollback deletes them after every test.

| Fixture | `user_name` | Roles | Time zone | Used for |
| --- | --- | --- | --- | --- |
| Player A | `atf.wpm.player_a` | `x_snc_wpm.user` | `America/New_York` | Main player |
| Player B | `atf.wpm.player_b` | `x_snc_wpm.user` | `Asia/Tokyo` | Isolation checks |
| Content admin | `atf.wpm.admin` | `x_snc_wpm.admin` | `Europe/London` | Admin ACLs |
| No role | `atf.wpm.norole` | — | `America/Los_Angeles` | Role checks |

Scripts look users up by `user_name` instead of passing step outputs between steps.

### 4.2 Content

The standard content fixture runs as the test runner, **before** any impersonation step:

1. Set `active = false` on every active `x_snc_wpm_lesson` and `x_snc_wpm_passage` (a single `updateMultiple()` each).
2. Create three lessons:

   | Fixture | `order` | `text` | `min_accuracy` | `target_net_wpm` |
   | --- | --- | --- | --- | --- |
   | L1 | 1 | `repeatTo('sad lads a', 100)` → 100 characters, home row only | 90 | 10 |
   | L2 | 2 | `repeatTo('gash ghash', 100)` | 90 | 10 |
   | L3 | 3 | `repeatTo('quiet wipe', 100)` | 90 | 10 |

3. Create one speed-test passage, SP1: `repeatTo('abel tuter teaches typing to everyone ', 3000)`.

Each fixture text starts and ends with a non-space character at its length (checked: L1 ends `a`, L2 `h`, L3 `e`, SP1 `n`), so normalization leaves the length unchanged. Tests still read the stored text back rather than reusing the input string.

### 4.3 Keystroke-log helpers

These ES5 helpers live in `src/fluent/tests/helpers.ts` as a string constant, `ATF_HELPERS`. It is prepended to every test script, so the helpers are written once but not shipped as a production script include.

| Helper | Behavior |
| --- | --- |
| `repeatTo(seed, n)` | Repeats `seed` and cuts the result to exactly `n` characters. |
| `wrongFor(c)` | Returns `'x'`, or `'z'` if `c` is `'x'`. Always differs from `c`. |
| `new LogBuilder()` | Collects operations in order: `.type(text)` adds one insert per character, `.miss(expectedChar)` inserts `wrongFor(expectedChar)`, `.back(n)` adds `n` deletes. |
| `.buildEven(totalMs)` | Gives the operations evenly spaced offsets from `0` to `totalMs` (`round(i × totalMs / (count − 1))`; a single operation gets offset `0`) and returns `{v: 1, events}`. |
| `.buildGaps(gapFn)` | Gives offsets from a function of the event index, for timing tests. Returns `{v: 1, events}`. |
| `typeEvenly(text, totalMs)` | Shorthand for `new LogBuilder().type(text).buildEven(totalMs)`. |
| `asUser(userName)` | Returns the `sys_user` sys_id for a fixture user. |
| `backdate(attemptId, seconds)` | Sets the attempt's `started_on` to now − `seconds` with plain `GlideRecord` and `setWorkflow(false)`. Test-only system write, used to simulate elapsed time. |
| `submitAfter(attemptId, log, ended)` | Backdates the attempt so the server-measured time covers the log (§4.4), then calls `submitAttempt`. Use it for every submission except those that test the timing rules themselves. |
| `lessonByOrder(n)` | Returns `{sys_id, text, title}` of the active lesson with `order` = `n`, read back from the table. |
| `svc()` | Returns `new x_snc_wpm.WpmAttemptService()`. |

### 4.4 Simulating time

The tests never wait in real time. The C4.4 timing check rejects any log whose last offset is more than 2 s longer than the time since `startAttempt`. A test that submits straight after starting would therefore fail, so `submitAfter` backdates `started_on` first:

| Submission | Backdate by |
| --- | --- |
| Passage mode | `ceil(lastOffset / 1000) + 1` seconds |
| Timed mode | `durationSeconds + 1` seconds, so the server also sees that the timer ran out (C2.2) |

The backdate is a plain `GlideRecord` write in the same script. That works while impersonating, because plain `GlideRecord` ignores ACLs. Only LC-08, LC-09, LC-10 and PW-02's "timeout too early" case call `backdate` and `submitAttempt` directly, with their own values.

### 4.5 Fluent shape (sketch)

The exact Fluent ATF API names (`Test`, `atf.server.createUser`, `atf.server.impersonate`, `atf.server.recordInsert` with `enforceSecurity`, `atf.server.runServerSideScript`) **MUST** be confirmed against the installed `@servicenow/sdk` version with the `aiux-build` skill before implementation.

```ts
import {Test} from '@servicenow/sdk/core';
import {ATF_HELPERS, withContentFixture, createPlayers} from './helpers';

Test(
  {
    $id: Now.ID['atf_wpm_lc_05'],
    name: 'WPM-LC-05 Completed lesson attempt stores scores',
    active: true,
    failOnServerError: true
  },
  atf => {
    withContentFixture(atf);              // §4.2, runs as the test runner
    createPlayers(atf, {impersonate: 'atf.wpm.player_a'});
    atf.server.runServerSideScript({
      script: ATF_HELPERS + `
        describe('submitAttempt (lesson)', function () {
          it('stores a completed, scored attempt', function () {
            var lesson = lessonByOrder(1);
            var start = svc().startAttempt({mode: 'lesson', lessonId: lesson.sys_id});
            var res = submitAfter(
              start.attempt.sysId,
              typeEvenly(lesson.text, 30000),
              'complete'
            );
            expect(res.result.state).toBe('completed');
            expect(res.result.grossWpm).toBe(40);
            expect(res.result.passed).toBe(true);
          });
        });`
    });
  }
);
```

`withContentFixture` and `createPlayers` are TypeScript helpers that add the standard steps to a test, so each test file stays short.

---

## 5. Test suites

| Suite | Contains | Runs |
| --- | --- | --- |
| `WPM — Unit` | SC, LV, CO | Fast. No users or records. Run on every deploy to dev. |
| `WPM — Integration` | LC, FL, LS, PB, PW | Run on every deploy to dev and test. |
| `WPM — Security and integrity` | SE, DI | Run on every deploy to dev and test. |
| `WPM — Full regression` | The three suites above, as child suites | **MUST** pass on the test instance before promotion to production (A7.3). |

If Fluent does not support suites in the installed SDK version, define them as `Record`s on `sys_atf_test_suite` and `sys_atf_test_suite_test`.

---

## 6. Test catalog

Unless stated otherwise, "passage mode" means `opts = {mode: 'lesson', minAccuracy: 90, targetNetWpm: 10}`.

### 6.1 Scoring — `score()` (pure, `WPM-SC`)

| ID | Test | Input | Expected |
| --- | --- | --- | --- |
| SC-01 | Clean run (**B8 #1**) | Passage `repeatTo('the quick brown fox ', 250)`. `typeEvenly(passage, 60000)`. | `elapsedMs` 60000, `typedChars` 250, `keystrokes` 250, `missedKeystrokes` 0, `errors` 0, `grossWpm` 50.0, `netWpm` 50.0, `accuracy` 100, `complete` true. |
| SC-02 | Corrected and uncorrected errors (**B8 #2**) | Passage *P* = `repeatTo('typing tests are fun ', 300)`. For each index *i*: if *i* ∈ {20, 60}: `miss(P[i]).back(1).type(P[i])`; if *i* ∈ {100, 140, 180, 220}: `miss(P[i])`; otherwise `type(P[i])`. `buildEven(120000)`. | `keystrokes` 302, `missedKeystrokes` 6, `typedChars` 300, `errors` 4, `grossWpm` 30.0, `netWpm` 28.0, `accuracy` 98. |
| SC-03 | Reference example (**B8 #3**) | *P* = `repeatTo('abel teaches typing ', 550)`. Corrected misses (`miss, back(1), type`) at *i* = 7 + 15*k* for *k* = 0…35 (36 positions). Uncorrected misses at *i* ∈ {10, 110, 210, 310, 410}. `buildEven(300000)`. | `keystrokes` 586, `missedKeystrokes` 41, `typedChars` 550, `errors` 5, `grossWpm` 22.0, `netWpm` 21.0, `accuracy` 93. |
| SC-04 | One-second minimum | Passage `hello`. `typeEvenly('hello', 400)`. | `elapsedMs` 400; `minutes` uses 1000 ms, so `grossWpm` 60.0 and `netWpm` 60.0. |
| SC-05 | AWPM never negative | Passage `abcdefghij`. Ten `miss()` operations, `buildEven(60000)`. | `errors` 10, `grossWpm` 2.0, `netWpm` 0.0, `accuracy` 0. |
| SC-06 | Timed mode ignores late keystrokes (**B8 #8**) | `opts = {mode: 'speed_test', durationSeconds: 60}`. Passage SP1 text. `typeEvenly(first 300 chars, 72000)`. | Only events with offset ≤ 60000 count: `keystrokes` 250, `typedChars` 250, `elapsedMs` 60000, `grossWpm` 50.0. |
| SC-07 | Timed mode uses the full duration | Same `opts`. `typeEvenly(first 100 chars, 30000)`. | `elapsedMs` 60000, `grossWpm` 20.0. |
| SC-08 | Timed mode, no keystrokes | Same `opts`. `{v: 1, events: []}`. | `keystrokes` 0, `accuracy` 0, `grossWpm` 0.0, `complete` false. |
| SC-09 | Deletes on an empty buffer are ignored | Passage `abc`. Builder: `back(2).type('abc')`, `buildEven(3000)`. | `keystrokes` 3, `typedChars` 3, `errors` 0, `accuracy` 100. |
| SC-10 | Events after completion are ignored | Passage `abc`. Builder `type('abcdef')`, `buildGaps(i => i × 200)`. | `typedChars` 3, `keystrokes` 3, `elapsedMs` 400 (the third event). |
| SC-11 | Per-key stats | Passage `Ab a`. Builder `type('Ab').miss(' ').type('a')`, `buildEven(1000)`. | `perKey`: `a` → 2 hits, 0 misses (uppercase lowercased); `b` → 1 hit; `space` → 0 hits, 1 miss. `errors` 1. |
| SC-12 | Rounding to one decimal | Passage of 251 characters. `typeEvenly(passage, 60000)`. | `grossWpm` 50.2. |
| SC-13 | Passing requires every condition | Passage mode, 100 characters, `typeEvenly(…, 30000)` (40 WPM, 100%). Run four times, changing one input each time: `minAccuracy` 101; `targetNetWpm` 41; passage incomplete (only 99 characters typed); mode `speed_test`. | `passed` is true for the base case and false for each of the four variants. |

### 6.2 Log validation — `validateLog()` (pure, `WPM-LV`)

| ID | Test | Input | Expected |
| --- | --- | --- | --- |
| LV-01 | Valid log | `typeEvenly('abc', 1000)` | `null` |
| LV-02 | Wrong version | `{v: 2, events: [...]}`, and a log with no `v` | `'invalid_log'` |
| LV-03 | Offsets decrease | `[[0,'i','a'],[500,'i','b'],[400,'i','c']]` | `'invalid_log'` |
| LV-04 | First offset not 0, negative or non-integer offsets | `[[5,'i','a']]`, `[[-1,'i','a']]`, `[[0,'i','a'],[10.5,'i','b']]` | `'invalid_log'` for each |
| LV-05 | Multi-character or missing insert | `[[0,'i','ab']]`, `[[0,'i']]`, `[[0,'i','']]` | `'invalid_log'` for each |
| LV-06 | Unknown event type, or a delete carrying a character | `[[0,'x','a']]`, `[[0,'i','a'],[10,'d','a']]` | `'invalid_log'` for each |
| LV-07 | Size limit | 20,000 events (valid) and 20,001 events | `null`, then `'invalid_log'` |
| LV-08 | Not an object | `null`, a string, `{v: 1}` with no `events` | `'invalid_log'` for each |

### 6.3 Attempt lifecycle (`WPM-LC`)

All run as Player A with the content fixture, unless stated otherwise.

| ID | Test | Steps | Expected |
| --- | --- | --- | --- |
| LC-01 | Start takes a snapshot | `startAttempt({mode: 'lesson', lessonId: L1})` | One new attempt: `user` = A, `state` `in_progress`, `passage_text` = L1's stored text, `passage_title` = L1's title, `started_on` within 5 s of now, all score fields empty. |
| LC-02 | Starting abandons earlier attempts (**B8 #9**) | As A, start two attempts on L1. As B, start one on L1. As A, start a third. | A's first two attempts are `abandoned`. A's third is `in_progress`. B's attempt is still `in_progress`. |
| LC-03 | Speed-test passage choice | Start a speed test (60 s). Then deactivate SP1 and start another. | First: `passage_text` = SP1's text. Second: `{errorCode: 'no_passages'}` and no attempt row. |
| LC-04 | Speed-test text is hidden until start | `getSessionConfig({mode: 'speed_test', durationSeconds: 60})` | The result has no `passage.text` (property missing or empty). |
| LC-05 | Complete a lesson | Start L1. Submit `typeEvenly(L1 text, 30000)` with `ended: 'complete'`. | `state` `completed`, `completed_on` set, `gross_wpm` 40.0, `accuracy` 100, `passed` true. `attempt_key` rows exist for each distinct key in L1. |
| LC-06 | Exit part-way | Start L1. Submit the first 40 characters with `ended: 'exit'`. | `state` `abandoned`. Score fields empty. No `attempt_key` rows. |
| LC-07 | Part-way submission claiming "complete" | Start L1. Submit the first 40 characters with `ended: 'complete'`. | `{errorCode: 'invalid_log'}`. `state` `rejected`. |
| LC-08 | Timing check (**B8 #6**) | Start L1. `backdate(10)`. Submit a log whose last offset is 20000. | `{errorCode: 'invalid_timing'}`. `state` `rejected`. Score fields empty. |
| LC-09 | Timing tolerance | Start L1. `backdate(30)`. Submit a complete log whose last offset is 31500. | Accepted (within the 2,000 ms tolerance). `state` `completed`. |
| LC-10 | Expired | Start L1. `backdate(3660)`. Submit a valid log. | `{errorCode: 'expired'}`. `state` `abandoned`. |
| LC-11 | Not found | (a) As B, submit A's attempt. (b) Submit `attemptId: 'not-a-sys-id'`. (c) Submit a valid ID twice. | `{errorCode: 'not_found'}` for (a), (b) and the second call in (c). A's attempt is unchanged by (a). |
| LC-12 | Abandon | As A, start L1, then `abandonAttempt`. As B, call `abandonAttempt` on a new attempt of A's. | A's first attempt becomes `abandoned`. B gets `not_found`, and A's second attempt stays `in_progress`. |
| LC-13 | Idle speed test | Start a 60 s speed test. `submitAfter` with `{v: 1, events: []}` and `ended: 'timeout'`. | `state` `abandoned`. Not scored. `result.profileWpm` is `null`. |

### 6.4 Flagging (`WPM-FL`)

| ID | Test | Input | Expected |
| --- | --- | --- | --- |
| FL-01 | Uniform intervals (**B8 #7**) | Pure `score()`. L1's text typed in bursts of 10 characters: 5 ms between characters in a burst, 3000 ms between bursts (`buildGaps`). 90 of 99 intervals are under 15 ms. | `flagged` true, `flagReason` `uniform_intervals`. No 50-character window beats 250 WPM, so this isolates the interval rule. |
| FL-02 | Too fast | Pure `score()`. L1's text with a constant 20 ms gap. No interval is under 15 ms, and a 50-character window takes 980 ms (612 WPM). | `flagged` true, `flagReason` `too_fast`. |
| FL-03 | Both conditions | Pure `score()`. L1's text with a constant 5 ms gap. | `flagReason` `uniform_intervals` (C4.3 precedence). |
| FL-04 | Normal typing is not flagged | Pure `score()`. L1's text with gaps cycling 180, 240, 300 ms. | `flagged` false. |
| FL-05 | Effects of a flagged attempt | As A, start L1 and `submitAfter` with the FL-02 log. | `state` `completed`. `flagged` true. `passed` false, even though accuracy is 100%. `personal_best` false. No `attempt_key` rows. Coach rule 1. `getLessonMap()` still shows L2 `locked`. |

### 6.5 Lessons and unlocking (`WPM-LS`)

"Pass L*n*" means: start L*n* and `submitAfter` with `typeEvenly(text, 30000)` (40 AWPM, 100%). "Fail L*n*" means the same, except `miss()` replaces `type()` at *i* = 5, 10, …, 75 (15 uncorrected misses). That scores 85% accuracy and 10 AWPM, so it fails only on accuracy.

| ID | Test | Steps | Expected |
| --- | --- | --- | --- |
| LS-01 | New player | As A, `getLessonMap()` | L1 `available`; L2 and L3 `locked`. `completedCount` 0, `totalCount` 3, `nextLessonId` = L1. |
| LS-02 | Passing unlocks the next lesson (**B8 #4**) | Pass L1, then `getLessonMap()`. Also check the `submitAttempt` result. | L1 `passed`, L2 `available`, L3 `locked`. The result has `nextLessonId` = L2 and `nextLessonUnlocked` true. |
| LS-03 | Failing does not unlock (**B8 #4**) | Fail L1, then `getLessonMap()`. | L1 `available`, L2 `locked`. The result has `passed` false and `nextLessonUnlocked` false. |
| LS-04 | Locked lesson, player | As A, `startAttempt` on L2. | `{errorCode: 'locked'}`. No attempt row. |
| LS-05 | Locked lesson, admin | As the content admin, `startAttempt` on L3. | An `in_progress` attempt is created. |
| LS-06 | Inactive lessons are skipped | Deactivate L2. As A, pass L1, then `getLessonMap()`. | L2 is absent. L3 is `available`. `totalCount` 2. |
| LS-07 | Best scores on the map | As A, pass L1 at 20 AWPM (`typeEvenly(…, 60000)`) and at 25 AWPM (`…, 48000`), and fail it once. | L1 shows `bestNetWpm` 25 and `bestAccuracy` 100. The failed attempt doesn't count. |
| LS-08 | Custom practice never unlocks | As A, create a custom passage with L1's text and practice it perfectly. | L2 is still `locked`. |
| LS-09 | Other players don't unlock your lessons | As B, pass L1. As A, `getLessonMap()`. | A's L2 is still `locked`. |

### 6.6 Personal best (`WPM-PB`)

| ID | Test | Steps (as A, on L1 unless stated) | Expected `personal_best` |
| --- | --- | --- | --- |
| PB-01 | First attempt is never a personal best | One attempt at 20 AWPM. | false (C4.3) |
| PB-02 | Beating, then tying | Attempts at 20, then 25, then 25 AWPM. | false, true, false |
| PB-03 | Scoped to the speed-test duration | Speed tests: 60 s at 22, 60 s at 25, then 120 s at 30. | false, true, false (first 120 s attempt) |
| PB-04 | Flagged attempts don't count | Attempt at 25 AWPM, then a flagged attempt (FL-02 log, about 612 AWPM), then an attempt at 30 AWPM. | false, false, true. The flagged attempt doesn't raise the bar. |

### 6.7 Coach messages — `chooseCoach()` (pure, `WPM-CO`)

`ctx = {mode: 'lesson', minAccuracy: 90, targetNetWpm: 10}` unless stated.

| ID | Test | `result` input | Expected |
| --- | --- | --- | --- |
| CO-01 | Flagged wins over everything | `flagged` true, `passed` false, `accuracy` 100, `personalBest` false | `rule` 1, headline "Let's try that again", `summary` empty. |
| CO-02 | New personal best | `passed` true, `personalBest` true | `rule` 2, headline "New personal best!", advice "Ready for the next lesson?" |
| CO-03 | Passed | `passed` true, `personalBest` false | `rule` 3, headline "Good job!", advice "Ready for the next lesson?" |
| CO-04 | Accuracy rule comes before speed | `passed` false, `accuracy` 85, `netWpm` 5 | `rule` 4, headline "Slow down a little", advice contains "90%". |
| CO-05 | Speed below target | `passed` false, `accuracy` 95, `netWpm` 5 | `rule` 5, headline "Almost there", advice contains "10 AWPM". |
| CO-06 | Speed test | `ctx.mode` `speed_test`: once with `personalBest` true, once false | `rule` 6 both times. Headlines "New personal best!" and "Nice work!". |
| CO-07 | Exact summary sentence (**B8 #3**) | `accuracy` 93, `grossWpm` 22, `errors` 5, `netWpm` 21, `passed` true | `summary` is exactly: "Your accuracy was 93% and your typing speed was 22 WPM. You made 5 errors in this lesson, so your adjusted speed was 21 AWPM." |

### 6.8 Profile WPM on `sys_user` (`WPM-PW`)

"Timed round at *N* WPM (*D* s)" means: as A, start a speed test of *D* seconds, then `submitAfter` with `typeEvenly(first N × D / 12 characters of SP1, (D − 1) × 1000)` and `ended: 'timeout'`. That is *N* × 5 characters per minute, so *N* WPM. For example, 22 WPM over 60 s is 110 characters.

| ID | Test | Steps | Expected |
| --- | --- | --- | --- |
| PW-01 | Latest and best over four rounds (**B8 #12**) | Timed rounds (60 s) at 22, 31, 25 and 31 WPM. Read A's `sys_user` after each. | latest / best: 22/22, 31/31, 25/31, 31/31. `result.profileWpm.isNewBest`: true, true, false, false. `saved` true each time. |
| PW-02 | Rounds that don't update the profile (**B8 #13**) | Set A's latest = 40 and best = 50 first (system write). Then run each of these: pass L1; practice a custom passage; a speed test with `ended: 'exit'`; a speed test rejected with `invalid_timing`; a flagged speed test; a speed test submitted with `ended: 'timeout'` after only `backdate(30)` on a 60 s test. | Latest stays 40 and best stays 50 after every case. `result.profileWpm` is `null` for each scored case. |
| PW-03 | User record otherwise untouched | Record A's `sys_updated_on` and `sys_mod_count`. Run one timed round. | Both values are unchanged. Only the two WPM columns changed. |
| PW-04 | Only the session user is updated | Timed round as A at 22 WPM. | B's latest and best are still empty. |
| PW-05 | Rounding | Timed round (120 s) with 225 characters (22.5 WPM). Then set best = 31 and run a 120 s round with 306 characters (30.6 WPM). | First: latest 23. Second: latest 31, best 31, `isNewBest` false (a tie after rounding). |
| PW-06 | Empty best | A has no previous rounds. Timed round at 0.2 WPM (one character in 60 s). | latest 0, best 0, `isNewBest` true. An empty best counts as "no previous round", not as 0. |

### 6.9 Security (`WPM-SE`)

All checks run while impersonating the named user, with `GlideRecordSecure` or with "enforce security" on.

| ID | Test | Steps | Expected |
| --- | --- | --- | --- |
| SE-01 | Forged attempt is neutralized (**B8 #5**) | As A, insert an attempt with `mode` `lesson`, `lesson` L1, `user` = B, `state` `completed`, `net_wpm` 200, `passed` true, `started_on` = yesterday. | The row exists with `user` = A, `state` `in_progress`, `net_wpm` empty, `passed` false, `started_on` within 5 s of now. |
| SE-02 | Players can't update attempts (**B8 #5**) | As A, complete L1. Then try to set `net_wpm` = 200 on that attempt. | `canWrite()` false. The update is denied and `net_wpm` is unchanged. |
| SE-03 | Players can't delete attempts (**B8 #5**) | As A, try to delete their own attempt and its `attempt_key` rows. | `canDelete()` false. All rows still exist. |
| SE-04 | Isolation (**B8 #10**) | As A, complete L1 and create a custom passage. As B, query A's attempts, A's `attempt_key` rows and A's custom passages by sys_id and by `user`. | Every query returns 0 rows. `get(sysId)` returns false. |
| SE-05 | `flag_reason` is admin-only | Flag an attempt for A (FL-05). Read `flag_reason` as A, then as the content admin. | A: `canRead()` on the field is false and the value is empty. Admin: `canRead()` true and the value is `too_fast`. |
| SE-06 | Profile WPM columns (**B8 #14**) | Set A's and B's latest/best (system write). Check `canRead()` and `canWrite()` on both columns, as A on A's record, as A on B's record, and as the content admin on B's record. Then, as A, try to update their own best to 999. | A on A: read true, write false. A on B: read false. Admin on B: read true, write false. A's best is unchanged. |
| SE-07 | No role (**B8 #11**) | As the no-role user, call `getSessionConfig`, `startAttempt`, `submitAttempt`, `abandonAttempt` and `getLessonMap`. Query `x_snc_wpm_lesson`. | Every method returns `{errorCode: 'no_role'}`. The lesson query returns 0 rows. No attempt rows are created. |
| SE-08 | Owner reassignment is admin-only | As A, change their custom passage's `user` to B. As the content admin, do the same on another passage. | A: denied, `user` still A. Admin: allowed. |
| SE-09 | Players see only active content | Deactivate L3. As A, query lessons. | L1 and L2 only. |
| SE-10 | Players can't edit content | As A, try to insert a lesson, update L1's text, and delete SP1. | All three are denied. Content is unchanged. |
| SE-11 | Admin can manage attempts | As the content admin, read A's attempt, update its `net_wpm`, and delete it. | All allowed. Deleting the attempt also deletes its `attempt_key` rows (cascade). |

### 6.10 Data integrity (`WPM-DI`)

| ID | Test | Steps | Expected |
| --- | --- | --- | --- |
| DI-01 | Text normalization (C2.1) | As A, save a custom passage whose text starts with `“Hello”\t—  world…\n` followed by a 60-character ASCII sentence. | The stored text starts with `"Hello" - world... ` (curly quotes and dashes replaced, whitespace collapsed). No tabs, line breaks or double spaces remain. |
| DI-02 | Non-keyboard characters rejected | As A, save a custom passage containing `café` (50+ characters). | Insert aborted with "Only characters on a standard US keyboard are supported." No record. |
| DI-03 | Custom passage length limits | As A, save texts of `repeatTo('abcd', n)` for *n* = 49, 50, 2000 and 2001, plus 2000 characters followed by three spaces. | 49 rejected, 50 accepted, 2000 accepted, 2001 rejected, 2000 + spaces accepted (trimmed to 2000). |
| DI-04 | Speed-test passage minimum | As the content admin, save a passage of 2,999 characters, then 3,000. | First rejected, second accepted. |
| DI-05 | Custom passage limit | As the test runner, insert 100 custom passages for A with plain `GlideRecord`. As A, insert one more. | The 101st is rejected. Count stays 100. |
| DI-06 | Lesson order is unique among active lessons | As the content admin, insert an active lesson with `order` 1. Then insert an inactive one with `order` 1. | First rejected. Second accepted. |
| DI-07 | Attempt mode must match its reference | As A, insert attempts with `mode` `lesson` and no `lesson`, and with `mode` `custom` and no `custom_passage`. | Both rejected. |
| DI-08 | Owner forced on custom passages | As A, insert a custom passage with `user` = B. | Stored with `user` = A. |
| DI-09 | Deleting a custom passage keeps history | As A, practice a custom passage, then delete the passage. | The attempt still exists. Its `custom_passage` is empty, and `passage_text` and `passage_title` are unchanged. |

---

## 7. Traceability: acceptance criteria to tests

| B8 # | Criterion | ATF tests | Manual (§8) |
| --- | --- | --- | --- |
| 1 | Clean run scores | SC-01 | — |
| 2 | Scores with errors | SC-02 | — |
| 3 | Reference example and coach text | SC-03, CO-07 | Results screen shows it |
| 4 | Unlocking | LS-02, LS-03 | Map updates without a reload |
| 5 | Forged scores are neutralized | SE-01, SE-02, SE-03 | — |
| 6 | Timing check | LC-08, LC-09 | — |
| 7 | Implausible speed is flagged | FL-01 to FL-05, PB-04 | — |
| 8 | Timed test ends at the limit | SC-06, SC-07 | Input stops at 60 s |
| 9 | Abandoning | LC-02, LC-06, LC-12 | Abandoned rounds hidden in History |
| 10 | Isolation | SE-04 | — |
| 11 | No role | SE-07 | Routes refuse access |
| 12 | Profile latest and best | PW-01, PW-05, PW-06 | Results screen message |
| 13 | Profile not updated | PW-02, LC-13 | — |
| 14 | Profile security | SE-06 | — |
| 15 | Accessibility | — | All of §8.2 |

Every business rule in C10 and every row of the ACL table in C3 is covered by at least one SE or DI test. A change that adds a rule or ACL **MUST** add a test in the same pull request.

---

## 8. Outside ATF: manual and browser tests

These run before each promotion, on the test instance, using the fixture users from §4.1 (created by hand).

### 8.1 Functional

- [ ] Typing session: countdown, block cursor, correct and incorrect highlighting, auto-scroll, live gauge and error count, virtual keyboard with next-key and error flashes, hands overlay.
- [ ] Paste and drop are blocked with the message from B4.
- [ ] A 1-minute speed test stops accepting input at 60 s and shows results (B8 #8).
- [ ] Passing a lesson enables **Next lesson**, and the lesson map updates without a reload (B8 #4).
- [ ] Leaving the page during typing abandons the attempt, and it is hidden in History by default (B8 #9).
- [ ] The results screen shows the profile message: "Saved to your profile: … · Best: …", "New profile best", and the failure message (by temporarily removing the cross-scope privilege on a dev instance).
- [ ] The no-role user is refused on every route (B8 #11).
- [ ] The widget heading reads **Abel Tuter Teaches Typing** in every state.

### 8.2 Accessibility (B7, B8 #15)

- [ ] A full lesson can be completed with the keyboard only, and with NVDA + Firefox or JAWS + Chrome.
- [ ] The textarea is labelled and described by the passage. Error announcements follow the `announce_errors` preference. **Alt+W** announces the current WPM.
- [ ] Focus moves to the results headline when results appear.
- [ ] Reduced motion: no needle sweep, no count-up, no key flashes.
- [ ] Windows High Contrast: correct, incorrect and current characters are distinguishable.
- [ ] Reflow at 320 px with no horizontal scrolling. The virtual keyboard is hidden below `md`.
- [ ] Contrast meets 4.5:1 for text and 3:1 for UI with the C7 theme.

---

## 9. Running the tests

| When | What | Who |
| --- | --- | --- |
| Every deploy to dev | `WPM — Unit` and `WPM — Integration` | Developer |
| Every deploy to test | `WPM — Full regression` and §8 | Developer, then reviewer |
| Before production | `WPM — Full regression` passes with no failures or skipped tests on the test instance | Release owner |

- **Command line:** add `scripts/run-atf.mjs` and a `pnpm test:atf -- <suite name>` script. It starts a suite through the CI/CD REST API (`POST /api/sn_cicd/testsuite/run`), polls the progress URL, prints each test's result, and exits non-zero on any failure. It uses the instance credentials in `.env`.
- **Instance setup:** ATF test execution must be enabled on dev and test (`sn_atf.runner.enabled`). It stays **disabled on production**. The tests ship with the app, but are never run there.
- **Target run time:** under 15 minutes for the full regression. If it grows past that, split the integration suite to run in parallel on the scheduled client test runner, not by removing tests.
- **Flaky tests:** a test that fails without a code change is a defect in the test. Fix it or quarantine it (`active: false`) with a linked defect within one working day. Never re-run until green.
