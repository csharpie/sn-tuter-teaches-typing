/**
 * The vehicles of the road trip (road-sim.js): their sizes and the driver every
 * one of them uses, the player's included. An Intelligent Driver Model sets
 * the speed; lane changes go only into gaps that are clear ahead and behind.
 */
import {
  ROAD_HALF, LANES, KMH, clamp, mod,
} from './road-common.js';

// Driver model
const S0 = 250;
const HEADWAY = 1.1;
const COMFORT = 450;
const HARD_BRAKE = 1100;
const HARD_GAP = 120;
const LC_MARGIN = 8 * KMH;
const LC_COOLDOWN = 3;
export const LAT_MAX = 0.42;

export const KINDS = {
  car: {
    halfW: 90 / ROAD_HALF, len: 450, height: 145, accel: 350,
  },
  taxi: {
    halfW: 90 / ROAD_HALF, len: 470, height: 150, accel: 350,
  },
  police: {
    halfW: 92 / ROAD_HALF, len: 500, height: 150, accel: 380,
  },
  limo: {
    halfW: 95 / ROAD_HALF, len: 850, height: 148, accel: 260,
  },
  suv: {
    halfW: 98 / ROAD_HALF, len: 490, height: 178, accel: 320,
  },
  pickup: {
    halfW: 102 / ROAD_HALF, len: 580, height: 190, accel: 300,
  },
  van: {
    halfW: 100 / ROAD_HALF, len: 520, height: 210, accel: 300,
  },
  ambulance: {
    halfW: 110 / ROAD_HALF, len: 680, height: 275, accel: 280,
  },
  motorcycle: {
    halfW: 45 / ROAD_HALF, len: 220, height: 150, accel: 450,
  },
  schoolbus: {
    halfW: 122 / ROAD_HALF, len: 1100, height: 320, accel: 220,
  },
  firetruck: {
    halfW: 125 / ROAD_HALF, len: 1000, height: 330, accel: 230,
  },
  truck: {
    halfW: 125 / ROAD_HALF, len: 1100, height: 380, accel: 220,
  },
  coach: {
    halfW: 128 / ROAD_HALF, len: 1350, height: 360, accel: 220,
  },
  player: {
    halfW: 90 / ROAD_HALF, len: 450, height: 145, accel: 650,
  },
};

/**
 * One vehicle, the player's included. It steers, changes lanes and sets its
 * speed itself; the RoadTrip it drives on answers what is ahead and whether a
 * lane is safe.
 */
export default class Vehicle {
  constructor({
    kind, lane, z, v0, color, think,
  }) {
    const k = KINDS[kind];
    this.kind = kind;
    this.lane = lane;
    this.target = lane;
    this.home = lane;
    this.x = LANES[lane];
    this.z = z;
    this.speed = v0;
    this.v0 = v0;
    this.latV = 0;
    this.halfW = k.halfW;
    this.len = k.len;
    this.height = k.height;
    this.accel = k.accel;
    this.color = color;
    this.braking = false;
    this.brakeHold = 0;
    this.cool = 0;
    this.think = think;
    this.lo = 0;
    this.hi = 0;
  }

  /** Sets the lateral band it occupies, including the lane it is moving into. */
  range() {
    const tx = LANES[this.target];
    this.lo = Math.min(this.x, tx) - this.halfW;
    this.hi = Math.max(this.x, tx) + this.halfW;
  }

  steer(dt, road) {
    this.cool = Math.max(0, this.cool - dt);
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25;
      if (this.cool === 0 && this.lane === this.target) this.chooseLane(road);
    }
    const diff = LANES[this.target] - this.x;
    this.latV = clamp(diff * 2.5, -LAT_MAX, LAT_MAX);
    const step = this.latV * dt;
    this.x = Math.abs(step) >= Math.abs(diff) ? LANES[this.target] : this.x + step;
    if (this.target !== this.lane && Math.abs(LANES[this.target] - this.x) < 0.004) {
      this.x = LANES[this.target];
      this.lane = this.target;
      this.latV = 0;
      this.cool = LC_COOLDOWN;
    }
  }

  /** Intelligent Driver Model towards v0, behind `lead` ({gap, speed} or null). */
  throttle(dt, lead) {
    const s = this.speed;
    const { v0 } = this;
    const a = this.accel;
    let free;
    if (v0 < 1) free = s > 0 ? -Math.min(COMFORT, s * 1.2 + 50) : 0;
    else if (s <= v0) free = a * (1 - (s / v0) ** 4);
    else free = -Math.min(COMFORT, (s - v0) * 1.2);
    let interaction = 0;
    if (lead) {
      const closing = (s * (s - lead.speed)) / (2 * Math.sqrt(a * COMFORT));
      const want = S0 + Math.max(0, s * HEADWAY + closing);
      interaction = -a * (want / Math.max(lead.gap, 1)) ** 2;
    }
    const acc = clamp(free + interaction, -HARD_BRAKE, a);
    let next = Math.max(0, s + acc * dt);
    // Backstop: never close to less than HARD_GAP from whatever is ahead.
    if (lead && next * dt > lead.gap - HARD_GAP) {
      next = Math.max(0, (lead.gap - HARD_GAP) / dt);
    }
    // Brake lights stay on briefly so they never flicker frame to frame.
    this.brakeHold = acc < -150 ? 0.6 : Math.max(0, this.brakeHold - dt);
    this.braking = this.brakeHold > 0 || (v0 < 1 && s > 1);
    this.speed = next;
  }

  advance(dt, length) {
    this.z = mod(this.z + this.speed * dt, length);
  }

  chooseLane(road) {
    if (this.v0 < 1) return;
    const here = road.laneScore(this, this.lane);
    let best = -1;
    let bestScore = here;
    [this.lane - 1, this.lane + 1]
      .filter((k) => k >= 0 && k <= 2)
      .forEach((k) => {
        const score = road.laneScore(this, k);
        // Overtake into a faster lane, or drift back home once it is as good.
        const faster = here < this.v0 - LC_MARGIN && score > bestScore + LC_MARGIN;
        const home = best < 0
          && Math.abs(k - this.home) < Math.abs(this.lane - this.home)
          && score >= here - 1;
        if ((faster || home) && road.laneSafe(this, k)) {
          best = k;
          bestScore = Math.max(score, bestScore);
        }
      });
    if (best >= 0) {
      this.target = best;
      this.lo = Math.min(this.lo, LANES[best] - this.halfW);
      this.hi = Math.max(this.hi, LANES[best] + this.halfW);
    }
  }
}
