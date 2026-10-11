import {
  html, css, nothing, isServer,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import {
  AIUXWidgetElement,
  decorators,
} from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { AriaLiveController } from '@servicenow/aiux/aiux-controller-aria-live';
import { icon } from '@servicenow/aiux/aiux-directive-icon';
import '../../components/x-snc-ttt-passage-view.js';
import '../../components/x-snc-ttt-virtual-keyboard.js';
import '../../components/x-snc-ttt-speed-gauge.js';
import '../../components/x-snc-ttt-coach-card.js';
import '../../components/x-snc-ttt-stats-card.js';
import '../../components/x-snc-ttt-road-trip.js';
import { formatClock, formatInteger } from '../../utils/format.js';
import productName from '../../utils/product-name.js';

const {
  name,
  description,
  bestFor,
  category,
  chatCompatible,
  server,
  acl,
  discoverable,
} = decorators;

const DURATIONS = [60, 120, 180, 300];
const MAX_EVENTS = 20000;
const TICK_MS = 200;
const PLAYING = new Set(['countdown', 'typing']);

function renderPassBadge(passed) {
  if (passed) {
    return html`<span class="aiux-badge aiux-badge-success aiux-badge-soft gap-1">
      ${icon({ name: 'circle-check', size: 'sm' })}
      ${i18n.getMessage('Passed')}
    </span>`;
  }
  return html`<span class="aiux-badge aiux-badge-neutral aiux-badge-soft">
    ${i18n.getMessage('Not passed yet')}
  </span>`;
}

function charName(ch) {
  return ch === ' ' ? i18n.getMessage('space') : ch;
}

function renderLoading() {
  return html`<div
    role="status"
    aria-label=${i18n.getMessage('Loading typing session')}
    class="flex flex-col gap-3"
  >
    <div class="aiux-skeleton h-24 w-full" aria-hidden="true"></div>
    <div class="aiux-skeleton h-12 w-full" aria-hidden="true"></div>
    <div class="aiux-skeleton h-10 w-40" aria-hidden="true"></div>
  </div>`;
}

/**
 * Abel Tuter Teaches Typing — the typing session for lessons, timed speed
 * tests and custom passages (APPLICATION_SPEC B4, B5, C5.1).
 *
 * The client records a keystroke log and shows provisional live stats while
 * typing; every score on the results screen comes from the server.
 *
 * Events (bubbling, composed):
 *   attempt-scored  {mode, lessonId, passed, nextLessonId}
 *   next-lesson     {lessonId}
 *   session-exit    {mode}
 */
@customElement('x-snc-ttt-typing-session')
@name('Abel Tuter Teaches Typing')
@description(
  'Abel Tuter Teaches Typing: a typing game with lessons, timed speed tests and custom passages that scores words per minute, accuracy and errors for the signed-in user.',
)
@bestFor(
  'Letting the signed-in user practice typing and measure their words per minute.',
)
@category('custom')
@chatCompatible(false)
@server('./server-script.js')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
@discoverable(true)
export default class TypingSession extends AIUXWidgetElement {
  static properties = {
    mode: { type: String },
    lessonId: { type: String, attribute: 'lesson-id' },
    passageId: { type: String, attribute: 'passage-id' },
    duration: { type: Number },
    _phase: { type: String, state: true },
    _config: { type: Object, state: true },
    _text: { type: String, state: true },
    _typed: { type: String, state: true },
    _elapsed: { type: Number, state: true },
    _countdown: { type: Number, state: true },
    _result: { type: Object, state: true },
    _message: { type: Object, state: true },
    _notice: { type: String, state: true },
    _errorKey: { type: String, state: true },
    _errorPulse: { type: Number, state: true },
    _selectedDuration: { type: Number, state: true },
    _touchOnly: { type: Boolean, state: true },
    _reducedMotion: { type: Boolean, state: true },
  };

  // The session loads its own state (with the current properties) once it is
  // on the client, so a response for an earlier lesson can never apply.
  static fetchDataOnConnect = false;

  static styles = css`
    :host {
      display: block;
    }
    .countdown {
      font-size: 4rem;
      line-height: 1;
    }
    @media (forced-colors: active) {
      .countdown {
        border: 2px solid CanvasText;
      }
    }
    /* In the driving view the textarea covers the cockpit, invisibly, so a
       click anywhere on it keeps typing. The cockpit draws the focus ring. */
    .drive-input {
      display: block;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      resize: none;
      overflow: hidden;
      background: transparent;
      color: transparent;
      caret-color: transparent;
      font-size: 16px;
      cursor: text;
      outline: none;
      forced-color-adjust: none;
    }
    .drive-input::selection {
      background: transparent;
      color: transparent;
    }
  `;

  // The controller builds its live regions in its constructor, which crashes
  // under the SSR DOM shim, so it is created in firstUpdated (client only).
  _live = null;

  constructor() {
    super();
    this.mode = '';
    this.lessonId = '';
    this.passageId = '';
    this.duration = 60;
    this._phase = 'loading';
    this._config = null;
    this._text = '';
    this._typed = '';
    this._elapsed = 0;
    this._countdown = 0;
    this._result = null;
    this._message = null;
    this._notice = '';
    this._errorKey = '';
    this._errorPulse = 0;
    this._selectedDuration = 60;
    this._touchOnly = false;
    this._reducedMotion = false;
    this._keys = { total: 0, wrong: 0 };
    this._events = [];
    this._t0 = null;
    this._attempt = null;
    this._timers = { clock: 0, countdown: 0, limit: 0 };
    this._loadTicket = 0;
    this._busy = false;
    this._reload = false;
  }

  // ------------------------------------------------------------ lifecycle

  connectedCallback() {
    super.connectedCallback();
    if (!isServer) {
      window.addEventListener('pagehide', this._onPageHide);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (!isServer) {
      window.removeEventListener('pagehide', this._onPageHide);
    }
    // Leaving the page during an attempt abandons it (B4).
    this._abandonInFlight();
    this._clearTimers();
  }

  willUpdate(changed) {
    if (changed.has('duration')) {
      this._selectedDuration = DURATIONS.includes(Number(this.duration))
        ? Number(this.duration)
        : DURATIONS[0];
    }
    if (
      this.hasUpdated
      && ['mode', 'lessonId', 'passageId', 'duration'].some((p) => changed.has(p))
    ) {
      this._reload = true;
    }
  }

  firstUpdated() {
    this._live = new AriaLiveController(this);
    this._touchOnly = window.matchMedia?.('(pointer: coarse)').matches
      && !window.matchMedia?.('(any-pointer: fine)').matches;
    this._reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this._load();
  }

  updated(changed) {
    super.updated?.(changed);
    if (this._reload) {
      this._reload = false;
      this._abandonInFlight();
      this._config = null;
      this._phase = 'loading';
      this._load();
    }
  }

  // ------------------------------------------------------------ server

  _request() {
    return {
      mode: this.mode,
      lessonId: this.lessonId || '',
      customId: this.passageId || '',
      durationSeconds: this._selectedDuration,
    };
  }

  async _call(input) {
    try {
      return (await this.server.get({ ...this._request(), ...input })) || null;
    } catch {
      return null;
    }
  }

  async _load() {
    if (isServer) return;
    this._loadTicket += 1;
    const ticket = this._loadTicket;
    const response = await this._call({ action: 'getState' });
    // Only the latest request applies, even if the lesson changed meanwhile.
    if (ticket === this._loadTicket) this._applyConfig(response);
  }

  _applyConfig(data) {
    if (!data) {
      this._fail(i18n.getMessage('The typing session could not be loaded.'));
      return;
    }
    if (data.isError && !data.locale) {
      this._fail(data.errorMessage);
      return;
    }
    this._config = data;
    if (data.isError) {
      this._message = { kind: 'error', text: data.errorMessage };
    }
    if (!PLAYING.has(this._phase) && this._phase !== 'results') {
      this._resetToReady();
    }
  }

  _fail(text) {
    this._message = { kind: 'error', text };
    this._phase = 'error';
  }

  // ------------------------------------------------------------ session

  get _prefs() {
    return (
      this._config?.preferences || {
        showKeyboard: true,
        showHands: true,
        showLiveStats: true,
        announceErrors: false,
        drivingView: null,
      }
    );
  }

  get _timed() {
    return this.mode === 'speed_test';
  }

  // The driving game is on by default, unless the player asked for reduced
  // motion and hasn't chosen it explicitly (null means "not chosen").
  get _drivingOn() {
    const choice = this._prefs.drivingView;
    return typeof choice === 'boolean' ? choice : !this._reducedMotion;
  }

  get _driving() {
    return this._timed && this._drivingOn;
  }

  get _locale() {
    return this._config?.locale || 'en';
  }

  _resetToReady() {
    this._clearTimers();
    this._events = [];
    this._t0 = null;
    this._attempt = null;
    this._typed = '';
    this._elapsed = 0;
    this._countdown = 0;
    this._result = null;
    this._errorKey = '';
    this._notice = '';
    this._keys = { total: 0, wrong: 0 };
    this._text = this._timed ? '' : this._config?.passage?.text || '';
    this._phase = 'ready';
  }

  async _start() {
    if (this._busy || this._phase !== 'ready') return;
    this._busy = true;
    this._message = null;
    this._phase = 'starting';
    const response = await this._call({ action: 'startAttempt' });
    this._busy = false;
    if (!response || response.isError || !response.attempt) {
      this._phase = 'ready';
      this._message = {
        kind: 'error',
        text:
          response?.errorMessage
          || i18n.getMessage('The attempt could not be started. Try again.'),
      };
      return;
    }
    this._attempt = response.attempt;
    this._text = response.passage?.text || '';
    this._events = [];
    this._keys = { total: 0, wrong: 0 };
    this._typed = '';
    this._t0 = null;
    this._runCountdown();
  }

  _runCountdown() {
    this._phase = 'countdown';
    this._countdown = 3;
    this._announce(formatInteger(3, this._locale));
    this.updateComplete.then(() => this._focusInput());
    // One change per second: well under three flashes a second (B7.5).
    const tick = () => {
      this._countdown -= 1;
      if (this._countdown > 0) {
        this._announce(formatInteger(this._countdown, this._locale));
        this._timers.countdown = setTimeout(tick, 1000);
      } else {
        this._announce(i18n.getMessage('Go'));
        this._phase = 'typing';
        this.updateComplete.then(() => this._focusInput());
      }
    };
    this._timers.countdown = setTimeout(tick, 1000);
  }

  _offset() {
    const now = performance.now();
    if (this._t0 === null) {
      // The clock starts at the first keystroke, not at Start (B4).
      this._t0 = now;
      this._timers.clock = setInterval(this._onTick, TICK_MS);
      if (this._timed) {
        this._timers.limit = setTimeout(
          () => this._finish('timeout'),
          this._selectedDuration * 1000,
        );
      }
    }
    return Math.round(now - this._t0);
  }

  _record(event) {
    if (this._events.length >= MAX_EVENTS) return false;
    this._events.push(event);
    [this._elapsed] = event;
    return true;
  }

  _insert(ch) {
    if (this._typed.length >= this._text.length) return;
    const offset = this._offset();
    if (this._timed && offset > this._selectedDuration * 1000) {
      this._finish('timeout');
      return;
    }
    if (!this._record([offset, 'i', ch])) return;
    const expected = this._text[this._typed.length];
    this._typed += ch;
    this._notice = '';
    this._keys.total += 1;
    if (ch === expected) {
      this._errorKey = '';
    } else {
      this._keys.wrong += 1;
      this._errorKey = expected;
      this._errorPulse += 1;
      if (this._prefs.announceErrors) {
        this._announce(
          i18n.getMessage('Typed {0}, expected {1}', [
            charName(ch),
            charName(expected),
          ]),
        );
      }
    }
    if (!this._timed && this._typed.length >= this._text.length) {
      this._finish('complete');
    }
  }

  _delete() {
    const offset = this._offset();
    if (this._timed && offset > this._selectedDuration * 1000) {
      this._finish('timeout');
      return;
    }
    if (!this._record([offset, 'd'])) return;
    if (this._typed.length) this._typed = this._typed.slice(0, -1);
    this._errorKey = '';
  }

  async _finish(ended) {
    if (this._phase !== 'typing' || !this._attempt) return;
    this._clearTimers();
    this._phase = 'submitting';
    const attemptId = this._attempt.sysId;
    const response = await this._call({
      action: 'submitAttempt',
      attemptId,
      log: { v: 1, events: this._events },
      ended,
    });
    this._attempt = null;
    if (!response || response.isError) {
      this._resetToReady();
      this._message = {
        kind: 'error',
        text:
          response?.errorMessage
          || i18n.getMessage('Your attempt could not be submitted. Try again.'),
      };
      return;
    }
    this._config = { ...this._config, ...response, result: undefined };
    const { result } = response;
    if (!result || result.state !== 'completed') {
      this._resetToReady();
      this._message = {
        kind: 'info',
        text: i18n.getMessage(
          "This attempt wasn't scored. Start again when you're ready.",
        ),
      };
      return;
    }
    this._result = result;
    this._phase = 'results';
    this._emit('attempt-scored', {
      mode: this.mode,
      lessonId: this.lessonId,
      passed: !!result.passed,
      nextLessonId: result.nextLessonId || null,
    });
    await this.updateComplete;
    const coach = this.renderRoot.querySelector('x-snc-ttt-coach-card');
    await coach?.updateComplete;
    coach?.focusHeadline();
  }

  _abandonInFlight() {
    if (!this._attempt) return;
    const attemptId = this._attempt.sysId;
    this._attempt = null;
    this._clearTimers();
    // Fire and forget: if the request never arrives, the next start abandons
    // the attempt and the server's 60-minute expiry covers it (C4.4).
    this._call({ action: 'abandonAttempt', attemptId });
  }

  _restart = () => {
    this._abandonInFlight();
    this._resetToReady();
    this._message = null;
    this.updateComplete.then(() => this.renderRoot.querySelector('[data-start]')?.focus());
  };

  _exit = () => {
    this._abandonInFlight();
    this._resetToReady();
    this._emit('session-exit', { mode: this.mode });
  };

  _tryAgain = () => {
    this._resetToReady();
    this._message = null;
    this.updateComplete.then(() => this.renderRoot.querySelector('[data-start]')?.focus());
  };

  _nextLesson = () => {
    const lessonId = this._result?.nextLessonId;
    if (lessonId) this._emit('next-lesson', { lessonId });
  };

  _clearTimers() {
    clearInterval(this._timers.clock);
    clearTimeout(this._timers.countdown);
    clearTimeout(this._timers.limit);
    this._timers = { clock: 0, countdown: 0, limit: 0 };
  }

  _emit(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  _announce(message) {
    this._live?.announce(message);
  }

  _focusInput() {
    this.renderRoot.querySelector('textarea')?.focus();
  }

  // ------------------------------------------------------------ provisional live stats

  _liveWpm() {
    const minutes = Math.max(this._elapsed, 1000) / 60000;
    return this._t0 === null ? 0 : this._typed.length / 5 / minutes;
  }

  _liveErrors() {
    let errors = 0;
    for (let i = 0; i < this._typed.length; i += 1) {
      if (this._typed[i] !== this._text[i]) errors += 1;
    }
    return errors;
  }

  /** Share of character keystrokes that were right, 0-100 (as the server scores it). */
  _liveAccuracy() {
    const { total, wrong } = this._keys;
    return total ? ((total - wrong) / total) * 100 : 100;
  }

  // ------------------------------------------------------------ input handlers

  _onTick = () => {
    if (this._t0 === null) return;
    this._elapsed = performance.now() - this._t0;
  };

  _onPageHide = () => this._abandonInFlight();

  _onBeforeInput = (e) => {
    if (this._phase !== 'typing') {
      e.preventDefault();
      return;
    }
    if (e.isComposing || e.inputType === 'insertCompositionText') return;
    e.preventDefault();
    switch (e.inputType) {
      case 'insertText':
        // One character per event; multi-character inserts are rejected (C4.1).
        if (typeof e.data === 'string' && e.data.length === 1) {
          this._insert(e.data);
        }
        break;
      case 'deleteContentBackward':
        this._delete();
        break;
      case 'insertFromPaste':
      case 'insertFromPasteAsQuotation':
      case 'insertFromDrop':
      case 'insertFromYank':
        this._blockPaste();
        break;
      default:
        // Line breaks, word deletes, undo and autocorrect replacements are
        // not part of a typing test.
        break;
    }
  };

  _onCompositionEnd = (e) => {
    const data = e.data || '';
    e.target.value = this._typed;
    if (this._phase === 'typing' && data.length === 1) this._insert(data);
  };

  _onPaste = (e) => {
    e.preventDefault();
    this._blockPaste();
  };

  _blockPaste() {
    this._notice = i18n.getMessage("Pasting isn't allowed in a typing test.");
  }

  _onKeyDown = (e) => {
    if (e.altKey && (e.code === 'KeyW' || e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      this._announce(
        i18n.getMessage('Current speed: {0} WPM', [
          formatInteger(this._liveWpm(), this._locale),
        ]),
      );
      return;
    }
    if (!PLAYING.has(this._phase)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this._restart();
      return;
    }
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(e.key)
    ) {
      // The caret always stays at the end of what you typed.
      e.preventDefault();
    }
  };

  _onDuration = (e) => {
    this._selectedDuration = Number(e.target.value);
  };

  async _savePreference(key, value) {
    this._config = {
      ...this._config,
      preferences: { ...this._prefs, [key]: value },
    };
    const response = await this._call({
      action: 'savePreferences',
      preferences: { [key]: value },
    });
    if (response?.preferences) {
      this._config = { ...this._config, preferences: response.preferences };
    }
  }

  // ------------------------------------------------------------ render

  _goalText() {
    const lesson = this._config?.lesson;
    if (this.mode === 'lesson' && lesson) {
      return lesson.targetNetWpm > 0
        ? i18n.getMessage('Pass with {0}% accuracy and {1} AWPM.', [
          formatInteger(lesson.minAccuracy, this._locale),
          formatInteger(lesson.targetNetWpm, this._locale),
        ])
        : i18n.getMessage('Pass with {0}% accuracy.', [
          formatInteger(lesson.minAccuracy, this._locale),
        ]);
    }
    if (this._timed) {
      return i18n.getMessage(
        'Type as much of the passage as you can before the time runs out.',
      );
    }
    return i18n.getMessage('Type the whole passage. There is no time limit.');
  }

  _renderHeader() {
    const lesson = this._config?.lesson;
    return html`<header class="flex flex-col gap-1">
      ${this.mode === 'lesson' && lesson?.focusKeys
        ? html`<p class="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            ${i18n.getMessage('Focus keys:')}
            ${lesson.focusKeys
              .split(/\s+/)
              .filter(Boolean)
              .map((key) => html`<kbd class="aiux-kbd aiux-kbd-sm">${key}</kbd>`)}
          </p>`
        : nothing}
      ${this._config
        ? html`<p id="session-goal" class="text-sm text-text-secondary">
            ${icon({ name: 'target', size: 'sm', class: 'inline align-text-bottom' })}
            ${this._goalText()}
          </p>`
        : nothing}
    </header>`;
  }

  _renderMessage() {
    if (!this._message) return nothing;
    const error = this._message.kind === 'error';
    return html`<div
      class="aiux-alert aiux-alert-soft ${error ? 'aiux-alert-error' : 'aiux-alert-info'}"
      role=${error ? 'alert' : 'status'}
    >
      ${icon({ name: error ? 'circle-exclamation' : 'circle-info', size: 'sm' })}
      <span>${this._message.text}</span>
    </div>`;
  }

  _renderDurationPicker() {
    return html`<fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm font-medium text-text-primary">
        ${i18n.getMessage('Test length')}
      </legend>
      <div class="flex flex-wrap gap-2">
        ${DURATIONS.map(
          (seconds) => html`<label
            class="flex cursor-pointer items-center gap-2 rounded-box border border-base-300 px-3 py-2"
          >
            <input
              type="radio"
              name="duration"
              class="aiux-radio aiux-radio-sm"
              .value=${String(seconds)}
              .checked=${this._selectedDuration === seconds}
              ?disabled=${this._phase !== 'ready'}
              @change=${this._onDuration}
            />
            <span>
              ${seconds === 60
                ? i18n.getMessage('1 minute')
                : i18n.getMessage('{0} minutes', [
                    formatInteger(seconds / 60, this._locale),
                  ])}
            </span>
          </label>`,
        )}
      </div>
    </fieldset>`;
  }

  _renderPreferences() {
    const prefs = { ...this._prefs, drivingView: this._drivingOn };
    const driving = this._driving;
    const toggles = [
      // The driving game has no keyboard, so its toggles only show without it.
      this._timed && ['drivingView', i18n.getMessage('Show the driving game')],
      !driving && ['showKeyboard', i18n.getMessage('Show the keyboard')],
      !driving && ['showHands', i18n.getMessage('Show which finger to use')],
      ['showLiveStats', i18n.getMessage('Show live speed and errors')],
      [
        'announceErrors',
        i18n.getMessage('Announce each mistyped character to screen readers'),
      ],
    ].filter(Boolean);
    return html`<details class="rounded-box border border-base-300 px-4 py-2">
      <summary class="cursor-pointer py-1 text-sm font-medium text-text-primary">
        ${i18n.getMessage('Preferences')}
      </summary>
      <div class="flex flex-col gap-3 py-2">
        ${toggles.map(
          ([key, label]) => html`<label class="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              role="switch"
              class="aiux-toggle aiux-toggle-sm aiux-toggle-primary"
              .checked=${!!prefs[key]}
              aria-checked=${prefs[key] ? 'true' : 'false'}
              @change=${(e) => this._savePreference(key, e.target.checked)}
            />
            <span>${label}</span>
          </label>`,
        )}
      </div>
    </details>`;
  }

  _renderLiveBar() {
    const elapsed = this._elapsed;
    const limit = this._selectedDuration * 1000;
    const clock = this._timed
      ? formatClock(Math.max(0, limit - elapsed), this._locale)
      : formatClock(elapsed, this._locale);
    const showStats = this._prefs.showLiveStats;
    const wpm = this._liveWpm();
    return html`<div
      class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-box bg-base-200 px-4 py-3"
    >
      <div class="flex flex-col">
        <span class="text-xs font-medium text-text-secondary">
          ${this._timed
            ? i18n.getMessage('Time left')
            : i18n.getMessage('Time')}
        </span>
        <span class="text-2xl font-bold tabular-nums text-text-primary">
          ${clock}
        </span>
      </div>
      ${showStats
        ? html`<div class="flex flex-col">
              <span class="text-xs font-medium text-text-secondary">
                ${i18n.getMessage('Speed (estimate)')}
              </span>
              <span class="text-2xl font-bold tabular-nums text-text-primary">
                ${i18n.getMessage('{0} WPM', [formatInteger(wpm, this._locale)])}
              </span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs font-medium text-text-secondary">
                ${i18n.getMessage('Errors')}
              </span>
              <span class="text-2xl font-bold tabular-nums text-text-primary">
                ${formatInteger(this._liveErrors(), this._locale)}
              </span>
            </div>
            <div class="ms-auto w-36 sm:w-44" aria-hidden="true">
              <x-snc-ttt-speed-gauge
                .value=${wpm}
                .target=${this._config?.lesson?.targetNetWpm || 0}
                locale=${this._locale}
              ></x-snc-ttt-speed-gauge>
            </div>`
        : nothing}
    </div>`;
  }

  _renderInput(driving) {
    return html`<textarea
      id="typing-input"
      slot=${driving ? 'input' : nothing}
      class=${driving ? 'drive-input' : 'aiux-textarea w-full font-mono text-base'}
      rows="2"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      aria-describedby="session-goal passage-text typing-help"
      .value=${live(this._typed)}
      @beforeinput=${this._onBeforeInput}
      @compositionend=${this._onCompositionEnd}
      @paste=${this._onPaste}
      @drop=${this._onPaste}
      @keydown=${this._onKeyDown}
    ></textarea>`;
  }

  _renderTypingHelp() {
    return html`<p id="typing-help" class="text-xs text-text-secondary">
        ${this._phase === 'typing'
          ? i18n.getMessage(
              'Press Escape to restart. Press Alt+W to hear your current speed.',
            )
          : i18n.getMessage('Press Start, wait for the countdown, then type.')}
      </p>
      <p class="text-sm font-medium text-error" role="alert">${this._notice}</p>`;
  }

  /** The speed test as a driving game: the cockpit replaces the passage and live bar. */
  _renderDrive() {
    const elapsed = this._elapsed;
    const limit = this._selectedDuration * 1000;
    return html`<x-snc-ttt-road-trip
        .text=${this._text}
        .typed=${this._typed}
        .phase=${this._phase}
        .countdown=${this._countdown}
        .errorPulse=${this._errorPulse}
        .wpm=${this._liveWpm()}
        .accuracy=${this._liveAccuracy()}
        .clock=${formatClock(Math.max(0, limit - elapsed), this._locale)}
        .clockLabel=${i18n.getMessage('Time left')}
        .showStats=${this._prefs.showLiveStats}
        locale=${this._locale}
        >${this._renderInput(true)}</x-snc-ttt-road-trip
      >
      <p id="passage-text" hidden>${this._text}</p>
      <div class="flex flex-col gap-1">
        <label for="typing-input" class="sr-only">
          ${i18n.getMessage('Type the passage')}
        </label>
        ${this._renderTypingHelp()}
      </div>`;
  }

  _renderPlay() {
    const phase = this._phase;
    const playing = PLAYING.has(phase);
    const prefs = this._prefs;
    const nextChar = phase === 'typing' || phase === 'countdown'
      ? this._text[this._typed.length] || ''
      : '';
    const hidePassage = this._timed && !this._text;
    const driving = this._driving;
    return html`
      ${this._timed && !playing ? this._renderDurationPicker() : nothing}
      ${this._touchOnly
        ? html`<div class="aiux-alert aiux-alert-info aiux-alert-soft" role="status">
            ${icon({ name: 'keyboard', size: 'sm' })}
            <span>${i18n.getMessage('A physical keyboard is recommended.')}</span>
          </div>`
        : nothing}
      ${driving ? this._renderDrive() : this._renderClassic(phase, playing, prefs, nextChar, hidePassage)}
      ${this._renderControls(phase, playing)}
      ${phase === 'ready' ? this._renderPreferences() : nothing}
    `;
  }

  _renderClassic(phase, playing, prefs, nextChar, hidePassage) {
    return html`
      <div class="relative rounded-box border border-base-300 bg-base-100 p-4">
        ${hidePassage
          ? html`<p class="text-text-secondary">
              ${i18n.getMessage(
                'The passage appears when you start the test. The clock starts with your first keystroke.',
              )}
            </p>`
          : html`<x-snc-ttt-passage-view
              aria-hidden="true"
              .text=${this._text}
              .typed=${this._typed}
              ?active=${phase === 'typing'}
            ></x-snc-ttt-passage-view>`}
        ${phase === 'countdown'
          ? html`<div
              class="absolute inset-0 flex items-center justify-center rounded-box bg-base-100"
              aria-hidden="true"
            >
              <span
                class="countdown rounded-box px-8 py-4 font-bold tabular-nums text-text-primary"
                >${formatInteger(this._countdown, this._locale)}</span
              >
            </div>`
          : nothing}
      </div>
      <p id="passage-text" hidden>${this._text}</p>
      <div class="flex flex-col gap-1">
        <label for="typing-input" class="text-sm font-medium text-text-primary">
          ${i18n.getMessage('Type the passage')}
        </label>
        ${this._renderInput(false)} ${this._renderTypingHelp()}
      </div>
      ${playing || phase === 'submitting' ? this._renderLiveBar() : nothing}
      ${prefs.showKeyboard
        ? html`<div class="hidden md:block" aria-hidden="true">
            <x-snc-ttt-virtual-keyboard
              next-key=${nextChar}
              error-key=${phase === 'typing' ? this._errorKey : ''}
              .errorPulse=${this._errorPulse}
              focus-keys=${this.mode === 'lesson'
                ? this._config?.lesson?.focusKeys || ''
                : ''}
              ?show-hands=${prefs.showHands}
            ></x-snc-ttt-virtual-keyboard>
          </div>`
        : nothing}
    `;
  }

  _renderControls(phase, playing) {
    return html`<div class="flex flex-wrap gap-2">
        ${phase === 'ready' || phase === 'starting'
          ? html`<button
              type="button"
              class="aiux-btn aiux-btn-primary"
              data-start
              ?disabled=${phase === 'starting'}
              @click=${this._start}
            >
              ${phase === 'starting'
                // A spinner inside a button is action feedback, which the rule allows.
                // eslint-disable-next-line @servicenow/aiux-style/prefer-skeleton-loader
                ? html`<span class="aiux-loading aiux-loading-spinner aiux-loading-xs"></span>`
                : icon({ name: 'play', size: 'sm' })}
              ${i18n.getMessage('Start')}
            </button>`
          : nothing}
        ${playing
          ? html`<button type="button" class="aiux-btn aiux-btn-outline" @click=${this._restart}>
              ${icon({ name: 'rotate-counter-clockwise', size: 'sm' })}
              ${i18n.getMessage('Restart')}
            </button>`
          : nothing}
        ${phase === 'submitting'
          ? html`<span class="flex items-center gap-2 text-sm text-text-secondary" role="status">
              ${icon({ name: 'stopwatch', size: 'sm' })}
              ${i18n.getMessage('Scoring your attempt')}
            </span>`
          : nothing}
        ${playing || (phase === 'ready' && !this._timed)
          ? html`<button type="button" class="aiux-btn aiux-btn-ghost" @click=${this._exit}>
              ${icon({ name: 'close', size: 'sm' })}
              ${i18n.getMessage('Exit')}
            </button>`
          : nothing}
      </div>`;
  }

  _renderProfileWpm(profile) {
    if (!profile) return nothing;
    let text;
    if (!profile.saved) {
      text = i18n.getMessage(
        "Your result was saved, but your profile couldn't be updated.",
      );
    } else if (profile.isNewBest) {
      text = i18n.getMessage('New profile best: {0} WPM', [
        formatInteger(profile.best, this._locale),
      ]);
    } else {
      text = i18n.getMessage('Saved to your profile: {0} WPM · Best: {1} WPM', [
        formatInteger(profile.latest, this._locale),
        formatInteger(profile.best, this._locale),
      ]);
    }
    return html`<p class="text-sm font-medium text-text-primary" role="status">
      ${text}
    </p>`;
  }

  _renderResults() {
    const r = this._result;
    const coach = r.coach || {};
    const weak = r.weakKeys || [];
    const heat = {};
    const most = weak.reduce((max, k) => Math.max(max, k.misses), 0) || 1;
    weak.forEach((k) => {
      heat[k.key] = k.misses / most;
    });
    const backLabel = this.mode === 'lesson'
      ? i18n.getMessage('Back to lessons')
      : i18n.getMessage('Back to custom lessons');
    return html`<div class="flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <x-snc-ttt-coach-card .headline=${coach.headline || ''}></x-snc-ttt-coach-card>
        ${r.flagged
          ? nothing
          : html`<x-snc-ttt-stats-card
              .result=${r}
              locale=${this._locale}
            ></x-snc-ttt-stats-card>`}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${r.personalBest
          ? html`<span class="aiux-badge aiux-badge-success aiux-badge-soft gap-1">
              ${icon({ name: 'star', size: 'sm' })}
              ${i18n.getMessage('New personal best')}
            </span>`
          : nothing}
        ${this.mode === 'lesson' && !r.flagged ? renderPassBadge(r.passed) : nothing}
      </div>
      <p class="text-base text-text-primary">
        <strong>${coach.headline}</strong>
        ${coach.summary ? html` ${coach.summary}` : nothing}
        ${coach.advice ? html` ${coach.advice}` : nothing}
      </p>
      ${this._renderProfileWpm(r.profileWpm)}
      ${!r.flagged && weak.length
        ? html`<section aria-labelledby="weak-keys-heading" class="flex flex-col gap-3">
            <h3 id="weak-keys-heading" class="text-base font-semibold text-text-primary">
              ${i18n.getMessage('Keys to practice')}
            </h3>
            <ul class="flex flex-wrap gap-2">
              ${weak.map(
                (k) => html`<li class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-1 text-sm">
                  <kbd class="aiux-kbd aiux-kbd-sm">
                    ${k.key === 'space' ? i18n.getMessage('space') : k.key}
                  </kbd>
                  ${k.misses === 1
                    ? i18n.getMessage('1 miss')
                    : i18n.getMessage('{0} misses', [formatInteger(k.misses, this._locale)])}
                </li>`,
              )}
            </ul>
            ${this._prefs.showKeyboard
              ? html`<div class="hidden md:block" aria-hidden="true">
                  <x-snc-ttt-virtual-keyboard .heat=${heat}></x-snc-ttt-virtual-keyboard>
                </div>`
              : nothing}
          </section>`
        : nothing}
      <div class="flex flex-wrap gap-2">
        ${this.mode === 'lesson' && r.passed && r.nextLessonId
          ? html`<button type="button" class="aiux-btn aiux-btn-primary" @click=${this._nextLesson}>
              ${i18n.getMessage('Next lesson')}
              ${icon({ name: 'arrow-right', size: 'sm' })}
            </button>`
          : nothing}
        <button type="button" class="aiux-btn aiux-btn-outline" @click=${this._tryAgain}>
          ${icon({ name: 'rotate-counter-clockwise', size: 'sm' })}
          ${i18n.getMessage('Try again')}
        </button>
        ${this._timed
          ? nothing
          : html`<button type="button" class="aiux-btn aiux-btn-ghost" @click=${this._exit}>
              ${backLabel}
            </button>`}
      </div>
    </div>`;
  }

  render() {
    const phase = this._phase;
    let body;
    if (phase === 'loading') body = renderLoading();
    else if (phase === 'error') body = nothing;
    else if (phase === 'results' && this._result) body = this._renderResults();
    else body = this._renderPlay();
    return html`<section
      class="aiux-card aiux-card-border bg-base-100"
      aria-label=${productName()}
    >
      <div class="aiux-card-body gap-5">
        ${this._renderHeader()} ${this._renderMessage()} ${body}
      </div>
    </section>`;
  }
}
