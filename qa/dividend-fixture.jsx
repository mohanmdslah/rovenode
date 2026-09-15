import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../src/i18n.jsx";
import { NodeCenter } from "../src/components/NodeCenter.jsx";
import { api, ApiError } from "../src/lib/api.js";
import { nodeHub } from "../src/lib/node-hub.js";
import { CHAIN_ID, HUB_ADDRESS, TOKEN_ADDRESS } from "../src/lib/network.js";
import { DIVIDEND_DOMAIN } from "../src/lib/dividend-order.js";
import "../src/styles.css";

// Isolated UI fixture: every API and wallet operation is simulated on this page.
const account = "0x1111111111111111111111111111111111111111";
window.ethereum = { request: async ({ method }) => method === "eth_accounts" ? [account] : "0x61" };
const orders = new Map();
for (let index = 0; index < 21; index++) {
  const orderId = `WD-SERVER-${String(index).padStart(3, "0")}`;
  orders.set(orderId, { orderId, amount: "10000000000000000000", sourceType: "MANUAL_CREDIT", status: "REFUNDED", createdAt: "2026-09-07T06:11:52Z", deadline: "2026-09-07T06:16:52Z" });
}
let available = 12500000000000000000n;
let frozen = 0n;
let withdrawn = 0n;
let cancelOnce = true;
let count = 0;
api.price = async () => ({ lastPrice: 5000000000000n, initialPrice: 2500000000000n });
api.dividends = async () => ({ available, pendingFreeze: frozen, withdrawn });
api.withdrawals = async (_, { page = 1, pageSize = 20, status, sourceType } = {}) => {
  const rows = [...orders.values()].reverse().filter((row) => (!status || row.status === status) && (!sourceType || row.sourceType === sourceType));
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
};
api.dividendHistory = async (_, page) => ({ rows: Array.from({ length: page === 1 ? 20 : 1 }, (_, i) => ({ id: `ldg_af80d7698d96bac8b2699c74_${i}`, chainId: 97, settlementId: "stl_manual", nodeId: "node_af80d7698d96bac8b2699c74", userId: "cmtq47x7b354rte07cz5prtpn", settlementDate: `2026-09-${String(i + 1).padStart(2, "0")}`, amount: "1250000000000000000", availableAmount: "1000000000000000000", withdrawnAmount: "250000000000000000", refundedAmount: "0", status: "SETTLED" })), total: 21 });
api.requestWithdrawal = async (_, amount) => {
  count++;
  document.getElementById("root").dataset.requestCount = String(count);
  const deadlineSec = String(Math.floor(Date.now() / 1000) + 240);
  const order = { orderId: `WD-FIXTURE-${Date.now()}`, user: account, amount, nonce: "1", deadlineSec, deadline: new Date(Number(deadlineSec) * 1000).toISOString(), signature: `0x${"ab".repeat(65)}`, hub: HUB_ADDRESS, token: TOKEN_ADDRESS, chainId: String(CHAIN_ID), domain: { ...DIVIDEND_DOMAIN }, status: "PENDING", createdAt: new Date().toISOString() };
  available -= BigInt(amount); frozen += BigInt(amount); orders.set(order.orderId, order);
  return { ...order };
};
api.withdrawalOrder = async (_, id) => {
  if (id === "WD-UI-PREVIEW") return { orderId: id, amount: "10000000000000000000", status: "CLAIMED", createdAt: "2026-09-07T06:11:52Z", deadline: "2026-09-07T06:16:52Z", claimedTxHash: `0x${"ab".repeat(32)}` };
  if (!orders.has(id) && id.startsWith("WD-FIXTURE-")) return { orderId: id, amount: "1250000000000000000", status: "REFUNDED" };
  if (!orders.has(id)) throw new ApiError("订单不存在", 404);
  return { ...orders.get(id) };
};
nodeHub.read = async () => ({ nodeId: 1n, paused: false, walletBalance: 100n * 10n ** 18n + withdrawn, lockedTotal: 500000n * 10n ** 18n, claimable: 125000n * 10n ** 18n, unlocked: 125000n * 10n ** 18n, claimed: 0n, lpRegistered: 100n * 10n ** 18n, lpCustodied: 50n * 10n ** 18n, lpShare: 100n * 10n ** 18n, lpRemoved: false, exited: false });
nodeHub.execute = async ({ action, order, onStatus }) => {
  if (action !== "claimDividend") throw new Error("Only dividend UI is exercised here");
  onStatus({ phase: "signing" });
  if (cancelOnce) { cancelOnce = false; throw Object.assign(new Error("Rejected"), { code: 4001 }); }
  const hash = `0x${"ab".repeat(32)}`;
  onStatus({ phase: "pending", hash });
  await new Promise((resolve) => setTimeout(resolve, 400));
  orders.set(order.orderId, { ...order, status: "CLAIMED", claimedTxHash: hash, claimedAt: new Date().toISOString() });
  frozen -= BigInt(order.amount); withdrawn += BigInt(order.amount);
  onStatus({ phase: "success", hash });
  return { hash };
};
createRoot(document.getElementById("root")).render(<LocaleProvider><NodeCenter walletAddress={account} token="dividend-fixture" walletBusy={false} onConnect={() => {}} onUnauthorized={() => {}} /></LocaleProvider>);
