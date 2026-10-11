/**
 * Road trip: the highway simulation and renderer behind the driving view of
 * the speed test (x-snc-ttt-road-trip).
 *
 * Plain JavaScript with no DOM access outside the draw methods, so it is safe
 * to import during SSR and runs under Node for tests.
 *
 * World units are centimetres. The road is a closed loop of 2 m slices, each
 * with a curve and a height, drawn as a pseudo-3D projection from far to near
 * so nearer hills, cars and trees cover what is behind them.
 *
 * Every vehicle, the player's included, uses the same driver: an Intelligent
 * Driver Model for speed, lane changes only into gaps that are clear ahead and
 * behind, and a hard stopping distance as a backstop. Nothing ever drives into
 * another vehicle or a lane closure, and the player's car stays centred in its
 * lane through every curve.
 */
import SERVICENOW_LOGO from './servicenow-logo.js';
import {
  ROAD_HALF, LANES, LANE_HALF, KMH, clamp, lerp, mod, easeIn, easeOut, easeInOut,
} from './road-common.js';
import Vehicle, { KINDS, LAT_MAX } from './road-vehicle.js';

export const SEGMENT = 200;
const TRACK_SEGMENTS = 3000;
export const MAX_SPEED = 150 * KMH;
const MAX_WPM = 120;

// Camera and drawing
const DRAW_DISTANCE = 320;
const MIRROR_DISTANCE = 110;
const EYE_HEIGHT = 120;
const DEPTH = 1 / Math.tan((72 / 2) * (Math.PI / 180));
const NEAR = 30;
const FOG_STEPS = 24;
const FOG_DENSITY = 4.5;
const FOG_RGB = [207, 226, 241];
const BG_PARALLAX = 0.00006;

// Driver model
const LOOK = 26000;
const PLAN = 7000;
const PLAN_CLOSURE = 22000;
const LC_GAP = 450;
const LC_TIME = 2.2;

// Share of traffic for each kind, as cumulative upper bounds; the rest are cars.
const TRAFFIC_MIX = [
  ['truck', 0.1],
  ['van', 0.17],
  ['pickup', 0.26],
  ['suv', 0.38],
  ['taxi', 0.45],
  ['motorcycle', 0.52],
  ['limo', 0.56],
  ['police', 0.61],
  ['coach', 0.65],
  ['ambulance', 0.69],
  ['schoolbus', 0.73],
  ['firetruck', 0.76],
];
// Heavy vehicles keep to the right lane at lorry speeds.
const HEAVY = new Set(['truck', 'coach', 'schoolbus', 'firetruck']);
// Flat-fronted, flat-backed bodies, drawn by _drawBoxRear / _drawBoxFront.
const BOXES = new Set([...HEAVY, 'ambulance']);
// Cab-roof width for the car-shaped kinds, as a fraction of body width.
const CABIN = {
  car: 0.36, taxi: 0.36, police: 0.36, limo: 0.36, suv: 0.43, van: 0.42,
};
const CAR_COLORS = [
  '#c0392b',
  '#2e5fa8',
  '#e8e6e1',
  '#f1c232',
  '#3d3f45',
  '#8a9196',
  '#1e7a5a',
  '#7d3c98',
  '#d35400',
  '#111111',
];
const TRUCK_COLORS = ['#f2f2ee', '#dfe6ea', '#e9e2cf'];
const PALETTES = {
  truck: TRUCK_COLORS,
  taxi: ['#f4c20d'],
  limo: ['#111111', '#f2f2ee'],
  police: ['#15171c'],
  ambulance: ['#f4f4f0'],
  coach: ['#d5d9de'],
  schoolbus: ['#f7b500'],
  firetruck: ['#b3121f'],
};
// Warning lamps are drawn steadily lit, never flashing (see the hazards).
const LAMP_RED = '#e0261b';
const LAMP_BLUE = '#1f5fd6';
const LAMP_AMBER = '#ffb000';

// The roadside billboard: one, a few hundred metres past the start line.
const BILLBOARD_SEGMENT = 200;

// Road colours: [light, dark] pairs that alternate to show speed.
const COLORS = {
  grass: ['#4f9d2d', '#489327'],
  shoulder: ['#8f8b80', '#8a867b'],
  asphalt: ['#5d5f63', '#595b5f'],
  yellow: '#e8c33a',
  white: '#f2f2f2',
};

/* eslint-disable no-bitwise -- mulberry32 is defined in 32-bit integer operations */
/** Small seeded PRNG (mulberry32), so a seed always builds the same road. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

/** Cruising speed for a typing speed: quick to respond at low WPM, capped at MAX_WPM. */
export function speedForWpm(wpm) {
  const w = clamp(Number(wpm) || 0, 0, MAX_WPM);
  return MAX_SPEED * (w / MAX_WPM) ** 0.6;
}

/** The blue six-armed Star of Life (EMS emblem), centred on (cx, cy). */
function drawStarOfLife(ctx, cx, cy, r) {
  if (r < 1) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#1f5fbf';
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(-r * 0.32, -r, r * 0.64, r * 2);
    ctx.rotate(Math.PI / 3);
  }
  // The rod down the middle.
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(-r * 0.06, -r * 0.7, r * 0.12, r * 1.4);
  ctx.restore();
}

/**
 * Details on top that look the same from both ends: taxi sign and band,
 * SUV rails, police light bar.
 */
function drawRoofExtras(ctx, v, x, y, W, H, roof) {
  if (v.kind === 'police') {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - W * 0.26, y - H * 1.02, W * 0.52, H * 0.03);
    ctx.fillStyle = LAMP_RED;
    ctx.fillRect(x - W * 0.25, y - H * 1.08, W * 0.24, H * 0.06);
    ctx.fillStyle = LAMP_BLUE;
    ctx.fillRect(x + W * 0.01, y - H * 1.08, W * 0.24, H * 0.06);
  } else if (v.kind === 'suv') {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - W * (roof - 0.02), y - H * 1.03, W * (roof - 0.02) * 2, H * 0.03);
  } else if (v.kind === 'taxi') {
    ctx.fillStyle = '#fff4c2';
    ctx.fillRect(x - W * 0.14, y - H * 1.1, W * 0.28, H * 0.1);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x - W * 0.09, y - H * 1.07, W * 0.18, H * 0.035);
    // Chequered band along the waist.
    ctx.fillStyle = '#151515';
    const sq = W / 10;
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(x - W / 2 + i * sq, y - H * 0.61, sq, H * 0.045);
    }
  }
}

