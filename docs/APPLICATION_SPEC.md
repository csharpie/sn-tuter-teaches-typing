# Words Per Minute — Application Specification

| | |
| --- | --- |
| Application | Words Per Minute (typing tutor) |
| Scope | `x_snc_wpm` (scope sys_id assigned at `now-sdk init`) |
| Application type | Scoped AIUX application (Lit, SSR) with Fluent-defined metadata |
| Basename | `/aiux/words-per-minute` · landing route `/home` |
| Stack | ServiceNow AIUX (Lit web components, server-side rendered) + Now SDK Fluent metadata; Node `>=24.14.1`, pnpm |
| Source of truth | This repository: `src/fluent/` (metadata), `pages/`, `widgets/`, `application.js` |
| Reference project | `../hydration-management` (same conventions, rules and tooling) |
| Test specification | [`ATF_TEST_SPEC.md`](ATF_TEST_SPEC.md) |
| Status | v1.0 draft — Lessons, Speed Test, Custom Lessons, Lesson History |

This document has three parts. **Part A** gives the development rules for everything in this application. **Part B** describes the product: what the player sees and does. **Part C** is the technical design that implements Part B under the Part A rules. The RFC 2119 keywords **MUST**, **SHOULD** and **MAY** are used throughout.

---

## Part A — Development Rules

These rules carry over from the Hydration Management reference project. Where this app differs, the difference is called out.

### A1. Platform and ALM

1. All work **MUST** live in the `x_snc_wpm` scope. Do not modify global or other-scope artifacts. **The one approved exception** is the pair of scoped columns `x_snc_wpm_words_per_minute_latest` and `x_snc_wpm_words_per_minute_best` on `sys_user`, with their field ACLs and cross-scope privilege (C2.2). It is owned by this scope, defined in Fluent, and written only by `WpmAttemptService`. Any other change to a platform table needs a spec change first.
2. Tables, roles, ACLs, business rules, script includes and seed records **MUST** be defined in Fluent (`src/fluent/*.now.ts`). Do not create them in Studio or by editing forms on an instance.
3. Promote changes dev → test → prod with `pnpm build` then `pnpm deploy`. Never use update sets, and never edit in production.
4. Bump `package.json#version` for every release that goes past dev.
5. Curriculum lessons and speed-test passages are **product content**, so they are installed on every instance (no `installMethod: 'demo'`). Sample attempts and sample custom passages **MUST** use `$meta: { installMethod: 'demo' }`.
6. All passage text **MUST** be original or public-domain. Do not copy lesson text, coach art or layouts from commercial typing tutors.

### A2. Operating model: player-owned, system-scored records

The app follows the requester-owned model from the reference project, with one stricter rule: **players never write their own scores**.

| Concept | This application |
| --- | --- |
| Owner | `user` reference to `sys_user`; defaults to `gs.getUserID()` |
| End-user entitlement | Role `x_snc_wpm.user` |
| Content author / administrator | Role `x_snc_wpm.admin` (contains `.user`) |
| "My records" visibility | Read ACLs conditioned on `user` = *Me* |
| Score integrity | Scores are computed and written only by the `WpmAttemptService` script include. No user role has write access to attempts. |

Rules:

1. Every user-generated table **MUST** have a mandatory owner reference (`user`) that defaults to the current user. A *before insert* business rule forces it to the current user for non-admins.
2. End-user ACLs **MUST** use the ownership condition `userDYNAMIC90d1921e5f510100a9ad2572f2b477fe` ("is (dynamic) Me"), not a script.
3. Admin ACLs are separate, unconditioned ACLs on the admin role. Do not add `OR gs.hasRole(...)` branches to end-user ACLs.
4. `x_snc_wpm_attempt` and `x_snc_wpm_attempt_key` **MUST NOT** have a write or delete ACL for `x_snc_wpm.user`. Players create an attempt (through the widget). All later writes go through `WpmAttemptService`, which runs as system logic after checking ownership and state itself (see C5).
5. A *before insert* business rule on `x_snc_wpm_attempt` **MUST** clear every score field and set `state = in_progress` and `started_on = now` for non-admins. That way an attempt created through a form, list, import or script cannot carry forged scores.
6. Owner reassignment is admin-only, enforced with a field-level write ACL on `user`.

### A3. Data model

1. Table names are `x_snc_wpm_<noun>` (singular). Column names are lowercase `snake_case`. Every table and column has a `label`.
2. Date/times are `glide_date_time` (UTC). Anything shown as a date uses the server's user-formatted display value.
3. Index the real query patterns (see C2).
4. Turn auditing on for low-volume content tables (`lesson`, `passage`). Turn it off for high-volume logs (`attempt`, `attempt_key`).
5. Cross-scope access: `accessibleFrom: 'public'` with `actions: { read: true }` only. Set `allowWebServiceAccess: false` on every table.
6. Owner references use `cascadeRule: 'delete'`.

### A4. Server-side scripting

1. Widget server scripts **MUST** use `GlideRecordSecure` and call `canCreate()` / `canWrite()` / `canDelete()` before mutating.
2. Plain `GlideRecord` is allowed only in business rules and in `WpmAttemptService`'s scoring write path. Each use **MUST** carry a comment explaining why it needs system access.
3. Every query **MUST** call `setLimit()`. Counts, sums, maximums and averages **MUST** use `GlideAggregate`.
4. All client input is validated on the server: type, range, allowed values, sys_id format (`/^[0-9a-f]{32}$/`) and payload size.
5. *Before* business rules **MUST NOT** call `current.update()`. Abort with `current.setAbortAction(true)` plus `gs.addErrorMessage(gs.getMessage(...))`.
6. Reusable logic lives in script includes. Scoring is shared by the widget and ATF, so it **MUST** be a script include.
7. User-facing strings go through `gs.getMessage()`. Log with `gs.error()` / `gs.warn()` and include the artifact name. Never log typed text or keystroke logs.
8. Widget server scripts use `export default function server(data, options, input)`, route by `input.action`, and return `data.isError` / `data.errorCode` / `data.errorMessage` for errors and `data.actionStatus` / `data.actionMessage` for action outcomes.
9. Server scripts, script includes and business rules are written in ES5 style (`var`, function declarations).

### A5. Client (AIUX) rules

