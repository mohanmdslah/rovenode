import test from "node:test";
import assert from "node:assert/strict";
import { Interface, Wallet } from "ethers";
import hubArtifact from "../contracts/LabdogNodeHub.json" with { type: "json" };
import tokenArtifact from "../contracts/LabdogToken.json" with { type: "json" };
import { createDividendClaim, createNodeHub, encodeDividendClaimData, hubActionBlock, hubErrorKey } from "./node-hub.js";
import { HUB_ADDRESS, TOKEN_ADDRESS } from "./network.js";
import { DIVIDEND_TYPES } from "./dividend-order.js";

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const HASH = `0x${"ab".repeat(32)}`;
const iface = new Interface(hubArtifact.abi);
const tokenIface = new Interface(tokenArtifact.abi);
const node = () => ({ wallet: ACCOUNT, lockedTotal: 500000n * 10n ** 18n, initialClaimable: 0n, claimed: 20n * 10n ** 18n, lpRegistered: 100n * 10n ** 18n, lpCustodied: 50n * 10n ** 18n, lpRemoved: false, status: 0n });
function receipt(action = "claimLocked", account = ACCOUNT) {
  const event = action === "claimLocked" ? iface.encodeEventLog(iface.getEvent("LockedTokensClaimed"), [1n, account, 100n, account]) : iface.encodeEventLog(iface.getEvent("NodeExited"), [1n, account]);
  return { status: 1, hash: HASH, logs: [{ address: HUB_ADDRESS, ...event }] };
}
function fixture() {
  const data = node();
  const writes = [];
  const calls = [];
  const provider = { account: ACCOUNT, chain: "0x61", request: async ({ method }) => method === "eth_chainId" ? provider.chain : [provider.account] };
  const client = {
    blockNumber: async () => 123,
    token: { balanceOf: async () => 9007199254740993123456789n },
    hub: {
      nodeOf: async () => 1n, paused: async () => false, getNode: async () => data,
      claimableLocked: async () => 100n, unlockedLocked: async () => 120n,
    },
  };
  for (const action of ["claimLocked", "removeLP"]) {
    client.hub[action] = Object.assign(async (...args) => {
      writes.push({ action, args });
      return { hash: HASH, data: iface.encodeFunctionData(action), wait: async () => receipt(action) };
    }, { staticCall: async (...args) => { calls.push({ action, args }); } });
  }
  const hub = createNodeHub({ clientFactory: async () => client });
  return { provider, data, writes, calls, client, hub };
}

test("reads exact asset amounts and does not fetch getNode for a non-node", async () => {
  const f = fixture();
  const result = await f.hub.read({ provider: f.provider, account: ACCOUNT });
  assert.equal(result.lockedTotal, 500000000000000000000000n);
  assert.equal(result.walletBalance, 9007199254740993123456789n);
  assert.equal(result.claimable, 100n);
  assert.equal(result.lpShare, f.data.lpRegistered);
  f.client.hub.nodeOf = async () => 0n;
  f.client.hub.getNode = async () => assert.fail("getNode may revert for a non-node");
  const empty = await f.hub.read({ provider: f.provider, account: ACCOUNT });
  assert.equal(empty.nodeId, 0n);
  assert.equal(empty.claimable, 0n);
});

