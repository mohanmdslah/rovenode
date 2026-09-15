import test from "node:test";
import assert from "node:assert/strict";
import {
  BSC_CHAIN_ID,
  NODE_PRICE_USDT,
  createNodePurchaseStatusReader,
  createNodePurchase,
  describeNodePurchaseError,
  ensureBscChain,
} from "./node-purchase.js";

const BUYER = "0x1234567890abcdef1234567890abcdef12345678";
const RECEIVER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("node purchase constants use BSC and exactly 150 USDT with 18 decimals", () => {
  assert.equal(BSC_CHAIN_ID, "0x61");
  assert.equal(NODE_PRICE_USDT, 150000000000000000000n);
});

test("unknown BSC networks are not added with a hard-coded RPC", async () => {
  const requests = [];
  const provider = {
    async request(payload) {
      requests.push(payload);
      if (payload.method === "eth_chainId") return "0x1";
      const error = new Error("Unknown chain");
      error.code = 4902;
      throw error;
    },
  };

  await assert.rejects(ensureBscChain(provider), { code: "CHAIN_NOT_CONFIGURED" });
  assert.deepEqual(requests.map(({ method }) => method), ["eth_chainId", "wallet_switchEthereumChain"]);
  assert.equal(requests.some(({ method }) => method === "wallet_addEthereumChain"), false);
});

test("unconfigured testnet purchases cannot submit contract transactions", async () => {
  const methods = [];
  const provider = { request: async ({ method }) => { methods.push(method); return "0x61"; } };
  await assert.rejects(createNodePurchase()({ provider, expectedAccount: BUYER }), { code: "NOT_CONFIGURED" });
  assert.deepEqual(methods, ["eth_chainId"]);
});

test("node purchase status reader queries hasRecharged for the connected wallet", async () => {
  const walletProvider = { request() {} };
  const queriedAccounts = [];
  const steps = [];
  const readStatus = createNodePurchaseStatusReader({
    ensureChain: async (provider) => steps.push(["chain", provider]),
    createVault: (provider) => ({
      async hasRecharged(account) {
        steps.push(["vault", provider]);
        queriedAccounts.push(account);
        return true;
      },
    }),
  });

  assert.equal(await readStatus({ provider: walletProvider, account: BUYER }), true);
  assert.deepEqual(queriedAccounts, [BUYER]);
  assert.deepEqual(steps, [["chain", walletProvider], ["vault", walletProvider]]);
});

test("node purchase status reader rejects missing providers and invalid wallet addresses", async () => {
  const readStatus = createNodePurchaseStatusReader({ createVault: () => ({}) });
  await assert.rejects(() => readStatus({ provider: null, account: BUYER }), { code: "PROVIDER_NOT_FOUND" });
  await assert.rejects(
    () => readStatus({ provider: { request() {} }, account: "not-an-address" }),
    { code: "INVALID_ACCOUNT" },
  );
});

test("ensureBscChain switches an injected wallet only when needed", async () => {
  const requests = [];
  let chain = "0x1";
  const provider = {
    async request(payload) {
      requests.push(payload);
      if (payload.method === "eth_chainId") return chain;
      if (payload.method === "wallet_switchEthereumChain") chain = BSC_CHAIN_ID;
      return null;
    },
  };

  await ensureBscChain(provider);

  assert.deepEqual(requests, [
    { method: "eth_chainId" },
    { method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] },
    { method: "eth_chainId" },
  ]);
});

test("ensureBscChain waits for a delayed mobile chain update", async () => {
  let reads = 0;
  await ensureBscChain({ request: async ({ method }) => {
    if (method === "wallet_switchEthereumChain") return null;
    reads += 1;
    return reads < 3 ? "0x1" : BSC_CHAIN_ID;
  } });
  assert.equal(reads, 3);
});

test("ensureBscChain accepts a decimal chain id from mobile wallet bridges", async () => {
  let switched = false;
  await ensureBscChain({ request: async ({ method }) => {
    if (method === "eth_chainId") return 56;
    if (method === "wallet_switchEthereumChain") switched = true;
    return null;
  } });
  assert.equal(switched, false);
});