1. Components extend `AIUXElement` or `AIUXWidgetElement`, never `LitElement`. Widgets declare `@name`, `@description`, `@bestFor`, `@category('custom')`, `@server`, `@acl` and `@discoverable(true)`.
2. **Scores are computed on the server.** The final WPM, AWPM, accuracy, errors, pass/fail, personal best, lesson unlocks and coach message all come from the server. *Exception:* the live speed gauge and live error count shown **while typing** are provisional client-side estimates. They are never sent to the server, stored or shown on the results screen.
3. Every mutating action returns the full widget state, so one round trip refreshes the UI. An in-flight flag guards against overlapping requests.
4. Rendering is SSR-safe: no browser globals, `Date.now()`, `performance.now()` or `Math.random()` in `render()` or constructors. Timing and input listeners are attached in `firstUpdated()` and removed in `disconnectedCallback()`.
5. Every user-visible string uses `i18n.getMessage('<literal>')`. Numbers use `Intl.NumberFormat` with the server-supplied locale.
6. Every page and widget **MUST** meet WCAG 2.2 AA (see B7 for the typing-specific requirements).
7. Every page except `/home` declares `@acl([...])` with `x_snc_wpm.user`. `/home` also declares it in this app, because it shows personal stats.
8. Style with Tailwind + DaisyUI (`aiux-` prefix) and theme tokens. Do not hard-code colors or use `--now-*` tokens.
9. Before building any UI, run the `ui-discovery` skill and reuse platform components (cards, tables, badges, progress, tabs, alerts) where they fit. Build custom components only for the keyboard, gauge and passage view.

### A6. Security checklist (per change)

- [ ] New tables have read/create/write/delete ACLs for the user role (owner-conditioned) and the admin role, or a documented reason why an operation is missing.
- [ ] No score, unlock or pass/fail value is accepted from the client.
- [ ] Owner is forced on insert. Owner reassignment is admin-only.
- [ ] Web service access is disabled.
- [ ] Widget and page `@acl` decorators name the app role.
- [ ] Input is validated in the server script **and** enforced in a *before* business rule.
- [ ] Keystroke payloads are size-limited and never logged.
- [ ] Any write to `sys_user` targets `gs.getUserID()` only, touches only `x_snc_wpm_words_per_minute_latest` and `x_snc_wpm_words_per_minute_best`, and goes through `WpmAttemptService`.

### A7. Quality gates

1. `pnpm lint` passes with zero errors.
2. `pnpm build` succeeds with no new `[metadata]` warnings.
3. The ATF suite in [ATF_TEST_SPEC.md](ATF_TEST_SPEC.md) passes on the test instance before every promotion. It covers every formula in C4, every business rule and ACL, and every acceptance criterion in B8 that does not need a browser.
4. Manual test with: two players, one admin, one user without the app role, keyboard-only, a screen reader (NVDA + Firefox or JAWS + Chrome), Windows High Contrast, and 320 px width.

---

## Part B — Product

### B1. Concept

Players improve their typing speed and accuracy through a structured series of lessons, timed speed tests and their own practice text. After every attempt, an on-screen **coach** gives the results: accuracy, typing speed (WPM), errors and adjusted speed (AWPM). The coach adds a short message of encouragement or advice, and the player can move straight on to the next lesson. A history view shows progress over time and which keys cause the most mistakes.

The tone is encouraging and low-pressure, like a classroom: feedback first, judgment second.

### B2. Roles and personas

| Persona | Role | Can do |
| --- | --- | --- |
| Player | `x_snc_wpm.user` | Take lessons and speed tests, create custom passages, view their own history. |
| Content admin | `x_snc_wpm.admin` | Everything a player can do, plus manage lessons and speed-test passages, and view or remove any player's attempts. |
| No role | — | Sees a "You don't have access" message on every page. |

### B3. Navigation and screens

The app shell uses `aiux-nav-layout`, with the help panel turned on (this replaces the **HELP** button in the original design). The side nav replaces the original tab strip:

| Nav item | Icon | Route | Original equivalent |
| --- | --- | --- | --- |
| Home | `home` | `/home` | HOME |
| Lessons | `book-open` | `/lessons` | LESSON AREA |
| Speed test | `gauge` | `/speed-test` | SPEED TEST |
| Custom lessons | `pencil` | `/custom` | CUSTOM LESSON |
| History | `history` | `/history` | LESSON HISTORY |

Icon names **MUST** be confirmed against the AIUX icon set during `ui-discovery`. Use the nearest available icon if one is missing.

#### B3.1 Home (`/home`)

- A greeting and a **Continue** card that links to the next unlocked lesson.
- Three stat tiles: best AWPM (speed test), average accuracy over the last 10 attempts, and lessons completed out of the total.
- A small AWPM trend sparkline for the last 10 attempts.
- An empty state for new players: "Start with Lesson 1: Home row" plus a button.

#### B3.2 Lessons (`/lessons`)

- **Lesson map:** an ordered list of lessons grouped by unit (for example, *Home row*, *Top row*, *Bottom row*, *Numbers*, *Punctuation*, *Full sentences*). Each lesson shows its title, focus keys, status (Locked / Available / Passed) and the player's best AWPM and accuracy.
- Lesson *n* unlocks when lesson *n − 1* has a passed attempt. Lesson 1 is always available. Admins can play any lesson.
- Selecting a lesson opens the **typing session** on the same page (`/lessons?lesson=<sys_id>`), so the URL can be bookmarked and the browser Back button returns to the map.

#### B3.3 Speed test (`/speed-test`)

- The player picks a duration: 1, 2, 3 or 5 minutes (default 1).
- The server picks a random active speed-test passage. Passages are long enough for 5 minutes at 120 WPM, and the test ends when the time runs out.
- The results screen shows the personal best for that duration and whether this attempt beat it.
- When the timer ends and the attempt is scored, the player's user profile is updated (C2.2). **Words per minute (latest)** is set to this attempt's WPM. **Words per minute (best)** is raised if this attempt beat it. The results screen confirms this with "Saved to your profile: 22 WPM · Best: 31 WPM".
- **Driving game view** (on by default, see `driving_view` in B6): the test is played from the driver's seat of a car on a three-lane highway, after the driving game in Mavis Beacon Teaches Typing. The car's speed follows the player's typing over the last few seconds and it rolls to a stop when they stop typing. The car follows the road through curves and hills, overtakes slower traffic and steers round lane closures, and never touches another vehicle or obstacle. Each mistyped key splats a bug at a random spot on the windscreen. The dashboard shows the passage as a moving line of text (the next character underlined), WPM and accuracy meters, and the time left. Scoring is unchanged: the view is a presentation of the same session.

#### B3.4 Custom lessons (`/custom`)

- A list of the player's own passages, with **New**, **Edit**, **Delete** and **Practice** actions.
- The editor has a title (required, ≤ 80 characters) and text (50–2,000 characters).
- Practicing a custom passage opens the typing session in passage mode. Custom attempts appear in history but never unlock lessons.

#### B3.5 History (`/history`)

