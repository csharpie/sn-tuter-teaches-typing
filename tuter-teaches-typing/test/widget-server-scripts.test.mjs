// Local checks for the widget server scripts and WpmAttemptService.respond():
// every widget is the same thin adapter, so these pin the shared contract
// (role check, action routing, error wording, the not-installed fallback) and
// each widget's mapping of actions to service methods. The scripts run under
// Node with a stubbed `gs`; service data methods are replaced per test.
//
// Run with: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Objects made inside the sandbox have its prototypes; compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));

const session = { hasRole: true, errors: [] };
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
    hasRole: () => session.hasRole,
    error: (message) => session.errors.push(message),
  },
};
vm.createContext(sandbox);
vm.runInContext(read('src/fluent/scripts/WpmAttemptService.server.js'), sandbox);

const NOT_INSTALLED = 'Abel Tuter Teaches Typing is not installed on this instance. Ask your administrator to deploy it.';
const NO_ROLE = 'You need the Abel Tuter Teaches Typing player role. Contact your administrator.';

/**
 * Loads a widget server script with x_snc_ttt.WpmAttemptService set to the
 * real class, its data methods replaced by `stubs` (null leaves the app
 * uninstalled). Returns run(input, options) -> data.
 */
function widget(name, stubs) {
  const source = read(`widgets/${name}/server-script.js`).replace(
    /^export default function server/m,
    'function server',
  );
  const server = vm.runInContext(`${source}\nserver;`, sandbox);
  return (input, options = {}) => {
    session.errors = [];
    if (stubs === null) {
      delete sandbox.x_snc_ttt;
    } else {
      const Service = function Service() {};
      Service.prototype = Object.assign(Object.create(sandbox.WpmAttemptService.prototype), stubs);
      sandbox.x_snc_ttt = { WpmAttemptService: Service };
    }
    const data = {};
    server(data, options, input);
    return plain(data);
  };
}

test.beforeEach(() => {
  session.hasRole = true;
});

// ---------------------------------------------------------------- respond()

test('respond: the action defaults to getState and its result is copied into data', () => {
  const data = widget('x-snc-ttt-lesson-map', { getLessonMap: () => ({ locale: 'en', units: [] }) })();
  assert.deepEqual(data, { locale: 'en', units: [] });
});

test('respond: without the player role nothing runs', () => {
  session.hasRole = false;
  let called = false;
  const run = widget('x-snc-ttt-dashboard', {
    getDashboard: () => {
      called = true;
      return {};
    },
  });
  assert.deepEqual(run({ action: 'getState' }), {
    isError: true,
    errorCode: 'no_role',
    errorMessage: NO_ROLE,
  });
  assert.equal(called, false);
});

test('respond: an unknown action is an invalid request', () => {
  const data = widget('x-snc-ttt-dashboard', { getDashboard: () => ({}) })({ action: 'deleteEverything' });
  assert.equal(data.errorCode, 'invalid_request');
  assert.equal(data.errorMessage, 'That request is not valid.');
});

test('respond: an exception is logged without the input and reported as server_error', () => {
  const run = widget('x-snc-ttt-history', {
    getHistory: () => {
      throw new Error('boom');
    },
  });
  const data = run({ action: 'getState', mode: 'secret-input' });
  assert.equal(data.errorCode, 'server_error');
  assert.equal(data.errorMessage, 'Your history could not be loaded. Try again.');
  assert.deepEqual(session.errors, ['x-snc-ttt-history getState: boom']);
});

test('respond: an errorCode without widget wording uses the service default', () => {
  const data = widget('x-snc-ttt-lesson-map', { getLessonMap: () => ({ errorCode: 'expired' }) })();
  assert.equal(data.isError, true);
  assert.equal(
    data.errorMessage,
    'This attempt was open for more than an hour, so it expired. Start a new one.',
  );
});

// ---------------------------------------------------------------- every widget

