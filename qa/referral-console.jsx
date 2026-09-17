/**
 * End-to-end check of the referral work against the shared v2 NodeSale mock.
 * Run from qa/referral-console.html.
 */
import { getAddress } from "ethers";
import { REFERRAL_ROOT_ADDRESS } from "../src/lib/network.js";
import { installMockNodeSale } from "./mock-node-sale.js";

const mock = installMockNodeSale({ bound: false, downlineCount: 23 });
const sent = mock.sent;
const NON_NODE = getAddress("0x9999999999999999999999999999999999999999");

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

/** React owns the input value, so drive it through the native setter. */
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function main() {
  await import("../src/main.jsx");

  record("app boots", Boolean(await waitFor(() => document.querySelector(".app-shell.is-ready"), 10000)));
  record("referral nav anchor exists", Boolean(document.querySelector("#network.referral-section")));

  // ── purchase gate ──────────────────────────────────────────────────────
  const bindStep = await waitFor(() => document.querySelector(".node-bind-step"));
  record("the bind step is shown to an unregistered wallet", Boolean(bindStep));
  record("the bind step is not marked as bound", bindStep?.classList.contains("is-bound") === false, [...(bindStep?.classList ?? [])].join(" "));

  const submitDisabled = document.querySelector(".node-bind-submit")?.disabled;
  record("the bind button starts disabled until an address is present", submitDisabled === true, `disabled=${submitDisabled}`);
  record("the removed root shortcut is gone", !document.querySelector(".node-bind-root"));

  const bindNote = document.querySelector(".node-bind-note")?.textContent ?? "";
  record("the bind note no longer invites users to use the root address", !/没有推荐人/.test(bindNote),
    bindNote.trim().replace(/\s+/g, " ").slice(0, 90));
  record("the bind note still states the two binding constraints", /必须先完成购买/.test(bindNote) && /两笔独立交易/.test(bindNote),
    bindNote.trim().replace(/\s+/g, " ").slice(0, 90));

  const bindRow = document.querySelector(".node-bind-row");
  const bindColumns = bindRow ? getComputedStyle(bindRow).gridTemplateColumns.split(" ").length : 0;
  if (window.innerWidth <= 560) {
    record("the bind row stacks on a phone", bindColumns === 1, bindRow ? getComputedStyle(bindRow).gridTemplateColumns : "not rendered");
    const offer = document.querySelector(".node-offer");
    record("the purchase panel fits the phone width", offer.scrollWidth <= offer.clientWidth + 1, `scrollWidth=${offer.scrollWidth} clientWidth=${offer.clientWidth}`);
  } else {
    record("the bind row is just the field and the submit button", bindColumns === 2, `columns=${bindColumns}: ${bindRow ? getComputedStyle(bindRow).gridTemplateColumns : "not rendered"}`);
  }
  const metrics = [...document.querySelectorAll(".referral-metric")];
  record("the summary strip has three cells and no network total", metrics.length === 3 && !/全网已注册/.test(document.querySelector(".referral-metrics")?.textContent ?? ""),
    `cells=${metrics.length} · ${metrics.map((cell) => cell.querySelector(".referral-metric-label")?.textContent).join(" / ")}`);

  const purchaseButton = document.querySelector(".node-action-row .primary-button");
  record("purchase is locked before binding", purchaseButton?.disabled === true, `disabled=${purchaseButton?.disabled}, label="${purchaseButton?.textContent?.trim()}"`);
  record("the locked label tells the user to bind first", String(purchaseButton?.textContent ?? "").includes("绑定上级"), purchaseButton?.textContent?.trim());

  // ── console before binding ─────────────────────────────────────────────
  const uplineCard = document.querySelector(".referral-metric-upline");
  record("the console renders the upline cell", Boolean(uplineCard));
  record("no upline is shown before binding", /尚未绑定上级/.test(uplineCard?.textContent ?? ""), uplineCard?.textContent?.trim().slice(0, 60));

  const downline = document.querySelector(".referral-downline");
  const rowCount = () => downline?.querySelectorAll(".referral-record").length ?? 0;
  await waitFor(() => /入网后/.test(downline?.textContent ?? ""));
  record("an unregistered wallet is told to bind before downlines appear", /入网后/.test(downline?.textContent ?? ""), downline?.textContent?.trim().replace(/\s+/g, " ").slice(0, 70));
  record("an unregistered wallet has no rows", rowCount() === 0, `rows=${rowCount()}`);

  // ── v2: the upline must already own a node ─────────────────────────────
  const input = document.querySelector(".node-bind-row input");
  typeInto(input, NON_NODE);
  const submit = await waitFor(() => {
    const button = document.querySelector(".node-bind-submit");
    return button && !button.disabled ? button : null;
  }, 5000);
  record("the bind button enables once an address is present", Boolean(submit));
  submit?.click();
  const refused = await waitFor(() => (/还不是节点/.test(document.querySelector(".node-bind-status")?.textContent ?? "") ? true : null), 10000);
  record("an upline that owns no node is refused with the v2 message", Boolean(refused), document.querySelector(".node-bind-status")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80));
  record("no transaction is sent for a refused binding", !sent.includes("bindUpline"), `sent: ${sent.join(", ") || "none"}`);

  // ── binding to ROOT is allowed even though ROOT owns no node ───────────
  // The root address is typed by hand; the field still holds the rejected one.
  typeInto(input, REFERRAL_ROOT_ADDRESS);
  const filled = await waitFor(() => (input?.value?.toLowerCase() === REFERRAL_ROOT_ADDRESS.toLowerCase() ? input.value : null), 5000);
  record("the root address can be entered by hand", filled?.toLowerCase() === REFERRAL_ROOT_ADDRESS.toLowerCase(), filled);

  document.querySelector(".node-bind-submit")?.click();
  const boundStep = await waitFor(() => document.querySelector(".node-bind-step.is-bound"), 15000);
  record("binding ROOT succeeds although ROOT owns no node", Boolean(boundStep),
    `bind status: "${document.querySelector(".node-bind-status")?.textContent?.trim() ?? "(none)"}"`);
  record("binding was submitted to the contract", sent.includes("bindUpline"), `sent: ${sent.join(", ") || "none"}`);
  record("the purchase button unlocks after binding", document.querySelector(".node-action-row .primary-button")?.disabled === false);

  // Derive the expected masked prefix from the configured root so this keeps
  // working when the deployment changes the root address.
  const rootPrefix = REFERRAL_ROOT_ADDRESS.slice(0, 6);
  const uplineAfter = await waitFor(() => {
    const text = document.querySelector(".referral-metric-upline")?.textContent ?? "";
    return text.includes(rootPrefix) ? text : null;
  }, 10000);
  record("the console refreshes to show the new upline", Boolean(uplineAfter), (uplineAfter ?? "").trim().replace(/\s+/g, " ").slice(0, 80));

  record("no horizontal overflow at this viewport",
    document.documentElement.scrollWidth <= window.innerWidth + 1,
    `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`);

  // ── console pagination now that the wallet is registered ───────────────
  await waitFor(() => rowCount() > 0);
  record("the downline total comes from the contract", /23/.test(downline?.textContent ?? ""), `rows on page 1: ${rowCount()}`);
  record("page one shows ten rows", rowCount() === 10, `rows=${rowCount()}`);
  record("the pager reports three pages", /1 \/ 3/.test(downline?.textContent ?? ""), downline?.querySelector(".referral-pager")?.textContent?.trim());
  const levelTags = [...(downline?.querySelectorAll(".referral-record .referral-level") ?? [])].map((node) => node.textContent.trim());
  record("each downline carries a node identity", levelTags.length === 10 && levelTags.some((tag) => /^L[1-3]$/.test(tag)) && levelTags.some((tag) => tag === "未成为节点"), levelTags.join(", "));

  if (window.innerWidth <= 560) {
    const list = document.querySelector(".referral-list");
    const columns = list ? getComputedStyle(list).gridTemplateColumns.split(" ").length : 0;
    record("the record list is a single column on a phone", columns === 1, `columns=${columns}`);
  }

  downline.querySelectorAll(".referral-pager button")[1].click();
  await waitFor(() => /2 \/ 3/.test(downline?.textContent ?? ""));
  record("the second page loads the next ten rows", rowCount() === 10, `page 2 rows=${rowCount()}`);
  downline.querySelectorAll(".referral-pager button")[1].click();
  await waitFor(() => /3 \/ 3/.test(downline?.textContent ?? ""));
  record("the last page holds the remainder", rowCount() === 3, `page 3 rows=${rowCount()}`);
  record("next is disabled on the last page", downline.querySelectorAll(".referral-pager button")[1]?.disabled === true);
  downline.querySelectorAll(".referral-pager button")[0].click();
  await waitFor(() => /2 \/ 3/.test(downline?.textContent ?? ""));
  record("previous returns to the earlier page", rowCount() === 10, `back to page 2 rows=${rowCount()}`);
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => {
    document.getElementById("qa-result").textContent = JSON.stringify({ results, calls: [...new Set(mock.calls)], errors: mock.errors });
  });