- A filter by mode (All / Lessons / Speed test / Custom).
- A table of attempts, newest first, 25 per page: date, mode, lesson or passage title, AWPM, WPM, accuracy, errors, and a Passed badge for lessons.
- An AWPM trend chart for the last 30 attempts in the selected mode.
- A **weak keys** heatmap: the keyboard drawn with each key shaded by its miss rate over the last 20 attempts, plus a ranked list of the five worst keys. The list is the accessible equivalent of the heatmap.
- Selecting a row opens that attempt's results panel, read-only.

### B4. The typing session

The typing session is one widget that runs all three modes. Its player-facing name is **Abel Tuter Teaches Typing**. This name is used for the widget only. The app shell, nav title and page titles keep the application name "Words Per Minute".

The name is rendered as `i18n.getMessage('Abel Tuter Teaches Typing')` (A5.5). It is a product name, so the translation-source comment **MUST** tell translators to leave it untranslated.

The widget moves through these states:

```
 ready ──Start──► countdown (3-2-1) ──► typing ──passage complete / time up──► submitting ──► results
   ▲                                      │                                                  │
   └──────────────── Restart / Esc ◄──────┘                     Try again / Next lesson ◄────┘
```

**Layout, top to bottom (wide screens):**

1. **Header:** the game name **Abel Tuter Teaches Typing** as the widget's heading (`<h2>`, or the level that fits the host page). Below it: the lesson or passage title, focus keys, and the mode-specific goal ("Pass with 90% accuracy and 20 AWPM"). The name stays visible in every state (ready, countdown, typing, results).
2. **Passage view:** the text to type. Characters already typed correctly are shown in the success style. Incorrect characters are shown in the error style **and** underlined. The current character has a block cursor. The view scrolls to keep the current line in the middle.
3. **Live bar:** time elapsed (or remaining in timed mode), a provisional WPM shown on a **speed gauge** (a dial with a needle, from 0 to 120+), and a live error count.
4. **Virtual keyboard:** a QWERTY keyboard that highlights the next key to press. A **hands overlay** shows the correct finger, with home-row bumps on F and J. A key flashes in the error style when the player mistypes it. The keyboard and hands can be turned off in preferences.
5. **Controls:** **Start** (primary), **Restart**, and **Exit**. Esc restarts during typing.

**Rules:**

- Typing starts on the first keystroke after the countdown. The clock starts at that keystroke, not when Start is pressed.
- In passage mode, the attempt ends when the last character is typed. In timed mode, it ends when the time runs out.
- Backspace is allowed. Corrected mistakes still count against **accuracy**, but not against **errors** (see C4).
- Paste, drop and autocorrect are blocked. A paste attempt shows "Pasting isn't allowed in a typing test."
- Leaving the page during typing abandons the attempt. An abandoned attempt is not scored.

### B5. Results screen

This screen replaces the passage view and live bar after submitting, and keeps the original design's layout:

- **Coach card (left):** a round, original illustration of the coach character (not a photo of a real person), with a speech bubble containing the headline, such as **"Good job!"**.
- **Stats card (right):**

  | Metric | Example |
  | --- | --- |
  | Accuracy | 93% |
  | Typing speed | 22 WPM |
  | Errors | 5 |
  | Adjusted speed | 21 AWPM |

  Each stat shows a trend arrow and the difference from the player's previous attempt in the same lesson or duration ("▲ 3"). The arrow **MUST** come with text, so color and shape are not the only signal.
- **Coach summary (below):** the headline, then a sentence that explains the numbers, then advice. For example: *"Good job! Are you ready for the next lesson? Your accuracy was 93% and your typing speed was 22 WPM. You made 5 errors in this lesson, so your adjusted speed was 21 AWPM."*
- **Weak keys from this attempt:** up to three keys with the most misses, highlighted on the virtual keyboard and listed as text.
- **Actions:** **Next lesson** (primary, shown only when the lesson was passed and a next lesson exists), **Try again**, and **Back to lessons**.
- A **New personal best** badge when the attempt beat the previous best.

**Coach messages** are chosen by the server. The first rule that matches wins:

| # | Condition | Headline | Advice |
| --- | --- | --- | --- |
| 1 | Attempt flagged (C4.4) | "Let's try that again" | "We couldn't verify this attempt, so it wasn't scored. Type the passage normally from start to finish." |
| 2 | Passed and new personal best | "New personal best!" | "Ready for the next lesson?" |
| 3 | Passed | "Good job!" | "Ready for the next lesson?" |
| 4 | Accuracy below the lesson's minimum | "Slow down a little" | "Accuracy comes first. Aim for {min}% before you push your speed." |
| 5 | AWPM below the lesson's target | "Almost there" | "Your accuracy is solid. Now try to keep a steady rhythm to reach {target} AWPM." |
| 6 | Speed test or custom, no pass criteria | "Nice work!" / "New personal best!" | "Keep practicing to build speed." |

The explanation sentence ("Your accuracy was …") always follows the headline, except for rule 1.

### B6. Preferences

These are stored per player as user preferences (`gs.getUser().savePreference`) with the `x_snc_wpm.` prefix:

| Preference | Default | Effect |
| --- | --- | --- |
| `x_snc_wpm.show_keyboard` | `true` | Shows the virtual keyboard. |
| `x_snc_wpm.show_hands` | `true` | Shows the hands overlay. Has no effect if the keyboard is hidden. |
| `x_snc_wpm.show_live_stats` | `true` | Shows the live gauge and error count while typing. Some players find them distracting. |
| `x_snc_wpm.announce_errors` | `false` | Screen readers announce each mistyped character (see B7). |
| `x_snc_wpm.driving_view` | unset | The speed test uses the driving game view (B3.3). While unset it is on, unless the browser asks for reduced motion. The virtual keyboard is not shown in the driving view. |

### B7. Accessibility requirements specific to typing

1. Input goes to a **real, focusable, labelled `<textarea>`** ("Type the passage"), with `autocomplete="off"`, `autocapitalize="off"`, `autocorrect="off"` and `spellcheck="false"`. The passage view is visually linked to the textarea and also exposed as its description (`aria-describedby`).
2. The virtual keyboard, hands overlay and gauge are decorative (`aria-hidden="true"`). Their information is also available as text: the live bar shows numbers, and weak keys are listed.
3. Screen-reader announcements during typing are **off by default** because they would interrupt the player. If `announce_errors` is on, each wrong character is announced politely. The current WPM can be announced on demand with **Alt+W**.
4. Timed speed tests fall under the WCAG 2.2.1 "essential" exception. Lessons and custom passages have **no time limit**.
5. The countdown is announced ("3, 2, 1, go") and **MUST NOT** flash more than three times per second.
6. With `prefers-reduced-motion`, the gauge needle jumps instead of sweeping, the stats do not count up, and key flashes are replaced by a static outline. The driving game view starts off (the player can still turn it on); if it is on, bug splats fade in without growing and the steering wheel holds still. The driving view's scene is decorative (`aria-hidden`); its dashboard readouts are text, and turning the view off is the way to hide its motion (WCAG 2.2.2).
7. On a touch-only device, the session shows "A physical keyboard is recommended" but still works with the on-screen keyboard. Below the `md` breakpoint, the virtual keyboard is hidden so the page reflows at 320 px.
8. In forced-colors mode, correct, incorrect and current characters stay distinguishable by underline and outline, not color.
9. The results panel receives focus when it appears, starting at the headline.

