import { BSC_CHAIN_ID } from "./network.js";

function walletError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readChainId(provider) {
  return Number(await provider.request({ method: "eth_chainId" }));
}

/**
 * A wallet that opens on another network cannot serve BSC reads or writes, so
 * ask it to switch before using it.
 *
 * The wallet owns RPC selection: never create a fixed JSON-RPC provider and
 * never push a hard-coded RPC through wallet_addEthereumChain. If the wallet
 * does not know the chain, the user has to configure it in the wallet.
 *
 * Mobile wallets can also keep reporting the old chain for a moment after a
 * successful switch, so re-read the chain instead of failing on the first look.
 */
export async function ensureWalletChain(provider, chainId = BSC_CHAIN_ID, { attempts = 5, delayMs = 250 } = {}) {
  if (!provider?.request) throw walletError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
  const target = Number(chainId);
  if (await readChainId(provider) === target) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (error?.code === 4001 || error?.code === "ACTION_REJECTED") throw walletError("REJECTED", "The wallet cancelled the network switch");
    if (Number(error?.code) === 4902) throw walletError("CHAIN_NOT_CONFIGURED", "The wallet does not know this network");
    throw error;
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await readChainId(provider) === target) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw walletError("WRONG_CHAIN", "The wallet did not switch to the required network");
}

const READ_METHODS = new Set([
  "eth_accounts",
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_estimateGas",
]);

/**
 * Methods that open a wallet prompt or move value. Mobile wallets bind these to
 * the user's gesture, so they must reach the wallet immediately instead of
 * waiting behind a stalled background read.
 */
const PROMPT_METHODS = new Set([
  "eth_requestAccounts",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "personal_sign",
  "wallet_addEthereumChain",
  "wallet_requestPermissions",
  "wallet_revokePermissions",
  "wallet_switchEthereumChain",
  "wallet_watchAsset",
]);

const TRANSIENT_READ_CODES = new Set([-32603, -32000, -32005]);
const WALLET_TIMEOUT_CODE = "WALLET_TIMEOUT";

/** A read that took too long is worth one retry; a prompt is not. */
function isRetryableReadError(error) {
  if (!READ_METHODS.has(error?.method)) return false;
  return TRANSIENT_READ_CODES.has(Number(error?.code)) || error?.code === WALLET_TIMEOUT_CODE;
}

function annotateProviderError(error, method) {
  if (error && typeof error === "object" && !error.method) {
    try { error.method = method; } catch { return Object.assign(new Error(error.message ?? "Wallet request failed"), error, { method }); }
  }
  return error;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Race a wallet call against a deadline. Huawei and other mobile wallet
 * WebViews can leave a bridge promise permanently unsettled; without a deadline
 * that single request would freeze the caller and every request queued behind
 * it for the rest of the page's life.
 */
function settleWithin(promise, timeoutMs, method) {
  if (!(timeoutMs > 0)) return promise;
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(walletError(WALLET_TIMEOUT_CODE, `The wallet did not respond to ${method} in time`));
    }, timeoutMs);
    const complete = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      callback(value);
    };
    promise.then((value) => complete(resolve, value), (error) => complete(reject, error));
  });
}

export const DEFAULT_READ_TIMEOUT_MS = 15000;
export const DEFAULT_PROMPT_TIMEOUT_MS = 90000;

/**
 * Huawei and other mobile wallet WebViews are sensitive to overlapping
 * EIP-1193 requests. Reads stay serialized and retry transient bridge errors;
 * prompts jump the read queue so a wallet UI always opens on the user's tap.
 * Every request is bounded by a deadline, and the queue is released on timeout
 * so a wedged bridge can never block later wallet calls.
 */