/** A motorcycle and rider, seen from behind or (front) from ahead. */
function drawMotorcycle(ctx, v, x, y, W, H, lamp, front) {
  ctx.fillStyle = '#151515';
  ctx.fillRect(x - W * 0.09, y - H * 0.3, W * 0.18, H * 0.3);
  // Legs either side, then the bodywork between them.
  ctx.fillStyle = '#1f2a44';
  ctx.fillRect(x - W * 0.32, y - H * 0.52, W * 0.13, H * 0.24);
  ctx.fillRect(x + W * 0.19, y - H * 0.52, W * 0.13, H * 0.24);
  ctx.fillStyle = v.color;
  ctx.fillRect(x - W * 0.2, y - H * 0.5, W * 0.4, H * 0.18);
  ctx.fillStyle = lamp;
  ctx.fillRect(x - W * 0.1, y - H * 0.45, W * 0.2, H * 0.06);
  // Jacket from waist to shoulders, arms out to the bars, then the helmet.
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.moveTo(x - W * 0.2, y - H * 0.5);
  ctx.lineTo(x - W * 0.32, y - H * 0.84);
  ctx.lineTo(x + W * 0.32, y - H * 0.84);
  ctx.lineTo(x + W * 0.2, y - H * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - W * 0.48, y - H * 0.7, W * 0.96, H * 0.05);
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.arc(x, y - H * 0.91, W * 0.17, 0, Math.PI * 2);
  ctx.fill();
  if (front) {
    ctx.fillStyle = '#1b2530';
    ctx.fillRect(x - W * 0.12, y - H * 0.95, W * 0.24, H * 0.05);
  }
}

/** Rear of a flat-backed body: lorry, coach, school bus, fire engine or ambulance. */
function drawBoxRear(ctx, v, x, y, W, H, tail) {
  ctx.fillStyle = '#151515';
  ctx.fillRect(x - W * 0.44, y - H * 0.12, W * 0.2, H * 0.12);
  ctx.fillRect(x + W * 0.24, y - H * 0.12, W * 0.2, H * 0.12);
  ctx.fillStyle = v.color;
  ctx.fillRect(x - W / 2, y - H, W, H * 0.84);
  switch (v.kind) {
    case 'coach':
      // Blue band, small rear window, engine grille.
      ctx.fillStyle = '#1f4e9c';
      ctx.fillRect(x - W / 2, y - H * 0.6, W, H * 0.07);
      ctx.fillStyle = '#26323d';
      ctx.fillRect(x - W * 0.36, y - H * 0.94, W * 0.72, H * 0.18);
      ctx.fillStyle = '#2a2d31';
      ctx.fillRect(x - W * 0.32, y - H * 0.46, W * 0.64, H * 0.16);
      ctx.fillStyle = '#e9e6d8';
      ctx.fillRect(x - W * 0.07, y - H * 0.27, W * 0.14, H * 0.05);
      ctx.fillStyle = tail;
      ctx.fillRect(x - W * 0.48, y - H * 0.42, W * 0.06, H * 0.16);
      ctx.fillRect(x + W * 0.42, y - H * 0.42, W * 0.06, H * 0.16);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - W / 2, y - H * 0.2, W, H * 0.04);
      return;
    case 'schoolbus':
      // Windows either side of the emergency door, black rub rails, and
      // red warning lamps at the top corners.
      ctx.fillStyle = '#26323d';
      ctx.fillRect(x - W * 0.42, y - H * 0.9, W * 0.26, H * 0.26);
      ctx.fillRect(x + W * 0.16, y - H * 0.9, W * 0.26, H * 0.26);
      ctx.fillRect(x - W * 0.09, y - H * 0.9, W * 0.18, H * 0.3);
      ctx.fillStyle = '#151515';
      ctx.fillRect(x - W / 2, y - H * 0.5, W, H * 0.025);
      ctx.fillRect(x - W / 2, y - H * 0.36, W, H * 0.025);
      ctx.fillStyle = LAMP_RED;
      ctx.fillRect(x - W * 0.46, y - H * 0.98, W * 0.1, H * 0.05);
      ctx.fillRect(x + W * 0.36, y - H * 0.98, W * 0.1, H * 0.05);
      ctx.fillStyle = tail;
      ctx.fillRect(x - W * 0.46, y - H * 0.3, W * 0.08, H * 0.08);
      ctx.fillRect(x + W * 0.38, y - H * 0.3, W * 0.08, H * 0.08);
      ctx.fillStyle = '#151515';
      ctx.fillRect(x - W / 2, y - H * 0.2, W, H * 0.05);
      return;
    case 'firetruck':
      // Chrome compartment doors, white stripe, the ladder over the top,
      // amber lamps, and tail lamps in black housings on the red body.
      ctx.fillStyle = '#c9ccd1';
      ctx.fillRect(x - W * 0.42, y - H * 0.86, W * 0.84, H * 0.3);
      ctx.fillRect(x - W * 0.3, y - H * 1.08, W * 0.04, H * 0.1);
      ctx.fillRect(x + W * 0.26, y - H * 1.08, W * 0.04, H * 0.1);
      for (let r = 0; r < 3; r += 1) {
        ctx.fillRect(x - W * 0.3, y - H * (1.07 - r * 0.035), W * 0.6, H * 0.012);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - W * 0.006, y - H * 0.86, W * 0.012, H * 0.3);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(x - W / 2, y - H * 0.5, W, H * 0.04);
      ctx.fillStyle = LAMP_AMBER;
      ctx.fillRect(x - W * 0.48, y - H * 0.98, W * 0.06, H * 0.06);
      ctx.fillRect(x + W * 0.42, y - H * 0.98, W * 0.06, H * 0.06);
      ctx.fillStyle = '#151515';
      ctx.fillRect(x - W * 0.49, y - H * 0.42, W * 0.1, H * 0.12);
      ctx.fillRect(x + W * 0.39, y - H * 0.42, W * 0.1, H * 0.12);
      ctx.fillStyle = tail;
      ctx.fillRect(x - W * 0.48, y - H * 0.41, W * 0.08, H * 0.1);
      ctx.fillRect(x + W * 0.4, y - H * 0.41, W * 0.08, H * 0.1);
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(x - W / 2, y - H * 0.22, W, H * 0.05);
      return;
    case 'ambulance':
      // Split rear doors with windows, a red stripe, the Star of Life, and
      // red lamps at the top corners.
      ctx.fillStyle = '#26323d';
      ctx.fillRect(x - W * 0.34, y - H * 0.88, W * 0.26, H * 0.18);
      ctx.fillRect(x + W * 0.08, y - H * 0.88, W * 0.26, H * 0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - W * 0.006, y - H * 0.94, W * 0.012, H * 0.74);
      ctx.fillStyle = '#d7261e';
      ctx.fillRect(x - W / 2, y - H * 0.42, W, H * 0.06);
      drawStarOfLife(ctx, x, y - H * 0.58, W * 0.07);
      ctx.fillStyle = LAMP_RED;
      ctx.fillRect(x - W * 0.48, y - H * 0.99, W * 0.1, H * 0.05);
      ctx.fillRect(x + W * 0.38, y - H * 0.99, W * 0.1, H * 0.05);
      ctx.fillStyle = tail;
      ctx.fillRect(x - W * 0.49, y - H * 0.34, W * 0.06, H * 0.12);
      ctx.fillRect(x + W * 0.43, y - H * 0.34, W * 0.06, H * 0.12);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - W / 2, y - H * 0.2, W, H * 0.05);
      return;
    default:
      // Lorry: plain box with a door seam and a low underrun bar.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x - W * 0.006, y - H * 0.98, W * 0.012, H * 0.8);
      ctx.fillRect(x - W / 2, y - H * 0.2, W, H * 0.04);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - W * 0.42, y - H * 0.14, W * 0.84, H * 0.03);
      ctx.fillStyle = tail;
      ctx.fillRect(x - W * 0.48, y - H * 0.26, W * 0.08, H * 0.05);
      ctx.fillRect(x + W * 0.4, y - H * 0.26, W * 0.08, H * 0.05);
  }
}