### B8. Acceptance criteria

1. **Scoring, clean run:** typing a 250-character passage correctly in exactly 60 s gives 50 WPM, 50 AWPM, 100% accuracy and 0 errors.
2. **Scoring, with errors:** a player types a 300-character passage in 120 s. They make 6 wrong keystrokes, correct 2 of them with Backspace (302 character keystrokes in total), and leave 4 wrong. The result is 30 WPM, 28 AWPM, 4 errors, and accuracy of `round((302 − 6) / 302 × 100)` = 98%.
3. **Reference example:** an attempt with 22 WPM and 5 uncorrected errors over 5 minutes gives 21 AWPM, and the coach summary reads exactly as in B5.
4. **Unlocking:** passing lesson 1 makes lesson 2 Available on the lesson map without a page reload. Failing it leaves lesson 2 Locked.
5. **Integrity:** a player who creates an `x_snc_wpm_attempt` record from a list view with `net_wpm = 200` ends up with an `in_progress` record whose score fields are empty. The player cannot update or delete any attempt through a form, a list or `GlideRecordSecure`.
6. **Replay check:** submitting a keystroke log whose last offset is more than 2 s longer than the server-measured time since `startAttempt` returns `errorCode: "invalid_timing"` and scores nothing.
7. **Implausible speed:** a log with 95% of key intervals under 15 ms is scored, but flagged. It is excluded from personal bests and unlocks, and the coach uses rule 1.
8. **Timed test:** a 1-minute speed test ends at 60 s even if the player keeps typing. Only keystrokes within 60 s are scored.
9. **Abandon:** starting a new attempt marks the player's earlier `in_progress` attempts as `abandoned`. Abandoned attempts do not appear in history by default.
10. **Isolation:** player A cannot read player B's attempts, key stats or custom passages through any widget, list or script.
11. **No role:** a user without `x_snc_wpm.user` cannot open any route. A widget placed elsewhere shows the role message.
12. **Profile WPM, latest and best:** a player with no earlier rounds finishes a speed test at 22 WPM, so latest = 22 and best = 22. Their next round scores 31, so latest = 31 and best = 31. The round after that scores 25, so latest = 25 and best stays 31. A tie at 31 leaves best at 31 and `isNewBest` false.
13. **Profile WPM, when not updated:** both columns stay unchanged after a lesson, a custom passage, an exited, rejected or flagged speed test, or a speed test whose submission never reached the server.
14. **Profile WPM security:** a player can read their own latest and best values, but not another user's. A player who tries to set either one through the user form, a list, the Table API or `GlideRecordSecure` is denied. An admin can read everyone's values.
15. **Accessibility:** a full lesson can be completed using only the keyboard and a screen reader. The page reflows at 320 px and works in Windows High Contrast.

---

## Part C — Technical Design

### C1. Architecture

```
┌──────────────────────────── Browser ───────────────────────────────────┐
│  aiux-nav-layout (application.js + theme.js)                           │
│   ├─ /home        x-snc-wpm-home-page        └─ <x-snc-wpm-dashboard>  │
│   ├─ /lessons     x-snc-wpm-lessons-page     ├─ <x-snc-wpm-lesson-map> │
│   │                                          └─ <x-snc-wpm-typing-session mode="lesson">
│   ├─ /speed-test  x-snc-wpm-speed-test-page  └─ <x-snc-wpm-typing-session mode="speed_test">
│   ├─ /custom      x-snc-wpm-custom-page      ├─ <x-snc-wpm-custom-passages>
│   │                                          └─ <x-snc-wpm-typing-session mode="custom">
│   └─ /history     x-snc-wpm-history-page     └─ <x-snc-wpm-history>    │
└──────────────┬─────────────────────────────────────────────────────────┘
               │ this.server.get({action, ...})
┌──────────────▼────────────────── ServiceNow instance ──────────────────┐
│  Widget server scripts ──► WpmAttemptService (script include)          │
│        │  GlideRecordSecure        │ replay + score + write (system)   │
│        ▼                           ▼                                   │
│  ACLs ──► x_snc_wpm_lesson, _passage, _custom_passage,                 │
│           _attempt, _attempt_key   ◄── before business rules           │
└────────────────────────────────────────────────────────────────────────┘
```

### C2. Data model

#### `x_snc_wpm_lesson` — Lesson (admin-managed content, audited)

| Column | Type | Rules |
| --- | --- | --- |
| `title` | String (80) | Mandatory. Display field. |
| `unit` | Choice | `home_row`, `top_row`, `bottom_row`, `numbers`, `punctuation`, `sentences`. |
| `order` | Integer | Mandatory and unique among active lessons. Sets the unlock sequence. |
| `focus_keys` | String (40) | For example `asdf jkl;`. Shown in the header and highlighted on the keyboard. |
| `text` | String (4000) | Mandatory, 50–2,000 characters after normalization (C2.1). |
| `min_accuracy` | Integer | 50–100, default 90. |
| `target_net_wpm` | Integer | 0–200, default 0 (accuracy only). |
| `active` | Boolean | Default true. Inactive lessons are hidden and skipped when unlocking. |

Index: `(active, order)`.

#### `x_snc_wpm_passage` — Speed-test passage (admin-managed content, audited)

| Column | Type | Rules |
| --- | --- | --- |
| `title` | String (80) | Mandatory. |
| `text` | String (8000) | Mandatory, at least 3,000 characters after normalization (enough for 5 minutes at 120 WPM). |
| `active` | Boolean | Default true. |

#### `x_snc_wpm_custom_passage` — Custom passage (player-owned)

| Column | Type | Rules |
| --- | --- | --- |
| `user` | Reference `sys_user` | Mandatory; default current user; forced on insert for non-admins. |
| `title` | String (80) | Mandatory. |
| `text` | String (4000) | Mandatory, 50–2,000 characters after normalization. |

Index: `(user, sys_updated_on)`. A player can have at most 100 custom passages (business rule).

#### `x_snc_wpm_attempt` — Attempt (player-owned, system-scored, not audited)