[
  'x-snc-ttt-custom-passages',
  'x-snc-ttt-dashboard',
  'x-snc-ttt-history',
  'x-snc-ttt-lesson-map',
  'x-snc-ttt-typing-session',
].forEach((name) => {
  test(`${name}: reports not_installed when the app is missing`, () => {
    assert.deepEqual(widget(name, null)({ action: 'getState' }), {
      isError: true,
      errorCode: 'not_installed',
      errorMessage: NOT_INSTALLED,
    });
  });
});

// ---------------------------------------------------------------- per widget

test('history: getAttempt passes the sysId and words not_found for an attempt', () => {
  let asked = null;
  const run = widget('x-snc-ttt-history', {
    getAttemptResult: (params) => {
      asked = params;
      return { errorCode: 'not_found' };
    },
  });
  const data = run({ action: 'getAttempt', sysId: 'abc' });
  assert.deepEqual(plain(asked), { sysId: 'abc' });
  assert.equal(data.errorMessage, 'That attempt was not found.');
});

test('history: getState passes the mode and page', () => {
  let asked = null;
  widget('x-snc-ttt-history', {
    getHistory: (params) => {
      asked = params;
      return {};
    },
  })({
    action: 'getState', mode: 'lesson', page: 2, extra: 'ignored',
  });
  assert.deepEqual(plain(asked), { mode: 'lesson', page: 2 });
});

test('custom passages: a form error keeps the list and is not a widget error', () => {
  const run = widget('x-snc-ttt-custom-passages', {
    saveCustomPassage: (params) => ({
      passages: [],
      limit: 100,
      actionStatus: 'error',
      actionField: 'title',
      actionMessage: `bad ${params.title}`,
    }),
  });
  const data = run({
    action: 'savePassage', sysId: '', title: 'x', text: 'y',
  });
  assert.equal(data.isError, undefined);
  assert.equal(data.actionStatus, 'error');
  assert.equal(data.actionField, 'title');
  assert.equal(data.actionMessage, 'bad x');
  assert.deepEqual(data.passages, []);
});

test('typing session: getState reads the component properties', () => {
  let asked = null;
  const run = widget('x-snc-ttt-typing-session', {
    getSessionConfig: (request) => {
      asked = request;
      return { locale: 'en', mode: request.mode };
    },
  });
  const data = run(undefined, { mode: 'speed_test', duration: 120, passageId: '' });
  assert.deepEqual(plain(asked), {
    mode: 'speed_test', lessonId: '', customId: '', durationSeconds: 120,
  });
  assert.deepEqual(data, { locale: 'en', mode: 'speed_test' });
});

test('typing session: an action error keeps the session config', () => {
  const run = widget('x-snc-ttt-typing-session', {
    getSessionConfig: () => ({ locale: 'en', mode: 'lesson' }),
    startAttempt: () => ({ errorCode: 'locked' }),
  });
  const data = run({ action: 'startAttempt', mode: 'lesson', lessonId: 'L1' });
  assert.equal(data.locale, 'en');
  assert.equal(data.errorCode, 'locked');
  assert.equal(data.errorMessage, 'This lesson is locked. Pass the lesson before it to unlock it.');
});

test('typing session: a submitted log arrives parsed and the result is merged', () => {
  let submitted = null;
  const run = widget('x-snc-ttt-typing-session', {
    getSessionConfig: () => ({ locale: 'en' }),
    submitAttempt: (params) => {
      submitted = params;
      return { result: { state: 'completed' } };
    },
  });
  const data = run({
    action: 'submitAttempt',
    mode: 'custom',
    attemptId: 'a1',
    ended: 'complete',
    log: JSON.stringify({ v: 1, events: [[0, 'i', 'a']] }),
  });
  assert.deepEqual(plain(submitted), {
    attemptId: 'a1',
    log: { v: 1, events: [[0, 'i', 'a']] },
    ended: 'complete',
  });
  assert.deepEqual(data.result, { state: 'completed' });
  assert.equal(data.isError, undefined);
});