test("default client reads supplied ABI through the injected provider at one block", async () => {
  const requests = [];
  const provider = { request: async (request) => {
    requests.push(request);
    if (request.method === "eth_accounts") return [ACCOUNT];
    if (request.method === "eth_chainId") return "0x61";
    if (request.method === "eth_blockNumber") return "0x7b";
    if (request.method !== "eth_call") throw new Error(request.method);
    const [tx, block] = request.params;
    assert.equal(block, "0x7b");
    if (tx.to.toLowerCase() === TOKEN_ADDRESS.toLowerCase()) return tokenIface.encodeFunctionResult("balanceOf", [5n]);
    assert.equal(tx.to.toLowerCase(), HUB_ADDRESS.toLowerCase());
    const fn = iface.parseTransaction({ data: tx.data });
    const results = { nodeOf: [1n], paused: [false], claimableLocked: [100n], unlockedLocked: [120n], getNode: [[ACCOUNT, HASH, 0, 100, 123, node().lockedTotal, 0, 20n, node().lpRegistered, node().lpCustodied, false, 0]] };
    return iface.encodeFunctionResult(fn.name, results[fn.name]);
  } };
  const result = await createNodeHub().read({ provider, account: ACCOUNT });
  assert.equal(result.walletBalance, 5n);
  assert.equal(result.lpCustodied, node().lpCustodied);
  assert.ok(requests.every(({ method }) => !method.includes("send") && !method.includes("sign")));
});

test("claim and LP exit simulate and send zero-argument methods with confirmed events", async () => {
  for (const action of ["claimLocked", "removeLP"]) {
    const f = fixture();
    const statuses = [];
    const result = await f.hub.execute({ provider: f.provider, account: ACCOUNT, action, onStatus: (s) => statuses.push(s) });
    assert.deepEqual(f.calls, [{ action, args: [] }]);
    assert.deepEqual(f.writes, [{ action, args: [] }]);
    assert.equal(result.hash, HASH);
    assert.deepEqual(statuses.map((s) => s.phase), ["checking", "signing", "pending", "success"]);
  }
});

test("preflight prevents writes for empty claims, exited nodes, pause, and missing LP", async () => {
  const cases = [
    ["NothingToClaim", "claimLocked", (f) => { f.client.hub.claimableLocked = async () => 0n; }],
    ["NodeNotFound", "claimLocked", (f) => { f.client.hub.nodeOf = async () => 0n; }],
    ["EnforcedPause", "claimLocked", (f) => { f.client.hub.paused = async () => true; }],
    ["NodeAlreadyExited", "removeLP", (f) => { f.data.status = 1n; }],
    ["removeLP allows a node with any registered LP", "removeLP", (f) => { f.data.lpCustodied = 0n; }],
    ["LpAlreadyRemoved", "removeLP", (f) => { f.data.lpRemoved = true; }],
    ["NoExitLp", "removeLP", (f) => { f.data.lpRegistered = 0n; }],
  ];
  for (const [code, action, setup] of cases) {
    const f = fixture(); setup(f);
    if (code.startsWith("removeLP allows")) {
      await f.hub.execute({ provider: f.provider, account: ACCOUNT, action });
    } else {
      await assert.rejects(f.hub.execute({ provider: f.provider, account: ACCOUNT, action }), { code });
    }
    assert.equal(f.writes.length, code.startsWith("removeLP allows") ? 1 : 0);
  }
});

test("exited nodes block dividend claim preflight", () => {
  assert.equal(hubActionBlock({ nodeId: 1n, exited: true, paused: false }, "claimDividend"), "NodeAlreadyExited");
});

test("dividend claim data uses the exact Hub tuple ABI and signature bytes", () => {
  const data = encodeDividendClaimData({
    user: ACCOUNT,
    token: TOKEN_ADDRESS,
    amount: 50n * 10n ** 18n,
    nonce: 1n,
    deadline: 1788942013n,
  }, `0x${"40".repeat(65)}`);
  assert.equal(data.slice(0, 10), "0xe94c5cc3");
  const decoded = iface.decodeFunctionData("claimDividend", data);
  assert.equal(decoded[0].user.toLowerCase(), ACCOUNT.toLowerCase());
  assert.equal(decoded[0].token.toLowerCase(), TOKEN_ADDRESS.toLowerCase());
  assert.equal(decoded[0].amount, 50n * 10n ** 18n);
  assert.equal(decoded[0].nonce, 1n);
  assert.equal(decoded[0].deadline, 1788942013n);
  assert.equal(decoded[1], `0x${"40".repeat(65)}`);
});

