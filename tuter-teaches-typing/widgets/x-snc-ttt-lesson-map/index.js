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
import '@servicenow/aiux/aiux-components-empty-state-content';
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

function statusBadge(status) {
  if (status === 'passed') {
    return html`<span class="aiux-badge aiux-badge-success aiux-badge-soft gap-1">
      ${icon({ name: 'circle-check', size: 'sm' })} ${i18n.getMessage('Passed')}
    </span>`;
  }
  if (status === 'available') {
    return html`<span class="aiux-badge aiux-badge-info aiux-badge-soft gap-1">
      ${icon({ name: 'play', size: 'sm' })} ${i18n.getMessage('Available')}
    </span>`;
  }
  return html`<span class="aiux-badge aiux-badge-neutral aiux-badge-soft gap-1">
    ${icon({ name: 'lock', size: 'sm' })} ${i18n.getMessage('Locked')}
  </span>`;
}

function renderLoading() {
  return html`<div
    role="status"
    aria-label=${i18n.getMessage('Loading lessons')}
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
  >
    ${[0, 1, 2, 3].map(
      () => html`<div class="aiux-skeleton h-36 w-full" aria-hidden="true"></div>`,
    )}
  </div>`;
}

/**
 * Lesson map (APPLICATION_SPEC B3.2, C5.2): lessons grouped by unit with their
 * status and the player's best scores. Fires `lesson-select` {lessonId}; the
 * host page writes ?lesson= to the URL. Call refresh() after an attempt.
 */
@customElement('x-snc-ttt-lesson-map')
@name('Lesson Map')
@description(
  'Shows the Abel Tuter Teaches Typing lessons grouped by unit, with each lesson\'s status (locked, available or passed) and the signed-in user\'s best scores.',
)
@bestFor('Choosing the next typing lesson and seeing lesson progress.')
@category('custom')
@chatCompatible(false)
@server('./server-script.js')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
@discoverable(true)
export default class LessonMap extends AIUXWidgetElement {
  static fetchDataOnConnect = false;

  static properties = {
    _state: { type: Object, state: true },
    _error: { type: String, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
    @media (forced-colors: active) {
      .lesson[data-next] {
        border-color: Highlight;
      }
    }
  `;

  constructor() {
    super();
    this._state = null;
    this._error = '';
    this._ticket = 0;
  }

  firstUpdated() {
    this.refresh();
  }

  /** Reloads the map, e.g. after the typing session reports an attempt. */
  async refresh() {
    if (isServer) return;
    this._ticket += 1;
    const ticket = this._ticket;
    let response = null;
    try {
      response = await this.server.get({ action: 'getState' });
    } catch {
      response = null;
    }
    if (ticket !== this._ticket) return;
    if (!response || response.isError) {
      this._error = response?.errorMessage
        || i18n.getMessage(
          "The lessons couldn't be loaded. Check that you have the Abel Tuter Teaches Typing player role, then try again.",
        );
      return;
    }
    this._error = '';
    this._state = response;
  }

  _select(lessonId) {
    this.dispatchEvent(
      new CustomEvent('lesson-select', {
        detail: { lessonId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _renderLesson(lesson) {
    const { locale } = this._state;
    const isNext = lesson.sysId === this._state.nextLessonId;
    const titleId = `lesson-title-${lesson.sysId}`;
    return html`<li
      class="lesson flex h-full flex-col gap-3 rounded-box border-2 bg-base-100 p-4 ${isNext
        ? 'border-primary'
        : 'border-base-300'}"
      ?data-next=${isNext}
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-semibold text-text-secondary">
          ${i18n.getMessage('Lesson {0}', [formatInteger(lesson.order, locale)])}
        </span>
        <span class="flex flex-wrap gap-1">
          ${isNext
            ? html`<span class="aiux-badge aiux-badge-primary">${i18n.getMessage('Up next')}</span>`
            : nothing}
          ${statusBadge(lesson.status)}
        </span>
      </div>
      <h4 id=${titleId} class="break-words text-base font-semibold text-text-primary">
        ${lesson.title}
      </h4>
      ${lesson.focusKeys
        ? html`<p class="flex flex-wrap gap-1 text-sm text-text-secondary">
            <span class="sr-only">${i18n.getMessage('Focus keys:')}</span>
            ${lesson.focusKeys
              .split(/\s+/)
              .filter(Boolean)
              .map((key) => html`<kbd class="aiux-kbd aiux-kbd-sm">${key}</kbd>`)}
          </p>`
        : nothing}
      ${lesson.status === 'passed'
        ? html`<p class="text-sm text-text-secondary">
            ${i18n.getMessage('Best: {0} AWPM, {1} accuracy', [
              formatInteger(lesson.bestNetWpm, locale),
              formatPercent(lesson.bestAccuracy, locale),
            ])}
          </p>`
        : nothing}
      <div class="mt-auto">
        ${lesson.status === 'locked'
          ? html`<p class="text-sm text-text-secondary">
              ${i18n.getMessage('Pass the lesson before this one to unlock it.')}
            </p>`
          : html`<button
              type="button"
              class="aiux-btn aiux-btn-sm ${isNext ? 'aiux-btn-primary' : 'aiux-btn-outline'}"
              aria-describedby=${titleId}
              @click=${() => this._select(lesson.sysId)}
            >
              ${lesson.status === 'passed'
                ? i18n.getMessage('Practice again')
                : i18n.getMessage('Start lesson')}
            </button>`}
      </div>
    </li>`;
  }

  render() {
    if (this._error) {
      return html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
        ${icon({ name: 'circle-exclamation', size: 'sm' })}
        <span>${this._error}</span>
        <button type="button" class="aiux-btn aiux-btn-sm" @click=${() => this.refresh()}>
          ${i18n.getMessage('Retry')}
        </button>
      </div>`;
    }
    if (!this._state) return renderLoading();
    const {
      units, completedCount, totalCount, locale,
    } = this._state;
    if (!totalCount) {
      return html`<div role="status">
        <aiux-empty-state-content
          icon="book-open"
          heading-text=${i18n.getMessage('No lessons yet')}
          body-text=${i18n.getMessage('Lessons appear here once your administrator adds them.')}
        ></aiux-empty-state-content>
      </div>`;
    }
    const percent = Math.round((completedCount / totalCount) * 100);
    return html`<div class="flex flex-col gap-6">
      <section aria-labelledby="progress-heading" class="flex flex-col gap-2">
        <h2 id="progress-heading" class="text-lg font-semibold text-text-primary">
          ${i18n.getMessage('Your progress')}
        </h2>
        <p class="text-sm text-text-secondary" id="progress-text">
          ${i18n.getMessage('{0} of {1} lessons passed', [
            formatInteger(completedCount, locale),
            formatInteger(totalCount, locale),
          ])}
        </p>
        <progress
          class="aiux-progress aiux-progress-primary w-full"
          value=${completedCount}
          max=${totalCount}
          aria-labelledby="progress-heading"
          aria-describedby="progress-text"
          aria-valuetext=${i18n.getMessage('{0}% complete', [formatInteger(percent, locale)])}
        ></progress>
      </section>
      ${units.map(
        (unit) => html`<section
          aria-labelledby="unit-${unit.unit}"
          class="flex flex-col gap-3"
        >
          <h3 id="unit-${unit.unit}" class="text-base font-semibold text-text-primary">
            ${unit.label}
          </h3>
          <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            ${unit.lessons.map((lesson) => this._renderLesson(lesson))}
          </ul>
        </section>`,
      )}
    </div>`;
  }
}