export function createReliableWalletProvider(provider, {
  readRetries = 1,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
  promptTimeoutMs = DEFAULT_PROMPT_TIMEOUT_MS,
} = {}) {
  if (!provider?.request) return null;
  let readTail = Promise.resolve();
  let promptTail = Promise.resolve();

  const enqueue = (getTail, setTail, job) => {
    const run = getTail().then(job, job);
    setTail(run.then(() => undefined, () => undefined));
    return run;
  };

  const runRead = (payload) => {
    const method = payload.method;
    const attempts = Math.max(0, readRetries) + 1;
    const job = async () => {
      // Let any open wallet prompt settle first, then serialize reads.
      await promptTail.catch(() => undefined);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await settleWithin(Promise.resolve().then(() => provider.request(payload)), readTimeoutMs, method);
        } catch (error) {
          const annotated = annotateProviderError(error, method);
          if (attempt + 1 >= attempts || !isRetryableReadError(annotated)) throw annotated;
          await delay(80 * (attempt + 1));
        }
      }
      return undefined;
    };
    return enqueue(() => readTail, (next) => { readTail = next; }, job);
  };

  const runPrompt = (payload) => {
    const method = payload.method;
    const job = () => settleWithin(Promise.resolve().then(() => provider.request(payload)), promptTimeoutMs, method);
    return enqueue(() => promptTail, (next) => { promptTail = next; }, job);
  };

  const request = (payload = {}) => (
    PROMPT_METHODS.has(payload.method) ? runPrompt(payload) : runRead(payload)
  );

  const reliable = {
    isReliableWalletProvider: true,
    request,
    on: (...args) => { provider.on?.(...args); return reliable; },
    removeListener: (...args) => { provider.removeListener?.(...args); return reliable; },
    once: (...args) => { provider.once?.(...args); return reliable; },
    isConnected: (...args) => provider.isConnected?.(...args),
    rawProvider: provider,
  };
  return reliable;
}

/**
 * Some Chinese wallet WebViews only ship the legacy `send`/`sendAsync` bridge
 * and never expose EIP-1193 `request`. Adapt them instead of reporting that no
 * wallet exists.
 */
function createLegacyProviderAdapter(legacy) {
  const send = (payload, callback) => (
    typeof legacy.sendAsync === "function" ? legacy.sendAsync(payload, callback) : legacy.send(payload, callback)
  );
  const adapter = {
    isLegacyWalletAdapter: true,
    rawProvider: legacy,
    request(payload) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (error, response) => {
          if (settled) return;
          settled = true;
          if (error) return reject(error?.code !== undefined ? error : walletError(-32603, String(error?.message ?? error)));
          if (response?.error) {
            const failure = walletError(Number(response.error.code ?? -32603), response.error.message ?? "Wallet request failed");
            return reject(failure);
          }
          resolve(response && typeof response === "object" && "result" in response ? response.result : response);
        };
        try {
          const maybe = send(payload, done);
          if (maybe && typeof maybe.then === "function") maybe.then((value) => done(null, value), done);
        } catch (error) {
          done(error);
        }
      });
    },
    on: (...args) => { legacy.on?.(...args); return adapter; },
    removeListener: (...args) => { legacy.removeListener?.(...args); return adapter; },
    isConnected: () => legacy.isConnected?.() ?? true,
  };
  return adapter;
}

// Legacy adapters are cached so repeated discovery always returns the same
// object identity; otherwise a watcher would re-deliver the same wallet.
const legacyAdapters = new WeakMap();

function asEip1193(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (typeof candidate.request === "function") return candidate;
  if (typeof candidate.sendAsync !== "function" && typeof candidate.send !== "function") return null;
  const cached = legacyAdapters.get(candidate);
  if (cached) return cached;
  const adapter = createLegacyProviderAdapter(candidate);
  legacyAdapters.set(candidate, adapter);
  return adapter;
}

/** Providers announced through EIP-6963, newest announcement first per source. */
const announcedBySource = new WeakMap();

function announcedFor(source) {
  if (!source || typeof source !== "object") return [];
  let list = announcedBySource.get(source);
  if (!list) { list = []; announcedBySource.set(source, list); }
  return list;
}

function rememberAnnouncedProvider(source, provider) {
  if (!provider || typeof provider !== "object") return;
  const list = announcedFor(source);
  const index = list.indexOf(provider);
  if (index !== -1) list.splice(index, 1);
  list.unshift(provider);
  if (list.length > 12) list.length = 12;
}

function selectInjectedProvider(source = globalThis) {
  const seen = new Set();
  const candidates = [];
  const push = (candidate) => {
    const capable = asEip1193(candidate);
    if (!capable || seen.has(capable)) return;
    seen.add(capable);
    candidates.push(capable);
  };
  const injected = source?.ethereum;
  push(injected);
  if (Array.isArray(injected?.providers)) injected.providers.forEach(push);
  announcedFor(source).forEach(push);
  push(source?.web3?.currentProvider);
  return candidates[0] ?? null;
}

