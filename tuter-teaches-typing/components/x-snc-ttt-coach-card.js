import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement } from '@servicenow/aiux/aiux-components-core';

// Public assets are served under the app basename (keep in step with
// aiux.json#basename; see head.app.css for the same convention).
const COACH_IMAGE = '/aiux/tuter-teaches-typing/public/coach.svg';

/**
 * Coach card (APPLICATION_SPEC B5, C6): the coach illustration with a speech
 * bubble holding the result headline. The illustration is decorative (empty
 * alt); the headline is a real heading that the results panel focuses first
 * (B7.9) through focusHeadline().
 */
@customElement('x-snc-ttt-coach-card')
export default class CoachCard extends AIUXElement {
  static properties = {
    headline: { type: String },
  };

  static styles = css`
    :host {
      display: block;
    }
    .bubble {
      position: relative;
      background: var(--color-base-100);
      border: 2px solid var(--color-primary);
    }
    .bubble::before {
      content: '';
      position: absolute;
      inset-block-start: -0.6rem;
      inset-inline-start: calc(50% - 0.6rem);
      width: 1.2rem;
      height: 1.2rem;
      background: inherit;
      border-block-start: 2px solid var(--color-primary);
      border-inline-start: 2px solid var(--color-primary);
      transform: rotate(45deg);
    }
    @media (min-width: 640px) {
      .bubble::before {
        inset-block-start: calc(50% - 0.6rem);
        inset-inline-start: -0.65rem;
        transform: rotate(-45deg);
      }
      :host(:dir(rtl)) .bubble::before {
        transform: rotate(45deg);
      }
    }
    .headline:focus {
      outline: none;
    }
    .headline:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    img {
      forced-color-adjust: none;
    }
    @media (forced-colors: active) {
      .bubble,
      .bubble::before {
        border-color: CanvasText;
        background: Canvas;
      }
    }
  `;

  constructor() {
    super();
    this.headline = '';
  }

  /** Moves focus to the headline (B7.9). */
  focusHeadline() {
    this.renderRoot?.querySelector('.headline')?.focus();
  }

  render() {
    return html`<div class="aiux-card aiux-card-border h-full bg-base-100">
      <div
        class="aiux-card-body flex flex-col items-center gap-5 text-center sm:flex-row sm:text-start"
      >
        <img
          src=${COACH_IMAGE}
          alt=""
          width="112"
          height="112"
          decoding="async"
          class="size-24 shrink-0 rounded-full sm:size-28"
        />
        <div class="bubble rounded-box w-full px-5 py-4">
          <h3
            class="headline break-words text-2xl font-bold text-text-primary"
            tabindex="-1"
          >
            ${this.headline}
          </h3>
        </div>
      </div>
    </div>`;
  }
}
