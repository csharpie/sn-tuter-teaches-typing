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
import '@servicenow/aiux/aiux-components-dialog';
import '@servicenow/aiux/aiux-components-empty-state-content';
import '@servicenow/aiux/aiux-components-pagination';
import '@servicenow/aiux/aiux-components-visualizations-axis';
import '../../components/x-snc-ttt-virtual-keyboard.js';
import '../../components/x-snc-ttt-coach-card.js';
import '../../components/x-snc-ttt-stats-card.js';
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

const WORST_KEYS = 5;

// The status badge for one attempt row: unverified, passed, or nothing.
function renderStatus(attempt) {
  if (attempt.flagged) {
    return html`<span class="aiux-badge aiux-badge-warning aiux-badge-soft">
      ${i18n.getMessage('Not verified')}
    </span>`;
  }
  if (attempt.mode === 'lesson' && attempt.passed) {
    return html`<span class="aiux-badge aiux-badge-success aiux-badge-soft gap-1">
      ${icon({ name: 'circle-check', size: 'sm' })} ${i18n.getMessage('Passed')}
    </span>`;
  }
  return nothing;
}

function trendData(trend) {
  return {
    metadata: {
      columns: {
        attempt: {
          type: 'categorical',
          meaning: 'dimension',
          order: 0,
          elements: trend.map((point, i) => ({ id: String(i), label: point.completedOn })),
        },
        awpm: {
          type: 'numerical',
          meaning: 'metric',
          order: 1,
          dataShape: 'single',
          groupedBy: ['attempt'],
          label: i18n.getMessage('Adjusted speed (AWPM)'),
        },
      },
    },
    data: trend.map((point, i) => [String(i), String(point.netWpm)]),
    rendering: { columns: { attempt: { role: 'grouping' }, awpm: { role: 'value' } } },
    interactions: {},
  };
}

function modeLabel(mode) {
  if (mode === 'lesson') return i18n.getMessage('Lessons');
  if (mode === 'speed_test') return i18n.getMessage('Speed tests');
  if (mode === 'custom') return i18n.getMessage('Custom passages');
  return i18n.getMessage('All attempts');
}

/**
 * History (APPLICATION_SPEC B3.5, C5.4): completed attempts with a mode
 * filter, the AWPM trend, and a weak-keys heatmap. The ranked list of the five
 * worst keys is the accessible equivalent of the heatmap, and the trend has a
 * table view. Selecting a row opens that attempt's results, read-only.
 */
@customElement('x-snc-ttt-history')
@name('Typing History')
@description(
  "Shows the signed-in user's completed Abel Tuter Teaches Typing attempts with a mode filter, an adjusted-speed trend chart and a weak-keys heatmap.",
)
@bestFor('Reviewing typing progress over time and the keys that cause the most mistakes.')
@category('custom')
@chatCompatible(false)
@server('./server-script.js')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
@discoverable(true)
export default class TypingHistory extends AIUXWidgetElement {
  static fetchDataOnConnect = false;