/** Front of a flat-fronted body, as seen in the mirror. */
function drawBoxFront(ctx, v, x, y, W, H) {
  ctx.fillStyle = '#151515';
  ctx.fillRect(x - W * 0.46, y - H * 0.16, W * 0.17, H * 0.16);
  ctx.fillRect(x + W * 0.29, y - H * 0.16, W * 0.17, H * 0.16);
  ctx.fillStyle = v.color;
  ctx.fillRect(x - W / 2, y - H, W, H * 0.86);
  ctx.fillStyle = '#2b3946';
  if (v.kind === 'coach') {
    ctx.fillRect(x - W * 0.44, y - H * 0.88, W * 0.88, H * 0.42);
  } else {
    ctx.fillRect(x - W * 0.34, y - H * 0.92, W * 0.68, H * (v.kind === 'truck' ? 0.22 : 0.26));
  }
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(x - W * 0.46, y - H * 0.42, W * 0.16, H * 0.08);
  ctx.fillRect(x + W * 0.3, y - H * 0.42, W * 0.16, H * 0.08);
  ctx.fillStyle = v.kind === 'firetruck' ? '#9aa0a6' : '#1d1d1d';
  ctx.fillRect(x - W * 0.2, y - H * 0.38, W * 0.4, H * 0.1);
  switch (v.kind) {
    case 'coach':
      // Split windscreen, amber destination sign, blue band.
      ctx.fillStyle = '#1d1d1d';
      ctx.fillRect(x - W * 0.008, y - H * 0.88, W * 0.016, H * 0.42);
      ctx.fillStyle = LAMP_AMBER;
      ctx.fillRect(x - W * 0.3, y - H * 0.96, W * 0.6, H * 0.05);
      ctx.fillStyle = '#1f4e9c';
      ctx.fillRect(x - W / 2, y - H * 0.46, W, H * 0.03);
      return;
    case 'schoolbus':
      ctx.fillStyle = LAMP_RED;
      ctx.fillRect(x - W * 0.46, y - H * 0.99, W * 0.1, H * 0.05);
      ctx.fillRect(x + W * 0.36, y - H * 0.99, W * 0.1, H * 0.05);
      ctx.fillStyle = '#151515';
      ctx.fillRect(x - W / 2, y - H * 0.5, W, H * 0.025);
      return;
    case 'firetruck':
    case 'ambulance':
      // Light bar over the cab and a stripe across the front.
      ctx.fillStyle = LAMP_RED;
      ctx.fillRect(x - W * 0.3, y - H * 1.04, W * 0.6, H * 0.05);
      ctx.fillStyle = v.kind === 'firetruck' ? '#f2f2f2' : '#d7261e';
      ctx.fillRect(x - W / 2, y - H * 0.56, W, H * 0.04);
      break;
    default:
  }
}

// Hazard lamps are drawn steadily lit, never flashing.
function tailLampColor(v) {
  if (v.hazard) return '#ffae1a';
  return v.braking ? '#ff2d20' : '#a3191a';
}

