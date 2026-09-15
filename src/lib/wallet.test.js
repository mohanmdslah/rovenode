import test from "node:test";
import assert from "node:assert/strict";
import {
  connectInjectedWallet,
  createReliableWalletProvider,
  discoverInjectedWallet,
  disconnectInjectedWallet,
  formatWalletAddress,
  getInjectedWalletProvider,
  isWalletAddress,
  watchInjectedWallet,
} from "./wallet.js";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeSource() {
  const listeners = new Map();
  const source = {
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) ?? []), handler]); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== handler)); },
    dispatchEvent(event) { (listeners.get(event.type) ?? []).forEach((handler) => handler(event)); return true; },
    listenerCount(type) { return (listeners.get(type) ?? []).length; },
    emit(type, detail) { (listeners.get(type) ?? []).forEach((handler) => handler({ type, detail })); },
  };
  return source;
}

test("wallet addresses are validated and formatted for compact display", () => {
  assert.equal(isWalletAddress(ADDRESS), true);
  assert.equal(isWalletAddress("0x1234"), false);
  assert.equal(formatWalletAddress(ADDRESS), "0x1234...5678");
  assert.equal(formatWalletAddress("invalid"), "");
});

test("wallet connection requests accounts from an EIP-1193 provider", async () => {
  const requests = [];
  const provider = {
    async request(payload) {
      requests.push(payload);
      return [ADDRESS];
    },
  };

  assert.equal(await connectInjectedWallet(provider), ADDRESS);
  assert.deepEqual(requests, [{ method: "eth_requestAccounts" }]);
});

test("wallet connection reports missing providers and empty account lists", async () => {
  await assert.rejects(() => connectInjectedWallet(null), { code: "PROVIDER_NOT_FOUND" });
  await assert.rejects(() => connectInjectedWallet({ request: async () => [] }), { code: "ACCOUNT_NOT_FOUND" });
});

test("mobile provider requests are serialized and transient reads retry", async () => {
  let inFlight = 0;
  let peak = 0;
  let chainAttempts = 0;
  const provider = createReliableWalletProvider({
    request: async ({ method }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      if (method === "eth_chainId" && chainAttempts++ === 0) {
        const error = new Error("bridge busy");
        error.code = -32603;
        throw error;
      }
      return method === "eth_chainId" ? "0x61" : [ADDRESS];
    },
  }, { readRetries: 1 });

  const [chain, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);

  assert.equal(chain, "0x61");
  assert.deepEqual(accounts, [ADDRESS]);
  assert.equal(chainAttempts, 2);
  assert.equal(peak, 1);
});

test("delayed wallet injection is discovered through the initialized event", async () => {
  const source = new EventTarget();
  const provider = { request: async () => [ADDRESS] };
  const discovered = discoverInjectedWallet({ source, timeoutMs: 50 });
  setTimeout(() => {
    source.ethereum = provider;
    source.dispatchEvent(new Event("ethereum#initialized"));
  }, 1);
  assert.equal((await discovered).rawProvider, provider);
});

test("wallet disconnect revokes permissions when the provider supports it", async () => {
  const requests = [];
  const provider = {
    async request(payload) {
      requests.push(payload);
      return null;
    },
  };

  assert.equal(await disconnectInjectedWallet(provider), true);
  assert.deepEqual(requests, [{ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }]);
});

test("wallet disconnect falls back to local state when revoke is unsupported", async () => {
  const provider = {
    async request() {
      const error = new Error("Unsupported method");
      error.code = 4200;
      throw error;
    },
  };

  assert.equal(await disconnectInjectedWallet(provider), false);
});

test("a wallet injected after the one-shot discovery window is still picked up", async () => {
  const source = fakeSource();
  assert.equal(await discoverInjectedWallet({ source, timeoutMs: 40 }), null);

  const seen = [];
  const stop = watchInjectedWallet({ source, pollMs: 0, onProvider: (provider) => seen.push(provider) });
  assert.deepEqual(seen, []);

  const provider = { request: async () => [ADDRESS] };
  source.ethereum = provider;
  source.emit("ethereum#initialized");
  await tick();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].rawProvider, provider);
  stop();
});

test("the injected wallet watcher detaches its listeners when stopped", async () => {
  const source = fakeSource();
  const stop = watchInjectedWallet({ source, pollMs: 0, onProvider: () => {} });
  assert.ok(source.listenerCount("ethereum#initialized") > 0);
  stop();
  assert.equal(source.listenerCount("ethereum#initialized"), 0);
  assert.equal(source.listenerCount("eip6963:announceProvider"), 0);
});

test("a prompt that never settles cannot block later wallet reads", async () => {
  const provider = createReliableWalletProvider({
    request: ({ method }) => (method === "eth_requestAccounts" ? new Promise(() => {}) : Promise.resolve("0x38")),
  }, { promptTimeoutMs: 40 });

  await assert.rejects(() => provider.request({ method: "eth_requestAccounts" }), { code: "WALLET_TIMEOUT" });
  assert.equal(await provider.request({ method: "eth_chainId" }), "0x38");
});

test("a read that never settles times out and releases the queue", async () => {
  let calls = 0;
  const provider = createReliableWalletProvider({
    request: () => { calls += 1; return calls === 1 ? new Promise(() => {}) : Promise.resolve("ok"); },
  }, { readTimeoutMs: 30, readRetries: 0 });

  await assert.rejects(() => provider.request({ method: "eth_blockNumber" }), { code: "WALLET_TIMEOUT" });
  assert.equal(await provider.request({ method: "eth_blockNumber" }), "ok");
});

test("wallets that only expose a legacy send bridge are still usable", async () => {
  const source = { ethereum: { send: (payload, callback) => callback(null, { id: payload.id, result: [ADDRESS] }) } };
  const provider = getInjectedWalletProvider(source);
  assert.deepEqual(await provider.request({ method: "eth_requestAccounts" }), [ADDRESS]);
  assert.equal(getInjectedWalletProvider(source), provider, "repeated discovery returns the same adapter");
});

test("a multi-provider wallet exposes the injected aggregator first", async () => {
  const first = { request: async () => [ADDRESS] };
  const second = { request: async () => [ADDRESS] };
  const source = { ethereum: { request: async () => [ADDRESS], providers: [second] } };
  assert.equal(getInjectedWalletProvider(source).rawProvider, source.ethereum);
  const fallback = { ethereum: { providers: [first, second] } };
  assert.equal(getInjectedWalletProvider(fallback).rawProvider, first);
});

test("EIP-6963 announcements are discovered when window.ethereum is absent", async () => {
  const source = fakeSource();
  const announced = { request: async () => [ADDRESS] };
  const seen = [];
  const stop = watchInjectedWallet({ source, pollMs: 0, onProvider: (provider) => seen.push(provider) });
  source.emit("eip6963:announceProvider", { provider: announced });
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].rawProvider, announced);
  stop();
});

test("disconnect treats an unsupported revoke as a local-only disconnect", async () => {
  const provider = {
    async request() {
      throw Object.assign(new Error("Method not found"), { code: -32601 });
    },
  };
  assert.equal(await disconnectInjectedWallet(provider), false);
});
