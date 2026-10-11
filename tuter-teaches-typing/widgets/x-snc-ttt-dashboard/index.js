import {
  html, css, nothing, isServer,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import {
  AIUXWidgetElement,
  decorators,
} from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { icon } from '@servicenow/aiux/aiux-directive-icon';
import '@servicenow/aiux/aiux-components-score';
import '@servicenow/aiux/aiux-components-visualizations-axis';
import { formatInteger, formatPercent } from '../../utils/format.js';

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

function sparklineData(points) {
  return {
    metadata: {
      columns: {
        attempt: {
          type: 'categorical',
          meaning: 'dimension',
          order: 0,
          elements: points.map((p, i) => ({ id: String(i), label: p.completedOn })),
        },
        awpm: {
          type: 'numerical',
          meaning: 'metric',
          order: 1,
          dataShape: 'single',
          groupedBy: ['attempt'],
          label: i18n.getMessage('AWPM'),
        },
      },
    },
    data: points.map((p, i) => [String(i), String(p.netWpm)]),
    rendering: { columns: { attempt: { role: 'grouping' }, awpm: { role: 'value' } } },
    interactions: {},
  };
}

/**
 * Home dashboard (APPLICATION_SPEC B3.1, C5.5). Links are app-relative to the
 * `basePath` the host page passes in, so the router handles them in place.
 */
@customElement('x-snc-ttt-dashboard')
@name('Typing Dashboard')
@description(
  "Shows the signed-in user's Abel Tuter Teaches Typing progress: best speed-test AWPM, recent accuracy, lessons completed, a trend sparkline and a link to the next lesson.",
)
@bestFor('Giving a player an at-a-glance view of their typing progress and what to do next.')
@category('custom')
@chatCompatible(false)
@server('./server-script.js')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
@discoverable(true)
export default class TypingDashboard extends AIUXWidgetElement {
  static fetchDataOnConnect = false;

  static properties = {
    basePath: { type: String, attribute: 'base-path' },
    _state: { type: Object, state: true },
    _error: { type: String, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  constructor() {
    super();
    this.basePath = '';
    this._state = null;
    this._error = '';
  }

  firstUpdated() {
    this._load();
  }

  async _load() {
    if (isServer) return;
    let response = null;
    try {
      response = await this.server.get({ action: 'getState' });
    } catch {
      response = null;
    }
    if (!response || response.isError) {
      this._error = response?.errorMessage
        || i18n.getMessage(
          "Your progress couldn't be loaded. Check that you have the Abel Tuter Teaches Typing player role, then try again.",
        );
      return;
    }
    this._error = '';
    this._state = response;
  }

  get _locale() {
    return this._state?.locale || 'en';
  }

  _href(path) {
    return `${this.basePath || ''}${path}`;
  }

  _greeting() {
    const { firstName, isNewPlayer } = this._state;
    if (isNewPlayer) {
      return firstName
        ? i18n.getMessage('Welcome, {0}.', [firstName])
        : i18n.getMessage('Welcome.');
    }
    return firstName
      ? i18n.getMessage('Welcome back, {0}.', [firstName])
      : i18n.getMessage('Welcome back.');
  }

  _score(label, value, formattedValue, format, denominator = null) {
    return {
      label,
      value,
      formattedValue,
      format,
      denominator,
      formattedDenominator:
        denominator === null ? null : formatInteger(denominator, this._locale),
      sentiment: 'neutral',
      color: null,
      change: null,
      target: null,
    };
  }

  _renderContinue() {
    const s = this._state;
    if (s.isNewPlayer) {
      return html`<div class="aiux-card aiux-card-border bg-base-100">
        <div class="aiux-card-body items-start gap-3">
          <h2 class="aiux-card-title text-text-primary">
            ${i18n.getMessage('Start with Lesson 1: Home row')}
          </h2>
          <p class="text-text-secondary">
            ${i18n.getMessage(
              'Rest your fingers on A S D F and J K L ; and the coach will take it from there. Accuracy first, speed later.',
            )}
          </p>
          ${s.nextLesson
            ? html`<a
                class="aiux-btn aiux-btn-primary"
                href=${this._href(`/lessons?lesson=${s.nextLesson.sysId}`)}
              >
                ${icon({ name: 'play', size: 'sm' })} ${i18n.getMessage('Start lesson 1')}
              </a>`
            : nothing}
        </div>
      </div>`;
    }
    if (!s.nextLesson) {
      return html`<div class="aiux-card aiux-card-border bg-base-100">
        <div class="aiux-card-body items-start gap-3">
          <h2 class="aiux-card-title text-text-primary">
            ${i18n.getMessage('Every lesson passed')}
          </h2>
          <p class="text-text-secondary">
            ${i18n.getMessage('Keep your speed up with a timed test or your own passages.')}
          </p>
          <a class="aiux-btn aiux-btn-primary" href=${this._href('/speed-test')}>
            ${icon({ name: 'dashboard-dial', size: 'sm' })} ${i18n.getMessage('Take a speed test')}
          </a>
        </div>
      </div>`;
    }
    return html`<div class="aiux-card aiux-card-border bg-base-100">
      <div class="aiux-card-body items-start gap-3">
        <p class="text-sm font-medium text-text-secondary">${i18n.getMessage('Continue')}</p>
        <h2 class="aiux-card-title break-words text-text-primary">
          ${i18n.getMessage('Lesson {0}: {1}', [
            formatInteger(s.nextLesson.order, this._locale),
            s.nextLesson.title,
          ])}
        </h2>
        <a
          class="aiux-btn aiux-btn-primary"
          href=${this._href(`/lessons?lesson=${s.nextLesson.sysId}`)}
        >
          ${icon({ name: 'play', size: 'sm' })} ${i18n.getMessage('Continue lesson')}
        </a>
      </div>
    </div>`;
  }

  _renderStats() {
    const s = this._state;
    const loc = this._locale;
    const tiles = [
      this._score(
        i18n.getMessage('Best speed test (AWPM)'),
        s.bestSpeedTestNetWpm || 0,
        s.bestSpeedTestNetWpm === null ? '-' : formatInteger(s.bestSpeedTestNetWpm, loc),
        'plain',
      ),
      this._score(
        i18n.getMessage('Average accuracy, last 10 attempts'),
        s.avgAccuracyLast10 || 0,
        s.avgAccuracyLast10 === null ? '-' : formatPercent(s.avgAccuracyLast10, loc),
        'percentage',
      ),
      this._score(
        i18n.getMessage('Lessons completed'),
        s.lessonsCompleted,
        formatInteger(s.lessonsCompleted, loc),
        'ratio',
        s.lessonsTotal,
      ),
    ];
    return html`<ul class="grid grid-cols-1 gap-4 md:grid-cols-3">
      ${tiles.map(
        (tile) => html`<li>
          <aiux-score size="md" .data=${tile}></aiux-score>
        </li>`,
      )}
    </ul>`;
  }

  _renderSparkline() {
    const points = this._state.sparkline || [];
    if (points.length < 2) return nothing;
    const values = points.map((p) => formatInteger(p.netWpm, this._locale)).join(', ');
    return html`<section class="aiux-card aiux-card-border bg-base-100" aria-labelledby="spark-heading">
      <div class="aiux-card-body gap-2">
        <h2 id="spark-heading" class="text-base font-semibold text-text-primary">
          ${i18n.getMessage('Adjusted speed, last {0} attempts', [
            formatInteger(points.length, this._locale),
          ])}
        </h2>
        <div class="h-20 w-full" aria-hidden="true">
          <aiux-visualizations-axis
            type="line"
            .data=${sparklineData(points)}
            .axes=${{
              xAxis: { column: 'attempt', visible: false },
              yAxis: [{ columns: ['awpm'], visible: false }],
            }}
            .legend=${{ visible: false }}
          ></aiux-visualizations-axis>
        </div>
        <p class="text-sm text-text-secondary">
          ${i18n.getMessage('Oldest to newest: {0} AWPM', [values])}
        </p>
      </div>
    </section>`;
  }

  render() {
    if (this._error) {
      return html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
        ${icon({ name: 'circle-exclamation', size: 'sm' })}
        <span>${this._error}</span>
      </div>`;
    }
    if (!this._state) {
      return html`<div
        role="status"
        aria-label=${i18n.getMessage('Loading your progress')}
        class="flex flex-col gap-4"
      >
        <div class="aiux-skeleton h-32 w-full" aria-hidden="true"></div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          ${[0, 1, 2].map(
            () => html`<div class="aiux-skeleton h-28 w-full" aria-hidden="true"></div>`,
          )}
        </div>
      </div>`;
    }
    const s = this._state;
    return html`<div class="flex flex-col gap-6">
      <p class="text-lg text-text-primary">${this._greeting()}</p>
      ${this._renderContinue()}
      ${s.isNewPlayer ? nothing : html`${this._renderStats()} ${this._renderSparkline()}`}
    </div>`;
  }
}