function drawCarRear(ctx, v, x, y, k) {
  const W = v.halfW * ROAD_HALF * 2 * k;
  if (W < 1.5) return;
  const H = v.height * k;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, W * 0.56, Math.max(1, W * 0.07), 0, 0, Math.PI * 2);
  ctx.fill();
  const tail = tailLampColor(v);
  if (BOXES.has(v.kind)) {
    drawBoxRear(ctx, v, x, y, W, H, tail);
    return;
  }
  if (v.kind === 'motorcycle') {
    drawMotorcycle(ctx, v, x, y, W, H, tail, false);
    return;
  }
  if (v.kind === 'pickup') {
    ctx.fillStyle = '#151515';
    ctx.fillRect(x - W * 0.46, y - H * 0.18, W * 0.18, H * 0.18);
    ctx.fillRect(x + W * 0.28, y - H * 0.18, W * 0.18, H * 0.18);
    // The cab shows over the bed; the tailgate covers its lower edge.
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.moveTo(x - W * 0.42, y - H * 0.56);
    ctx.lineTo(x - W * 0.38, y - H);
    ctx.lineTo(x + W * 0.38, y - H);
    ctx.lineTo(x + W * 0.42, y - H * 0.56);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - W / 2, y - H * 0.58, W, H * 0.42);
    ctx.fillStyle = '#26323d';
    ctx.fillRect(x - W * 0.3, y - H * 0.93, W * 0.6, H * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - W / 2, y - H * 0.58, W, H * 0.03);
    ctx.fillStyle = tail;
    ctx.fillRect(x - W * 0.5, y - H * 0.55, W * 0.06, H * 0.2);
    ctx.fillRect(x + W * 0.44, y - H * 0.55, W * 0.06, H * 0.2);
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(x - W * 0.06, y - H * 0.5, W * 0.12, H * 0.03);
    ctx.fillStyle = '#e9e6d8';
    ctx.fillRect(x - W * 0.08, y - H * 0.3, W * 0.16, H * 0.08);
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(x - W / 2, y - H * 0.2, W, H * 0.06);
    return;
  }
  const cabin = CABIN[v.kind] || CABIN.car;
  ctx.fillStyle = '#151515';
  ctx.fillRect(x - W * 0.46, y - H * 0.2, W * 0.17, H * 0.2);
  ctx.fillRect(x + W * 0.29, y - H * 0.2, W * 0.17, H * 0.2);
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.moveTo(x - W * 0.42, y - H * 0.6);
  ctx.lineTo(x - W * cabin, y - H);
  ctx.lineTo(x + W * cabin, y - H);
  ctx.lineTo(x + W * 0.42, y - H * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - W / 2, y - H * 0.62, W, H * 0.46);
  // Limousines have tinted glass and a chrome bumper.
  const limo = v.kind === 'limo';
  ctx.fillStyle = limo ? '#0b0f14' : '#26323d';
  ctx.beginPath();
  ctx.moveTo(x - W * 0.37, y - H * 0.64);
  ctx.lineTo(x - W * (cabin - 0.05), y - H * 0.94);
  ctx.lineTo(x + W * (cabin - 0.05), y - H * 0.94);
  ctx.lineTo(x + W * 0.37, y - H * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x - W * 0.3, y - H * 0.9, W * 0.18, H * 0.05);
  ctx.fillStyle = tail;
  ctx.fillRect(x - W * 0.48, y - H * 0.56, W * 0.17, H * 0.11);
  ctx.fillRect(x + W * 0.31, y - H * 0.56, W * 0.17, H * 0.11);
  if (v.kind === 'suv') {
    // Spare wheel on the tailgate.
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x, y - H * 0.5, W * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b5f66';
    ctx.beginPath();
    ctx.arc(x, y - H * 0.5, W * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e9e6d8';
  ctx.fillRect(x - W * 0.1, y - H * 0.4, W * 0.2, H * 0.1);
  ctx.fillStyle = limo ? '#c9ccd1' : '#1d1d1d';
  ctx.fillRect(x - W / 2, y - H * 0.22, W, H * 0.07);
  drawRoofExtras(ctx, v, x, y, W, H, cabin);
}

function drawCarFront(ctx, v, x, y, k) {
  const W = v.halfW * ROAD_HALF * 2 * k;
  if (W < 1.5) return;
  const H = v.height * k;
  if (v.kind === 'motorcycle') {
    drawMotorcycle(ctx, v, x, y, W, H, '#fff6c9', true);
    return;
  }
  if (BOXES.has(v.kind)) {
    drawBoxFront(ctx, v, x, y, W, H);
    return;
  }
  const roof = v.kind === 'suv' || v.kind === 'pickup' ? 0.4 : 0.34;
  ctx.fillStyle = '#151515';
  ctx.fillRect(x - W * 0.46, y - H * 0.16, W * 0.17, H * 0.16);
  ctx.fillRect(x + W * 0.29, y - H * 0.16, W * 0.17, H * 0.16);
  ctx.fillStyle = v.color;
  ctx.fillRect(x - W / 2, y - H * 0.62, W, H * 0.48);
  ctx.beginPath();
  ctx.moveTo(x - W * 0.42, y - H * 0.6);
  ctx.lineTo(x - W * roof, y - H);
  ctx.lineTo(x + W * roof, y - H);
  ctx.lineTo(x + W * 0.42, y - H * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = v.kind === 'limo' ? '#0b0f14' : '#2b3946';
  ctx.fillRect(x - W * 0.34, y - H * 0.95, W * 0.68, H * 0.3);
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(x - W * 0.46, y - H * 0.42, W * 0.16, H * 0.08);
  ctx.fillRect(x + W * 0.3, y - H * 0.42, W * 0.16, H * 0.08);
  // Pickups and limousines get a big chrome grille.
  if (v.kind === 'pickup' || v.kind === 'limo') {
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(x - W * 0.26, y - H * 0.44, W * 0.52, H * 0.16);
  } else {
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(x - W * 0.2, y - H * 0.38, W * 0.4, H * 0.1);
  }
  drawRoofExtras(ctx, v, x, y, W, H, roof);
}

function laneBand(k) {
  return [LANES[k] - LANE_HALF + 0.01, LANES[k] + LANE_HALF - 0.01];
}

export class RoadTrip {
  constructor(seed = 1) {
    this.rand = rng(seed);
    this.segments = [];
    this.obstacles = [];
    this.vehicles = [];
    this.bgOffset = 0;
    this.steer = 0;
    this.distance = 0;
    this._fwd = Array.from({ length: DRAW_DISTANCE }, () => ({}));
    this._back = Array.from({ length: MIRROR_DISTANCE }, () => ({}));
    this._carsAt = Array.from({ length: DRAW_DISTANCE }, () => []);
    this._colorCache = new Map();
    this._backdrop = null;
    this._logoPaths = null;
    this._buildTrack();
    this.length = this.segments.length * SEGMENT;
    this._buildScenery();
    this._buildBillboard();
    this._buildClosures();
    this.player = this._vehicle('player', 1, 20 * SEGMENT, 0, '#7a1d1d');
    this._spawnTraffic();
    this.all = [this.player, ...this.vehicles];
    this.all.forEach((v) => v.range());
  }

  // ------------------------------------------------------------ world

  _pick(a, b) {
    return a + (b - a) * this.rand();
  }

  _int(a, b) {
    return Math.floor(this._pick(a, b + 1));
  }

  _buildTrack() {
    const segs = this.segments;
    const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
    const add = (curve, y) => {
      segs.push({
        index: segs.length, curve, y1: lastY(), y2: y, sprites: [],
      });
    };
    const section = (enter, hold, leave, curve, dy) => {
      const y0 = lastY();
      const y1 = y0 + dy;
      const total = enter + hold + leave;
      for (let n = 0; n < enter; n += 1) {
        add(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / total));
      }
      for (let n = 0; n < hold; n += 1) {
        add(curve, easeInOut(y0, y1, (enter + n) / total));
      }
      for (let n = 0; n < leave; n += 1) {
        add(easeOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / total));
      }
    };

    // A flat straight start, then long highway curves over rolling hills.
    section(0, 100, 0, 0, 0);
    while (segs.length < TRACK_SEGMENTS - 360) {
      const y = lastY();
      const dy = this.rand() < 0.3 ? 0 : clamp(this._pick(-2200, 2200), -3000 - y, 3000 - y);
      const kind = this.rand();
      const side = this.rand() < 0.5 ? -1 : 1;
      if (kind < 0.25) {
        section(0, this._int(60, 160), 0, 0, dy / 2);
      } else if (kind < 0.8) {
        const curve = side * this._pick(0.25, 1.1);
        section(this._int(40, 80), this._int(60, 200), this._int(40, 80), curve, dy);
      } else {
        const curve = side * this._pick(0.3, 0.8);
        section(this._int(30, 60), this._int(40, 100), this._int(30, 60), curve, dy / 2);
        section(this._int(30, 60), this._int(40, 100), this._int(30, 60), -curve, -dy / 2);
      }
    }
    // Ease back to flat and straight so the loop joins without a seam.
    section(80, 120, 80, 0, -lastY());
    section(0, 60, 0, 0, 0);
  }

  _buildScenery() {
    this.segments.forEach((seg) => {
      const i = seg.index;
      if (i % 25 === 0) {
        seg.sprites.push({ type: 'post', x: -1.24, s: 1 }, { type: 'post', x: 1.24, s: 1 });
      }
      if (this.rand() < 0.24) {
        const side = this.rand() < 0.5 ? -1 : 1;
        seg.sprites.push({
          type: this.rand() < 0.55 ? 'pine' : 'oak',
          x: side * this._pick(1.9, 7),
          s: this._pick(0.75, 1.35),
        });
      }
      if (this.rand() < 0.08) {
        const side = this.rand() < 0.5 ? -1 : 1;
        seg.sprites.push({ type: 'bush', x: side * this._pick(1.5, 3), s: this._pick(0.7, 1.4) });
      }
    });
  }

  /**
   * One ServiceNow billboard on the right, so every test passes it soon after
   * the start. Trees and bushes in front of it on that side are cleared.
   */
  _buildBillboard() {
    for (let i = BILLBOARD_SEGMENT - 30; i <= BILLBOARD_SEGMENT + 2; i += 1) {
      const seg = this.segments[i];
      seg.sprites = seg.sprites.filter((sp) => sp.type === 'post' || sp.x < 1.3);
    }
    this.segments[BILLBOARD_SEGMENT].sprites.push({ type: 'billboard', x: 2.6, s: 1 });
  }

  /**
   * Obstacles that close one lane: road works in an outer lane (cones and an
   * arrow board), or a broken-down car in any lane (warning triangle, cones).
   */
  _buildClosures() {
    const segs = this.segments;
    let i = 300;
    while (i < segs.length - 320) {
      const works = this.rand() < 0.55;
      let lane;
      if (works) lane = this.rand() < 0.5 ? 0 : 2;
      else lane = this._int(0, 2);
      const len = works ? this._int(60, 90) : 20;
      this.obstacles.push({
        z0: i * SEGMENT,
        z1: (i + len) * SEGMENT,
        lane,
        xMin: LANES[lane] - LANE_HALF,
        xMax: LANES[lane] + LANE_HALF,
      });
      if (works) {
        const outer = lane === 0 ? -1 : 1;
        const inner = lane === 0 ? -LANE_HALF : LANE_HALF;
        // Taper from the road edge to the lane line, then cones along the line.
        for (let k = 0; k <= 12; k += 2) {
          segs[i + k].sprites.push({ type: 'cone', x: lerp(outer * 0.97, inner * 1.12, k / 12), s: 1 });
        }
        for (let k = 15; k < len; k += 4) {
          segs[i + k].sprites.push({ type: 'cone', x: inner * 1.12, s: 1 });
        }
        segs[i + 6].sprites.push({
          type: 'board', x: LANES[lane], s: 1, dir: -outer,
        });
      } else {
        const c = LANES[lane];
        segs[i].sprites.push({ type: 'triangle', x: c, s: 1 });
        for (let k = 0; k < 3; k += 1) {
          segs[i + 7 + k * 2].sprites.push({ type: 'cone', x: c + (k - 1) * 0.2, s: 1 });
        }
        segs[i + 15].sprites.push({
          type: 'stalled',
          x: c,
          s: 1,
          car: {
            ...KINDS.car, kind: 'car', color: CAR_COLORS[this._int(0, CAR_COLORS.length - 1)], hazard: true,
          },
        });
      }
      i += len + this._int(220, 420);
    }
  }

  _vehicle(kind, lane, z, v0, color) {
    return new Vehicle({
      kind, lane, z, v0, color, think: this.rand() * 0.25,
    });
  }

  _spawnTraffic() {
    const count = 110;
    const start = this.player.z;
    const ranges = {
      car: [
        [82, 96],
        [63, 75],
        [50, 62],
      ],
      truck: [
        [55, 62],
        [52, 60],
        [45, 55],
      ],
    };
    for (let n = 0; n < count; n += 1) {
      for (let tries = 0; tries < 40; tries += 1) {
        const roll = this.rand();
        const kind = (TRAFFIC_MIX.find(([, upTo]) => roll < upTo) || ['car'])[0];
        const lane = HEAVY.has(kind) ? 2 : this._int(0, 2);
        const z = this._pick(0, this.length);
        if (this._spawnClear(lane, z, start)) {
          const [lo, hi] = ranges[HEAVY.has(kind) ? 'truck' : 'car'][lane];
          const palette = PALETTES[kind] || CAR_COLORS;
          const color = palette[this._int(0, palette.length - 1)];
          const v = this._vehicle(kind, lane, z, this._pick(lo, hi) * KMH, color);
          this.vehicles.push(v);
          break;
        }
      }
    }
  }

  _spawnClear(lane, z, start) {
    const L = this.length;
    const fromStart = mod(z - start, L);
    if (fromStart < 9000 || fromStart > L - 5000) return false;
    const nearClosure = this.obstacles.some(
      (o) => o.lane === lane && mod(z - (o.z0 - 6000), L) < o.z1 - o.z0 + 7500,
    );
    if (nearClosure) return false;
    return !this.vehicles.some((v) => {
      const d = mod(z - v.z, L);
      return v.lane === lane && (d < 3500 || d > L - 3500);
    });
  }

  // ------------------------------------------------------------ driving

  /**
   * Advances the world by dt seconds. `target` is the player's cruising speed
   * in cm/s (0 lets the car roll to a stop).
   */
  update(elapsed, target) {
    if (!(elapsed > 0)) return;
    const dt = Math.min(elapsed, 0.05);
    const L = this.length;
    const p = this.player;
    p.v0 = Math.max(0, target || 0);
    this.all.forEach((v) => v.steer(dt, this));
    this.all.forEach((v) => v.range());
    this.all.forEach((v) => v.throttle(dt, this._leader(v)));
    this.all.forEach((v) => v.advance(dt, L));

    const seg = this.segments[Math.floor(p.z / SEGMENT) % this.segments.length];
    this.distance += p.speed * dt;
    this.bgOffset += seg.curve * p.speed * dt * BG_PARALLAX;
    this.steer = clamp(seg.curve / 1.2 + (p.latV / LAT_MAX) * 0.5, -1, 1);
  }

  /** Nearest vehicle or closure ahead that overlaps v's lateral band. */
  _leader(v) {
    const L = this.length;
    let gap = Infinity;
    let speed = 0;
    this.all.forEach((u) => {
      if (u === v || u.hi <= v.lo || u.lo >= v.hi) return;
      const d = mod(u.z - v.z, L);
      if (d > LOOK) return;
      const g = d - (u.len + v.len) / 2;
      if (g < gap) {
        gap = g;
        ({ speed } = u);
      }
    });
    this.obstacles.forEach((o) => {
      if (o.xMax <= v.lo || o.xMin >= v.hi) return;
      const d = mod(o.z0 - v.z, L);
      if (d > LOOK) return;
      const g = d - v.len / 2;
      if (g < gap) {
        gap = g;
        speed = 0;
      }
    });
    return gap === Infinity ? null : { gap, speed };
  }

  /** The speed v could hold in lane k, given what is ahead in it. */
  laneScore(v, k) {
    const L = this.length;
    const [lo, hi] = laneBand(k);
    const blocked = this.obstacles.some((o) => {
      if (o.xMax <= lo || o.xMin >= hi) return false;
      const ahead = mod(o.z0 - v.z, L);
      const inside = mod(v.z - o.z0, L) < o.z1 - o.z0 + v.len;
      return ahead < PLAN_CLOSURE || inside;
    });
    if (blocked) return 0;
    const plan = Math.max(PLAN, v.speed * 5);
    return this.all.reduce((score, u) => {
      if (u === v || u.hi <= lo || u.lo >= hi) return score;
      const d = mod(u.z - v.z, L);
      return d > 0 && d < plan ? Math.min(score, u.speed) : score;
    }, v.v0);
  }

  /** True when v can move into lane k without cutting anyone up. */
  laneSafe(v, k) {
    const L = this.length;
    const [lo, hi] = laneBand(k);
    const closureInTheWay = this.obstacles.some((o) => {
      if (o.xMax <= lo || o.xMin >= hi) return false;
      const ahead = mod(o.z0 - v.z, L);
      const inside = mod(v.z - o.z0, L) < o.z1 - o.z0 + v.len;
      return inside || ahead - v.len / 2 < LC_GAP + v.speed * LC_TIME * 2;
    });
    if (closureInTheWay) return false;
    return !this.all.some((u) => {
      if (u === v || u.hi <= lo || u.lo >= hi) return false;
      const ahead = mod(u.z - v.z, L);
      const behind = L - ahead;
      const half = (u.len + v.len) / 2;
      if (ahead <= behind) {
        return ahead - half < LC_GAP + Math.max(0, v.speed - u.speed) * LC_TIME;
      }
      return behind - half < LC_GAP + Math.max(0, u.speed - v.speed) * LC_TIME;
    });
  }

  // ------------------------------------------------------------ drawing

  /** Draws the forward view. Call only in the browser. */
  render(ctx, w, h) {
    const horizon = h * 0.4;
    this._drawBackdrop(ctx, w, h, horizon);
    this._drawRoad(ctx, w, h, horizon, 1, DRAW_DISTANCE);
  }

  /** Draws the rear-view mirror: the road behind, as a mirror shows it. */
  renderMirror(ctx, w, h) {
    const horizon = h * 0.46;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#5f97d6');
    sky.addColorStop(1, '#cfe2f1');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = this._fog(COLORS.grass[0], FOG_STEPS - 4);
    ctx.fillRect(0, horizon, w, h - horizon);
    this._drawRoad(ctx, w, h, horizon, -1, MIRROR_DISTANCE);
  }

  _fog(hex, level) {
    const key = hex + level;
    let c = this._colorCache.get(key);
    if (!c) {
      const t = level / FOG_STEPS;
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      c = `rgb(${Math.round(lerp(r, FOG_RGB[0], t))},${Math.round(lerp(g, FOG_RGB[1], t))},${Math.round(lerp(b, FOG_RGB[2], t))})`;
      this._colorCache.set(key, c);
    }
    return c;
  }

  _drawBackdrop(ctx, w, h, horizon) {
    const bd = this._makeBackdrop(w, h, horizon);
    ctx.drawImage(bd.sky, 0, 0);
    const layer = (img, factor) => {
      const x = -mod(this.bgOffset * factor * w, img.width);
      ctx.drawImage(img, x, 0);
      if (x + img.width < w) ctx.drawImage(img, x + img.width, 0);
    };
    layer(bd.clouds, 0.25);
    layer(bd.far, 0.5);
    layer(bd.near, 1);
    ctx.fillStyle = this._fog(COLORS.grass[1], Math.round(FOG_STEPS * 0.55));
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  /** Sky, clouds and two layers of rolling hills, cached per canvas size. */
  _makeBackdrop(w, h, horizon) {
    const bd = this._backdrop;
    if (bd && bd.w === w && bd.h === h) return bd;
    const make = (cw, ch) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(cw));
      c.height = Math.max(1, Math.ceil(ch));
      return c;
    };
    const r = rng(7);
    const sky = make(w, horizon + 2);
    let g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#2f6fcf');
    grad.addColorStop(0.55, '#79aee6');
    grad.addColorStop(1, '#cfe2f1');
    g.fillStyle = grad;
    g.fillRect(0, 0, sky.width, sky.height);

    const tile = Math.ceil(w * 2);
    const clouds = make(tile, horizon);
    g = clouds.getContext('2d');
    for (let n = 0; n < 26; n += 1) {
      const cx = r() * tile;
      const cy = horizon * (0.08 + r() * 0.55);
      const rx = w * (0.04 + r() * 0.09);
      const ry = rx * (0.25 + r() * 0.2);
      [-tile, 0, tile].forEach((dx) => {
        for (let puff = 0; puff < 4; puff += 1) {
          const px = cx + dx + (puff - 1.5) * rx * 0.5;
          const py = cy + (r() - 0.5) * ry * 0.6;
          const cloud = g.createRadialGradient(px, py, 0, px, py, rx * 0.7);
          cloud.addColorStop(0, 'rgba(255,255,255,0.85)');
          cloud.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = cloud;
          g.beginPath();
          g.ellipse(px, py, rx * 0.7, ry * 1.2, 0, 0, Math.PI * 2);
          g.fill();
        }
      });
    }

    const hills = (height, color, top, waves) => {
      const c = make(tile, horizon + 2);
      const hg = c.getContext('2d');
      const phase = waves.map(() => r() * Math.PI * 2);
      const fill = hg.createLinearGradient(0, horizon - height, 0, horizon);
      fill.addColorStop(0, top);
      fill.addColorStop(1, color);
      hg.fillStyle = fill;
      hg.beginPath();
      hg.moveTo(0, horizon + 2);
      for (let x = 0; x <= tile; x += 4) {
        let y = 0;
        waves.forEach((k, i) => {
          y += Math.sin((x / tile) * Math.PI * 2 * k + phase[i]) / (i + 1);
        });
        hg.lineTo(x, horizon - height * (0.55 + y * 0.3));
      }
      hg.lineTo(tile, horizon + 2);
      hg.closePath();
      hg.fill();
      return c;
    };
    const far = hills(h * 0.09, '#8fb3a6', '#7d9fb0', [2, 5, 11]);
    const near = hills(h * 0.07, '#4f9132', '#78b04a', [3, 7, 13]);
    this._backdrop = {
      w, h, sky, clouds, far, near,
    };
    return this._backdrop;
  }

  /** Projects `distance` slices from the camera, front to back. */
  _project(w, horizon, dir, distance) {
    const segs = this.segments;
    const N = segs.length;
    const p = this.player;
    const base = Math.floor(p.z / SEGMENT) % N;
    const pct = (p.z % SEGMENT) / SEGMENT;
    const bseg = segs[base];
    const camY = lerp(bseg.y1, bseg.y2, pct) + EYE_HEIGHT;
    const camX = p.x * ROAD_HALF;
    const f = (DEPTH * w) / 2;
    const out = dir > 0 ? this._fwd : this._back;
    let x = 0;
    let dx = -bseg.curve * (dir > 0 ? pct : 1 - pct);
    for (let n = 0; n < distance; n += 1) {
      const seg = segs[dir > 0 ? (base + n) % N : (base - n + N) % N];
      const o = out[n];
      const zNear = n * SEGMENT - (dir > 0 ? pct : 1 - pct) * SEGMENT;
      o.seg = seg;
      o.visible = zNear > NEAR;
      if (o.visible) {
        const s1 = f / zNear;
        const s2 = f / (zNear + SEGMENT);
        const yNear = dir > 0 ? seg.y1 : seg.y2;
        const yFar = dir > 0 ? seg.y2 : seg.y1;
        o.x1 = w / 2 + s1 * (x - camX);
        o.y1 = horizon - s1 * (yNear - camY);
        o.w1 = s1 * ROAD_HALF;
        o.s1 = s1;
        o.x2 = w / 2 + s2 * (x + dx - camX);
        o.y2 = horizon - s2 * (yFar - camY);
        o.w2 = s2 * ROAD_HALF;
        o.s2 = s2;
      }
      x += dx;
      dx += seg.curve;
    }
    return { out, base };
  }

  _drawRoad(ctx, w, h, horizon, dir, distance) {
    const { out, base } = this._project(w, horizon, dir, distance);
    const N = this.segments.length;
    const L = this.length;
    const camZ = this.player.z;
    const carsAt = this._carsAt;
    for (let n = 0; n < distance; n += 1) carsAt[n].length = 0;
    this.vehicles.forEach((v) => {
      // Forward we see rear bumpers; in the mirror, front bumpers.
      const edge = mod(v.z - (dir * v.len) / 2, L);
      const d = dir > 0 ? mod(edge - camZ, L) : mod(camZ - edge, L);
      if (d < NEAR || d >= (distance - 1) * SEGMENT) return;
      const si = Math.floor(edge / SEGMENT);
      const n = dir > 0 ? mod(si - base, N) : mod(base - si, N);
      if (n >= distance) return;
      const frac = (edge % SEGMENT) / SEGMENT;
      carsAt[n].push({ v, t: dir > 0 ? frac : 1 - frac, d });
    });

    for (let n = distance - 1; n > 0; n -= 1) {
      const o = out[n];
      if (o.visible) {
        const fog = Math.min(
          FOG_STEPS - 1,
          Math.floor((1 - Math.exp(-((n / distance) ** 2) * FOG_DENSITY)) * FOG_STEPS),
        );
        if (o.y2 < o.y1 && o.y2 <= h) this._drawSlice(ctx, w, o, fog);
        const alpha = 1 - (fog / FOG_STEPS) * 0.8;
        o.seg.sprites.forEach((sp) => {
          const sx = o.x1 + o.w1 * sp.x;
          if (sx < -w * 0.5 || sx > w * 1.5) return;
          ctx.globalAlpha = alpha;
          this._drawSprite(ctx, sp, sx, o.y1, o.s1 * sp.s, dir > 0);
        });
        const cars = carsAt[n];
        if (cars.length) {
          cars.sort((a, b) => b.d - a.d);
          cars.forEach(({ v, t }) => {
            const k = lerp(o.s1, o.s2, t);
            const sx = lerp(o.x1, o.x2, t) + k * v.x * ROAD_HALF;
            const sy = lerp(o.y1, o.y2, t);
            ctx.globalAlpha = alpha;
            if (dir > 0) drawCarRear(ctx, v, sx, sy, k);
            else drawCarFront(ctx, v, sx, sy, k);
          });
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawSlice(ctx, w, o, fog) {
    const i = o.seg.index;
    const shade = Math.floor(i / 3) % 2;
    ctx.fillStyle = this._fog(COLORS.grass[Math.floor(i / 4) % 2], fog);
    ctx.fillRect(0, o.y2, w, o.y1 - o.y2 + 1);
    const quad = (color, off, half) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(o.x1 + o.w1 * (off - half), o.y1 + 0.5);
      ctx.lineTo(o.x2 + o.w2 * (off - half), o.y2);
      ctx.lineTo(o.x2 + o.w2 * (off + half), o.y2);
      ctx.lineTo(o.x1 + o.w1 * (off + half), o.y1 + 0.5);
      ctx.closePath();
      ctx.fill();
    };
    quad(this._fog(COLORS.shoulder[shade], fog), 0, 1.18);
    quad(this._fog(COLORS.asphalt[shade], fog), 0, 1);
    quad(this._fog(COLORS.yellow, fog), -0.955, 0.016);
    quad(this._fog(COLORS.white, fog), 0.955, 0.016);
    // 4 m dashes with 8 m gaps between the lanes.
    if (i % 6 < 2) {
      const white = this._fog(COLORS.white, fog);
      quad(white, -LANE_HALF, 0.013);
      quad(white, LANE_HALF, 0.013);
    }
  }

  // ------------------------------------------------------------ sprites
  // Sizes are in centimetres; k is pixels per centimetre at that distance.

  /** `front` is false in the mirror, which sees signs from behind. */
  _drawSprite(ctx, sp, x, y, k, front) {
    switch (sp.type) {
      case 'pine': {
        const H = 900 * k;
        if (H < 2) return;
        ctx.fillStyle = '#5b3a1e';
        ctx.fillRect(x - 20 * k, y - 160 * k, 40 * k, 160 * k);
        const tiers = [
          [0.15, 0.55, 260],
          [0.4, 0.78, 200],
          [0.62, 1, 140],
        ];
        tiers.forEach(([b, t, r]) => {
          ctx.fillStyle = '#1f5d2b';
          ctx.beginPath();
          ctx.moveTo(x - r * k, y - H * b);
          ctx.lineTo(x, y - H * t);
          ctx.lineTo(x + r * k, y - H * b);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2d7a3a';
          ctx.beginPath();
          ctx.moveTo(x, y - H * b);
          ctx.lineTo(x, y - H * t);
          ctx.lineTo(x + r * k, y - H * b);
          ctx.closePath();
          ctx.fill();
        });
        return;
      }
      case 'oak': {
        const H = 800 * k;
        if (H < 2) return;
        ctx.fillStyle = '#5e4128';
        ctx.fillRect(x - 25 * k, y - 330 * k, 50 * k, 330 * k);
        const blobs = [
          [-130, 520, 230, '#3c7a2c'],
          [130, 540, 220, '#3c7a2c'],
          [0, 640, 260, '#4a9136'],
          [60, 560, 170, '#58a43f'],
        ];
        blobs.forEach(([bx, by, br, c]) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x + bx * k, y - by * k, br * k, 0, Math.PI * 2);
          ctx.fill();
        });
        return;
      }
      case 'bush': {
        if (150 * k < 1.5) return;
        ctx.fillStyle = '#3d7d2c';
        ctx.beginPath();
        ctx.arc(x - 60 * k, y - 60 * k, 80 * k, 0, Math.PI * 2);
        ctx.arc(x + 50 * k, y - 70 * k, 90 * k, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'post': {
        if (110 * k < 2) return;
        ctx.fillStyle = '#f4f4f0';
        ctx.fillRect(x - 6 * k, y - 110 * k, 12 * k, 110 * k);
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 6 * k, y - 110 * k, 12 * k, 22 * k);
        ctx.fillStyle = '#f2a33a';
        ctx.fillRect(x - 4 * k, y - 84 * k, 8 * k, 10 * k);
        return;
      }
      case 'cone': {
        const H = 70 * k;
        if (H < 1.5) return;
        const W = 32 * k;
        ctx.fillStyle = '#ff6a00';
        ctx.beginPath();
        ctx.moveTo(x - W / 2, y);
        ctx.lineTo(x - W * 0.08, y - H);
        ctx.lineTo(x + W * 0.08, y - H);
        ctx.lineTo(x + W / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f6f6f6';
        ctx.beginPath();
        ctx.moveTo(x - W * 0.32, y - H * 0.38);
        ctx.lineTo(x - W * 0.22, y - H * 0.62);
        ctx.lineTo(x + W * 0.22, y - H * 0.62);
        ctx.lineTo(x + W * 0.32, y - H * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillRect(x - W * 0.62, y - H * 0.08, W * 1.24, H * 0.08);
        return;
      }
      case 'board': {
        const W = 240 * k;
        if (W < 3) return;
        const H = 150 * k;
        const top = y - 330 * k;
        ctx.fillStyle = '#ff7a00';
        ctx.fillRect(x - W * 0.3, y - 60 * k, W * 0.6, 60 * k);
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 6 * k, top + H, 12 * k, 330 * k - H - 60 * k);
        ctx.fillStyle = '#151515';
        ctx.fillRect(x - W / 2, top, W, H);
        ctx.fillStyle = '#ffb000';
        for (let c = 0; c < 3; c += 1) {
          const cx = x + sp.dir * (c - 1) * W * 0.24;
          const tip = cx + sp.dir * W * 0.1;
          const back = cx - sp.dir * W * 0.04;
          ctx.beginPath();
          ctx.moveTo(back, top + H * 0.18);
          ctx.lineTo(tip, top + H * 0.5);
          ctx.lineTo(back, top + H * 0.82);
          ctx.lineTo(back - sp.dir * W * 0.07, top + H * 0.82);
          ctx.lineTo(tip - sp.dir * W * 0.07, top + H * 0.5);
          ctx.lineTo(back - sp.dir * W * 0.07, top + H * 0.18);
          ctx.closePath();
          ctx.fill();
        }
        return;
      }
      case 'triangle': {
        const H = 50 * k;
        if (H < 1.5) return;
        ctx.strokeStyle = '#e0261b';
        ctx.lineWidth = Math.max(1, 9 * k);
        ctx.beginPath();
        ctx.moveTo(x - H * 0.55, y - 6 * k);
        ctx.lineTo(x, y - H);
        ctx.lineTo(x + H * 0.55, y - 6 * k);
        ctx.closePath();
        ctx.stroke();
        return;
      }
      case 'stalled':
        drawCarRear(ctx, sp.car, x, y, k);
        return;
      case 'billboard': {
        const W = 1200 * k;
        if (W < 3) return;
        const H = 420 * k;
        const top = y - 920 * k;
        // Two legs and a catwalk under a framed panel.
        ctx.fillStyle = '#4a4d52';
        ctx.fillRect(x - W * 0.3 - 20 * k, top + H, 40 * k, 500 * k);
        ctx.fillRect(x + W * 0.3 - 20 * k, top + H, 40 * k, 500 * k);
        ctx.fillRect(x - W * 0.48, top + H, W * 0.96, 18 * k);
        ctx.fillStyle = '#2f3237';
        ctx.fillRect(x - W / 2, top, W, H);
        if (!front) return;
        const pad = 22 * k;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - W / 2 + pad, top + pad, W - pad * 2, H - pad * 2);
        this._drawLogo(ctx, x, top + H / 2, W * 0.78);
        break;
      }
      default:
    }
  }

  /** The ServiceNow wordmark, centred on (cx, cy) and `width` pixels wide. */
  _drawLogo(ctx, cx, cy, width) {
    if (width < 12 || typeof Path2D === 'undefined') return;
    if (!this._logoPaths) {
      this._logoPaths = SERVICENOW_LOGO.paths.map(([d, fill]) => [new Path2D(d), fill]);
    }
    const s = width / SERVICENOW_LOGO.width;
    ctx.save();
    ctx.translate(cx - width / 2, cy - (SERVICENOW_LOGO.height * s) / 2);
    ctx.scale(s, s);
    this._logoPaths.forEach(([path, fill]) => {
      ctx.fillStyle = fill;
      ctx.fill(path, 'evenodd');
    });
    ctx.restore();
  }
}
