/**
 * Verifies the Huawei / mobile wallet-interaction fixes end to end.
 * Run with: node qa/huawei-wallet-check.mjs
 */
import { createReliableWalletProvider, discoverInjectedWallet, watchInjectedWallet } from "../src/lib/wallet.js";
import { createWalletSession } from "../src/lib/wallet-session.js";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
};
const withTimeout = (promise, ms) => Promise.race([
  promise.then(() => "settled", (error) => `rejected:${error?.code}`),
  new Promise((resolve) => setTimeout(() => resolve("hung"), ms)),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

// 1. A wallet injected long after load is still picked up.
{
  const source = new EventTarget();
  const oneShot = await discoverInjectedWallet({ source, timeoutMs: 100 });
  const seen = [];
  const stop = watchInjectedWallet({ source, pollMs: 0, onProvider: (provider) => seen.push(provider) });
  source.ethereum = { request: async () => [ADDRESS] };
  source.dispatchEvent(new Event("ethereum#initialized"));
  await tick();
  stop();
  record(
    "late wallet injection is still discovered",
    oneShot === null && seen.length === 1,
    `one-shot probe: ${oneShot === null ? "null (as before)" : "provider"}; continuous watcher delivered ${seen.length} provider.`,
  );
}

// 2. A hung prompt no longer freezes the whole wallet bridge.
{
  const provider = createReliableWalletProvider({
    request: ({ method }) => (method === "eth_requestAccounts" ? new Promise(() => {}) : Promise.resolve("0x38")),
  }, { promptTimeoutMs: 80 });
  const prompt = withTimeout(provider.request({ method: "eth_requestAccounts" }), 250);
  const read = withTimeout(provider.request({ method: "eth_chainId" }), 250);
  const [promptResult, readResult] = await Promise.all([prompt, read]);
  record(
    "a hung prompt no longer blocks later wallet calls",
    promptResult === "rejected:WALLET_TIMEOUT" && readResult === "settled",
    `eth_requestAccounts -> ${promptResult}; the following eth_chainId -> ${readResult}.`,
  );
}

// 3. connect() always leaves the busy state so the button can be retried.
{
  const provider = createReliableWalletProvider({ request: () => new Promise(() => {}) }, { promptTimeoutMs: 80 });
  let state = { account: "", token: "", busy: false, error: "" };
  const manager = createWalletSession({ provider, onChange: (next) => { state = next; } });
  await manager.connect();
  record(
    "connect() always releases the busy state",
    state.busy === false && state.error === "timeout",
    `busy=${state.busy}, error=${JSON.stringify(state.error)} - the user sees an explanation and can retry.`,
  );
  manager.dispose();
}

// 4. A wallet that opens on another chain is switched instead of dead-ending.
{
  const calls = [];
  let chain = "0x1";
  const provider = createReliableWalletProvider({
    request: async ({ method, params }) => {
      calls.push(method);
      if (["eth_accounts", "eth_requestAccounts"].includes(method)) return [ADDRESS];
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") { chain = params[0].chainId; return null; }
      return null;
    },
  });
  let state = { account: "", token: "", busy: false, error: "" };
  const manager = createWalletSession({ provider, onChange: (next) => { state = next; } });
  await manager.connect();
  record(
    "a wallet on another chain is switched to BSC",
    state.account === ADDRESS && state.error === "",
    `account=${state.account || "(none)"}, switched=${calls.includes("wallet_switchEthereumChain")}, addChain=${calls.includes("wallet_addEthereumChain")}.`,
  );
  manager.dispose();
}

// 5. Disconnect no longer disables the connect button until reload.
{
  const provider = createReliableWalletProvider({
    request: async ({ method }) => {
      if (["eth_accounts", "eth_requestAccounts"].includes(method)) return [ADDRESS];
      if (method === "eth_chainId") return "0x38";
      if (method === "wallet_revokePermissions") throw Object.assign(new Error("Unsupported"), { code: 4200 });
      return null;
    },
  });
  let state = { account: "", token: "", busy: false, error: "" };
  const manager = createWalletSession({ provider, onChange: (next) => { state = next; } });
  await manager.connect();
  const before = state.account;
  await manager.disconnect();
  const afterDisconnect = state.account;
  await manager.connect();
  record(
    "reconnecting after a manual disconnect works",
    before === ADDRESS && afterDisconnect === "" && state.account === ADDRESS,
    `connected=${before || "(none)"} -> disconnected=${afterDisconnect || "(none)"} -> reconnected=${state.account || "(none)"}.`,
  );
  manager.dispose();
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\n${results.length - failed}/${results.length} wallet-interaction checks pass.`);
process.exitCode = failed ? 1 : 0;
