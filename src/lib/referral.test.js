import test from "node:test";
import assert from "node:assert/strict";
import { Contract, Interface, getAddress } from "ethers";
import {
  REFERRAL_ABI,
  REFERRAL_MAX_PAGE_SIZE,
  REFERRAL_PAGE_SIZE,
  REFERRAL_ROOT_ADDRESS,
  ZERO_ADDRESS,
  createBindUpline,
  createReferralReader,
  describeNodeLevel,
  describeReferralError,
  describeReferralPage,
  isZeroAddress,
  normalizeWalletAddress,
  sameWalletAddress,
  validateUplineAddress,
} from "./referral.js";
import { createNodePurchase, describeNodePurchaseError } from "./node-purchase.js";

const ROOT = REFERRAL_ROOT_ADDRESS;
// Real, checksum-valid addresses: ethers refuses a mixed-case address whose
// EIP-55 checksum does not match.
const WALLET = getAddress("0x1234567890abcdef1234567890abcdef12345678");
const UPLINE = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const DOWN_A = getAddress("0x1111111111111111111111111111111111111111");
const DOWN_B = getAddress("0x2222222222222222222222222222222222222222");
const BUYER = getAddress("0x3333333333333333333333333333333333333333");
const PROVIDER = { request: async () => null };

/** Flip one letter's case so the EIP-55 checksum no longer matches. */
function brokenChecksum(address) {
  return `0x${address.slice(2).replace(/[a-f]/, (character) => character.toUpperCase())}`;
}

test("referral page maths clamps pages, sizes and empty totals", () => {
  assert.deepEqual(describeReferralPage(0, 1, 10), {
    page: 1, pageCount: 1, pageSize: 10, offset: 0, total: 0,
    hasPrevious: false, hasNext: false, start: 0, end: 0,
  });
  assert.deepEqual(describeReferralPage(25, 3, 10), {
    page: 3, pageCount: 3, pageSize: 10, offset: 20, total: 25,
    hasPrevious: true, hasNext: false, start: 21, end: 25,
  });
  assert.equal(describeReferralPage(25, 9, 10).page, 3, "a page past the end clamps to the last page");
  assert.equal(describeReferralPage(25, 0, 10).page, 1, "page zero clamps to the first page");
  assert.equal(describeReferralPage(500, 1, 5000).pageSize, REFERRAL_MAX_PAGE_SIZE, "page size is capped");
  assert.equal(REFERRAL_PAGE_SIZE, 10, "the console shows ten rows per page");
});

test("node level labels only render real tiers", () => {
  assert.equal(describeNodeLevel(1), "L1");
  assert.equal(describeNodeLevel(3), "L3");
  assert.equal(describeNodeLevel(0), "", "level 0 means the address is not a node yet");
  assert.equal(describeNodeLevel(undefined), "");
});

test("address helpers tolerate non-addresses and detect the zero address", () => {
  assert.equal(isZeroAddress(ZERO_ADDRESS), true);
  assert.equal(isZeroAddress(WALLET), false);
  assert.equal(sameWalletAddress(WALLET, WALLET.toUpperCase().replace("0X", "0x")), true);
  assert.equal(sameWalletAddress(WALLET, WALLET.toLowerCase()), true);
  assert.equal(sameWalletAddress("not-an-address", WALLET), false);
  // A pasted mixed-case address with a broken checksum still compares equal.
  assert.equal(sameWalletAddress(WALLET, brokenChecksum(WALLET)), true);
});

test("wallet addresses are normalised to a form the contract accepts", () => {
  assert.equal(normalizeWalletAddress(WALLET), WALLET);
  assert.equal(normalizeWalletAddress(WALLET.toLowerCase()), WALLET, "all-lowercase becomes checksummed");
  assert.equal(normalizeWalletAddress(`0x${WALLET.slice(2).toUpperCase()}`), WALLET, "all-uppercase is a valid input form");
  const broken = brokenChecksum(WALLET);
  assert.throws(() => getAddress(broken), "the fixture really is a broken checksum");
  assert.equal(normalizeWalletAddress(broken), WALLET.toLowerCase(), "a broken checksum falls back to lowercase");
  assert.equal(normalizeWalletAddress("0x1234"), "");
  assert.equal(normalizeWalletAddress(undefined), "");
});

test("upline preflight rejects malformed, self and unregistered addresses", () => {
  assert.equal(validateUplineAddress("", { account: WALLET }), "invalidUpline");
  assert.equal(validateUplineAddress("0x1234", { account: WALLET }), "invalidUpline");
  assert.equal(validateUplineAddress(ZERO_ADDRESS, { account: WALLET }), "invalidUpline");
  assert.equal(validateUplineAddress(WALLET, { account: WALLET }), "cannotBindSelf");
  assert.equal(validateUplineAddress(UPLINE, { account: WALLET, isUplineRegistered: () => false }), "uplineNotRegistered");
  assert.equal(validateUplineAddress(UPLINE, { account: WALLET }), "");
  assert.equal(validateUplineAddress(`  ${UPLINE}  `, { account: WALLET }), "", "surrounding whitespace is ignored");
});