  static properties = {
    _state: { type: Object, state: true },
    _error: { type: String, state: true },
    _mode: { type: String, state: true },
    _loading: { type: Boolean, state: true },
    _detail: { type: Object, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  constructor() {
    super();
    this._state = null;
    this._error = '';
    this._mode = 'all';
    this._loading = false;
    this._detail = null;
    this._ticket = 0;
  }

  firstUpdated() {
    this._load(0);
  }

  get _locale() {
    return this._state?.locale || 'en';
  }

  async _send(input) {
    try {
      return (await this.server.get(input)) || null;
    } catch {
      return null;
    }
  }

  async _load(page) {
    if (isServer) return;
    this._ticket += 1;
    const ticket = this._ticket;
    this._loading = true;
    const response = await this._send({ action: 'getState', mode: this._mode, page });
    if (ticket !== this._ticket) return;
    this._loading = false;
    if (!response || response.isError) {
      this._error = response?.errorMessage
        || i18n.getMessage(
          "Your history couldn't be loaded. Check that you have the Abel Tuter Teaches Typing player role, then try again.",
        );
      return;
    }
    this._error = '';
    this._state = response;
  }

  _onMode = (e) => {
    this._mode = e.target.value;
    this._load(0);
  };

  _onPage = (e) => {
    this._load((e.detail?.page || 1) - 1);
  };

  async _openAttempt(sysId) {
    this._detail = { loading: true };
    const response = await this._send({ action: 'getAttempt', sysId });
    if (!response || response.isError || !response.result) {
      this._detail = {
        error: response?.errorMessage || i18n.getMessage('That attempt was not found.'),
      };
      return;
    }
    this._detail = { result: response.result, locale: response.locale };
  }

  _closeDetail = () => {
    this._detail = null;
  };

  // ------------------------------------------------------------ trend

  _renderTrend() {
    const trend = this._state.trend || [];
    const label = modeLabel(this._state.mode);
    return html`<section aria-labelledby="trend-heading" class="flex flex-col gap-3">
      <h3 id="trend-heading" class="text-base font-semibold text-text-primary">
        ${i18n.getMessage('Adjusted speed over your last {0} attempts ({1})', [
          formatInteger(trend.length, this._locale),
          label,
        ])}
      </h3>
      ${trend.length < 2
        ? html`<p class="text-sm text-text-secondary">
            ${i18n.getMessage('Complete at least two attempts to see a trend.')}
          </p>`
        : html`<div class="h-64 w-full">
              <aiux-visualizations-axis
                type="line"
                .data=${trendData(trend)}
                .axes=${{
                  xAxis: { column: 'attempt', title: i18n.getMessage('Attempt'), showGridlines: false },
                  yAxis: [{ columns: ['awpm'], title: i18n.getMessage('AWPM') }],
                }}
                .legend=${{ visible: false }}
              ></aiux-visualizations-axis>
            </div>
            <details class="text-sm">
              <summary class="cursor-pointer text-text-primary">
                ${i18n.getMessage('Show the trend as a table')}
              </summary>
              <div class="mt-2 overflow-x-auto">
                <table class="aiux-table aiux-table-sm">
                  <caption class="sr-only">${i18n.getMessage('Adjusted speed by attempt')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">${i18n.getMessage('Completed')}</th>
                      <th scope="col">${i18n.getMessage('AWPM')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trend.map(
                      (point) => html`<tr>
                        <td>${point.completedOn}</td>
                        <td class="tabular-nums">${formatInteger(point.netWpm, this._locale)}</td>
                      </tr>`,
                    )}
                  </tbody>
                </table>
              </div>
            </details>`}
    </section>`;
  }

  // ------------------------------------------------------------ weak keys

  _renderWeakKeys() {
    const keys = this._state.weakKeys || [];
    const heat = {};
    keys.forEach((k) => {
      heat[k.key] = k.missRate;
    });
    const worst = keys
      .filter((k) => k.misses > 0)
      .sort((a, b) => b.missRate - a.missRate || b.misses - a.misses)
      .slice(0, WORST_KEYS);
    return html`<section aria-labelledby="weak-heading" class="flex flex-col gap-3">
      <h3 id="weak-heading" class="text-base font-semibold text-text-primary">
        ${i18n.getMessage('Weak keys over your last 20 attempts')}
      </h3>
      ${worst.length
        ? html`<ol class="flex flex-col gap-2">
            ${worst.map(
              (k, i) => html`<li class="flex flex-wrap items-center gap-3 text-sm">
                <span class="w-5 text-text-secondary">${formatInteger(i + 1, this._locale)}.</span>
                <kbd class="aiux-kbd">
                  ${k.key === 'space' ? i18n.getMessage('space') : k.key}
                </kbd>
                <span class="text-text-primary">
                  ${i18n.getMessage('{0} missed ({1} of {2})', [
                    formatPercent(k.missRate * 100, this._locale),
                    formatInteger(k.misses, this._locale),
                    formatInteger(k.hits + k.misses, this._locale),
                  ])}
                </span>
              </li>`,
            )}
          </ol>`
        : html`<p class="text-sm text-text-secondary">
            ${i18n.getMessage('No missed keys yet. Keep practicing!')}
          </p>`}
      ${keys.length
        ? html`<div class="hidden md:block" aria-hidden="true">
            <x-snc-ttt-virtual-keyboard .heat=${heat}></x-snc-ttt-virtual-keyboard>
          </div>`
        : nothing}
    </section>`;
  }

  // ------------------------------------------------------------ table

  _renderRow(a) {
    const loc = this._locale;
    const dash = html`<span aria-hidden="true">-</span><span class="sr-only"
        >${i18n.getMessage('Not scored')}</span
      >`;
    return html`<tr>
      <td class="whitespace-nowrap">${a.completedOn}</td>
      <td>${a.modeLabel}</td>
      <td class="max-w-56 break-words">${a.title}</td>
      <td class="tabular-nums">${a.flagged ? dash : formatInteger(a.netWpm, loc)}</td>
      <td class="tabular-nums">${a.flagged ? dash : formatInteger(a.grossWpm, loc)}</td>
      <td class="tabular-nums">${a.flagged ? dash : formatPercent(a.accuracy, loc)}</td>
      <td class="tabular-nums">${a.flagged ? dash : formatInteger(a.errors, loc)}</td>
      <td>
        ${renderStatus(a)}
      </td>
      <td>
        <button
          type="button"
          class="aiux-btn aiux-btn-xs aiux-btn-outline"
          aria-label=${i18n.getMessage('View results for {0}, {1}', [a.title, a.completedOn])}
          @click=${() => this._openAttempt(a.sysId)}
        >
          ${i18n.getMessage('View')}
        </button>
      </td>
    </tr>`;
  }

  _renderTable() {
    const {
      attempts, totalAvailable, page, pageSize,
    } = this._state;
    const totalPages = Math.max(1, Math.ceil(totalAvailable / pageSize));
    if (!attempts.length) {
      return html`<div role="status">
        <aiux-empty-state-content
          icon="history"
          heading-text=${this._mode === 'all'
            ? i18n.getMessage('No attempts yet')
            : i18n.getMessage('No attempts match this filter')}
          body-text=${this._mode === 'all'
            ? i18n.getMessage('Finish a lesson, speed test or custom passage and it appears here.')
            : i18n.getMessage('Choose All attempts to see everything you have finished.')}
        ></aiux-empty-state-content>
      </div>`;
    }
    return html`<div class="overflow-x-auto">
        <table class="aiux-table">
          <caption class="sr-only">
            ${i18n.getMessage('Your attempts, newest first')}
          </caption>
          <thead>
            <tr>
              <th scope="col">${i18n.getMessage('Date')}</th>
              <th scope="col">${i18n.getMessage('Mode')}</th>
              <th scope="col">${i18n.getMessage('Lesson or passage')}</th>
              <th scope="col">${i18n.getMessage('AWPM')}</th>
              <th scope="col">${i18n.getMessage('WPM')}</th>
              <th scope="col">${i18n.getMessage('Accuracy')}</th>
              <th scope="col">${i18n.getMessage('Errors')}</th>
              <th scope="col">${i18n.getMessage('Result')}</th>
              <th scope="col"><span class="sr-only">${i18n.getMessage('Actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            ${attempts.map((a) => this._renderRow(a))}
          </tbody>
        </table>
      </div>
      ${totalPages > 1
        ? html`<aiux-pagination-nav
            current-page=${page + 1}
            total-pages=${totalPages}
            @pagination-page-change=${this._onPage}
          ></aiux-pagination-nav>`
        : nothing}`;
  }

  _renderDetail() {
    const detail = this._detail;
    if (!detail) return nothing;
    const { result } = detail;
    return html`<aiux-dialog open size="xl" @aiux-dialog-close=${this._closeDetail}>
      <div slot="header">
        ${result?.title || i18n.getMessage('Attempt results')}
      </div>
      ${detail.loading
        ? html`<div role="status" aria-label=${i18n.getMessage('Loading attempt')}>
            <div class="aiux-skeleton h-40 w-full" aria-hidden="true"></div>
          </div>`
        : nothing}
      ${detail.error
        ? html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
            <span>${detail.error}</span>
          </div>`
        : nothing}
      ${result
        ? html`<div class="flex flex-col gap-4">
            <p class="text-sm text-text-secondary">${result.completedOn}</p>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <x-snc-ttt-coach-card .headline=${result.coach?.headline || ''}></x-snc-ttt-coach-card>
              ${result.flagged
                ? nothing
                : html`<x-snc-ttt-stats-card
                    .result=${result}
                    locale=${detail.locale || this._locale}
                  ></x-snc-ttt-stats-card>`}
            </div>
            <p class="text-text-primary">
              <strong>${result.coach?.headline}</strong>
              ${result.coach?.summary ? html` ${result.coach.summary}` : nothing}
              ${result.coach?.advice ? html` ${result.coach.advice}` : nothing}
            </p>
            ${result.weakKeys?.length
              ? html`<p class="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                  ${i18n.getMessage('Keys to practice:')}
                  ${result.weakKeys.map(
                    (k) => html`<kbd class="aiux-kbd aiux-kbd-sm">
                      ${k.key === 'space' ? i18n.getMessage('space') : k.key}
                    </kbd>`,
                  )}
                </p>`
              : nothing}
          </div>`
        : nothing}
      <div slot="footer" class="flex justify-end">
        <button type="button" class="aiux-btn aiux-btn-primary" @click=${this._closeDetail}>
          ${i18n.getMessage('Close')}
        </button>
      </div>
    </aiux-dialog>`;
  }

  render() {
    if (this._error && !this._state) {
      return html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
        ${icon({ name: 'circle-exclamation', size: 'sm' })}
        <span>${this._error}</span>
      </div>`;
    }
    if (!this._state) {
      return html`<div
        role="status"
        aria-label=${i18n.getMessage('Loading your history')}
        class="flex flex-col gap-3"
      >
        <div class="aiux-skeleton h-10 w-56" aria-hidden="true"></div>
        <div class="aiux-skeleton h-64 w-full" aria-hidden="true"></div>
        <div class="aiux-skeleton h-48 w-full" aria-hidden="true"></div>
      </div>`;
    }
    return html`<div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <label for="history-mode" class="text-sm font-medium text-text-primary">
          ${i18n.getMessage('Show')}
        </label>
        <select
          id="history-mode"
          class="aiux-select w-full sm:w-64"
          .value=${this._mode}
          ?disabled=${this._loading}
          @change=${this._onMode}
        >
          <option value="all">${i18n.getMessage('All attempts')}</option>
          <option value="lesson">${i18n.getMessage('Lessons')}</option>
          <option value="speed_test">${i18n.getMessage('Speed tests')}</option>
          <option value="custom">${i18n.getMessage('Custom passages')}</option>
        </select>
      </div>
      ${this._error
        ? html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
            <span>${this._error}</span>
          </div>`
        : nothing}
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        ${this._renderTrend()} ${this._renderWeakKeys()}
      </div>
      <section aria-labelledby="attempts-heading" class="flex flex-col gap-3">
        <h3 id="attempts-heading" class="text-base font-semibold text-text-primary">
          ${i18n.getMessage('Attempts')}
          <span class="text-sm font-normal text-text-secondary">
            ${i18n.getMessage('({0} in total)', [
              formatInteger(this._state.totalAvailable, this._locale),
            ])}
          </span>
        </h3>
        ${this._renderTable()}
      </section>
      ${this._renderDetail()}
    </div>`;
  }
}
