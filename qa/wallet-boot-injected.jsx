/**
 * Headless boot check with an injected EIP-1193 wallet, mirroring a Huawei phone
 * that opens the page inside a wallet app browser. It starts on Ethereum so the
 * chain switch is exercised too, then disconnects and reconnects - the exact
 * sequence that used to leave the connect button permanently dead.
 */
const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (read, timeout = 9000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = read();
    if (value) return value;
    await wait(50);
  }
  return null;
};

const ACCOUNT = "0x1234567890Abcdef1234567890abcdef12345678";
const calls = [];
let chainId = "0x1";
let account = ACCOUNT;

const provider = {
  isMetaMask: true,
  async request(payload = {}) {
    calls.push(payload.method);
    if (payload.method === "eth_requestAccounts" || payload.method === "eth_accounts") return account ? [account] : [];
    if (payload.method === "eth_chainId") return chainId;
    if (payload.method === "wallet_switchEthereumChain") { chainId = payload.params[0].chainId; return null; }
    // Older wallets refuse revoke permissions; the app must still disconnect.
    if (payload.method === "wallet_revokePermissions") throw Object.assign(new Error("Unsupported method"), { code: 4200 });
    return null;
  },
  on() {}, removeListener() {},
};
window.ethereum = provider;
window.addEventListener("eip6963:requestProvider", () => {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "qa", name: "QA Wallet", rdns: "qa.wallet" }, provider } }));
});

async function main() {
  await import("../src/main.jsx");

  const shellReady = await waitFor(() => document.querySelector(".app-shell.is-ready"), 9000);
  record("app boots and leaves the loading state", Boolean(shellReady), shellReady ? "" : "the app shell never became ready");

  const address = await waitFor(() => document.querySelector(".wallet-address"));
  record("an injected wallet is detected and connected automatically", Boolean(address), address ? address.textContent.trim() : "no .wallet-address rendered");
  record("the connected address is masked", address?.textContent?.includes("...") === true, address ? address.textContent.trim() : "");
  record("a wallet on another chain was switched to BSC", calls.includes("wallet_switchEthereumChain"), `methods: ${[...new Set(calls)].join(", ")}`);
  record("no hard-coded RPC is pushed through add-chain", !calls.includes("wallet_addEthereumChain"), "");

  const disconnect = await waitFor(() => document.querySelector(".disconnect-wallet-button"));
  record("a disconnect control is offered", Boolean(disconnect), disconnect ? "" : "no .disconnect-wallet-button found");
  if (disconnect) {
    disconnect.click();
    await waitFor(() => !document.querySelector(".wallet-address"));
    record("disconnecting clears the connected address", !document.querySelector(".wallet-address"), "");

    const reconnect = await waitFor(() => document.querySelector(".wallet-button"));
    reconnect?.click();
    const reconnected = await waitFor(() => document.querySelector(".wallet-address"), 9000);
    record(
      "the user can reconnect after disconnecting",
      Boolean(reconnected),
      reconnected ? reconnected.textContent.trim() : "the connect button stayed dead after a disconnect",
    );
  }
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => { document.getElementById("qa-result").textContent = JSON.stringify(results, null, 2); });
