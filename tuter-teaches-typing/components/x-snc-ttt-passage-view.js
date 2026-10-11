import { html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement } from '@servicenow/aiux/aiux-components-core';

/**
 * Passage view (APPLICATION_SPEC B4, C6): correct, incorrect, current and
 * pending characters, keeping the current line in the middle of the window.
 *
 * Renders by word: a word that is wholly pending, or wholly typed correctly,
 * is one span, so the DOM stays small for 3,000-character speed tests. Only
 * the word under the cursor and words with mistakes are split per character.
 *
 * Decorative for assistive technology: the session links its textarea to a
 * plain-text copy of the passage with aria-describedby instead (B7.1). State
 * never relies on color alone: mistakes are underlined and the cursor is an
 * outlined block, including in forced-colors mode (B7.8).
 */
@customElement('x-snc-ttt-passage-view')
export default class PassageView extends AIUXElement {
  static properties = {
    text: { type: String },
    typed: { type: String },
    active: { type: Boolean },
  };

  static styles = css`
    :host {
      display: block;
    }
    .window {
      max-height: calc(1.75em * 5);
      overflow: hidden;
      line-height: 1.75;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .ok {
      color: color-mix(in oklab, var(--color-success) 55%, var(--color-text-primary));
    }
    .bad {
      color: color-mix(in oklab, var(--color-error) 85%, var(--color-text-primary));
      background: color-mix(in oklab, var(--color-error) 14%, transparent);
      text-decoration: underline wavy;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.2em;
      border-radius: 2px;
    }
    .cur {
      background: var(--color-primary);
      color: var(--color-primary-content);
      outline: 2px solid var(--color-primary);
      border-radius: 2px;
    }
    .pending {
      color: var(--color-text-secondary);
    }
    @media (forced-colors: active) {
      .ok {
        color: CanvasText;
      }
      .pending {
        color: GrayText;
      }
      .bad {
        color: CanvasText;
        background: Canvas;
        text-decoration-color: CanvasText;
      }
      .cur {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
        outline: 2px solid CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this.text = '';
    this.typed = '';
    this.active = false;
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('typed') || changed.has('text')) {
      this._centerCursor();
    }
  }

  _centerCursor() {
    const view = this.renderRoot?.querySelector('.window');
    if (!view) return;
    const target = this.renderRoot.querySelector('.cur')
      || this.renderRoot.querySelector('[data-last]');
    if (!target) {
      view.scrollTop = 0;
      return;
    }
    const top = target.offsetTop - view.offsetTop - view.clientHeight / 2 + target.offsetHeight / 2;
    view.scrollTop = Math.max(0, top);
  }

  _words() {
    const text = this.text || '';
    const words = [];
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === ' ' || i === text.length - 1) {
        words.push([start, i + 1]);
        start = i + 1;
      }
    }
    return words;
  }

  _renderWord([start, end]) {
    const { text } = this;
    const typed = this.typed || '';
    const cursor = this.active ? typed.length : -1;
    const word = text.slice(start, end);
    const untyped = start > typed.length || start === typed.length;
    if (untyped && cursor !== start) {
      return html`<span class="pending">${word}</span>`;
    }
    if (end <= typed.length && typed.slice(start, end) === word) {
      return html`<span class="ok" ?data-last=${end === typed.length}
        >${word}</span
      >`;
    }
    const chars = [];
    for (let i = start; i < end; i += 1) {
      let state = 'pending';
      if (i < typed.length) state = typed[i] === text[i] ? 'ok' : 'bad';
      else if (i === cursor) state = 'cur';
      chars.push(
        html`<span class=${state} ?data-last=${i === typed.length - 1}
          >${text[i]}</span
        >`,
      );
    }
    return chars;
  }

  render() {
    if (!this.text) return nothing;
    return html`<div class="window font-mono text-lg sm:text-xl lg:text-2xl">
      ${this._words().map((word) => this._renderWord(word))}
    </div>`;
  }
}
