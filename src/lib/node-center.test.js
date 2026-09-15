import test from "node:test";
import assert from "node:assert/strict";
import {
  createFeeWithdrawalStore,
  parseFeeWithdrawalAmount,
} from "./node-center.js";

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";

test("fee withdrawal amount is required and must be positive", () => {
  assert.deepEqual(parseFeeWithdrawalAmount(""), { ok: false, errorKey: "required" });
  assert.deepEqual(parseFeeWithdrawalAmount("hello"), { ok: false, errorKey: "invalid" });
  assert.deepEqual(parseFeeWithdrawalAmount("0"), { ok: false, errorKey: "positive" });
});

test("fee withdrawal amount parses token decimals and enforces the available balance", () => {
  assert.deepEqual(parseFeeWithdrawalAmount("0.125", 200000000000000000n), {
    ok: true,
    value: 125000000000000000n,
  });
  assert.deepEqual(parseFeeWithdrawalAmount("0.25", 200000000000000000n), {
    ok: false,
    errorKey: "exceeds",
  });
});

test("fee withdrawal receipts are scoped by wallet and newest first", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = createFeeWithdrawalStore(storage);

  store.append(ACCOUNT, { hash: "0xfirst", amount: "0.1", timestamp: 10 });
  store.append(ACCOUNT.toUpperCase(), { hash: "0xsecond", amount: "0.2", timestamp: 20 });

  assert.deepEqual(store.read(ACCOUNT).map(({ hash }) => hash), ["0xsecond", "0xfirst"]);
  assert.deepEqual(store.read("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"), []);
});
