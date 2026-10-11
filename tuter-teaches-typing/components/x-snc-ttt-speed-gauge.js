import {
  html, css, nothing, svg,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { formatInteger } from '../utils/format.js';

const MAX = 120;
const TICKS = [0, 20, 40, 60, 80, 100, 120];
const CX = 100;
const CY = 100;

function point(value, radius) {
  const angle = Math.PI - (Math.min(value, MAX) / MAX) * Math.PI;
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

/**
 * Semicircular speed gauge, 0 to 120+ WPM, with a needle and readout
 * (APPLICATION_SPEC B4, C6). Decorative: the host marks it aria-hidden and the
 * live bar shows the same number as text. The needle sweeps, or jumps when the
 * user prefers reduced motion (B7.6).
 */
@customElement('x-snc-ttt-speed-gauge')
export default class SpeedGauge extends AIUXElement {
  static properties = {
    value: { type: Number },
    target: { type: Number },
    locale: { type: String },
  };

  static styles = css`
    :host {
      display: block;
    }
    .track {
      stroke: var(--color-base-300);
    }
    .fill {
      stroke: var(--color-primary);
    }
    .zone {
      stroke: var(--color-accent);
    }
    .tick {
      stroke: var(--color-text-secondary);
    }
    .label {
      fill: var(--color-text-secondary);
      font-size: 11px;
    }
    .needle {
      transform-box: view-box;
      transform-origin: 100px 100px;
      transition: transform var(--duration-md, 250ms) var(--ease-medium-accel, ease-out);
      stroke: var(--color-text-primary);
    }
    .hub {
      fill: var(--color-text-primary);
    }
    .readout {
      fill: var(--color-text-primary);
      font-size: 22px;
      font-weight: 700;
    }
    .unit {
      fill: var(--color-text-secondary);
      font-size: 10px;
    }
    @media (prefers-reduced-motion: reduce) {
      .needle {
        transition: none;
      }
    }
    @media (forced-colors: active) {
      svg {
        forced-color-adjust: none;
      }
      .track {
        stroke: GrayText;
      }
      .fill,
      .zone {
        stroke: Highlight;
      }
      .tick,
      .needle {
        stroke: CanvasText;
      }
      .hub,
      .readout,
      .label,
      .unit {
        fill: CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this.value = 0;
    this.target = 0;
    this.locale = 'en';
  }

  render() {
    const value = Math.max(0, Number(this.value) || 0);
    const clamped = Math.min(value, MAX);
    const fraction = clamped / MAX;
    const arc = `M ${CX - 80} ${CY} A 80 80 0 0 1 ${CX + 80} ${CY}`;
    const target = Math.min(Math.max(Number(this.target) || 0, 0), MAX);
    const [zx, zy] = point(target, 92);
    return html`<svg viewBox="0 0 200 118" class="block h-auto w-full" focusable="false" aria-hidden="true">
      ${svg`
        <path class="track" d=${arc} fill="none" stroke-width="14" stroke-linecap="round"></path>
        <path class="fill" d=${arc} fill="none" stroke-width="14" stroke-linecap="round"
          pathLength="100" stroke-dasharray="${fraction * 100} 100"></path>
        ${target > 0
          ? svg`<path class="zone" d="M ${zx} ${zy} A 92 92 0 0 1 ${CX + 92} ${CY}" fill="none" stroke-width="4"></path>`
          : nothing}
        ${TICKS.map((tick) => {
          const [x1, y1] = point(tick, 64);
          const [x2, y2] = point(tick, 70);
          const [lx, ly] = point(tick, 52);
          return svg`<line class="tick" x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke-width="2"></line>
            <text class="label" x=${lx} y=${ly + 4} text-anchor="middle">${
              tick === MAX
                ? `${formatInteger(tick, this.locale)}+`
                : formatInteger(tick, this.locale)
            }</text>`;
        })}
        <line class="needle" x1=${CX} y1=${CY} x2=${CX - 66} y2=${CY} stroke-width="3"
          stroke-linecap="round" style="transform: rotate(${fraction * 180}deg)"></line>
        <circle class="hub" cx=${CX} cy=${CY} r="6"></circle>
        <text class="readout" x=${CX} y=${CY - 18} text-anchor="middle">${formatInteger(value, this.locale)}</text>
      `}
      <text class="unit" x=${CX} y=${CY + 16} text-anchor="middle">
        ${i18n.getMessage('WPM')}
      </text>
    </svg>`;
  }
}