| Column | Type | Rules |
| --- | --- | --- |
| `user` | Reference `sys_user` | Mandatory; forced on insert for non-admins. |
| `mode` | Choice | `lesson`, `speed_test`, `custom`. Mandatory. |
| `lesson` | Reference `x_snc_wpm_lesson` | Required when `mode = lesson`. |
| `custom_passage` | Reference `x_snc_wpm_custom_passage` | Required when `mode = custom`. Cascade rule `clear`, so history is kept if the passage is deleted. |
| `passage_title` | String (80) | Snapshot taken at start. |
| `passage_text` | String (8000) | Snapshot of the exact text the player typed against. Scoring always uses this snapshot. |
| `duration_seconds` | Integer | Speed test only: 60, 120, 180 or 300. |
| `state` | Choice | `in_progress`, `completed`, `abandoned`, `rejected`. Default `in_progress`. |
| `started_on` | Date/Time | Set by the server at `startAttempt`. |
| `completed_on` | Date/Time | Set at scoring. |
| `elapsed_ms` | Integer | Scored duration (C4). |
| `typed_chars` | Integer | Length of the final typed text. |
| `keystrokes` | Integer | Number of character keystrokes (not backspaces). |
| `missed_keystrokes` | Integer | Keystrokes that did not match the expected character when typed. |
| `errors` | Integer | Uncorrected wrong characters in the final text. |
| `gross_wpm` | Decimal (1 dp) | |
| `net_wpm` | Decimal (1 dp) | Adjusted speed (AWPM). |
| `accuracy` | Integer | 0–100. |
| `passed` | Boolean | Lessons only. |
| `personal_best` | Boolean | Set when the attempt beat the earlier best. |
| `flagged` | Boolean | Implausible input (C4.4). |
| `flag_reason` | String (40) | `too_fast`, `uniform_intervals`. Admin-visible only (field ACL). |

Indexes: `(user, mode, state, completed_on)`, `(user, lesson, passed)`.

Every column from `completed_on` to `flag_reason` is a **score field**. Business rule `br_attempt_guard` clears all of them on insert for non-admins (A2.5).

#### `x_snc_wpm_attempt_key` — Per-key statistics (player-owned, system-written, not audited)

| Column | Type | Rules |
| --- | --- | --- |
| `attempt` | Reference `x_snc_wpm_attempt` | Mandatory; cascade delete. |
| `user` | Reference `sys_user` | Copied from the attempt, so queries don't need dot-walking. |
| `key_char` | String (4) | The expected character, lowercased. Space is stored as `space`. |
| `hits` | Integer | Times the key was expected and typed correctly. |
| `misses` | Integer | Times the key was expected and typed wrongly. |

Index: `(user, key_char)`. Only rows for completed, unflagged attempts are written.

#### C2.1 Text normalization (business rule `br_text_normalize` on lesson, passage and custom passage)

Before insert and update:

1. Replace curly quotes, dashes and ellipses with ASCII equivalents (`’` → `'`, `—` → `-`, `…` → `...`).
2. Replace tabs and line breaks with single spaces, collapse repeated spaces, and trim.
3. Reject any character outside printable ASCII (0x20–0x7E) with "Only characters on a standard US keyboard are supported." (v1 supports US QWERTY only.)
4. Enforce the length limits above.

#### C2.2 Profile WPM columns on `sys_user`

These are two scoped columns added to the platform user table. Together they hold the player's latest and best WPM from completed timed rounds.

| Column | Label | Holds |
| --- | --- | --- |
| `x_snc_wpm_words_per_minute_latest` | Words per minute (latest) | WPM from the most recent qualifying round. Every qualifying round overwrites it, even if the new value is lower. |
| `x_snc_wpm_words_per_minute_best` | Words per minute (best) | The highest WPM from any qualifying round, across all speed-test durations. It only goes up. |

The platform requires the scope prefix on columns that a scoped app adds to another scope's table.

| Property (both columns) | Value |
| --- | --- |
| Table | `sys_user` (global) |
| Type | Integer, read-only on forms, default empty (empty means "no qualifying round yet") |
| Owning scope | `x_snc_wpm`. They are created on install and **removed with their data on uninstall**. |
| Defined in | `src/fluent/sys-user-fields.now.ts`. Use the Fluent table-column API for an existing table if the installed SDK version supports it. Otherwise use `Record`s on `sys_dictionary` (plus `sys_documentation` for the labels). Confirm which with the `aiux-build` skill. |

**Values written.** Let `wpm` be the attempt's `gross_wpm` (the "Typing speed" stat), rounded to the nearest whole number.

- `latest` is set to `wpm`.
- `best` is set to `wpm` only if `best` is empty or `wpm > best`. Both values are compared after rounding, so a round that ties the best leaves it unchanged.

`best` is a profile-level value across all durations, so it can differ from the attempt-level `personal_best` flag (C4.3), which is tracked per duration. The attempt table remains the source of truth. If `best` is ever lost or wrong, an admin fix script can rebuild it from a `GlideAggregate` MAX of `gross_wpm` over the user's completed, unflagged, timed-out speed-test attempts.

**When they are written.** `WpmAttemptService` writes both columns, in one update, during `submitAttempt` once scoring has succeeded, if **all** of these are true:

- `mode = speed_test`, which is the only mode with a timer.
- `ended = timeout`, meaning the timer ran out. The server checks this against its own clock: the attempt **MUST** have been running for at least `duration_seconds` since `started_on`, minus a 2 s tolerance.
- `state` becomes `completed` and `flagged = false`.
- The attempt belongs to the session user. The columns are updated on `gs.getUserID()`'s record, never on a user ID sent by the client.

Lessons and custom passages have no timer, so they never update the columns. Exited, abandoned, expired, rejected and flagged attempts don't either. If the browser never submits (for example, the tab closes as the timer ends), the columns are unchanged. There is no retry.

**How it is written.** The write is part of C4.5's system write path:

```js
// System write: players have no write ACL on these columns (C3). Ownership,
// mode, timer and flag were verified above. setWorkflow(false) keeps platform
// sys_user business rules (LDAP, identity sync, etc.) from running for a game
// stat. autoSysFields(false) leaves sys_updated_on untouched so user sync
// integrations don't see a profile change.
var wpm = Math.round(grossWpm);
var user = new GlideRecord('sys_user');
if (user.get(gs.getUserID())) {
  var best = user.getValue('x_snc_wpm_words_per_minute_best');
  var isNewBest = best === null || best === '' || wpm > parseInt(best, 10);
  user.setValue('x_snc_wpm_words_per_minute_latest', wpm);
  if (isNewBest) {
    user.setValue('x_snc_wpm_words_per_minute_best', wpm);
  }
  user.setWorkflow(false);
  user.autoSysFields(false);
  user.update();
}
```

This read-then-write can race if the same player submits two rounds at the same instant, which only happens with two tabs open. `startAttempt` abandons a player's other in-progress attempts, so at most one of those submissions can score. That makes the race harmless in practice, so no lock is needed.

