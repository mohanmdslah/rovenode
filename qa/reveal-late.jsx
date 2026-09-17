/**
 * Reveal-system check for elements that mount after the page reveal scan.
 *
 * Headless Chrome never fires a real IntersectionObserver here, so this fixture
 * installs a stub that reports every observed target as intersecting. The app's
 * own reveal code then runs unchanged and its bookkeeping can be asserted.
 */
import { installMockNodeSale } from "./mock-node-sale.js";

const observed = [];
class StubIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = new Set();
  }
  observe(target) {
    if (this.targets.has(target)) return;
    this.targets.add(target);
    observed.push(target);
    Promise.resolve().then(() => {
      if (!this.targets.has(target) || target.classList.contains("is-visible")) return;
      this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
    });
  }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
}
window.IntersectionObserver = StubIntersectionObserver;

const mock = installMockNodeSale({ bound: true, downlineCount: 23 });
mock.state.accounts = false;
window.ethereum = mock.provider;

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail: detail || "" });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (read, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = read();
    if (value) return value;
    await wait(50);
  }
  return null;
};
const state = (selector) => {
  const element = document.querySelector(selector);
  return element ? { revealed: element.classList.contains("is-visible"), classes: [...element.classList].join(" ") } : null;
};

async function main() {
  await import("../src/main.jsx");
  await waitFor(() => document.querySelector(".app-shell.is-ready"), 12000);
  const initial = [...document.querySelectorAll("[data-reveal]")];
  record("the reveal scan runs at page ready", observed.length > 0, `observed=${observed.length} of ${initial.length}`);
  record("existing reveal targets are revealed", initial.every((element) => element.classList.contains("is-visible")),
    `revealed ${initial.filter((element) => element.classList.contains("is-visible")).length}/${initial.length}`);

  // Swap the console in AFTER the scan, which is what used to leave it hidden.
  mock.state.accounts = true;
  (await waitFor(() => document.querySelector(".wallet-button"), 8000))?.click();
  const consoleEl = await waitFor(() => document.querySelector(".referral-console"), 12000);
  record("connecting after the scan mounts the console", Boolean(consoleEl));
  const swapped = document.querySelector('.referral-body[data-reveal], .referral-console[data-reveal], .referral-connect[data-reveal]');
  record("the console's reveal target stayed revealed across the swap",
    Boolean(swapped) && swapped.classList.contains("is-visible"),
    `${swapped?.className} reveal=${swapped?.getAttribute("data-reveal")} revealed=${swapped?.classList.contains("is-visible")}`);

  // The systemic half: any [data-reveal] added later must join the observer.
  const before = observed.length;
  const late = document.createElement("div");
  late.setAttribute("data-reveal", "item");
  late.style.cssText = "height:120px";
  document.querySelector(".referral-section").appendChild(late);
  const lateRevealed = await waitFor(() => (late.classList.contains("is-visible") ? true : null), 5000);
  record("a [data-reveal] element mounted after the scan is observed", observed.length > before, `observed ${before} -> ${observed.length}`);
  record("that late element gets revealed", Boolean(lateRevealed), JSON.stringify(state(".referral-section > div:last-child")));
  late.remove();

  // A fresh swap (disconnect then reconnect) must still be revealed.
  (await waitFor(() => document.querySelector(".disconnect-wallet-button"), 6000))?.click();
  await waitFor(() => document.querySelector(".referral-connect"), 8000);
  mock.state.accounts = true;
  (await waitFor(() => document.querySelector(".wallet-button"), 8000))?.click();
  await waitFor(() => document.querySelector(".referral-console"), 12000);
  record("a second swap is still revealed", state(".referral-body")?.revealed === true, JSON.stringify(state(".referral-body")));
  record("no reveal target is left hidden", [...document.querySelectorAll("[data-reveal]")].every((element) => element.classList.contains("is-visible")),
    `${[...document.querySelectorAll("[data-reveal]")].filter((element) => !element.classList.contains("is-visible")).length} hidden`);
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => { document.getElementById("qa-result").textContent = JSON.stringify(results, null, 1); });
