/**
 * End-to-end check of the referral work against a mocked NodeSale contract.
 *
 * The app talks to the contract through the injected EIP-1193 provider, so this
 * fixture implements `eth_call`/`eth_sendTransaction` with ethers' own ABI coder
 * and the deployed contract's real interface. That exercises the actual ABI,
 * encoding and page maths instead of a hand-written stub.
 */
import { Interface, getAddress } from "ethers";
import { REFERRAL_ABI } from "../src/lib/referral.js";
import { NODE_SALE_ADDRESS, REFERRAL_ROOT_ADDRESS } from "../src/lib/network.js";

const SALE_ABI = [
  ...REFERRAL_ABI,
  "function getNodeLevel(address account) view returns (uint8)",
  "function getTierConfig(uint8 tier) view returns (uint256 priceUsdt, uint256 priceRaw, uint256 maxSupply, uint256 sold)",
  "function buyNode(uint8 tier)",
];
const USDT_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const sale = new Interface(SALE_ABI);
const usdt = new Interface(USDT_ABI);
const ACCOUNT = getAddress("0x1234567890abcdef1234567890abcdef12345678");
const ROOT = getAddress(REFERRAL_ROOT_ADDRESS);
const DOWNLINE_COUNT = 23;
const DOWNLINES = Array.from({ length: DOWNLINE_COUNT }, (_, index) => ({
  address: getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
  level: index % 4, // 0..3 so "not a node yet" and L1-L3 both appear
}));

let bound = false;
let uplineAddress = "0x0000000000000000000000000000000000000000";
let uplineLevel = 0;
let nodeLevel = 0;
const sent = [];
const calls = [];
const trace = [];
const errors = [];

const ok = (result) => Promise.resolve(result);
const blockNumber = "0x64";

function receiptFor(hash, target) {
  const event = sale.encodeEventLog(sale.getEvent("UplineBound"), [ACCOUNT, target]);
  return {
    transactionHash: hash,
    transactionIndex: "0x0",
    blockHash: `0x${"b".repeat(64)}`,
    blockNumber,
    from: ACCOUNT,
    to: NODE_SALE_ADDRESS,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    contractAddress: null,
    status: "0x1",
    type: "0x2",
    effectiveGasPrice: "0x1",
    logsBloom: `0x${"0".repeat(512)}`,
    logs: [{
      address: NODE_SALE_ADDRESS,
      topics: event.topics,
      data: event.data,
      blockNumber,
      blockHash: `0x${"b".repeat(64)}`,
      transactionHash: hash,
      transactionIndex: "0x0",
      logIndex: "0x0",
      removed: false,
    }],
  };
}

function readSale(to, data) {
  const parsed = sale.parseTransaction({ data });
  if (!parsed) throw new Error(`unknown selector ${data.slice(0, 10)}`);
  const { name, args } = parsed;
  calls.push(name);
  switch (name) {
    case "paused": return sale.encodeFunctionResult(name, [false]);
    case "root": return sale.encodeFunctionResult(name, [ROOT]);
    case "registeredCount": return sale.encodeFunctionResult(name, [BigInt(bound ? 2 : 1)]);
    case "isRegistered": {
      const account = getAddress(args[0]);
      const registered = account === ROOT || (account === ACCOUNT && bound);
      return sale.encodeFunctionResult(name, [registered]);
    }
    case "getUpline":
      return sale.encodeFunctionResult(name, bound ? [uplineAddress, uplineLevel] : ["0x0000000000000000000000000000000000000000", 0]);
    case "getDirectDownlineCount":
      return sale.encodeFunctionResult(name, [BigInt(bound ? DOWNLINE_COUNT : 0)]);
    case "getDirectDownlines": {
      const offset = Number(args[1]);
      const limit = Number(args[2]);
      const slice = DOWNLINES.slice(offset, offset + limit);
      return sale.encodeFunctionResult(name, [slice.map((row) => row.address), slice.map((row) => row.level)]);
    }
    case "getNodeLevel": return sale.encodeFunctionResult(name, [nodeLevel]);
    case "getTierConfig": {
      const tier = Number(args[0]);
      return sale.encodeFunctionResult(name, [BigInt(tier), BigInt(tier) * 10n ** 18n, BigInt([0, 1000, 600, 400][tier]), 0n]);
    }
    default: throw new Error(`unmocked view ${name}`);
  }
}