If this write fails, it **MUST NOT** fail the attempt. The attempt stays `completed`, the failure is logged with `gs.error('WpmAttemptService: profile WPM update failed')` (without the values or the user), and `result.profileWpm.saved` is `false`.

**Cross-scope access.** `sys_user` belongs to the global scope, so the app **MUST** declare a cross-scope privilege in Fluent: source scope `x_snc_wpm`, target `sys_user`, operations `read` and `write`, status `allowed`. Without it, the write is blocked on instances that enforce application access.

### C3. Roles and ACLs

Roles: `x_snc_wpm.user` and `x_snc_wpm.admin` (admin contains user). Assign the user role to a group, not to individuals.

| Table | user role | admin role |
| --- | --- | --- |
| `lesson`, `passage` | read (`active = true`) | read, create, write, delete |
| `custom_passage` | read, create, write, delete — owner is me | read, write, delete |
| `attempt` | read (owner is me), create | read, write, delete |
| `attempt_key` | read (owner is me) | read, delete |
| `attempt.flag_reason` (field) | — (no read) | read |
| `*.user` (field, writable tables) | — | write |
| `sys_user.x_snc_wpm_words_per_minute_latest` (field) | read — condition `sys_idDYNAMIC90d1921e5f510100a9ad2572f2b477fe` (record is me) | read |
| `sys_user.x_snc_wpm_words_per_minute_best` (field) | read — same condition | read |

The field ACLs on both profile WPM columns are created in the `x_snc_wpm` scope. Because there are specific field ACLs, the platform's `sys_user.*` wildcard ACLs no longer grant access to these columns. **No role** has a write ACL on them, not even `x_snc_wpm.admin`, so only the system write in C2.2 can change them. Users with the platform `admin` role can still edit it, because that role overrides ACLs.

Attempt creation by players is allowed, but `br_attempt_guard` neutralizes it (A2.5). The widget's own create path goes through the same rule. AIUX page and widget ACLs are generated from `@acl` decorators and all require `x_snc_wpm.user`.

### C4. Scoring (`WpmAttemptService`)

The service replays the keystroke log against `passage_text`. It never trusts totals computed by the client.

#### C4.1 Keystroke log format

```json
{"v": 1, "events": [[0, "i", "a"], [183, "i", "s"], [402, "d"], [530, "i", "d"]]}
```

- Each event is `[offsetMs, type, char?]`. `offsetMs` is milliseconds since the first keystroke (so the first event is `0`). `type` is `i` (insert one character) or `d` (delete one character). `char` is present only for `i`.
- The client records events from `beforeinput` / `input` (`insertText`, `deleteContentBackward`), so keyboard layouts and IME composition work. Each event inserts exactly one character. Multi-character inserts are rejected on the client and the server.
- Limits: at most 20,000 events, which is about 5 minutes at 200 WPM with corrections. Offsets are integers and never decrease.

#### C4.2 Replay

```
buffer = ""; keystrokes = 0; missed = 0; perKey = {}
for each event (offset ≤ limitMs):
  if type == "i":
    expected = passage[buffer.length]   (stop if buffer is already full)
    keystrokes++
    if char == expected: perKey[expected].hits++
    else:                missed++; perKey[expected].misses++
    buffer += char
  if type == "d" and buffer.length > 0:
    buffer = buffer.slice(0, -1)
```

`limitMs` is `duration_seconds × 1000` in timed mode and unlimited in passage mode.

#### C4.3 Formulas

| Value | Formula |
| --- | --- |
| `elapsed_ms` | Passage mode: the offset of the event that completed the passage (events after it are ignored). Timed mode: `duration_seconds × 1000`. |
| `minutes` | `max(elapsed_ms, 1000) / 60000` |
| `typed_chars` | `buffer.length` |
| `errors` | Positions *i* where `buffer[i] ≠ passage[i]` |
| `gross_wpm` | `(typed_chars / 5) / minutes`, rounded to 1 dp |
| `net_wpm` (AWPM) | `max(0, gross_wpm − errors / minutes)`, rounded to 1 dp; shown as a whole number |
| `accuracy` | `keystrokes == 0 ? 0 : round((keystrokes − missed) / keystrokes × 100)` |
| `passed` | `mode == lesson` and the passage is complete and `accuracy ≥ min_accuracy` and `net_wpm ≥ target_net_wpm` and not `flagged` |
| `personal_best` | Not flagged, **at least one** earlier completed, unflagged attempt exists for the same user and the same lesson / duration / custom passage, and `net_wpm` is greater than the highest of them (`GlideAggregate` MAX). A player's first attempt is never a personal best. |

In passage mode, a submission with `typed_chars < passage.length` is only accepted with `ended: "exit"`. It is stored as `abandoned` and not scored. In timed mode, a submission with zero character keystrokes is also stored as `abandoned` and not scored, so an idle round never sets a profile WPM of 0.

If both flag conditions in C4.4 fail, `flag_reason` is `uniform_intervals`.

#### C4.6 Service API (`WpmAttemptService`)

This script include is the single home for scoring and attempt rules. Widget server scripts **MUST** stay thin adapters: they parse `input`, call one service method, and copy its return value into `data`. This keeps every rule testable by ATF without a browser (see [ATF_TEST_SPEC.md](ATF_TEST_SPEC.md)).

| Method | Kind | Returns |
| --- | --- | --- |
| `validateLog(log)` | Pure | `null`, or `'invalid_log'` |
| `score(passageText, log, opts)` | Pure. `opts`: `mode`, `durationSeconds`, `minAccuracy`, `targetNetWpm` | `{elapsedMs, typedChars, keystrokes, missedKeystrokes, errors, grossWpm, netWpm, accuracy, complete, passed, flagged, flagReason, perKey}`, or `{errorCode: 'invalid_log'}` |
| `chooseCoach(result, ctx)` | Pure. `ctx`: `mode`, `minAccuracy`, `targetNetWpm` | `{rule, headline, summary, advice}` |
| `getSessionConfig(params)` | Reads as the session user | The C5.1 state without `attempt` / `result` |
| `startAttempt(params)` | Mutates as the session user | `{attempt}` or `{errorCode}` |
| `submitAttempt({attemptId, log, ended})` | Mutates as the session user | `{result}` or `{errorCode}` |
| `abandonAttempt({attemptId})` | Mutates as the session user | `{}` or `{errorCode}` |
| `getLessonMap()` | Reads as the session user | The C5.2 state |

"Pure" methods use no Glide record access and no clock, so tests can call them with fixed inputs. The other methods check `x_snc_wpm.user` first and return `{errorCode: 'no_role'}` without it.

#### C4.4 Verification