test("dividend simulation errors retain the Hub custom error selector", async () => {
  const f = fixture();
  const signer = Wallet.createRandom();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 240);
  const claim = { user: ACCOUNT, token: TOKEN_ADDRESS, amount: 50n * 10n ** 18n, nonce: 1n, deadline };
  const domain = { name: "LabdogNodeHub", version: "1", chainId: 97, verifyingContract: HUB_ADDRESS };
  const signature = await signer.signTypedData(domain, DIVIDEND_TYPES, claim);
  f.client.hub.signer = async () => signer.address;
  f.client.hub.userNonce = async () => 0n;
  f.client.hub.rewardToken = async () => TOKEN_ADDRESS;
  const revertData = iface.encodeErrorResult("InsufficientRewardPool");
  f.client.dividend = { claimDividend: Object.assign(async () => assert.fail("simulation must fail before sending"), {
    staticCall: async () => { throw Object.assign(new Error("execution reverted"), { info: { error: { data: revertData } } }); },
  }) };
  await assert.rejects(f.hub.execute({
    provider: f.provider,
    account: ACCOUNT,
    action: "claimDividend",
    order: {
      orderId: "WD-simulation",
      user: ACCOUNT,
      amount: "50000000000000000000",
      nonce: "1",
      deadlineSec: deadline.toString(),
      deadline: new Date(Number(deadline) * 1000).toISOString(),
      hub: HUB_ADDRESS,
      token: TOKEN_ADDRESS,
      chainId: "97",
      domain,
      signature,
      status: "PENDING",
    },
    expectedAmount: 50n * 10n ** 18n,
  }), (error) => {
    assert.equal(hubErrorKey(error), "InsufficientRewardPool");
    return true;
  });
});

test("dividend claim forwards backend fields to the Hub without frontend validity checks", async () => {
  const f = fixture();
  const order = {
    user: OTHER,
    token: OTHER,
    amount: "50000000000000000000",
    nonce: "999",
    deadlineSec: "1",
  };
  const claim = createDividendClaim(order);
  assert.deepEqual(claim, { user: OTHER, token: OTHER, amount: 50n * 10n ** 18n, nonce: 999n, deadline: 1n });
  const calls = [];
  f.client.dividend = { claimDividend: Object.assign(async (...args) => { calls.push(["send", ...args]); return { hash: HASH, wait: async () => ({ status: 1, logs: [] }) }; }, { staticCall: async (...args) => { calls.push(["simulate", ...args]); } }) };
  await assert.rejects(f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "claimDividend", order, expectedAmount: 1n }), { code: "EVENT_NOT_CONFIRMED" });
  assert.deepEqual(calls, [["send", claim, order.signature]]);
});

test("dividend receipts accept a relayer claimer when signed fields match", async () => {
  const { signer, order, claim } = await (async () => {
    const signer = Wallet.createRandom();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 240);
    const claim = { user: ACCOUNT, token: TOKEN_ADDRESS, amount: 50n * 10n ** 18n, nonce: 1n, deadline };
    const domain = { name: "LabdogNodeHub", version: "1", chainId: 97, verifyingContract: HUB_ADDRESS };
    return { signer, claim, order: { orderId: "WD-relayer", user: ACCOUNT, amount: claim.amount.toString(), nonce: "1", deadlineSec: deadline.toString(), deadline: new Date(Number(deadline) * 1000).toISOString(), hub: HUB_ADDRESS, token: TOKEN_ADDRESS, chainId: "97", domain, signature: await signer.signTypedData(domain, DIVIDEND_TYPES, claim), status: "PENDING" } };
  })();
  const f = fixture();
  f.client.hub.signer = async () => signer.address;
  f.client.hub.userNonce = async () => 0n;
  f.client.hub.rewardToken = async () => TOKEN_ADDRESS;
  const event = iface.encodeEventLog(iface.getEvent("DividendClaimed"), [ACCOUNT, TOKEN_ADDRESS, claim.amount, claim.nonce, claim.deadline, OTHER]);
  f.client.dividend = { claimDividend: Object.assign(async () => ({ hash: HASH, wait: async () => ({ status: 1, logs: [{ address: HUB_ADDRESS, ...event }] }) }), { staticCall: async () => {} }) };
  const result = await f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "claimDividend", order, expectedAmount: claim.amount });
  assert.equal(result.hash, HASH);
});

