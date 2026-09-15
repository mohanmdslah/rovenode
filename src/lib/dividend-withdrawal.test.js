import test from "node:test";
import assert from "node:assert/strict";
import { Interface, Wallet } from "ethers";
import hubArtifact from "../contracts/LabdogNodeHub.json" with { type: "json" };
import { createApi } from "./api.js";
import { CHAIN_ID, HUB_ADDRESS, TOKEN_ADDRESS } from "./network.js";
import { createWithdrawalOrderStore, DIVIDEND_DOMAIN, DIVIDEND_TYPES, validateDividendOrder } from "./dividend-order.js";
import { prepareDividendWithdrawal } from "./dividend-withdrawal.js";
import { createNodeHub } from "./node-hub.js";

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const AMOUNT = 1234567890123456789n;
const HASH = `0x${"ab".repeat(32)}`;
const provider = () => ({ request: async ({ method }) => method === "eth_chainId" ? "0x61" : [ACCOUNT] });
async function makeOrder() {
  const signer = Wallet.createRandom();
  const deadlineSec = BigInt(Math.floor(Date.now() / 1000) + 240);
  const order = { orderId: "WD-test", user: ACCOUNT, amount: AMOUNT.toString(), nonce: "1", deadlineSec: deadlineSec.toString(), deadline: new Date(Number(deadlineSec) * 1000).toISOString(), hub: HUB_ADDRESS, token: TOKEN_ADDRESS, chainId: String(CHAIN_ID), domain: { ...DIVIDEND_DOMAIN }, signature: `0x${"ab".repeat(65)}`, status: "PENDING" };
  const claim = validateDividendOrder(order, ACCOUNT, AMOUNT);
  order.signature = await signer.signTypedData(order.domain, DIVIDEND_TYPES, claim);
  return { signer, order, claim };
}

test("order validation binds the signed amount, user, deadlineSec and EIP-712 domain", async () => {
  const { order, claim } = await makeOrder();
  assert.equal(claim.amount, AMOUNT);
  assert.equal(claim.deadline, BigInt(order.deadlineSec));
  assert.equal(validateDividendOrder({ ...order, domain: { ...order.domain, chainId: String(CHAIN_ID) } }, ACCOUNT, AMOUNT).deadline, claim.deadline);
  const invalid = [{ hub: OTHER }, { token: OTHER }, { chainId: "56" }, { amount: "1" }, { nonce: "0" }, { user: OTHER }, { user: undefined }, { walletAddress: OTHER }, { status: "CLAIMED" }, { signature: "0x00" }, { deadlineSec: "0" }, { deadlineSec: undefined }, { deadline: "invalid" }, { deadline: new Date((Number(order.deadlineSec) + 1) * 1000).toISOString() }, { domain: { ...order.domain, name: "WrongHub" } }, { domain: { ...order.domain, version: "2" } }, { domain: { ...order.domain, chainId: 56 } }, { domain: { ...order.domain, verifyingContract: OTHER } }];
  for (const change of invalid) assert.throws(() => validateDividendOrder({ ...order, ...change }, ACCOUNT, AMOUNT));
});

test("a signed deadline more than five minutes ahead is accepted despite server clock skew", async () => {
  const { order } = await makeOrder();
  const deadlineSec = BigInt(Math.floor(Date.now() / 1000) + 420);
  const skewed = { ...order, deadlineSec: deadlineSec.toString(), deadline: new Date(Number(deadlineSec) * 1000).toISOString() };
  assert.equal(validateDividendOrder(skewed, ACCOUNT, AMOUNT).deadline, deadlineSec);
});

test("preparation checks fresh balance and freezes exactly the requested wei amount once", async () => {
  const { order } = await makeOrder(); const requests = []; const captured = [];
  const result = await prepareDividendWithdrawal({ provider: provider(), account: ACCOUNT, token: "session", amount: AMOUNT, onStatus: () => {}, onOrder: (o) => captured.push(o.orderId), hub: { read: async () => ({ nodeId: 1n, paused: false }) }, apiClient: {
    dividends: async () => ({ available: AMOUNT, pendingFreeze: 0n }),
    requestWithdrawal: async (token, amount) => { requests.push([token, amount]); return order; },
  } });
  assert.deepEqual(requests, [["session", AMOUNT.toString()]]);
  assert.deepEqual(captured, [order.orderId]);
  assert.equal(result.expectedAmount, AMOUNT);
});

test("insufficient balance, an existing freeze and exited nodes do not create orders", async () => {
  for (const kind of ["balance", "freeze", "exited"]) {
    await assert.rejects(prepareDividendWithdrawal({ provider: provider(), account: ACCOUNT, token: "session", amount: AMOUNT, onStatus: () => {}, onOrder: () => {}, hub: { read: async () => ({ nodeId: 1n, exited: kind === "exited" }) }, apiClient: {
      dividends: async () => ({ available: kind === "balance" ? 0n : AMOUNT, pendingFreeze: kind === "freeze" ? 1n : 0n }),
      requestWithdrawal: async () => assert.fail("Must not create an order"),
    } }));
  }
});

test("an order returned after account-session cancellation is retained but never submitted", async () => {
  const { order } = await makeOrder(); const signal = new AbortController(); let captured;
  await assert.rejects(prepareDividendWithdrawal({ provider: provider(), account: ACCOUNT, token: "session", amount: AMOUNT, signal: signal.signal, onStatus: () => {}, onOrder: (o) => { captured = o.orderId; }, hub: { read: async () => ({ nodeId: 1n }) }, apiClient: {
    dividends: async () => ({ available: AMOUNT, pendingFreeze: 0n }),
    requestWithdrawal: async () => { signal.abort(); return order; },
  } }), { name: "AbortError" });
  assert.equal(captured, order.orderId);
});

