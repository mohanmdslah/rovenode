import test from "node:test";
import assert from "node:assert/strict";
import { getNextLocaleIndex, localeOptions } from "./locale-menu.js";

test("locale menu exposes the localized ROVE languages with flag codes", () => {
  assert.deepEqual(localeOptions.map(({ id }) => id), ["zh-CN", "en", "ko", "ja", "vi"]);
  assert.equal(new Set(localeOptions.map(({ flag }) => flag)).size, 5);
  assert.equal(localeOptions.find(({ id }) => id === "zh-CN").flag, "cn");
});

test("locale menu keyboard navigation wraps in both directions", () => {
  assert.equal(getNextLocaleIndex(4, "ArrowDown"), 0);
  assert.equal(getNextLocaleIndex(0, "ArrowUp"), 4);
  assert.equal(getNextLocaleIndex(3, "Home"), 0);
  assert.equal(getNextLocaleIndex(0, "End"), 4);
});

test("unsupported keys preserve the current locale index", () => {
  assert.equal(getNextLocaleIndex(1, "Enter"), 1);
});
