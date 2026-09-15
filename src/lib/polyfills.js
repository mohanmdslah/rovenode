/**
 * Runtime shims for the WebViews this page must run in.
 *
 * Huawei phones still in circulation run Chromium 69-79 based browsers
 * (EMUI 9/10 Huawei Browser, wallet in-app WebViews). The bundler lowers the
 * *syntax* so those engines can parse the bundle, but it cannot add runtime
 * APIs. A single missing API throws during boot - `Promise.allSettled` in the
 * page loader, `queueMicrotask` in React, `globalThis` in the wallet module -
 * and because the failure happens before React mounts, the page goes blank or
 * dead with no visible error.
 *
 * Import this before anything else in the entry module.
 */
const root = typeof globalThis !== "undefined"
  ? globalThis
  : typeof window !== "undefined"
    ? window
    : typeof self !== "undefined"
      ? self
      : {};

if (typeof root.globalThis === "undefined") {
  try { root.globalThis = root; } catch { /* frozen global object */ }
}

if (typeof root.queueMicrotask !== "function") {
  root.queueMicrotask = (callback) => { Promise.resolve().then(() => callback()); };
}

if (typeof Promise.allSettled !== "function") {
  // eslint-disable-next-line no-extend-native
  Promise.allSettled = (iterable) => Promise.all(
    Array.from(iterable ?? []).map((item) => Promise.resolve(item).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),
    )),
  );
}

if (typeof Promise.prototype.finally !== "function") {
  // eslint-disable-next-line no-extend-native
  Promise.prototype.finally = function finallyShim(onSettled) {
    const run = typeof onSettled === "function" ? onSettled : () => undefined;
    return this.then(
      (value) => Promise.resolve(run()).then(() => value),
      (reason) => Promise.resolve(run()).then(() => { throw reason; }),
    );
  };
}

if (typeof Object.fromEntries !== "function") {
  Object.fromEntries = (entries) => {
    const result = {};
    for (const [key, value] of entries ?? []) result[key] = value;
    return result;
  };
}

if (typeof Array.prototype.flat !== "function") {
  // eslint-disable-next-line no-extend-native
  Array.prototype.flat = function flatShim(depth = 1) {
    return this.reduce((acc, value) => acc.concat(
      depth > 0 && Array.isArray(value) ? value.flat(depth - 1) : value,
    ), []);
  };
}

if (typeof Array.prototype.flatMap !== "function") {
  // eslint-disable-next-line no-extend-native
  Array.prototype.flatMap = function flatMapShim(callback, thisArg) {
    return this.map(callback, thisArg).flat(1);
  };
}
