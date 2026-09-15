import { parseUnits } from "ethers";

const STORAGE_PREFIX = "rove:56:node-center:fee-withdrawals:";
const TOKEN_DECIMALS = 18;

export function parseFeeWithdrawalAmount(input, availableBalance = null) {
  const normalized = String(input ?? "").trim();
  if (!normalized) return { ok: false, errorKey: "required" };
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized)) return { ok: false, errorKey: "invalid" };

  let value;
  try {
    value = parseUnits(normalized, TOKEN_DECIMALS);
  } catch {
    return { ok: false, errorKey: "invalid" };
  }

  if (value <= 0n) return { ok: false, errorKey: "positive" };
  if (typeof availableBalance === "bigint" && value > availableBalance) {
    return { ok: false, errorKey: "exceeds" };
  }
  return { ok: true, value };
}

function storageKey(account) {
  return `${STORAGE_PREFIX}${String(account ?? "").toLowerCase()}`;
}

function normalizeRecords(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((record) => record && typeof record.hash === "string" && typeof record.amount === "string")
    .map((record) => ({
      hash: record.hash,
      amount: record.amount,
      timestamp: Number.isFinite(Number(record.timestamp)) ? Number(record.timestamp) : 0,
    }))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 50);
}

export function createFeeWithdrawalStore(storage) {
  return {
    read(account) {
      if (!storage || !account) return [];
      try {
        return normalizeRecords(JSON.parse(storage.getItem(storageKey(account)) ?? "[]"));
      } catch {
        return [];
      }
    },
    append(account, record) {
      if (!storage || !account) return;
      const next = normalizeRecords([record, ...this.read(account)]);
      storage.setItem(storageKey(account), JSON.stringify(next));
    },
  };
}