const reliableProviders = new WeakMap();

export function getInjectedWalletProvider(source = globalThis) {
  const raw = selectInjectedProvider(source);
  if (!raw) return null;
  const cached = reliableProviders.get(raw);
  if (cached) return cached;
  const reliable = createReliableWalletProvider(raw);
  if (reliable) reliableProviders.set(raw, reliable);
  return reliable;
}

function listenForAnnouncements(source) {
  const onAnnounce = (event) => rememberAnnouncedProvider(source, event?.detail?.provider);
  source.addEventListener("eip6963:announceProvider", onAnnounce);
  try {
    source.dispatchEvent?.(new Event("eip6963:requestProvider"));
  } catch {
    // Older WebViews may not expose the Event constructor; polling still works.
  }
  return () => source.removeEventListener?.("eip6963:announceProvider", onAnnounce);
}

/**
 * Keep watching for an injected wallet instead of probing once. Huawei
 * WebViews and wallet in-app browsers can inject `window.ethereum` several
 * seconds after load, long after a one-shot probe would have given up.
 */
export function watchInjectedWallet({ source = globalThis, onProvider, pollMs = 500, timeoutMs = 0 } = {}) {
  const canWatch = Boolean(source?.addEventListener) || Boolean(source?.setInterval);
  if (!canWatch) return () => {};
  let stopped = false;
  let scheduled = false;
  let intervalId;
  let timeoutId;
  let delivered;
  const deliver = () => {
    if (stopped) return;
    const provider = getInjectedWalletProvider(source);
    if (!provider || provider === delivered) return;
    delivered = provider;
    onProvider?.(provider);
  };
  // Defer delivery so a wallet that announces itself synchronously during setup
  // cannot call back into a caller that has not finished initialising.
  const schedule = () => {
    if (stopped || scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; deliver(); });
  };
  const stopAnnouncements = source?.addEventListener ? listenForAnnouncements(source) : () => {};
  const onInitialized = () => schedule();
  source.addEventListener?.("ethereum#initialized", onInitialized);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(intervalId);
    clearTimeout(timeoutId);
    stopAnnouncements();
    source.removeEventListener?.("ethereum#initialized", onInitialized);
  };
  schedule();
  if (pollMs > 0) intervalId = setInterval(deliver, pollMs);
  if (timeoutMs > 0) timeoutId = setTimeout(stop, timeoutMs);
  return stop;
}

/** Discover providers injected after page load, including EIP-6963 wallets. */
export function discoverInjectedWallet({ source = globalThis, timeoutMs = 5000 } = {}) {
  const immediate = getInjectedWalletProvider(source);
  if (immediate) return Promise.resolve(immediate);
  if (!source?.addEventListener && !source?.setInterval) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let stop = () => {};
    const finish = (provider) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      resolve(provider ?? getInjectedWalletProvider(source));
    };
    stop = watchInjectedWallet({ source, onProvider: finish });
    timer = setTimeout(() => finish(getInjectedWalletProvider(source)), timeoutMs);
  });
}

export function isWalletAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function formatWalletAddress(value) {
  if (!isWalletAddress(value)) return "";
  const address = value.trim();
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function connectInjectedWallet(provider) {
  if (!provider?.request) throw walletError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) ? accounts.find(isWalletAddress) : null;
  if (!account) throw walletError("ACCOUNT_NOT_FOUND", "The wallet did not return an account");
  return account;
}

const REVOKE_UNSUPPORTED_CODES = new Set([4200, -32601, -32603, -32000, -32004]);
const REVOKE_UNSUPPORTED_TEXT = /unsupported|not supported|not implemented|method not found|does not exist|unknown method/i;

export async function disconnectInjectedWallet(provider) {
  if (!provider?.request) return false;
  try {
    await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    return true;
  } catch (error) {
    // Wallets without wallet_revokePermissions still disconnect locally.
    if (REVOKE_UNSUPPORTED_CODES.has(Number(error?.code))) return false;
    if (REVOKE_UNSUPPORTED_TEXT.test(String(error?.message ?? ""))) return false;
    throw error;
  }
}
