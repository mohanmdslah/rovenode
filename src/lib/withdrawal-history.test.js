import test from "node:test";
import assert from "node:assert/strict";
import { loadWithdrawalHistory } from "./withdrawal-history.js";
import { createWithdrawalOrderStore } from "./dividend-order.js";

const account = "0x123";
const order = (orderId, status = "REFUNDED") => ({ orderId, status, amount: "1000000000000000000" });
const envelope = (rows, page = 1, total = rows.length) => ({ rows, total, page, pageSize: 20 });

test("remote page and total are authoritative even with no saved orders; other-page active orders are tracked", async () => {
  const store = createWithdrawalOrderStore();
  const result = await loadWithdrawalHistory({ account, token: "session", page: 2, store, api: {
    withdrawals: async (_, { page, status }) => status ? envelope(status === "SUBMITTED" ? [order("WD-OTHER-DEVICE", status)] : []) : envelope([order("WD-PAGE-2")], page, 21),
    withdrawalOrder: async () => assert.fail("No detail request needed for server rows"),
  } });
  assert.equal(result.page, 2);
  assert.equal(result.total, 21);
  assert.deepEqual(result.rows.map((row) => row.orderId), ["WD-PAGE-2"]);
  assert.deepEqual(result.active.map((row) => row.orderId), ["WD-OTHER-DEVICE"]);
});

test("local receipts prevent duplicate sends while unresolved off-page orders continue synchronization", async () => {
  const store = createWithdrawalOrderStore();
  store.save(account, { ...order("WD-LOCAL", "SUBMITTED"), hash: "0xreceipt" });
  store.save(account, order("WD-OFF-PAGE", "SUBMITTED"));
  const result = await loadWithdrawalHistory({ account, token: "session", page: 1, store, api: {
    withdrawals: async (_, { status }) => envelope(status ? [] : [order("WD-LOCAL", "PENDING")]),
    withdrawalOrder: async (_, id) => ({ ...order(id, "CLAIMED"), claimedTxHash: "0xconfirmed" }),
  } });
  assert.equal(result.rows[0].hash, "0xreceipt");
  assert.equal(result.total, 1);
  assert.equal(result.details.find((row) => row.orderId === "WD-OFF-PAGE").status, "CLAIMED");
  assert.equal(result.active.length, 1);
});

test("history failure does not fall back to local records, and active status auth failures propagate", async () => {
  const store = createWithdrawalOrderStore();
  store.save(account, order("WD-OLD"));
  await assert.rejects(loadWithdrawalHistory({ account, token: "session", page: 1, store, api: {
    withdrawals: async (_, { status }) => {
      if (status === "PENDING") throw Object.assign(new Error("Expired"), { status: 401 });
      return envelope([]);
    },
  } }), { status: 401 });
});

test("legacy array responses are capped at five rows per displayed page", async () => {
  const store = createWithdrawalOrderStore();
  const all = Array.from({ length: 12 }, (_, index) => order(`WD-${index}`));
  const result = await loadWithdrawalHistory({ account, token: "session", page: 2, store, api: {
    withdrawals: async (_, { status }) => status ? envelope([]) : { rows: all, total: null, page: 2, pageSize: 5 },
    withdrawalOrder: async () => assert.fail("No detail request needed for server rows"),
  } });
  assert.deepEqual(result.rows.map((row) => row.orderId), ["WD-5", "WD-6", "WD-7", "WD-8", "WD-9"]);
});
