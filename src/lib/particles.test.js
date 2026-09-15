import test from "node:test";
import assert from "node:assert/strict";
import { getParticleCount, getParticleOpacity } from "./particles.js";

test("particle count stays low on desktop and mobile", () => {
  assert.equal(getParticleCount(1440), 30);
  assert.equal(getParticleCount(390), 16);
});

test("particle rendering is disabled for reduced motion and data saver", () => {
  assert.equal(getParticleCount(1440, { reducedMotion: true }), 0);
  assert.equal(getParticleCount(1440, { saveData: true }), 0);
});

test("particles fade at the bottom and top of the hero", () => {
  assert.equal(getParticleOpacity(900, 900), 0);
  assert.equal(getParticleOpacity(0, 900), 0);
  assert.ok(getParticleOpacity(450, 900) > 0.9);
});