| Check | Result if it fails |
| --- | --- |
| The attempt exists, belongs to the caller, and is `in_progress` | `errorCode: "not_found"` |
| The log is well-formed and within the limits in C4.1 | `errorCode: "invalid_log"`; state becomes `rejected` |
| The last offset ≤ (server now − `started_on`) + 2,000 ms | `errorCode: "invalid_timing"`; state becomes `rejected` |
| The attempt started less than 60 minutes ago | `errorCode: "expired"`; state becomes `abandoned` |
| Fewer than 90% of inter-key intervals are under 15 ms, **and** no 50-character window is faster than 250 WPM | Otherwise the attempt is scored but `flagged` (`uniform_intervals` / `too_fast`) |

Rejected and flagged attempts write no `attempt_key` rows.

#### C4.5 Writes

After the checks pass, the service updates the attempt and inserts its `attempt_key` rows using plain `GlideRecord`, because players have no write ACL on these tables (A2.4). The service has already verified ownership and state, so this is the only path that writes scores. Each write carries a comment that says so.

For a speed test whose timer ran out, the service then updates the session user's `x_snc_wpm_words_per_minute_latest` and `x_snc_wpm_words_per_minute_best` on `sys_user`, as described in C2.2. This happens after the attempt row is saved, so a failed profile write never loses the attempt.

### C5. Widgets and server contracts

Every action returns the full state for its widget. Errors use `{isError: true, errorCode, errorMessage}`. The `no_role` error is common to all widgets.

#### C5.1 `x-snc-wpm-typing-session` — Abel Tuter Teaches Typing (main feature)

| Decorator | Value |
| --- | --- |
| `@name` | `'Abel Tuter Teaches Typing'` |
| `@description` | `'Abel Tuter Teaches Typing: a typing game with lessons, timed speed tests and custom passages that scores words per minute, accuracy and errors for the signed-in user.'` |
| `@bestFor` | `'Letting the signed-in user practice typing and measure their words per minute.'` |

The tag name stays `x-snc-wpm-typing-session`. The game name is display text only.

Properties: `mode` (`lesson` | `speed_test` | `custom`), `lesson-id`, `passage-id` (custom), `duration` (speed test).