test("referral errors map to stable copy keys from codes, names and messages", () => {
  assert.equal(describeReferralError({ code: 4001 }), "rejected");
  assert.equal(describeReferralError({ code: "MUST_BIND_UPLINE" }), "mustBindUpline");
  assert.equal(describeReferralError({ code: "ALREADY_BOUND" }), "alreadyBound");
  assert.equal(describeReferralError({ revert: { name: "UplineNotRegistered" } }), "uplineNotRegistered");
  assert.equal(describeReferralError({ revert: { name: "CannotBindSelf" } }), "cannotBindSelf");
  assert.equal(describeReferralError({ message: "execution reverted: AlreadyBound()" }), "alreadyBound");
  assert.equal(describeReferralError({ message: "execution reverted: MustBindUpline()" }), "mustBindUpline");
  assert.equal(describeReferralError({ message: "network error" }), "failed");
});

function fakeSale(overrides = {}) {
  return {
    isRegistered: async () => true,
    paused: async () => false,
    getNodeLevel: async () => 0,
    getUpline: async () => ({ upline: ZERO_ADDRESS, uplineLevel: 0 }),
    getDirectDownlineCount: async () => 0,
    getDirectDownlines: async () => ({ accounts: [], levels: [] }),
    ...overrides,
  };
}

test("an unbound wallet reads as no upline instead of the zero address", async () => {
  const reader = createReferralReader({ createSale: () => fakeSale() });
  assert.deepEqual(await reader.readUpline({ provider: PROVIDER, account: WALLET }), { address: "", level: 0, isRoot: false });
});

test("the root vertex is reported as the upline without pretending it is a node", async () => {
  const reader = createReferralReader({ createSale: () => fakeSale({ getUpline: async () => ({ upline: ROOT, uplineLevel: 0 }) }) });
  assert.deepEqual(await reader.readUpline({ provider: PROVIDER, account: WALLET }), { address: ROOT, level: 0, isRoot: true });
});

test("a downline page pairs each address with its node identity", async () => {
  const requested = [];
  const reader = createReferralReader({
    createSale: () => fakeSale({
      getDirectDownlineCount: async () => 25,
      getDirectDownlines: async (_account, offset, limit) => {
        requested.push({ offset, limit });
        return { accounts: [DOWN_A, DOWN_B], levels: [2, 0] };
      },
    }),
  });
  const page = await reader.readDirectDownlines({ provider: PROVIDER, account: WALLET, page: 2 });
  assert.deepEqual(requested, [{ offset: 10, limit: 10 }], "page two asks the contract for offset 10, limit 10");
  assert.equal(page.count, 25);
  assert.equal(page.pageCount, 3);
  assert.deepEqual(page.rows, [
    { address: DOWN_A, level: 2, isRoot: false },
    { address: DOWN_B, level: 0, isRoot: false },
  ]);
});

test("the overview carries the wallet's own level and the network size", async () => {
  const reader = createReferralReader({
    createSale: () => fakeSale({
      getNodeLevel: async () => 3,
      registeredCount: async () => 43,
      getUpline: async () => ({ upline: ROOT, uplineLevel: 0 }),
      getDirectDownlineCount: async () => 0,
    }),
  });
  const overview = await reader.readOverview({ provider: PROVIDER, account: WALLET });
  assert.equal(overview.ownLevel, 3);
  assert.equal(overview.networkSize, 42, "the root vertex is excluded from the network total");
  assert.equal(overview.registered, true);
  assert.deepEqual(overview.upline, { address: ROOT, level: 0, isRoot: true });
});

test("an empty network never reports a negative size", async () => {
  const reader = createReferralReader({ createSale: () => fakeSale({ registeredCount: async () => 1 }) });
  assert.equal(await reader.readNetworkSize({ provider: PROVIDER }), 0);
  const empty = createReferralReader({ createSale: () => fakeSale({ registeredCount: async () => 0 }) });
  assert.equal(await empty.readNetworkSize({ provider: PROVIDER }), 0);
  await assert.rejects(() => reader.readNetworkSize({ provider: null }), { code: "PROVIDER_NOT_FOUND" });
});

test("an empty downline set never hits the paged getter", async () => {
  let called = false;
  const reader = createReferralReader({
    createSale: () => fakeSale({
      getDirectDownlineCount: async () => 0,
      getDirectDownlines: async () => { called = true; return { accounts: [], levels: [] }; },
    }),
  });
  const page = await reader.readDirectDownlines({ provider: PROVIDER, account: WALLET, page: 4 });
  assert.equal(called, false);
  assert.equal(page.count, 0);
  assert.equal(page.page, 1, "an empty set clamps back to page one");
  assert.deepEqual(page.rows, []);
});