test("wallet and session changes during preflight prevent a signature request", async () => {
  for (const change of ["account", "chain", "abort"]) {
    const f = fixture(); const controller = new AbortController();
    f.client.hub.claimLocked.staticCall = async () => {
      if (change === "account") f.provider.account = OTHER;
      if (change === "chain") f.provider.chain = "0x38";
      if (change === "abort") controller.abort();
    };
    await assert.rejects(f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "claimLocked", signal: controller.signal }));
    assert.equal(f.writes.length, 0);
  }
});

test("reverts and missing or unrelated Hub events never report success and retain the hash", async () => {
  for (const result of [{ status: 0, logs: [] }, { status: 1, logs: [] }, receipt("claimLocked", OTHER)]) {
    const f = fixture(); const statuses = [];
    f.client.hub.claimLocked = Object.assign(async () => ({ hash: HASH, wait: async () => result }), { staticCall: async () => {} });
    await assert.rejects(f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "claimLocked", onStatus: (s) => statuses.push(s) }), (error) => error.transactionHash === HASH);
    assert.ok(!statuses.some((s) => s.phase === "success"));
  }
});

test("speed-up replacements are confirmed but cancellations cannot become success", async () => {
  for (const cancelled of [false, true]) {
    const f = fixture(); const data = iface.encodeFunctionData("removeLP");
    f.client.hub.removeLP = Object.assign(async () => ({ hash: HASH, data, wait: async () => { throw Object.assign(new Error("replacement"), { code: "TRANSACTION_REPLACED", cancelled, replacement: { to: HUB_ADDRESS, data }, receipt: receipt("removeLP") }); } }), { staticCall: async () => {} });
    const pending = f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "removeLP" });
    if (cancelled) await assert.rejects(pending, { code: "TRANSACTION_CANCELLED" });
    else assert.equal((await pending).hash, HASH);
  }
});

test("exited nodes retain historical allocation but have no active LP share", async () => {
  const f = fixture(); f.data.status = 1n;
  const result = await f.hub.read({ provider: f.provider, account: ACCOUNT });
  assert.equal(result.lpShare, 0n);
  assert.equal(result.lockedTotal, f.data.lockedTotal);
  assert.equal(hubActionBlock(result, "claimLocked"), "NodeAlreadyExited");
});

test("custom ABI errors and wallet rejection map to stable messages", () => {
  assert.equal(hubErrorKey({ code: 4001 }), "rejected");
  assert.equal(hubErrorKey({ info: { error: { data: iface.encodeErrorResult("InsufficientRewardPool") } } }), "InsufficientRewardPool");
  assert.equal(hubErrorKey({ revert: { name: "LpNotCustodied" } }), "LpNotCustodied");
});

test("a lost confirmation response preserves the receipt link without claiming the transaction failed", async () => {
  const f = fixture();
  f.client.hub.claimLocked = Object.assign(async () => ({ hash: HASH, wait: async () => { throw Object.assign(new Error("Disconnected"), { code: "NETWORK_ERROR" }); } }), { staticCall: async () => {} });
  await assert.rejects(f.hub.execute({ provider: f.provider, account: ACCOUNT, action: "claimLocked" }), (error) => {
    assert.equal(error.transactionHash, HASH);
    assert.equal(hubErrorKey(error), "EVENT_NOT_CONFIRMED");
    return true;
  });
});
