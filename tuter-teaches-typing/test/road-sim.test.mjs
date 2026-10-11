// Checks for the driving view's highway simulation (components/road-sim.js):
// whatever the player types, no vehicle ever touches another vehicle or a
// lane closure, everyone stays on the road, and the player's car keeps
// overtaking slower traffic instead of getting stuck.
//
// Run with: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoadTrip, MAX_SPEED, speedForWpm } from '../components/road-sim.js';

const DT = 1 / 30;
const STEPS = 30 * 240; // four minutes of driving

const mod = (v, m) => ((v % m) + m) % m;

function overlapsZ(a0, a1, b0, b1, L) {
  // Intervals on a loop of length L, each shorter than L / 2.
  const d = mod(b0 - a0, L);
  return d < a1 - a0 || d > L - (b1 - b0);
}

function assertSafe(sim, step) {
  const L = sim.length;
  const { all } = sim;
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i];
    assert.ok(
      Math.abs(a.x) + a.halfW <= 1,
      `vehicle ${i} left the road at step ${step} (x=${a.x})`,
    );
    for (let j = i + 1; j < all.length; j += 1) {
      const b = all[j];
      if (Math.abs(a.x - b.x) < a.halfW + b.halfW) {
        const touching = overlapsZ(
          a.z - a.len / 2,
          a.z + a.len / 2,
          b.z - b.len / 2,
          b.z + b.len / 2,
          L,
        );
        assert.ok(!touching, `vehicles ${i} and ${j} collided at step ${step}`);
      }
    }
    sim.obstacles.forEach((o) => {
      if (a.x + a.halfW > o.xMin && a.x - a.halfW < o.xMax) {
        const hit = overlapsZ(a.z - a.len / 2, a.z + a.len / 2, o.z0, o.z1, L);
        assert.ok(!hit, `vehicle ${i} drove into a lane closure at step ${step}`);
      }
    });
  }
}

// Typing that speeds up, slows down, pauses and bursts, like a real player.
function typingSpeed(step) {
  const phase = Math.floor(step / 90) % 9;
  return [0, 25, 40, 40, 70, 15, 95, 0, 55][phase];
}

[1, 42, 2024].forEach((seed) => {
  test(`seed ${seed}: nothing ever collides and the player keeps driving`, () => {
    const sim = new RoadTrip(seed);
    let laneChanges = 0;
    let lastLane = sim.player.lane;
    for (let step = 0; step < STEPS; step += 1) {
      sim.update(DT, speedForWpm(typingSpeed(step)));
      if (step % 3 === 0) assertSafe(sim, step);
      if (sim.player.lane !== lastLane) {
        laneChanges += 1;
        lastLane = sim.player.lane;
      }
    }
    // About 40 WPM on average for four minutes is roughly 3 km.
    assert.ok(sim.distance > 150000, `player only drove ${Math.round(sim.distance / 100)} m`);
    assert.ok(laneChanges > 0, 'the player never changed lanes to get past anything');
  });
});

test('typing speed maps to a cruising speed that grows with WPM', () => {
  assert.equal(speedForWpm(0), 0);
  assert.ok(speedForWpm(20) < speedForWpm(40));
  assert.ok(speedForWpm(40) < speedForWpm(80));
  assert.equal(speedForWpm(500), MAX_SPEED);
});

test('the car rolls to a stop when the player stops typing', () => {
  const sim = new RoadTrip(7);
  for (let step = 0; step < 30 * 10; step += 1) sim.update(DT, speedForWpm(60));
  assert.ok(sim.player.speed > 0);
  for (let step = 0; step < 30 * 15; step += 1) sim.update(DT, 0);
  assert.equal(sim.player.speed, 0);
});
