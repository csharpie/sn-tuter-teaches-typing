import {
  html, css, nothing, svg,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { AIUXElement } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import {
  FINGERS,
  ROWS,
  fingersForChar,
  keyForChar,
  keyIdForKeyChar,
} from './keyboard-layout.js';

// Finger outlines for the hands overlay, in a 400 x 120 viewBox.
const FINGER_SHAPES = {
  L5: {
    x: 44, y: 34, w: 20, h: 46,
  },
  L4: {
    x: 68, y: 18, w: 21, h: 62,
  },
  L3: {
    x: 93, y: 10, w: 22, h: 70,
  },
  L2: {
    x: 119, y: 18, w: 22, h: 62,
  },
  thumb: null,
  R2: {
    x: 259, y: 18, w: 22, h: 62,
  },
  R3: {
    x: 285, y: 10, w: 22, h: 70,
  },
  R4: {
    x: 311, y: 18, w: 21, h: 62,
  },
  R5: {
    x: 336, y: 34, w: 20, h: 46,
  },
};

/**
 * US QWERTY virtual keyboard (APPLICATION_SPEC C6). Decorative: the host
 * marks it aria-hidden, and the live bar and weak-key lists carry the same
 * information as text (B7.2).
 *
 * - `nextKey`: the next character to type; its key (and the opposite-hand
 *   Shift) is highlighted, and the hands overlay shows the finger.
 * - `errorKey` + `errorPulse`: the expected character of the last mistake;
 *   bumping `errorPulse` replays the flash (a static outline when the user
 *   prefers reduced motion).
 * - `focusKeys`: the lesson's focus keys, outlined.
 * - `heat`: {keyChar: 0..1} miss rates for the weak-keys heatmap.
 */
@customElement('x-snc-ttt-virtual-keyboard')
export default class VirtualKeyboard extends AIUXElement {
  static properties = {
    nextKey: { type: String, attribute: 'next-key' },
    errorKey: { type: String, attribute: 'error-key' },
    errorPulse: { type: Number, attribute: 'error-pulse' },
    focusKeys: { type: String, attribute: 'focus-keys' },
    heat: { type: Object, attribute: false },
    showHands: { type: Boolean, attribute: 'show-hands' },
  };

  static styles = css`
    :host {
      display: block;
      --key-bg: color-mix(in oklab, var(--color-neutral) 88%, white);
      --key-fg: var(--color-neutral-content);
      --heat-hot: #f0884d;
    }
    .board {
      background: var(--color-neutral);
      color: var(--color-neutral-content);
    }
    .key {
      background: var(--key-bg);
      color: var(--key-fg);
      border: 2px solid transparent;
      min-width: 0;
    }
    .key[data-focus] {
      border-color: color-mix(in oklab, var(--color-accent) 70%, transparent);
    }
    .key[data-next] {
      background: var(--color-accent);
      color: var(--color-accent-content);
      border-color: var(--color-accent-content);
    }
    .key[data-heat] {
      background: color-mix(
        in oklab,
        var(--heat-hot) var(--heat-pct),
        var(--key-bg)
      );
    }
    .key[data-heat-high] {
      color: var(--color-neutral);
    }
    .spacer {
      flex: 4.375 1 0;
    }
    .key[data-error] {
      outline: 3px solid var(--color-error);
      outline-offset: 1px;
      animation: flash-a var(--duration-lg, 300ms) linear;
    }
    .key[data-error][data-pulse='1'] {
      animation-name: flash-b;
    }
    @keyframes flash-a {
      from {
        background: var(--color-error);
        color: var(--color-error-content);
      }
    }
    @keyframes flash-b {
      from {
        background: var(--color-error);
        color: var(--color-error-content);
      }
    }
    .bump {
      background: currentColor;
      opacity: 0.7;
    }
    .finger {
      fill: color-mix(in oklab, var(--key-bg) 70%, transparent);
      stroke: var(--key-fg);
    }
    .finger[data-active] {
      fill: var(--color-accent);
      stroke: var(--color-accent-content);
    }
    .palm {
      fill: color-mix(in oklab, var(--key-bg) 50%, transparent);
      stroke: var(--key-fg);
    }
    .legend-ramp {
      background: linear-gradient(to right, var(--key-bg), var(--heat-hot));
    }
    @media (prefers-reduced-motion: reduce) {
      .key[data-error] {
        animation: none;
      }
    }
    @media (forced-colors: active) {
      .board {
        border: 2px solid CanvasText;
      }
      .key {
        border-color: CanvasText;
      }
      .key[data-next] {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
        border-color: Highlight;
      }
      .key[data-error] {
        outline-color: CanvasText;
      }
      .key[data-heat],
      .legend-ramp {
        forced-color-adjust: none;
      }
      .finger[data-active] {
        forced-color-adjust: none;
        fill: Highlight;
        stroke: CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this.nextKey = '';
    this.errorKey = '';
    this.errorPulse = 0;
    this.focusKeys = '';
    this.heat = null;
    this.showHands = false;
  }

  /** Physical key ids lit by the current props. */
  _state() {
    const next = keyForChar(this.nextKey);
    const error = keyForChar(this.errorKey);
    // Focus keys are space-separated groups of characters ("asdf jkl;"),
    // plus the key names "Shift" and "Space".
    const focus = new Set();
    (this.focusKeys || '').split(/\s+/).filter(Boolean).forEach((token) => {
      const named = token.toLowerCase();
      if (named === 'shift') {
        focus.add('shift-left');
        focus.add('shift-right');
      } else if (named === 'space') {
        focus.add('space');
      } else {
        [...token].forEach((ch) => {
          const found = keyForChar(ch);
          if (found) focus.add(found.key.id);
        });
      }
    });
    const heat = new Map();
    Object.entries(this.heat || {}).forEach(([keyChar, rate]) => {
      const id = keyIdForKeyChar(keyChar);
      const value = Math.max(0, Math.min(1, Number(rate) || 0));
      if (id && value > (heat.get(id) || 0)) heat.set(id, value);
    });
    return {
      nextIds: new Set(next ? [next.key.id, next.shift].filter(Boolean) : []),
      errorId: error ? error.key.id : null,
      focus,
      heat,
    };
  }

  _renderKey(key, state) {
    const heat = state.heat.get(key.id);
    const style = styleMap({
      flexGrow: String(key.width),
      ...(heat ? { '--heat-pct': `${Math.round(heat * 100)}%` } : {}),
    });
    return html`<div
      class="key relative flex h-9 basis-0 items-center justify-center rounded-md text-xs font-medium lg:h-10 lg:text-sm"
      style=${style}
      ?data-next=${state.nextIds.has(key.id)}
      ?data-error=${state.errorId === key.id}
      data-pulse=${(this.errorPulse || 0) % 2}
      ?data-focus=${state.focus.has(key.id)}
      ?data-heat=${heat > 0}
      ?data-heat-high=${heat > 0.55}
    >
      ${key.special ? nothing : key.label}
      ${key.home
        ? html`<span class="bump absolute bottom-1 h-0.5 w-3 rounded"></span>`
        : nothing}
    </div>`;
  }

  _renderHands() {
    const active = new Set(fingersForChar(this.nextKey));
    const thumbs = active.has('thumb');
    return svg`
      <rect class="palm" x="40" y="64" width="104" height="50" rx="20" stroke-width="2"></rect>
      <rect class="palm" x="256" y="64" width="104" height="50" rx="20" stroke-width="2"></rect>
      ${FINGERS.filter((f) => FINGER_SHAPES[f]).map((f) => {
        const s = FINGER_SHAPES[f];
        return svg`<rect class="finger" ?data-active=${active.has(f)} x=${s.x} y=${s.y} width=${s.w} height=${s.h} rx="10" stroke-width="2"></rect>`;
      })}
      <rect class="finger" ?data-active=${thumbs} x="140" y="72" width="44" height="18" rx="9" stroke-width="2" transform="rotate(-24 140 81)"></rect>
      <rect class="finger" ?data-active=${thumbs} x="216" y="72" width="44" height="18" rx="9" stroke-width="2" transform="rotate(24 260 81)"></rect>
    `;
  }

  render() {
    const state = this._state();
    const showHeat = state.heat.size > 0;
    return html`
      <div class="board rounded-box flex flex-col gap-1 p-2 lg:gap-1.5 lg:p-3">
        ${ROWS.map(
          (row) => html`<div class="flex gap-1 lg:gap-1.5">
            ${row.length === 1 ? html`<div class="spacer"></div>` : nothing}
            ${row.map((key) => this._renderKey(key, state))}
            ${row.length === 1 ? html`<div class="spacer"></div>` : nothing}
          </div>`,
        )}
        ${this.showHands
          ? html`<svg
              class="mx-auto mt-2 block h-auto w-full max-w-md"
              viewBox="0 0 400 120"
              focusable="false"
              aria-hidden="true"
            >
              ${this._renderHands()}
            </svg>`
          : nothing}
        ${showHeat
          ? html`<div class="mt-2 flex items-center justify-end gap-2 text-xs">
              <span>${i18n.getMessage('Fewer misses')}</span>
              <span class="legend-ramp inline-block h-2.5 w-24 rounded"></span>
              <span>${i18n.getMessage('More misses')}</span>
            </div>`
          : nothing}
      </div>
    `;
  }
}
