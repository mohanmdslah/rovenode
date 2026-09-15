import test from "node:test";
import assert from "node:assert/strict";
import { getHeroParallax } from "./hero-motion.js";

test("hero parallax stays centered at the viewport midpoint", () => {
  assert.deepEqual(getHeroParallax(720, 450, 1440, 900), { x: 0, y: 0 });
});

test("hero parallax is clamped to subtle compositor-safe movement", () => {
  assert.deepEqual(getHeroParallax(0, 0, 1440, 900), { x: -10, y: -6 });
  assert.deepEqual(getHeroParallax(1440, 900, 1440, 900), { x: 10, y: 6 });
  assert.deepEqual(getHeroParallax(4000, -200, 1440, 900), { x: 10, y: -6 });
});

test("hero parallax returns a neutral position for invalid viewports", () => {
  assert.deepEqual(getHeroParallax(20, 30, 0, 900), { x: 0, y: 0 });
  assert.deepEqual(getHeroParallax(20, 30, 1440, 0), { x: 0, y: 0 });
});
