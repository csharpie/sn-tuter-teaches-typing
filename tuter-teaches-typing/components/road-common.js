/**
 * Units, road geometry and small math helpers shared by the road trip
 * simulation (road-sim.js) and its vehicles (road-vehicle.js). World units are
 * centimetres; lateral positions are fractions of the road's half-width.
 */
export const ROAD_HALF = 540;
export const LANES = [-2 / 3, 0, 2 / 3];
export const LANE_HALF = 1 / 3;
export const KMH = 100000 / 3600;

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (v, m) => ((v % m) + m) % m;
export const easeIn = (a, b, t) => a + (b - a) * t * t;
export const easeOut = (a, b, t) => a + (b - a) * (1 - (1 - t) * (1 - t));
export const easeInOut = (a, b, t) => a + (b - a) * (0.5 - Math.cos(t * Math.PI) / 2);
