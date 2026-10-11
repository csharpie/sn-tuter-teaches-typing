import {
  html, css, nothing, isServer,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, isReducedMotionEnabled } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { formatInteger, formatPercent, roundedDelta } from '../utils/format.js';

function renderItem(label, finalText, shownText, delta) {
  return html`<div class="flex flex-col gap-1 rounded-box bg-base-200 p-3">
    <dt class="text-sm font-medium text-text-secondary">${label}</dt>
    <dd class="text-3xl font-bold tabular-nums text-text-primary">
      <span aria-hidden="true">${shownText}</span>
      <span class="sr-only">${finalText}</span>
    </dd>
    ${delta}
  </div>`;
}

/**
 * Results stats card (APPLICATION_SPEC B5, C6): accuracy, typing speed,
 * errors and adjusted speed as a definition list. Each value shows its change
 * from the previous attempt as an arrow plus text ("up 3 from last time"), so
 * neither color nor shape carries the meaning alone. Values count up once
 * unless the user prefers reduced motion (B7.6); assistive technology always
 * reads the final value.
 */
@customElement('x-snc-ttt-stats-card')
export default class StatsCard extends AIUXElement {
  static properties = {
    result: { type: Object, attribute: false },
    locale: { type: String },
    _progress: { type: Number, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
    .better {
      color: color-mix(in oklab, var(--color-success) 55%, var(--color-text-primary));
    }
    .worse {
      color: color-mix(in oklab, var(--color-error) 85%, var(--color-text-primary));
    }
    @media (forced-colors: active) {
      .better,
      .worse {
        color: CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this.result = null;
    this.locale = 'en';
    this._progress = 1;
    this._frame = 0;
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('result') && this.result) {
      this._countUp();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (!isServer) cancelAnimationFrame(this._frame);
  }

  _countUp() {
    if (isServer) return;
    cancelAnimationFrame(this._frame);
    const reduce = isReducedMotionEnabled()
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this._progress = 1;
      return;
    }
    const duration = parseFloat(getComputedStyle(this).getPropertyValue('--duration-3xl')) || 500;
    const start = performance.now();
    const step = (now) => {
      this._progress = Math.min(1, (now - start) / duration);
      if (this._progress < 1) this._frame = requestAnimationFrame(step);
    };
    this._progress = 0;
    this._frame = requestAnimationFrame(step);
  }

  _delta(current, previous, lowerIsBetter) {
    const delta = roundedDelta(current, previous);
    if (delta === null) return nothing;
    if (delta === 0) {
      return html`<dd class="text-sm text-text-secondary">
        ${i18n.getMessage('Same as last time')}
      </dd>`;
    }
    const up = delta > 0;
    const better = lowerIsBetter ? !up : up;
    const amount = formatInteger(Math.abs(delta), this.locale);
    return html`<dd class="text-sm font-medium ${better ? 'better' : 'worse'}">
      <span aria-hidden="true">${up ? '▲' : '▼'}</span>
      ${up
        ? i18n.getMessage('up {0} from last time', [amount])
        : i18n.getMessage('down {0} from last time', [amount])}
    </dd>`;
  }

  render() {
    const r = this.result;
    if (!r) return nothing;
    const prev = r.previous || null;
    const p = this._progress;
    const loc = this.locale;
    const wpm = (v) => i18n.getMessage('{0} WPM', [formatInteger(v, loc)]);
    const awpm = (v) => i18n.getMessage('{0} AWPM', [formatInteger(v, loc)]);
    return html`<div class="aiux-card aiux-card-border h-full bg-base-100">
      <div class="aiux-card-body">
        <h3 class="sr-only">${i18n.getMessage('Your results')}</h3>
        <dl class="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          ${renderItem(
            i18n.getMessage('Accuracy'),
            formatPercent(r.accuracy, loc),
            formatPercent(r.accuracy * p, loc),
            prev ? this._delta(r.accuracy, prev.accuracy, false) : nothing,
          )}
          ${renderItem(
            i18n.getMessage('Typing speed'),
            wpm(r.grossWpm),
            wpm(r.grossWpm * p),
            prev ? this._delta(r.grossWpm, prev.grossWpm, false) : nothing,
          )}
          ${renderItem(
            i18n.getMessage('Errors'),
            formatInteger(r.errors, loc),
            formatInteger(r.errors * p, loc),
            prev ? this._delta(r.errors, prev.errors, true) : nothing,
          )}
          ${renderItem(
            i18n.getMessage('Adjusted speed'),
            awpm(r.netWpm),
            awpm(r.netWpm * p),
            prev ? this._delta(r.netWpm, prev.netWpm, false) : nothing,
          )}
        </dl>
      </div>
    </div>`;
  }
}
