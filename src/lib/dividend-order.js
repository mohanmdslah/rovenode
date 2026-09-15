import { CHAIN_ID, HUB_ADDRESS, TOKEN_ADDRESS } from "./network.js";
import { readWei } from "./api.js";

const fail = (code) => Object.assign(new Error(code), { code });
const same = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
export const ORDER_TERMINAL = new Set(["CLAIMED", "REFUNDED", "FAILED"]);
export const DIVIDEND_TYPES = { DividendClaim: [
  { name: "user", type: "address" }, { name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
// EIP-712 domain name must match the deployed Hub contract exactly; do not rename.
export const DIVIDEND_DOMAIN = { name: "LabdogNodeHub", version: "1", chainId: CHAIN_ID, verifyingContract: HUB_ADDRESS };

export function validateDividendOrder(order, account, expectedAmount, now = Date.now()) {
  if (!order || typeof order.orderId !== "string" || !order.orderId || !same(order.hub, HUB_ADDRESS) || !same(order.token, TOKEN_ADDRESS) || ![CHAIN_ID, String(CHAIN_ID)].includes(order.chainId)) throw fail("INVALID_ORDER");
  if (!same(order.user, account)) throw fail("INVALID_ORDER");
  if (order.walletAddress != null && !same(order.walletAddress, account)) throw fail("INVALID_ORDER");
  if (!order.domain || order.domain.name !== DIVIDEND_DOMAIN.name || order.domain.version !== DIVIDEND_DOMAIN.version || ![CHAIN_ID, String(CHAIN_ID)].includes(order.domain.chainId) || !same(order.domain.verifyingContract, HUB_ADDRESS) || !same(order.domain.verifyingContract, order.hub)) throw fail("INVALID_ORDER");
  if (order.status && order.status !== "PENDING") throw fail("ORDER_NOT_PENDING");
  let amount;
  let nonce;
  let deadline;
  try {
    amount = readWei(order.amount);
    nonce = readWei(order.nonce);
    deadline = readWei(order.deadlineSec);
  } catch { throw fail("INVALID_ORDER"); }
  if (amount <= 0n || amount !== expectedAmount || nonce === 0n || deadline === 0n) throw fail("INVALID_ORDER");
  if (typeof order.signature !== "string" || !/^0x(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{130})$/.test(order.signature)) throw fail("INVALID_ORDER");
  const deadlineMs = typeof order.deadline === "string" ? Date.parse(order.deadline) : NaN;
  if (!Number.isFinite(deadlineMs) || BigInt(Math.floor(deadlineMs / 1000)) !== deadline) throw fail("INVALID_ORDER");
  const current = BigInt(Math.floor(now / 1000));
  if (deadline <= current + 5n) throw fail("DividendExpired");
  return { user: account, token: TOKEN_ADDRESS, amount, nonce, deadline };
}

// Store identifiers and receipts only; signed payloads and auth tokens stay in memory.
export function createWithdrawalOrderStore(storage) {
  const memory = new Map();
  let storageFailed = false;
  const key = (account) => `rove:${CHAIN_ID}:dividend-orders:${account.toLowerCase()}`;
  return {
    read(account) {
      if (!account) return [];
      try {
        const rows = storageFailed ? null : JSON.parse(storage?.getItem(key(account)) ?? "null");
        if (Array.isArray(rows)) memory.set(key(account), rows.filter((r) => typeof r?.orderId === "string" && r.orderId.length <= 200));
      } catch { /* Keep the session's copy when browser storage is unavailable. */ }
      return memory.get(key(account)) ?? [];
    },
    save(account, order) {
      if (!account || typeof order.orderId !== "string" || !order.orderId) return false;
      const rows = this.read(account);
      const previous = rows.find((r) => r.orderId === order.orderId) ?? {};
      const record = { orderId: order.orderId, amount: order.amount ?? previous.amount, createdAt: order.createdAt ?? previous.createdAt ?? new Date().toISOString(), hash: order.hash ?? previous.hash ?? "", status: order.status ?? previous.status ?? "PENDING" };
      if (JSON.stringify(record) === JSON.stringify(previous)) return !storageFailed && Boolean(storage);
      const next = [record, ...rows.filter((r) => r.orderId !== order.orderId)].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      memory.set(key(account), next);
      try { if (!storage) return false; storage.setItem(key(account), JSON.stringify(next)); storageFailed = false; return true; } catch { storageFailed = true; return false; }
    },
  };
}