test("resume fetches the existing order instead of applying for another signature", async () => {
  const { order } = await makeOrder();
  const result = await prepareDividendWithdrawal({ provider: provider(), account: ACCOUNT, token: "session", amount: AMOUNT, orderId: order.orderId, onOrder: () => {}, hub: { read: async () => ({ nodeId: 1n }) }, apiClient: {
    withdrawalOrder: async (token, id) => { assert.equal(id, order.orderId); return order; },
    requestWithdrawal: async () => assert.fail("Must not duplicate the order"),
  } });
  assert.equal(result.order.orderId, order.orderId);
});

test("the Hub receives the backend signature and sends the documented claim tuple", async () => {
  const { signer, order, claim } = await makeOrder(); const iface = new Interface(hubArtifact.abi); const calls = [];
  const event = iface.encodeEventLog(iface.getEvent("DividendClaimed"), [ACCOUNT, TOKEN_ADDRESS, AMOUNT, claim.nonce, claim.deadline, ACCOUNT]);
  const claimDividend = Object.assign(async (...args) => { calls.push(args); return { hash: HASH, wait: async () => ({ status: 1, logs: [{ address: HUB_ADDRESS, ...event }] }) }; }, { staticCall: async (...args) => { assert.deepEqual(args, [claim, order.signature]); } });
  const client = { blockNumber: async () => 123, token: { balanceOf: async () => 0n }, dividend: { claimDividend }, hub: {
    nodeOf: async () => 1n, paused: async () => false, getNode: async () => ({ wallet: ACCOUNT, status: 0n }), claimableLocked: async () => 0n, unlockedLocked: async () => 0n,
    signer: async () => signer.address, userNonce: async () => 0n, rewardToken: async () => TOKEN_ADDRESS,
  } };
  const hub = createNodeHub({ clientFactory: async () => client });
  const result = await hub.execute({ provider: provider(), account: ACCOUNT, action: "claimDividend", order, expectedAmount: AMOUNT });
  assert.equal(result.hash, HASH);
  assert.deepEqual(calls, [[claim, order.signature]]);
  const wrongEvent = iface.encodeEventLog(iface.getEvent("DividendClaimed"), [ACCOUNT, TOKEN_ADDRESS, AMOUNT + 1n, claim.nonce, claim.deadline, ACCOUNT]);
  client.dividend.claimDividend = Object.assign(async () => ({ hash: HASH, wait: async () => ({ status: 1, logs: [{ address: HUB_ADDRESS, ...wrongEvent }] }) }), { staticCall: async () => {} });
  await assert.rejects(hub.execute({ provider: provider(), account: ACCOUNT, action: "claimDividend", order, expectedAmount: AMOUNT }), { code: "EVENT_NOT_CONFIRMED", transactionHash: HASH });
});

test("order storage scopes receipts by wallet and never stores backend signatures or JWTs", () => {
  const values = new Map(); const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const store = createWithdrawalOrderStore(storage);
  store.save(ACCOUNT, { orderId: "WD-one", amount: "1", signature: "secret-signature", token: "secret-session" });
  store.save(ACCOUNT, { orderId: "WD-one", hash: HASH, status: "SUBMITTED" });
  assert.equal(store.read(ACCOUNT)[0].amount, "1");
  assert.equal(store.read(ACCOUNT)[0].hash, HASH);
  assert.equal(store.read(OTHER).length, 0);
  assert.ok(![...values.values()].join("").includes("secret"));
  storage.setItem = () => { throw new Error("Quota"); };
  assert.equal(store.save(ACCOUNT, { orderId: "WD-two", amount: "2" }), false);
  assert.equal(store.read(ACCOUNT).length, 2);
});

test("API 4.2 accepts both the live array shape and a paginated response", async () => {
  for (const body of [[], { rows: [{ settlementDate: "2026-09-07", amount: "1", status: "SETTLED" }], total: 1, page: 1, pageSize: 20 }]) {
    const api = createApi(async (url, options) => { assert.ok(url.endsWith("/dividends/history?page=1&pageSize=20")); assert.equal(options.headers.Authorization, "Bearer session"); return Response.json(body); });
    assert.ok(Array.isArray((await api.dividendHistory("session")).rows));
  }
});

test("API 4.3 posts a wei string and 4.5 encodes the order identifier", async () => {
  const { order } = await makeOrder();
  const api = createApi(async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer session");
    if (options.method === "POST") { assert.deepEqual(JSON.parse(options.body), { amount: AMOUNT.toString() }); return Response.json({ order }); }
    assert.ok(url.endsWith("/dividends/withdrawal-orders/WD-test"));
    return Response.json(order);
  });
  assert.equal((await api.requestWithdrawal("session", AMOUNT.toString())).orderId, order.orderId);
  assert.equal((await api.withdrawalOrder("session", order.orderId)).status, "PENDING");
});

test("a lost signature-request response is not automatically retried", async () => {
  let attempts = 0;
  await assert.rejects(prepareDividendWithdrawal({ provider: provider(), account: ACCOUNT, token: "session", amount: AMOUNT, onStatus: () => {}, onOrder: () => {}, hub: { read: async () => ({ nodeId: 1n }) }, apiClient: {
    dividends: async () => ({ available: AMOUNT, pendingFreeze: 0n }), requestWithdrawal: async () => { attempts++; throw new TypeError("Network error"); },
  } }), { code: "REQUEST_UNCERTAIN" });
  assert.equal(attempts, 1);
});
