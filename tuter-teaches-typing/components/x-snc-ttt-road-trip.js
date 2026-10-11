import {
  html, css, nothing, svg, isServer,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { AIUXElement } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { formatInteger, formatPercent } from '../utils/format.js';
import { RoadTrip, speedForWpm } from './road-sim.js';

const MAX_SPLATS = 24;
const TAIL = 6;
const AHEAD = 40;
const RATE_WINDOW = 4000;
const METER_BARS = 10;
const MAX_DPR = 2;
const PLAYED = new Set(['countdown', 'typing', 'submitting']);
// [fill, highlight, rim]: mostly green-yellow bugs, the odd orange or red one.
// Cumulative odds that pick a splat colour set: the first 45%, the next 35%, …
const SPLAT_ODDS = [0.45, 0.8, 0.92];
const SPLAT_COLORS = [
  ['#c6d23c', '#eaf08f', '#56611a'],
  ['#b4c636', '#dbe77a', '#4b5717'],
  ['#d4a72c', '#f0d27a', '#6b4d10'],
  ['#a8452f', '#d77a5f', '#4d1c12'],
];

/** A random bug-splat outline (spiky blob plus droplets) in a -50..50 box. */
function splatShape() {
  const r = Math.random;
  const count = 9 + Math.floor(r() * 6);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const radius = r() < 0.35 ? 28 + r() * 16 : 13 + r() * 7;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const f = (n) => n.toFixed(1);
  const start = mid(points[count - 1], points[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  points.forEach((p, i) => {
    const m = mid(p, points[(i + 1) % count]);
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  });
  const drops = [];
  const dropCount = 3 + Math.floor(r() * 4);
  for (let i = 0; i < dropCount; i += 1) {
    const a = r() * Math.PI * 2;
    const dist = 33 + r() * 13;
    drops.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: 1.5 + r() * 3 });
  }
  return { d: `${d}Z`, drops, body: r() * 180 };
}

function renderSplat(s) {
  const [fill, light, rim] = s.colors;
  const { d, drops, body } = s.shape;
  return html`<div
    class="splat"
    style=${styleMap({ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}%` })}
  >
    <svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
      <g transform="rotate(${s.rot.toFixed(0)})">
        <path d=${d} fill=${fill} stroke=${rim} stroke-width="1.5" opacity="0.9"></path>
        <path d=${d} fill=${light} transform="scale(0.45)" opacity="0.75"></path>
        ${drops.map((p) => svg`<circle cx=${p.x.toFixed(1)} cy=${p.y.toFixed(1)} r=${p.r.toFixed(1)} fill=${fill} opacity="0.9"></circle>`)}
        <g transform="rotate(${body.toFixed(0)})">
          <ellipse cx="-4" cy="-3" rx="7" ry="3" fill="rgb(235 240 245 / 0.5)"></ellipse>
          <ellipse cx="-4" cy="3" rx="7" ry="3" fill="rgb(235 240 245 / 0.5)"></ellipse>
          <ellipse cx="2" cy="0" rx="5" ry="2.4" fill="#2b2414"></ellipse>
        </g>
      </g>
    </svg>
  </div>`;
}

function renderHood() {
  return html`<svg class="hood" viewBox="0 0 1000 625" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a32c25"></stop>
        <stop offset="0.45" stop-color="#701915"></stop>
        <stop offset="1" stop-color="#3a0b0a"></stop>
      </linearGradient>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"></stop>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.25"></stop>
        <stop offset="1" stop-color="#fff" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <path d="M60 625 L100 372 Q500 318 900 372 L940 625 Z" fill="url(#paint)"></path>
    <path d="M260 352 Q500 330 740 352 L730 360 Q500 340 270 360 Z" fill="url(#shine)"></path>
  </svg>`;
}

function renderFrame() {
  return html`<svg class="frame" viewBox="0 0 1000 625" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="dash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2c2c30"></stop>
        <stop offset="0.12" stop-color="#151517"></stop>
        <stop offset="1" stop-color="#050506"></stop>
      </linearGradient>
    </defs>
    <path d="M0 0 H1000 V26 Q500 8 0 26 Z" fill="#0b0b0c"></path>
    <path d="M0 24 L36 22 L0 260 Z" fill="#141416"></path>
    <path d="M1000 24 L964 22 L1000 260 Z" fill="#141416"></path>
    <rect x="704" y="0" width="14" height="30" fill="#0b0b0c"></rect>
    <path d="M0 625 V404 C170 372 330 380 500 380 C670 380 830 372 1000 404 V625 Z" fill="url(#dash)"></path>
    <path d="M0 404 C170 372 330 380 500 380 C670 380 830 372 1000 404" fill="none" stroke="#3e3e44" stroke-width="3"></path>
    <path d="M250 625 V432 Q500 396 750 432 V625 Z" fill="#0e0e10"></path>
  </svg>`;
}

function renderWheel() {
  return html`<div class="wheel" aria-hidden="true">
    <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
      <circle r="88" fill="none" stroke="#19191b" stroke-width="16"></circle>
      <circle r="96" fill="none" stroke="#2e2e33" stroke-width="1.5"></circle>
      <path d="M-60 -62 A88 88 0 0 1 -38 -78" fill="none" stroke="#2a2a2e" stroke-width="18" stroke-linecap="round"></path>
      <path d="M60 -62 A88 88 0 0 0 38 -78" fill="none" stroke="#2a2a2e" stroke-width="18" stroke-linecap="round"></path>
      <rect x="-3" y="-97" width="6" height="18" rx="2" fill="#b8862a"></rect>
      <path d="M-84 6 Q0 34 84 6" fill="none" stroke="#19191b" stroke-width="14"></path>
      <path d="M0 26 V84" fill="none" stroke="#19191b" stroke-width="16"></path>
      <circle r="26" fill="#202023" stroke="#3a3a3e" stroke-width="2"></circle>
      <circle r="8" fill="#7a1d1d"></circle>
    </svg>
  </div>`;
}

/**
 * The driving view of the speed test, after the driving game in Mavis Beacon
 * Teaches Typing: the player drives down a highway as fast as they type.
 *
 * The windscreen shows the road (components/road-sim.js) with a rear-view
 * mirror; each mistyped key splats a bug at a random spot on the glass. The
 * dashboard shows the passage as a moving line of text, plus WPM and accuracy
 * meters and the time left.
 *
 * The session owns all typing logic and scoring. It passes its textarea in
 * the `input` slot, which covers the cockpit so a click anywhere keeps typing,
 * and shows the focus ring on the cockpit. The scene is decorative
 * (aria-hidden); the dashboard readouts are text.
 */
@customElement('x-snc-ttt-road-trip')
export default class RoadTripView extends AIUXElement {
  static properties = {
    text: { type: String },
    typed: { type: String },
    phase: { type: String },
    countdown: { type: Number },
    errorPulse: { type: Number },
    wpm: { type: Number },
    accuracy: { type: Number },
    clock: { type: String },
    clockLabel: { type: String },
    showStats: { type: Boolean },
    locale: { type: String },
    _splats: { type: Array, state: true },
  };

  static styles = css`
    /* The cockpit is a physical object, so it keeps its own colours in
       light and dark themes. Contrast: amber on the display 11:1, dimmed
       amber 5:1, misses 6:1, meter readouts 6:1. */
    :host {
      display: block;
      --cockpit: #0b0b0c;
      --cockpit-shadow: rgb(0 0 0 / 0.55);
      --mirror-frame: #121214;
      --display: #0a0805;
      --display-bezel: #2c2c30;
      --amber: #ffb627;
      --amber-done: #b8862a;
      --amber-soft: #e6a52a;
      --miss: #ff6b5b;
      --meter-face: #120707;
      --meter-rim: #2a1715;
      --meter-off: #3d1411;
      --meter-on: #ff3b2f;
      --readout: #050506;
      --readout-text: #ff5a4f;
      --veil: rgb(10 10 12 / 0.85);
      --veil-text: #fff;
      --count-veil: rgb(0 0 0 / 0.7);
    }
    .cockpit {
      container: cockpit / inline-size;
      position: relative;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      isolation: isolate;
      border-radius: var(--radius-box, 1rem);
      background: var(--cockpit);
    }
    @media (max-width: 40rem) {
      .cockpit {
        aspect-ratio: 4 / 3;
      }
    }
    :host(:focus-within) .cockpit {
      outline: 3px solid var(--color-primary);
      outline-offset: 3px;
    }
    .scene,
    .hood,
    .frame {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
    }
    .splats {
      position: absolute;
      inset: 0 0 42% 0;
      pointer-events: none;
    }
    .splat {
      position: absolute;
      aspect-ratio: 1;
      translate: -50% -50%;
      animation:
        splat-grow var(--duration-xl, 350ms) var(--ease-light-bounce, ease-out) both,
        splat-fade var(--duration-sm, 200ms) linear both;
    }
    .splat svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    @keyframes splat-grow {
      from {
        scale: var(--scale-down-lg, 0.5);
      }
      to {
        scale: 1;
      }
    }
    @keyframes splat-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    .mirror {
      position: absolute;
      top: 3.5%;
      left: 57%;
      width: 28%;
      height: 13%;
      padding: 0.45cqi;
      border-radius: 1.4cqi;
      background: var(--mirror-frame);
      box-shadow: 0 0.4cqi 1cqi var(--cockpit-shadow);
    }
    .mirror canvas {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 1cqi;
    }
    .dash {
      position: absolute;
      inset: 64% 0 0 0;
    }
    .display {
      position: absolute;
      top: 8%;
      left: 27%;
      right: 27%;
      height: 42%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.6cqi;
      padding: 0 1.4cqi;
      border-radius: 1.2cqi;
      background: var(--display);
      box-shadow:
        inset 0 0 0 2px var(--display-bezel),
        inset 0 0.6cqi 1.2cqi var(--cockpit-shadow);
      color: var(--amber);
      font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    }
    .line {
      display: flex;
      margin: 0;
      font-size: clamp(0.875rem, 2.6cqi, 1.75rem);
      line-height: 1.5;
      white-space: pre;
    }
    .tail {
      flex: none;
      width: 6ch;
      overflow: hidden;
      text-align: end;
    }
    .ahead {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
    }
    .done {
      color: var(--amber-done);
    }
    .miss {
      color: var(--miss);
      text-decoration: underline wavy;
      text-decoration-thickness: 0.08em;
      text-underline-offset: 0.2em;
    }
    .cur {
      position: relative;
    }
    .cur::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0.02em;
      height: 0.12em;
      background: currentColor;
    }
    .hint {
      margin: 0;
      font-size: clamp(0.75rem, 1.8cqi, 1.125rem);
      line-height: 1.3;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .clock {
      display: flex;
      justify-content: space-between;
      gap: 1ch;
      margin: 0;
      font-size: clamp(0.6875rem, 1.5cqi, 1rem);
      color: var(--amber-soft);
    }
    .clock-value {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    .meter {
      position: absolute;
      top: 6%;
      bottom: 10%;
      width: 18%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.8cqi;
    }
    .meter.left {
      left: 3%;
    }
    .meter.right {
      right: 3%;
    }
    .grill {
      flex: 1 1 auto;
      min-height: 0;
      width: 72%;
      display: flex;
      flex-direction: column-reverse;
      gap: 6%;
      padding: 6% 12%;
      border-radius: 45% / 22%;
      background: var(--meter-face);
      box-shadow: inset 0 0 0 2px var(--meter-rim);
    }
    .bar {
      flex: 1 1 0;
      border-radius: 2px;
      background: var(--meter-off);
    }
    .bar.on {
      background: var(--meter-on);
    }
    .readout {
      margin: 0;
      padding: 0 0.6cqi;
      border-radius: 0.6cqi;
      background: var(--readout);
      color: var(--readout-text);
      font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: clamp(0.6875rem, 1.9cqi, 1.25rem);
      font-weight: 700;
      line-height: 1.3;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .wheel {
      position: absolute;
      top: 82%;
      left: 30%;
      width: 40%;
      aspect-ratio: 1;
      pointer-events: none;
    }
    .wheel svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .overlay {
      position: absolute;
      inset: 6% 0 44% 0;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    .count {
      min-width: 1.4em;
      padding: 0 0.25em;
      border-radius: 0.2em;
      background: var(--count-veil);
      color: var(--amber);
      font-size: clamp(3rem, 15cqi, 9rem);
      font-weight: 800;
      line-height: 1.15;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .focus-hint {
      max-width: 80%;
      padding: 0.5em 1em;
      border-radius: 0.5em;
      background: var(--veil);
      color: var(--veil-text);
      font-size: clamp(0.875rem, 2.2cqi, 1.25rem);
      font-weight: 600;
      text-align: center;
    }
    :host(:focus-within) .focus-hint {
      display: none;
    }
    .input {
      position: absolute;
      inset: 0;
    }
    @container cockpit (max-width: 32rem) {
      .tail {
        width: 3ch;
      }
      .display {
        left: 24%;
        right: 24%;
      }
      .meter {
        width: 17%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .splat {
        animation: splat-fade var(--duration-xs, 150ms) linear both;
      }
    }
    @media (forced-colors: active) {
      .scene,
      .hood,
      .frame,
      .splats,
      .mirror,
      .wheel,
      .grill {
        forced-color-adjust: none;
      }
      :host(:focus-within) .cockpit {
        outline-color: Highlight;
      }
      .display,
      .readout,
      .count,
      .focus-hint {
        background: Canvas;
        color: CanvasText;
        border: 2px solid ButtonBorder;
      }
      .done {
        color: GrayText;
      }
      .miss {
        color: CanvasText;
        text-decoration-color: CanvasText;
      }
      .cur::after {
        background: CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this.text = '';
    this.typed = '';
    this.phase = 'ready';
    this.countdown = 0;
    this.errorPulse = 0;
    this.wpm = 0;
    this.accuracy = 100;
    this.clock = '';
    this.clockLabel = '';
    this.showStats = true;
    this.locale = 'en';
    this._splats = [];
    this._splatId = 0;
    this._hits = [];
    this._firstHit = 0;
    this._sim = null;
    this._raf = 0;
    this._last = 0;
    this._dirty = true;
    this._onScreen = false;
    this._reduced = false;
    this._observers = [];
  }

  // ------------------------------------------------------------ lifecycle

  connectedCallback() {
    super.connectedCallback();
    // A reconnected element restarts its observers; the first connection
    // starts them in firstUpdated, once the canvases exist.
    if (!isServer && this.hasUpdated) this._observe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._observers.forEach((o) => o.disconnect());
    this._observers = [];
  }

  willUpdate(changed) {
    if (isServer) return;
    if (changed.has('phase')) {
      const before = changed.get('phase');
      // A new attempt, or a restart: the wipers clear the glass.
      if (this.phase === 'countdown' || (this.phase === 'ready' && PLAYED.has(before))) {
        this._splats = [];
        this._hits = [];
        this._firstHit = 0;
      }
    }
    if (changed.has('typed') && this.phase === 'typing') {
      const before = changed.get('typed') || '';
      const typed = this.typed || '';
      const i = typed.length - 1;
      if (typed.length === before.length + 1 && typed[i] === (this.text || '')[i]) {
        const now = performance.now();
        if (!this._firstHit) this._firstHit = now;
        this._hits.push(now);
      }
    }
    if (changed.has('errorPulse')) {
      const before = changed.get('errorPulse');
      if (typeof before === 'number' && this.errorPulse > before && this.phase === 'typing') {
        this._addSplat();
      }
    }
  }

  firstUpdated() {
    this._canvas = this.renderRoot.querySelector('.scene');
    this._mirror = this.renderRoot.querySelector('.mirror canvas');
    this._wheel = this.renderRoot.querySelector('.wheel svg');
    this._ctx = this._canvas.getContext('2d', { alpha: false });
    this._mctx = this._mirror.getContext('2d', { alpha: false });
    this._reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this._sim = new RoadTrip(Math.floor(Math.random() * 2 ** 31));
    this._observe();
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('phase')) this._loop();
  }

  _observe() {
    const cockpit = this.renderRoot.querySelector('.cockpit');
    if (!cockpit || this._observers.length) return;
    const resize = new ResizeObserver(() => this._fit());
    resize.observe(cockpit);
    const seen = new IntersectionObserver((entries) => {
      this._onScreen = entries.some((e) => e.isIntersecting);
      this._loop();
    });
    seen.observe(cockpit);
    this._observers = [resize, seen];
  }

  _fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    [this._canvas, this._mirror].forEach((canvas) => {
      const box = canvas.getBoundingClientRect();
      Object.assign(canvas, {
        width: Math.max(1, Math.round(box.width * dpr)),
        height: Math.max(1, Math.round(box.height * dpr)),
      });
    });
    // Resizing clears the canvases; repaint now rather than show a blank frame.
    this._draw();
    this._loop();
  }

  // ------------------------------------------------------------ animation

  get _running() {
    return this.phase === 'typing' || this.phase === 'submitting' || this._sim?.player.speed > 0;
  }

  _loop() {
    if (this._raf || !this._onScreen || !this._sim) return;
    if (!this._running && !this._dirty) return;
    this._raf = requestAnimationFrame(this._frame);
  }

  _frame = (now) => {
    this._raf = 0;
    if (!this._onScreen) return;
    const dt = this._last ? (now - this._last) / 1000 : 0;
    this._last = now;
    if (this._running) {
      this._sim.update(dt, this._targetSpeed(now));
      this._dirty = true;
    }
    if (this._dirty) this._draw();
    if (this._running) {
      this._raf = requestAnimationFrame(this._frame);
    } else {
      this._last = 0;
    }
  };

  _draw() {
    this._dirty = false;
    this._sim.render(this._ctx, this._canvas.width, this._canvas.height);
    this._sim.renderMirror(this._mctx, this._mirror.width, this._mirror.height);
    // The wheel follows the road; it holds still for reduced motion.
    const angle = this._reduced ? 0 : this._sim.steer * 28;
    this._wheel.style.rotate = `${angle.toFixed(1)}deg`;
  }

  /** Cruising speed from the last few seconds of correct keystrokes. */
  _targetSpeed(now) {
    if (this.phase !== 'typing') return 0;
    while (this._hits.length && this._hits[0] < now - RATE_WINDOW) this._hits.shift();
    if (!this._hits.length) return 0;
    const span = Math.min(RATE_WINDOW, Math.max(1500, now - this._firstHit));
    return speedForWpm(this._hits.length / 5 / (span / 60000));
  }

  _addSplat() {
    const r = Math.random();
    const colors = SPLAT_COLORS[SPLAT_ODDS.filter((odds) => r >= odds).length];
    this._splatId += 1;
    const splat = {
      id: this._splatId,
      x: 6 + Math.random() * 88,
      y: 8 + Math.random() * 84,
      size: 4.5 + Math.random() * 4.5,
      rot: Math.random() * 360,
      colors,
      shape: splatShape(),
    };
    this._splats = [...this._splats.slice(1 - MAX_SPLATS), splat];
  }

  // ------------------------------------------------------------ render

  _renderMeter(side, value, max, sr, shown, unit) {
    // The meters light up once the clock is running.
    const live = this.showStats && (this.phase === 'typing' || this.phase === 'submitting');
    const lit = live ? Math.round((Math.min(Math.max(value, 0), max) / max) * METER_BARS) : 0;
    const bars = [];
    for (let i = 0; i < METER_BARS; i += 1) {
      bars.push(html`<span class="bar ${i < lit ? 'on' : ''}"></span>`);
    }
    return html`<div class="meter ${side}">
      <div class="grill" aria-hidden="true">${bars}</div>
      ${this.showStats
        ? html`<p class="readout">
            <span class="sr-only">${sr}</span>
            <span aria-hidden="true">${shown}</span>
          </p>`
        : html`<p class="readout" aria-hidden="true">${unit}</p>`}
    </div>`;
  }

  _renderLine() {
    const text = this.text || '';
    if (!text) {
      return html`<p class="hint" aria-hidden="true">
        ${i18n.getMessage('Press Start, then type to drive.')}
      </p>`;
    }
    const typed = this.typed || '';
    const pos = Math.min(typed.length, text.length);
    const tail = [];
    for (let i = Math.max(0, pos - TAIL); i < pos; i += 1) {
      tail.push(
        html`<span class=${typed[i] === text[i] ? 'done' : 'miss'}>${text[i]}</span>`,
      );
    }
    const current = text[pos];
    return html`<p class="line" dir="auto" aria-hidden="true">
      <span class="tail">${tail}</span><span class="ahead">${current === undefined
        ? nothing
        : html`<span class="cur">${current}</span>${text.slice(pos + 1, pos + AHEAD)}`}</span>
    </p>`;
  }

  _renderOverlay() {
    if (this.phase === 'countdown' && this.countdown > 0) {
      return html`<div class="overlay" aria-hidden="true">
        <span class="count">${formatInteger(this.countdown, this.locale)}</span>
      </div>`;
    }
    if (this.phase === 'typing' || this.phase === 'countdown') {
      return html`<div class="overlay" aria-hidden="true">
        <span class="focus-hint">${i18n.getMessage('Click here to keep typing')}</span>
      </div>`;
    }
    return nothing;
  }

  render() {
    const wpm = formatInteger(this.wpm, this.locale);
    const accuracy = formatPercent(this.accuracy, this.locale);
    return html`<div class="cockpit">
      <canvas class="scene" aria-hidden="true"></canvas>
      ${renderHood()}
      <div class="splats" aria-hidden="true">
        ${repeat(this._splats, (s) => s.id, (s) => renderSplat(s))}
      </div>
      ${renderFrame()}
      <div class="mirror" aria-hidden="true"><canvas></canvas></div>
      <div class="dash">
        ${this._renderMeter(
          'left',
          this.wpm,
          120,
          i18n.getMessage('Speed (estimate): {0} WPM', [wpm]),
          i18n.getMessage('{0} WPM', [wpm]),
          i18n.getMessage('WPM'),
        )}
        <div class="display">
          ${this._renderLine()}
          <p class="clock">
            <span>${this.clockLabel}</span>
            <span class="clock-value">${this.clock}</span>
          </p>
        </div>
        ${this._renderMeter(
          'right',
          this.accuracy,
          100,
          i18n.getMessage('Accuracy (estimate): {0}', [accuracy]),
          // Translators: dashboard readout, e.g. "96% ACC". ACC is a short
          // label for typing accuracy.
          i18n.getMessage('{0} ACC', [accuracy]),
          // Translators: short dashboard label for typing accuracy.
          i18n.getMessage('ACC'),
        )}
      </div>
      ${renderWheel()} ${this._renderOverlay()}
      <div class="input"><slot name="input"></slot></div>
    </div>`;
  }
}