test("node purchase approves the exact shortfall and deposits after confirmation", async () => {
  const steps = [];
  const statuses = [];
  const purchase = createNodePurchase({
    ensureChain: async () => steps.push("chain"),
    createClient: async () => ({
      account: BUYER,
      vault: {
        depositEnabled: async () => true,
        hasRecharged: async () => false,
        receiver: async () => RECEIVER,
        deposit: Object.assign(
          async (amount) => {
            steps.push(["deposit", amount]);
            return { hash: "0xdeposit", wait: async () => steps.push("deposit-mined") };
          },
          { staticCall: async (amount) => steps.push(["simulate", amount]) },
        ),
      },
      usdt: {
        balanceOf: async () => NODE_PRICE_USDT,
        allowance: async () => 0n,
        approve: async (spender, amount) => {
          steps.push(["approve", spender, amount]);
          return { hash: "0xapprove", wait: async () => steps.push("approve-mined") };
        },
      },
    }),
  });

  const result = await purchase({ provider: { request() {} }, expectedAccount: BUYER, onStatus: (status) => statuses.push(status) });

  assert.equal(result.depositHash, "0xdeposit");
  assert.equal(result.approvalHash, "0xapprove");
  assert.equal(result.receiver, RECEIVER);
  assert.deepEqual(steps, [
    "chain",
    ["approve", "", NODE_PRICE_USDT],
    "approve-mined",
    ["simulate", NODE_PRICE_USDT],
    ["deposit", NODE_PRICE_USDT],
    "deposit-mined",
  ]);
  assert.deepEqual(statuses.map(({ phase }) => phase), [
    "checking",
    "approving",
    "approvalPending",
    "purchasing",
    "purchasePending",
    "success",
  ]);
});

test("node purchase skips approval when the existing allowance is sufficient", async () => {
  let approved = false;
  const purchase = createNodePurchase({
    ensureChain: async () => {},
    createClient: async () => ({
      account: BUYER,
      vault: {
        depositEnabled: async () => true,
        hasRecharged: async () => false,
        receiver: async () => RECEIVER,
        deposit: Object.assign(
          async () => ({ hash: "0xdeposit", wait: async () => {} }),
          { staticCall: async () => {} },
        ),
      },
      usdt: {
        balanceOf: async () => NODE_PRICE_USDT,
        allowance: async () => NODE_PRICE_USDT,
        approve: async () => { approved = true; },
      },
    }),
  });

  const result = await purchase({ provider: { request() {} }, expectedAccount: BUYER });

  assert.equal(approved, false);
  assert.equal(result.approvalHash, null);
});

test("node purchase blocks disabled, repeated, underfunded, and changed-account attempts", async (t) => {
  const cases = [
    { name: "disabled", enabled: false, recharged: false, balance: NODE_PRICE_USDT, account: BUYER, code: "DEPOSIT_DISABLED" },
    { name: "already purchased", enabled: true, recharged: true, balance: NODE_PRICE_USDT, account: BUYER, code: "ALREADY_RECHARGED" },
    { name: "insufficient balance", enabled: true, recharged: false, balance: NODE_PRICE_USDT - 1n, account: BUYER, code: "INSUFFICIENT_USDT" },
    { name: "account changed", enabled: true, recharged: false, balance: NODE_PRICE_USDT, account: RECEIVER, code: "ACCOUNT_CHANGED" },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const purchase = createNodePurchase({
        ensureChain: async () => {},
        createClient: async () => ({
          account: entry.account,
          vault: {
            depositEnabled: async () => entry.enabled,
            hasRecharged: async () => entry.recharged,
            receiver: async () => RECEIVER,
          },
          usdt: {
            balanceOf: async () => entry.balance,
            allowance: async () => 0n,
          },
        }),
      });

      await assert.rejects(
        () => purchase({ provider: { request() {} }, expectedAccount: BUYER }),
        { code: entry.code },
      );
    });
  }
});

test("wallet and contract failures map to stable user-facing error keys", () => {
  assert.equal(describeNodePurchaseError({ code: 4001 }), "rejected");
  assert.equal(describeNodePurchaseError({ code: "ACTION_REJECTED" }), "rejected");
  assert.equal(describeNodePurchaseError({ code: "DEPOSIT_DISABLED" }), "disabled");
  assert.equal(describeNodePurchaseError({ code: "ALREADY_RECHARGED" }), "alreadyPurchased");
  assert.equal(describeNodePurchaseError({ code: "INSUFFICIENT_USDT" }), "insufficientUsdt");
  assert.equal(describeNodePurchaseError({ code: "ACCOUNT_CHANGED" }), "accountChanged");
  assert.equal(describeNodePurchaseError({ message: "execution reverted: already recharged" }), "alreadyPurchased");
  assert.equal(describeNodePurchaseError(new Error("unknown")), "failed");
});