test("the reader refuses to query without a provider or a usable account", async () => {
  const reader = createReferralReader({ createSale: () => fakeSale() });
  await assert.rejects(() => reader.isRegistered({ provider: null, account: WALLET }), { code: "PROVIDER_NOT_FOUND" });
  await assert.rejects(() => reader.isRegistered({ provider: PROVIDER, account: "0x1234" }), { code: "INVALID_ACCOUNT" });
});

function bindFixture({ registered = false, uplineRegistered = true, revert = null, logs = null } = {}) {
  const iface = new Interface(REFERRAL_ABI);
  const sent = [];
  const signer = { getAddress: async () => WALLET };
  const sale = {
    interface: iface,
    isRegistered: async (address) => (sameWalletAddress(address, WALLET) ? registered : uplineRegistered),
    bindUpline: async (target) => {
      sent.push(target);
      if (revert) throw revert;
      return {
        hash: "0xbind",
        wait: async () => ({
          status: 1,
          hash: "0xbind",
          logs: logs ?? [{ ...iface.encodeEventLog(iface.getEvent("UplineBound"), [WALLET, target]) }],
        }),
      };
    },
  };
  const bind = createBindUpline({
    ensureChain: async () => {},
    createClient: async () => ({ signer, sale }),
  });
  return { bind, sent };
}

test("binding sends the upline transaction and confirms it through the event", async () => {
  const f = bindFixture();
  const result = await f.bind({ provider: PROVIDER, account: WALLET, upline: UPLINE });
  assert.deepEqual(f.sent, [UPLINE]);
  assert.equal(result.upline, UPLINE);
  assert.equal(result.hash, "0xbind");
});

test("binding is refused before opening a wallet prompt when it cannot succeed", async () => {
  const already = bindFixture({ registered: true });
  await assert.rejects(() => already.bind({ provider: PROVIDER, account: WALLET, upline: UPLINE }), { code: "ALREADY_BOUND" });
  assert.equal(already.sent.length, 0, "no transaction is sent when the wallet is already bound");

  const notJoined = bindFixture({ uplineRegistered: false });
  await assert.rejects(() => notJoined.bind({ provider: PROVIDER, account: WALLET, upline: UPLINE }), { code: "UPLINE_NOT_REGISTERED" });
  assert.equal(notJoined.sent.length, 0);

  const self = bindFixture();
  await assert.rejects(() => self.bind({ provider: PROVIDER, account: WALLET, upline: WALLET }), { code: "CANNOT_BIND_SELF" });
  assert.equal(self.sent.length, 0);

  const malformed = bindFixture();
  await assert.rejects(() => malformed.bind({ provider: PROVIDER, account: WALLET, upline: "0xnope" }), { code: "INVALID_UPLINE" });
  assert.equal(malformed.sent.length, 0);
});

test("a receipt without the matching UplineBound event is not treated as success", async () => {
  const other = getAddress("0x9999999999999999999999999999999999999999");
  const iface = new Interface(REFERRAL_ABI);
  const f = bindFixture({ logs: [{ ...iface.encodeEventLog(iface.getEvent("UplineBound"), [other, UPLINE]) }] });
  await assert.rejects(() => f.bind({ provider: PROVIDER, account: WALLET, upline: UPLINE }), { code: "BIND_UNCONFIRMED" });
});

test("a purchase is blocked until the wallet has bound an upline", async () => {
  const order = [];
  const sale = {
    isRegistered: async () => { order.push("isRegistered"); return false; },
    paused: async () => { order.push("paused"); return false; },
    getNodeLevel: async () => 0,
    getTierConfig: async () => { order.push("getTierConfig"); return { priceRaw: 1n, maxSupply: 1n, sold: 0n }; },
  };
  const usdt = { balanceOf: async () => 0n, allowance: async () => 0n };
  const purchase = createNodePurchase({
    ensureChain: async () => {},
    createClient: async () => ({ account: BUYER, sale, usdt }),
  });

  await assert.rejects(() => purchase({ provider: PROVIDER, expectedAccount: BUYER, tier: 1 }), { code: "MUST_BIND_UPLINE" });
  assert.deepEqual(order, ["isRegistered"], "registration is checked before pause, tier config or allowance");
  assert.equal(describeNodePurchaseError({ code: "MUST_BIND_UPLINE" }), "mustBindUpline");
  assert.equal(describeNodePurchaseError({ revert: { name: "MustBindUpline" } }), "mustBindUpline");
});

test("the referral ABI matches the deployed contract surface", () => {
  const contract = new Contract(ROOT, REFERRAL_ABI);
  for (const signature of [
    "root()", "isRegistered(address)", "registeredCount()", "getUpline(address)",
    "getDirectDownlineCount(address)", "getDirectDownlines(address,uint256,uint256)",
    "getRegisteredPage(uint256,uint256)", "getUplineChain(address,uint256)", "bindUpline(address)",
    "getNodeLevel(address)",
  ]) {
    assert.ok(contract.interface.getFunction(signature), `${signature} is missing from the ABI`);
  }
  assert.ok(contract.interface.getEvent("UplineBound"));
});