function readUsdt(to, data) {
  const parsed = usdt.parseTransaction({ data });
  const { name } = parsed;
  calls.push(`usdt.${name}`);
  switch (name) {
    case "decimals": return usdt.encodeFunctionResult(name, [18]);
    case "balanceOf": return usdt.encodeFunctionResult(name, [10n ** 24n]);
    case "allowance": return usdt.encodeFunctionResult(name, [10n ** 24n]);
    default: throw new Error(`unmocked view usdt.${name}`);
  }
}

let txCounter = 0;
const pending = new Map();

const provider = {
  isMetaMask: true,
  async request({ method, params = [] }) {
    trace.push(method === "eth_getTransactionByHash" || method === "eth_getTransactionReceipt" ? `${method}(${String(params[0]).slice(0, 12)})` : method);
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts": return [ACCOUNT];
      case "eth_chainId": return "0x38";
      case "eth_blockNumber": return blockNumber;
      case "eth_getBlockByNumber": return { number: blockNumber, hash: `0x${"b".repeat(64)}`, transactions: [], baseFeePerGas: "0x1", timestamp: "0x1", gasLimit: "0x1e8480", gasUsed: "0x0", miner: ACCOUNT, extraData: "0x", difficulty: "0x0", nonce: "0x0000000000000000" };
      case "eth_gasPrice": return "0x1";
      case "eth_maxPriorityFeePerGas": return "0x1";
      case "eth_feeHistory": return { oldestBlock: blockNumber, baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0.5], reward: [["0x1"]] };
      case "eth_getBalance": return "0xde0b6b3a7640000";
      case "eth_getCode": return "0x6000";
      case "eth_getTransactionCount": return "0x0";
      case "eth_estimateGas": return "0x5208";
      case "eth_call": {
        const to = getAddress(params[0].to);
        const data = params[0].data;
        if (to === getAddress(NODE_SALE_ADDRESS)) return readSale(to, data);
        return readUsdt(to, data);
      }
      case "eth_sendTransaction": {
        const tx = params[0];
        const parsed = sale.parseTransaction({ data: tx.data });
        txCounter += 1;
        const hash = `0x${txCounter.toString(16).padStart(64, "0")}`;
        sent.push(parsed.name);
        if (parsed.name === "bindUpline") {
          bound = true;
          uplineAddress = getAddress(parsed.args[0]);
          uplineLevel = 0;
        }
        if (parsed.name === "buyNode") nodeLevel = Number(parsed.args[0]);
        pending.set(hash, receiptFor(hash, uplineAddress === "0x0000000000000000000000000000000000000000" ? ACCOUNT : uplineAddress));
        return hash;
      }
      case "eth_getTransactionReceipt": return pending.get(params[0]) ?? null;
      case "eth_getTransactionByHash":
        // ethers refuses a transaction without signature fields ("missing r").
        return {
          hash: params[0], blockNumber, blockHash: `0x${"b".repeat(64)}`,
          from: ACCOUNT, to: NODE_SALE_ADDRESS, nonce: "0x0", value: "0x0",
          gas: "0x5208", gasLimit: "0x5208", gasPrice: "0x1", input: "0x", data: "0x",
          transactionIndex: "0x0", type: "0x0", chainId: "0x38", accessList: null,
          v: 27, r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`,
        };
      default: { errors.push(`unhandled ${method}`); return null; }
    }
  },
  on() {},
  removeListener() {},
};
window.ethereum = provider;

const results = [];
const record = (name, ok_, detail) => results.push({ name, ok: ok_, detail: detail || "" });
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

  record("app boots", Boolean(await waitFor(() => document.querySelector(".app-shell.is-ready"), 10000)));
  record("referral nav anchor exists", Boolean(document.querySelector("#network.referral-section")));

  // ── purchase gate ──────────────────────────────────────────────────────
  const bindStep = await waitFor(() => document.querySelector(".node-bind-step"));
  record("the bind step is shown to an unregistered wallet", Boolean(bindStep));
  record("the bind step is not marked as bound", bindStep?.classList.contains("is-bound") === false, [...(bindStep?.classList ?? [])].join(" "));

  if (window.innerWidth <= 560) {
    const bindRow = document.querySelector(".node-bind-row");
    record("the bind row stacks on a phone", Boolean(bindRow) && getComputedStyle(bindRow).gridTemplateColumns.split(" ").length === 1,
      bindRow ? getComputedStyle(bindRow).gridTemplateColumns : "not rendered");
    const offer = document.querySelector(".node-offer");
    record("the purchase panel fits the phone width", offer.scrollWidth <= offer.clientWidth + 1, `scrollWidth=${offer.scrollWidth} clientWidth=${offer.clientWidth}`);
  }

  const purchaseButton = document.querySelector(".node-action-row .primary-button");
  record("purchase is locked before binding", purchaseButton?.disabled === true, `disabled=${purchaseButton?.disabled}, label="${purchaseButton?.textContent?.trim()}"`);
  record("the locked label tells the user to bind first", String(purchaseButton?.textContent ?? "").includes("绑定上级"), purchaseButton?.textContent?.trim());

  // ── referral console ───────────────────────────────────────────────────
  const uplineCard = document.querySelector(".referral-metric-upline");
  record("the console renders the upline card", Boolean(uplineCard));
  record("no upline is shown before binding", /尚未绑定上级/.test(uplineCard?.textContent ?? ""), uplineCard?.textContent?.trim().slice(0, 60));

  const downline = document.querySelector(".referral-downline");
  const rowCount = () => downline?.querySelectorAll(".referral-record").length ?? 0;
  await waitFor(() => /入网后/.test(downline?.textContent ?? ""));
  record("an unregistered wallet is told to bind before downlines appear", /入网后/.test(downline?.textContent ?? ""), downline?.textContent?.trim().replace(/\s+/g, " ").slice(0, 70));
  record("an unregistered wallet has no rows", rowCount() === 0, `rows=${rowCount()}`);

  // ── binding then purchasing ────────────────────────────────────────────
  document.querySelector(".node-bind-root")?.click();
  const input = document.querySelector(".node-bind-row input");
  const filled = await waitFor(() => (input?.value ? input.value : null), 5000);
  record("the root shortcut fills the upline field", filled?.toLowerCase() === ROOT.toLowerCase(), filled);

  // React state updates are async: wait for the submit control to enable.
  const submit = await waitFor(() => {
    const button = document.querySelector(".node-bind-submit");
    return button && !button.disabled ? button : null;
  }, 5000);
  record("the bind button enables once an address is present", Boolean(submit));
  submit?.click();
  const boundStep = await waitFor(() => document.querySelector(".node-bind-step.is-bound"), 15000);
  record("a successful binding switches the step to bound", Boolean(boundStep),
    `bind status: "${document.querySelector(".node-bind-status")?.textContent?.trim() ?? "(none)"}"`);
  record("binding was submitted to the contract", sent.includes("bindUpline"), `sent: ${sent.join(", ") || "none"}`);
  record("the purchase button unlocks after binding", document.querySelector(".node-action-row .primary-button")?.disabled === false, `disabled=${document.querySelector(".node-action-row .primary-button")?.disabled}`);

  const uplineAfter = await waitFor(() => {
    const text = document.querySelector(".referral-metric-upline")?.textContent ?? "";
    return /0x2467/.test(text) ? text : null;
  }, 10000);
  record("the console refreshes to show the new upline", Boolean(uplineAfter), (uplineAfter ?? "").trim().replace(/\s+/g, " ").slice(0, 80));

  record("no horizontal overflow at this viewport",
    document.documentElement.scrollWidth <= window.innerWidth + 1,
    `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`);
  if (window.innerWidth <= 560) {
    const list = document.querySelector(".referral-list");
    const columns = list ? getComputedStyle(list).gridTemplateColumns.split(" ").length : 0;
    record("the record list is a single column on a phone", columns === 1, `columns=${columns}`);
  }

  // ── console pagination now that the wallet is registered ───────────────
  await waitFor(() => rowCount() > 0);
  record("the downline total comes from the contract", /23/.test(downline?.textContent ?? ""), `rows on page 1: ${rowCount()}`);
  record("page one shows ten rows", rowCount() === 10, `rows=${rowCount()}`);
  record("the pager reports three pages", /1 \/ 3/.test(downline?.textContent ?? ""), downline?.querySelector(".referral-pager")?.textContent?.trim());
  const levelTags = [...(downline?.querySelectorAll(".referral-record .referral-level") ?? [])].map((node) => node.textContent.trim());
  record("each downline carries a node identity", levelTags.length === 10 && levelTags.some((tag) => /^L[1-3]$/.test(tag)) && levelTags.some((tag) => tag === "未成为节点"), levelTags.join(", "));

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
    document.getElementById("qa-result").textContent = JSON.stringify({ results, calls: [...new Set(calls)], trace, errors });
  });
