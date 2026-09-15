import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createWalletSession, describeSessionError, ensureWalletChain, loginWallet } from "./wallet-session.js";
import { createReliableWalletProvider } from "./wallet.js";

const ACCOUNT = "0x1234567890Abcdef1234567890abcdef12345678";
const OTHER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ chain = "0x38", accounts = ACCOUNT } = {}) {
  const provider = new EventEmitter();
  const calls = [];
  provider.account = accounts;
  provider.chain = chain;
  provider.request = async (payload) => {
    calls.push(payload);
    if (payload.method === "eth_requestAccounts" || payload.method === "eth_accounts") return provider.account ? [provider.account] : [];
    if (payload.method === "eth_chainId") return provider.chain;
    if (payload.method === "wallet_switchEthereumChain") { provider.chain = payload.params[0].chainId; return null; }
    if (payload.method === "wallet_revokePermissions") { const error = new Error("Unsupported method"); error.code = 4200; throw error; }
    throw new Error(`Unexpected method: ${payload.method}`);
  };
  let state;
  const manager = createWalletSession({ provider, onChange: (next) => { state = next; } });
  return { provider, calls, manager, state: () => state };
}

test("a wallet that opens on another chain is switched to BSC instead of failing the login", async () => {
  const f = fixture({ chain: "0x1" });
  await f.manager.connect();
  assert.equal(f.state().account, ACCOUNT.toLowerCase());
  assert.equal(f.state().error, "");
  const switched = f.calls.filter((call) => call.method === "wallet_switchEthereumChain");
  assert.equal(switched.length, 1);
  assert.equal(switched[0].params[0].chainId, "0x38");
  // The wallet owns RPC selection: never push a fixed RPC through add-chain.
  assert.equal(f.calls.some((call) => call.method === "wallet_addEthereumChain"), false);
  f.manager.dispose();
});

test("a wallet that does not know BSC reports a network problem without inventing an RPC", async () => {
  const f = fixture({ chain: "0x1" });
  f.provider.request = async (payload) => {
    f.calls.push(payload);
    if (payload.method === "eth_chainId") return "0x1";
    if (payload.method === "eth_requestAccounts" || payload.method === "eth_accounts") return [ACCOUNT];
    if (payload.method === "wallet_switchEthereumChain") { const error = new Error("Unrecognized chain ID"); error.code = 4902; throw error; }
    throw new Error(`Unexpected method: ${payload.method}`);
  };
  await f.manager.connect();
  assert.equal(f.state().error, "chainNotConfigured");
  assert.equal(f.calls.some((call) => call.method === "wallet_addEthereumChain"), false);
  f.manager.dispose();
});

test("ensureWalletChain waits for a mobile wallet that reports the old chain briefly", async () => {
  let reads = 0;
  const provider = {
    async request({ method, params }) {
      if (method === "eth_chainId") { reads += 1; return reads < 3 ? "0x1" : "0x38"; }
      if (method === "wallet_switchEthereumChain") { assert.equal(params[0].chainId, "0x38"); return null; }
      throw new Error(`Unexpected method: ${method}`);
    },
  };
  await ensureWalletChain(provider);
  assert.ok(reads >= 3);
});

test("a mobile wallet that reports no account right after its own prompt still logs in", async () => {
  let accountReads = 0;
  const provider = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x38";
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "eth_accounts") { accountReads += 1; return accountReads <= 2 ? [] : [ACCOUNT]; }
      throw new Error(`Unexpected method: ${method}`);
    },
  };
  const session = await loginWallet({ provider, account: ACCOUNT, tolerateMissingAccount: true });
  assert.equal(session.account, ACCOUNT.toLowerCase());
  await assert.rejects(() => loginWallet({ provider, account: ACCOUNT }), { code: "ACCOUNT_CHANGED" });
});

test("a different wallet account is always rejected", async () => {
  const provider = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x38";
      if (method === "eth_accounts") return [OTHER];
      throw new Error(`Unexpected method: ${method}`);
    },
  };
  await assert.rejects(() => loginWallet({ provider, account: ACCOUNT, tolerateMissingAccount: true }), { code: "ACCOUNT_CHANGED" });
});

test("a wallet that never answers the prompt cannot leave the connect button stuck", async () => {
  const provider = createReliableWalletProvider({ request: () => new Promise(() => {}) }, { promptTimeoutMs: 40 });
  let state;
  const manager = createWalletSession({ provider, onChange: (next) => { state = next; } });
  await manager.connect();
  assert.equal(state.busy, false);
  assert.equal(state.error, "timeout");
  assert.equal(state.account, "");
  manager.dispose();
});

test("a slow passive probe cannot block or overwrite an interactive connect", async () => {
  const f = fixture();
  let accountCalls = 0;
  f.provider.request = async (payload) => {
    f.calls.push(payload);
    if (payload.method === "eth_accounts") { accountCalls += 1; if (accountCalls === 1) return new Promise(() => {}); return [ACCOUNT]; }
    if (payload.method === "eth_requestAccounts") return [ACCOUNT];
    if (payload.method === "eth_chainId") return "0x38";
    throw new Error(`Unexpected method: ${payload.method}`);
  };
  const passive = f.manager.connect(false);
  await tick();
  await f.manager.connect();
  assert.equal(f.state().account, ACCOUNT.toLowerCase());
  assert.equal(f.state().busy, false);
  assert.equal(accountCalls >= 2, true);
  passive.then(() => undefined, () => undefined);
  f.manager.dispose();
});

test("disconnecting does not disable the connect button until reload", async () => {
  const f = fixture();
  await f.manager.connect();
  assert.equal(f.state().account, ACCOUNT.toLowerCase());
  await f.manager.disconnect();
  assert.equal(f.state().account, "");
  await f.manager.connect();
  assert.equal(f.state().account, ACCOUNT.toLowerCase(), "a user must be able to reconnect after disconnecting");
  f.manager.dispose();
});

test("account and chain events update or clear the session", async () => {
  const f = fixture();
  await f.manager.connect();
  f.provider.account = OTHER;
  f.provider.emit("accountsChanged", [OTHER]);
  await tick();
  assert.equal(f.state().account, OTHER.toLowerCase());
  f.provider.emit("chainChanged", "0x1");
  assert.equal(f.state().account, "");
  assert.equal(f.state().error, "wrongChain");
  f.manager.dispose();
});

test("session errors map to stable user-facing keys", () => {
  assert.equal(describeSessionError({ code: 4001 }), "rejected");
  assert.equal(describeSessionError({ code: "WALLET_TIMEOUT" }), "timeout");
  assert.equal(describeSessionError({ code: "CHAIN_NOT_CONFIGURED" }), "chainNotConfigured");
  assert.equal(describeSessionError({ code: "PROVIDER_NOT_FOUND" }), "missing");
  assert.equal(describeSessionError({ code: "ACCOUNT_CHANGED" }), "accountChanged");
  assert.equal(describeSessionError(new Error("boom")), "loginFailed");
});

test("dispose clears the session and stops emitting", async () => {
  const f = fixture();
  await f.manager.connect();
  f.manager.dispose();
  assert.equal(f.state().account, "");
  f.provider.emit("accountsChanged", [OTHER]);
  await tick();
  assert.equal(f.state().account, "");
});
