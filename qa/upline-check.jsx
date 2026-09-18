/**
 * v2.2.0 removed the "upline must own a node" rule. This proves end to end that
 * an upline who joined the network but never bought a node is now accepted,
 * while an address that never joined is still refused before any wallet prompt.
 */
import { getAddress } from "ethers";
import { installMockNodeSale } from "./mock-node-sale.js";

const mock = installMockNodeSale({ bound: false, downlineCount: 6 });
// The first generated downline has level 0, i.e. it joined but owns no node.
const JOINED_BUT_NOT_A_NODE = getAddress("0x0000000000000000000000000000000000000001");
const NEVER_JOINED = getAddress("0x9999999999999999999999999999999999999999");

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
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function main() {
  await import("../src/main.jsx");
  await waitFor(() => document.querySelector(".app-shell.is-ready"), 12000);

  const input = await waitFor(() => document.querySelector(".node-bind-row input"), 10000);
  const submit = () => document.querySelector(".node-bind-submit");
  const status = () => document.querySelector(".node-bind-status")?.textContent?.trim().replace(/\s+/g, " ") ?? "";
  record("the mock confirms the upline joined but owns no node",
    mock.state.downlines[0].level === 0, `level=${mock.state.downlines[0].level}`);

  // 1) An address that never joined is still refused, without a wallet prompt.
  typeInto(input, NEVER_JOINED);
  await waitFor(() => (submit() && !submit().disabled ? true : null), 5000);
  submit()?.click();
  const refused = await waitFor(() => (/尚未入网/.test(status()) ? true : null), 10000);
  record("an upline that never joined is refused", Boolean(refused), status().slice(0, 70));
  record("no transaction is sent for it", !mock.sent.includes("bindUpline"), `sent: ${mock.sent.join(", ") || "none"}`);

  // 2) A member who never bought a node is accepted (the v2.2.0 behaviour).
  typeInto(input, JOINED_BUT_NOT_A_NODE);
  await waitFor(() => (submit() && !submit().disabled ? true : null), 5000);
  submit()?.click();
  const bound = await waitFor(() => (document.querySelector(".node-bind-step.is-bound") ? true : null), 15000);
  record("a joined upline that owns no node is accepted", Boolean(bound), status().slice(0, 70) || document.querySelector(".node-bind-status")?.textContent?.trim());
  record("the binding transaction was sent", mock.sent.includes("bindUpline"), `sent: ${mock.sent.join(", ") || "none"}`);
  record("the bound upline is the non-node address", mock.state.upline === JOINED_BUT_NOT_A_NODE, mock.state.upline);
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => { document.getElementById("qa-result").textContent = JSON.stringify(results, null, 1); });
