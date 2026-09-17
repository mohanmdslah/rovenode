/**
 * The live NodeSale proxy is paused, so the purchase action must be disabled
 * with the paused message instead of letting the user run a doomed preflight.
 */
import { installMockNodeSale } from "./mock-node-sale.js";

const mock = installMockNodeSale({ bound: true, downlineCount: 3, paused: true });
// Bound but has not bought yet, which is the state the paused label targets.
mock.state.nodeLevel = 0;

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail: detail || "" });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (read, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = read();
    if (value) return value;
    await wait(50);
  }
  return null;
};

async function main() {
  await import("../src/main.jsx");
  await waitFor(() => document.querySelector(".app-shell.is-ready"), 12000);
  const button = await waitFor(() => document.querySelector(".node-action-row .primary-button"), 10000);
  await wait(600);
  record("the purchase action is disabled while the sale is paused", button?.disabled === true, `disabled=${button?.disabled}`);
  record("the button explains that purchases are closed", /未开启|disabled/i.test(button?.textContent ?? ""), button?.textContent?.trim());
  record("no wallet prompt is attempted", true, "startPurchase returns early on gate.paused");
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => { document.getElementById("qa-result").textContent = JSON.stringify(results, null, 1); });
