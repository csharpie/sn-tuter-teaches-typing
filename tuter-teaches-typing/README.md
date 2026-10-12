# Abel Tuter Teaches Typing

A typing tutor that runs on ServiceNow. Players work through structured lessons, take timed speed tests and practise with their own text. After every attempt an on-screen coach reports their accuracy, typing speed (WPM), errors and adjusted speed (AWPM), with a short word of encouragement or advice.

The speed test can be played as a driving game, after the one in *Mavis Beacon Teaches Typing*: the car's speed follows your typing, it overtakes traffic and steers round road works, and every mistyped key splats a bug on the windscreen.

![The Speed test driving game: a highway seen from the driver's seat, with road works and traffic cones ahead, bug splats on the windscreen, a car in the rear-view mirror, and a dashboard showing the passage being typed, the time left, 58 WPM and 98% accuracy](docs/images/speed-test.png)

It is a scoped ServiceNow application (`x_snc_ttt`), built with AIUX (Lit web components rendered on the server) and the Now SDK, with its tables, security and tests defined in code as Fluent metadata.

## Features

- **Lessons**: 24 lessons in units from the home row to full sentences. Each lesson unlocks when the one before it is passed; the lesson map shows status and best scores.
- **Speed test**: 1, 2, 3 or 5 minutes on a random passage, played on the classic screen or the driving game. A completed timed test updates the player's profile with their latest and best WPM.
- **Custom lessons**: players keep up to 100 passages of their own (50–2,000 characters) and practise them like lessons.
- **History**: every attempt with a mode filter, an adjusted-speed trend chart and a weak-keys heatmap of the keyboard.
- **Coach and results**: scores, personal bests, the keys that caused the most mistakes, and the way to the next lesson.
- **Fair scoring**: the browser only records keystrokes. The server replays the keystroke log, scores it and rejects implausible input, so scores can't be forged.
- **Accessible**: keyboard-first, screen-reader announcements, reduced-motion support, and the driving game can be turned off.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 24.14.1 or later (see `.nvmrc`) and [pnpm](https://pnpm.io/).
- A ServiceNow instance you can install applications on, such as a personal developer instance, and an admin login for it.

### 1. Install

```bash
cd tuter-teaches-typing
pnpm install
```

`pnpm install` also copies the ServiceNow agent skills into `.claude/skills` for AI coding assistants (see [AGENTS.md](AGENTS.md)).

### 2. Connect to your instance

Save a login for the Now SDK and make it the default:

```bash
npx now-sdk auth --add https://<your-instance>.service-now.com --type basic --alias dev
npx now-sdk auth --use dev
```

The local dev server also reads the instance and login from a `.env` file in this folder (it is gitignored, so it never leaves your machine):

```ini
GLIDE_ORIGIN=https://<your-instance>.service-now.com
AUTH_TOKEN=Basic <base64 of username:password>
```

If no default SDK login is saved, `pnpm deploy` falls back to the login in `.env`.

### 3. Build and deploy

```bash
pnpm build
pnpm deploy
```

This installs the app with its tables, roles, security rules, seed lessons and passages, and ATF tests. `pnpm deploy:reinstall` uninstalls and reinstalls it if the instance has drifted from the code.

### 4. Give people access

Add players to the **Abel Tuter Teaches Typing Players** group, which grants the `x_snc_ttt.user` role. Content admins also need `x_snc_ttt.admin`, which lets them manage lessons and passages and see every player's attempts. Without a role, the app shows a "no access" message.

### 5. Play

Open `https://<your-instance>.service-now.com/aiux/tuter-teaches-typing/home`, then choose **Speed test** under **Abel Tuter Teaches Typing** in the side navigation.

### Local development

```bash
pnpm dev
```

This serves the app locally against your instance at `http://localhost/aiux/tuter-teaches-typing`, signing in through your instance's login page. Restart it after changing `tailwind.app.css`; a running server doesn't pick up changes to that file.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the local dev server against your instance. |
| `pnpm build` | Builds the app and its metadata into `dist/` and `target/`. |
| `pnpm deploy` | Installs or updates the app on your instance. |
| `pnpm deploy:reinstall` | Uninstalls and reinstalls the app. |
| `pnpm test` | Runs the local tests (scoring, widget server scripts, driving game). |
| `pnpm lint` | Checks style and AIUX rules; must report zero findings. |
| `pnpm atf:generate` | Regenerates the ATF tests from `scripts/atf/catalog.mjs`. |
| `pnpm doctor` | Checks the AIUX project setup. |

## How it's built

```text
tuter-teaches-typing/
├── application.js        App shell: side navigation, toolbar title, features
├── theme.js              Olive, lime and cream theme
├── pages/                One Lit page per route: home, lessons, speed-test, custom, history
├── widgets/              Self-contained widgets, each with a client and a server script
│   └── x-snc-ttt-typing-session/   The typing session used by lessons, speed tests and custom passages
├── components/           Shared UI: stats cards, coach card, virtual keyboard, the driving game
│   ├── road-sim.js       Highway simulation and renderer for the driving game
│   ├── road-vehicle.js   Vehicle types and the driver model every car uses
│   └── road-common.js    Shared units, lane geometry and math helpers
├── utils/                Formatting, document title and product name helpers
├── src/fluent/           Metadata as code: tables, roles, ACLs, business rules, seed content
│   ├── scripts/WpmAttemptService.server.js   Scoring, attempt rules and widget data
│   └── tests/            ATF tests (generated from scripts/atf/catalog.mjs)
├── scripts/              Deploy wrapper, ATF generator, agent-skill setup
└── test/                 Local Node tests
```

- **Scoring lives on the server.** `WpmAttemptService` validates and replays each keystroke log, works out WPM, AWPM and accuracy, flags implausible typing, picks the coach message and updates the player's profile. Business rules, ATF and every widget call this one class.
- **Widgets are thin adapters.** Each widget's server script maps its actions to service methods through `WpmAttemptService.respond()`, which owns the role check, error wording and response shape.
- **Players own their records, the system scores them.** Players can create attempts but never write scores; ACLs and business rules enforce this for every entry point, not only the UI.

## Testing

- `pnpm test` runs fast local checks under Node: the scoring rules, the widget server scripts against a stubbed service, and a driving-game simulation that proves no vehicle ever collides.
- The ATF suites (85 tests) install with the app and run on the instance from **Automated Test Framework > Suites**. Edit `scripts/atf/catalog.mjs`, then run `pnpm atf:generate`; don't edit the generated files.

## Code style

JavaScript follows the [Airbnb JavaScript style guide](https://github.com/airbnb/javascript), enforced by `pnpm lint`. Code that runs on the instance (server scripts, script includes, business rules, ATF steps) is written in ES5 and follows Airbnb's ES5 rules. The few exceptions the platform requires, such as `_private` names for Lit internals, are explained in `eslint.config.mjs`.

## Documentation

- [Application specification](../docs/APPLICATION_SPEC.md) and [ATF test specification](../docs/ATF_TEST_SPEC.md). They predate the final name and scope, so read "Words Per Minute" as this app and `x_snc_wpm` as `x_snc_ttt`.
- [AGENTS.md](AGENTS.md): guidance for AI coding assistants working in this project.
