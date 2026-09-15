import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../src/i18n.jsx";
import { NodeCenter } from "../src/components/NodeCenter.jsx";
import { api } from "../src/lib/api.js";
import { nodeHub } from "../src/lib/node-hub.js";
import "../src/styles.css";

// Browser-only fixtures: this page never connects to a wallet, RPC or backend.
const account = "0x1234567890abcdef1234567890abcdef12345678";
let asset = { nodeId: 1n, paused: false, walletBalance: 100n * 10n ** 18n, lockedTotal: 500000n * 10n ** 18n, claimable: 125000n * 10n ** 18n, unlocked: 125000n * 10n ** 18n, claimed: 0n, lpRegistered: 100n * 10n ** 18n, lpCustodied: 50n * 10n ** 18n, lpShare: 100n * 10n ** 18n, lpRemoved: false, exited: false };
api.price = async () => ({ lastPrice: 5000000000000n, initialPrice: 2500000000000n });
api.dividends = async () => ({ available: 12500000000000000000n, pendingFreeze: 0n, withdrawn: 0n });
api.dividendHistory = async () => ({ rows: [], total: 0 });
api.withdrawalOrder = async (_, orderId) => ({ orderId, amount: "0", status: "REFUNDED" });
api.withdrawals = async (_, { page = 1, pageSize = 20 } = {}) => ({ rows: [], total: 0, page, pageSize });
api.requestWithdrawal = async () => { throw new Error("Use the dividend fixture to test withdrawals"); };
nodeHub.read = async () => ({ ...asset });
nodeHub.execute = async ({ action, onStatus }) => {
  onStatus({ phase: "signing" });
  const hash = `0x${"ab".repeat(32)}`;
  onStatus({ phase: "pending", hash });
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (action === "claimLocked") asset = { ...asset, claimed: asset.claimed + asset.claimable, claimable: 0n };
  else asset = { ...asset, exited: true, lpRemoved: true, lpShare: 0n, claimable: 0n };
  onStatus({ phase: "success", hash });
  return { hash };
};
createRoot(document.getElementById("root")).render(<LocaleProvider><NodeCenter walletAddress={account} token="fixture-session" walletBusy={false} onConnect={() => {}} onUnauthorized={() => {}} /></LocaleProvider>);