| Action | Input | Effect |
| --- | --- | --- |
| `getState` *(default / SSR)* | `mode`, `lessonId` / `customId`, `durationSeconds` | Read only. Returns the session config. It does **not** include speed-test text, which is only revealed by `startAttempt`. |
| `startAttempt` | Same as `getState` | Marks the caller's other `in_progress` attempts as `abandoned`. Checks that the lesson is unlocked. Chooses a speed-test passage at random. Inserts an attempt with snapshots. Returns `attempt`. |
| `submitAttempt` | `attemptId`, `log` (C4.1), `ended` (`complete` / `timeout` / `exit`) | Scores the attempt through `WpmAttemptService`. Returns `result`. |
| `abandonAttempt` | `attemptId` | Sets the attempt to `abandoned`. Used on Exit and on `pagehide` (sent with `navigator.sendBeacon` where available; otherwise C4.4's expiry covers it). |
| `savePreferences` | Any keys from B6 | Saves the preferences and returns the state. |

```json
{
  "locale": "en",
  "mode": "lesson",
  "lesson": {"sysId": "…", "order": 3, "title": "Home row: reaching G and H", "focusKeys": "g h",
             "minAccuracy": 90, "targetNetWpm": 15, "locked": false, "nextLessonId": "…"},
  "passage": {"title": "…", "text": "…"},
  "preferences": {"showKeyboard": true, "showHands": true, "showLiveStats": true, "announceErrors": false},
  "attempt": {"sysId": "…", "startedOn": "2026-10-10 15:02:11", "durationSeconds": null},
  "result": {
    "state": "completed", "grossWpm": 22.0, "netWpm": 21.0, "accuracy": 93, "errors": 5,
    "elapsedMs": 300000, "passed": true, "personalBest": false, "flagged": false,
    "previous": {"netWpm": 18.0, "grossWpm": 19.0, "accuracy": 90, "errors": 7},
    "weakKeys": [{"key": "g", "misses": 3}, {"key": "h", "misses": 2}],
    "coach": {"rule": 3, "headline": "Good job!",
              "summary": "Your accuracy was 93% and your typing speed was 22 WPM. You made 5 errors in this lesson, so your adjusted speed was 21 AWPM.",
              "advice": "Ready for the next lesson?"},
    "nextLessonId": "…", "nextLessonUnlocked": true,
    "profileWpm": null
  }
}
```

`result.profileWpm` is `null` when the attempt didn't qualify for C2.2 (any lesson or custom attempt, for example). For a speed test whose timer ran out, it looks like this:

```json
{"saved": true, "latest": 22, "best": 31, "isNewBest": false}
```

- When `saved` is `true`, the results screen shows "Saved to your profile: {latest} WPM · Best: {best} WPM" in the status region. When `isNewBest` is also `true`, it shows "New profile best: {best} WPM".
- When `saved` is `false`, `latest`, `best` and `isNewBest` are `null`, and the screen shows "Your result was saved, but your profile couldn't be updated."

Widget-specific error codes: `locked`, `not_found`, `invalid_log`, `invalid_timing`, `expired`, `no_passages`.

**Client responsibilities:** capturing input and recording the log with `performance.now()` offsets, the countdown, the timer, provisional live stats, passage highlighting, focus management, and rendering `result`. In timed mode, the client stops accepting input at the limit and submits with `ended: "timeout"`. The server discards anything past the limit regardless.

#### C5.2 `x-snc-wpm-lesson-map` — Lesson Map

| Action | Input | Effect |
| --- | --- | --- |
| `getState` | — | Returns `units[]`, each with `lessons[]`: `{sysId, order, title, focusKeys, status: "locked"/"available"/"passed", bestNetWpm, bestAccuracy}`, plus `nextLessonId`, `completedCount` and `totalCount`. |

Status is derived with one `GlideAggregate` over the caller's passed attempts, grouped by `lesson` (MAX `net_wpm`, MAX `accuracy`). No progress table is stored. The widget fires a `lesson-select` event, and the page writes `?lesson=` to the URL. When the typing session reports a passed attempt, the page refreshes the map.

#### C5.3 `x-snc-wpm-custom-passages` — Custom Passages

| Action | Input | Effect |
| --- | --- | --- |
| `getState` | — | Returns `passages[]` (`sysId`, `title`, `length`, `updatedOn`), newest first, up to 100. |
| `savePassage` | `sysId?`, `title`, `text` | Creates or updates the caller's passage. The business rule normalizes and validates it. |
| `deletePassage` | `sysId` | Deletes the caller's passage. Attempts keep their snapshots. |

#### C5.4 `x-snc-wpm-history` — History

| Action | Input | Effect |
| --- | --- | --- |
| `getState` | `mode` (`all` / `lesson` / `speed_test` / `custom`), `page` (0-based) | Returns `attempts[]` (25 per page, completed only), `totalAvailable`, `trend[]` (last 30 `{completedOn, netWpm}`), and `weakKeys[]` (all keys with `{key, hits, misses, missRate}` over the caller's last 20 completed attempts, using `GlideAggregate` SUM on `attempt_key`). |
| `getAttempt` | `sysId` | Returns that attempt's `result` block (same shape as C5.1), read-only. |

The trend chart and heatmap **MUST** follow the `dataviz` skill. The ranked weak-key list is the accessible alternative to the heatmap.

#### C5.5 `x-snc-wpm-dashboard` — Home dashboard

| Action | Input | Effect |
| --- | --- | --- |
| `getState` | — | Returns `bestSpeedTestNetWpm`, `avgAccuracyLast10`, `lessonsCompleted`, `lessonsTotal`, `nextLesson {sysId, title}`, `sparkline[]` (last 10 `netWpm`) and `isNewPlayer`. |

### C6. Shared client components

These are custom components under `components/` (shared). Each extends `AIUXElement` and is SSR-safe.

| Component | Purpose | Notes |
| --- | --- | --- |
| `x-snc-wpm-passage-view` | Renders the passage with correct, incorrect, current and pending character states, and auto-scrolls. | Renders by word spans to keep the DOM small. Uses underline and outline as well as color. |
| `x-snc-wpm-virtual-keyboard` | A US QWERTY layout. Props: `nextKey`, `errorKey`, `focusKeys`, `heat` (map of key to 0–1), `showHands`. | `aria-hidden`. The finger map is a constant (key → finger). The hands are an inline SVG overlay. |
| `x-snc-wpm-speed-gauge` | A semicircular dial from 0 to 120+ with a needle and a numeric readout. | `aria-hidden`; the live bar shows the number as text. Respects reduced motion. Uses `motion` skill timing. |
| `x-snc-wpm-coach-card` | The coach avatar, speech bubble, summary and advice. | The avatar is an original illustration in `public/coach.svg`, with empty alt text (decorative). |
| `x-snc-wpm-stats-card` | The four results metrics with trend arrows and deltas. | Uses a definition list (`<dl>`). Deltas include text such as "up 3 from last time". |

### C7. Theme

The original design's olive, lime and cream palette is the starting point. `theme.js` example:

```js
export const AppTheme = {
  primary_color: '#3E5C1E',   // olive — buttons, active nav
  accent_color: '#A4C639',    // lime — highlights, gauge zone
  neutral_colors: {use_hex_value: true, hex_value: '#F7F3E3'}, // cream surfaces
  shape: {selector_radius: '0.75rem', field_radius: '0.75rem', boxes_radius: '1rem', border_width: '1px'}
};
```

All text and essential UI against these colors **MUST** be checked for 4.5:1 (text) and 3:1 (UI) contrast. Adjust the colors, not the requirement. The virtual keyboard uses the dark `neutral` surface tokens, so it works in both light and dark themes.

### C8. Seed content (Fluent `Record`, installed everywhere)

- **24 lessons** across six units, four per unit. Each lesson is 150–400 characters long. `min_accuracy` is 90 for every lesson. `target_net_wpm` goes from 0 in unit 1 to 25 in unit 6.
- **6 speed-test passages** of at least 3,000 characters each, original prose.
- Demo only (`installMethod: 'demo'`): 2 custom passages for the admin user.

### C9. Repository layout

```
application.js            App shell: theme, aiux-nav-layout, nav items (B3)
theme.js                  AppTheme (C7)
aiux.json                 name "Words Per Minute", basename "words-per-minute", landing "/home"
now.config.json           scope x_snc_wpm
public/coach.svg          Coach illustration
components/               Shared components (C6)
pages/
  home/page.js            /home
  lessons/page.js         /lessons (map + session; ?lesson= URL sync)
  speed-test/page.js      /speed-test
  custom/page.js          /custom
  history/page.js         /history
widgets/
  x-snc-wpm-typing-session/   index.js, server-script.js
  x-snc-wpm-lesson-map/       index.js, server-script.js
  x-snc-wpm-custom-passages/  index.js, server-script.js
  x-snc-wpm-history/          index.js, server-script.js
  x-snc-wpm-dashboard/        index.js, server-script.js
utils/document-title.js   SSR-safe page titles
src/fluent/
  roles.now.ts  tables.now.ts  acls.now.ts  business-rules.now.ts
  script-includes.now.ts      WpmAttemptService (replay, score, coach, persist, profile WPM)
  sys-user-fields.now.ts      sys_user latest/best WPM columns + field ACLs + cross-scope privilege (C2.2)
  seed-lessons.now.ts  seed-passages.now.ts  seed-demo.now.ts
  tests/                      ATF tests and suites (docs/ATF_TEST_SPEC.md)
docs/APPLICATION_SPEC.md  This document
docs/ATF_TEST_SPEC.md     ATF test specification
```

### C10. Business rules summary

| Name | Table | When | Behavior |
| --- | --- | --- | --- |
| `br_attempt_guard` | attempt | before insert | For non-admins: force `user`, set `state = in_progress` and `started_on = now`, clear every score field. Require `lesson` / `custom_passage` to match `mode`. |
| `br_text_normalize` | lesson, passage, custom_passage | before insert/update | Normalize text and enforce limits (C2.1). |
| `br_custom_owner_limit` | custom_passage | before insert | Force `user` for non-admins. Reject a player's 101st passage (plain `GlideAggregate` count, commented). |
| `br_lesson_order_unique` | lesson | before insert/update | Reject a duplicate `order` among active lessons (plain `GlideRecord`, commented). |

### C11. Out of scope for v1 (backlog)

| Item | Guidance when added |
| --- | --- |
| Keyboard layouts other than US QWERTY (Dvorak, AZERTY, UK) | Add a `layout` preference and per-layout finger maps; extend C2.1's allowed characters. |
| Team leaderboards and manager view | A new `x_snc_wpm.manager` role with ACLs limited to direct reports. Leaderboards must be opt-in. |
| AI coach advice (Now Assist) | Generate the advice line from the attempt's stats and weak keys. Keep the rule-based coach as the fallback. Never send typed text. |
| Adaptive drills generated from weak keys | A server-generated passage built from the player's worst keys; mode `drill`. |
| Sound effects and keystroke audio | Off by default, with a preference. |
| Certificates or badges | Award through a Flow Designer flow triggered on attempt completion, not in widget code. |
| Reporting dashboard | Platform Analytics on `x_snc_wpm_attempt.net_wpm` and `accuracy`. |
