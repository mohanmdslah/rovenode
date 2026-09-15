import { BSC_CHAIN_ID } from "./network.js";
import { disconnectInjectedWallet, ensureWalletChain, isWalletAddress } from "./wallet.js";

export { ensureWalletChain };

function sessionError(code) { return Object.assign(new Error(code), { code }); }

async function readLiveAccount(provider) {
  const accounts = await provider.request({ method: "eth_accounts" });
  const account = Array.isArray(accounts) ? accounts.find(isWalletAddress) : null;
  return account ? account.toLowerCase() : "";
}

/**
 * Validate the account a wallet just authorised.
 *
 * Mobile wallet WebViews can briefly report no account immediately after their
 * own prompt, so a missing account is tolerated on the interactive path where
 * the wallet has already handed us the address. Only a *different* account is
 * always a real change.
 */
export async function loginWallet({ provider, account, signal, tolerateMissingAccount = false }) {
  if (!isWalletAddress(account)) throw sessionError("ACCOUNT_NOT_FOUND");
  const expected = account.toLowerCase();
  signal?.throwIfAborted();
  await ensureWalletChain(provider);
  const live = await readLiveAccount(provider);
  if (live && live !== expected) throw sessionError("ACCOUNT_CHANGED");
  if (!live && !tolerateMissingAccount) throw sessionError("ACCOUNT_CHANGED");
  signal?.throwIfAborted();
  return { account: expected, token: "" };
}

const SESSION_ERROR_KEYS = {
  PROVIDER_NOT_FOUND: "missing",
  ACCOUNT_NOT_FOUND: "noAccount",
  ACCOUNT_CHANGED: "accountChanged",
  WRONG_CHAIN: "wrongChain",
  CHAIN_NOT_CONFIGURED: "chainNotConfigured",
  REJECTED: "rejected",
  WALLET_TIMEOUT: "timeout",
};

export function describeSessionError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "rejected";
  return SESSION_ERROR_KEYS[error?.code] ?? "loginFailed";
}

export function createWalletSession({ provider, onChange }) {
  let state = { account: "", token: "", busy: false, error: "" };
  let disposed = false;
  let manuallyDisconnected = false;
  // Every connect attempt takes a ticket; a newer attempt supersedes older ones
  // so a slow passive probe can never overwrite an interactive result.
  let attemptId = 0;
  const emit = (next) => { state = { ...state, ...next }; if (!disposed) onChange(state); };
  const clear = (error = "") => emit({ account: "", token: "", busy: false, error });

  async function connect(interactive = true) {
    if (disposed) return;
    if (interactive) manuallyDisconnected = false;
    else if (manuallyDisconnected) return;
    if (state.busy && !interactive) return;
    const attempt = (attemptId += 1);
    const superseded = () => disposed || attempt !== attemptId;
    emit({ busy: true, error: "" });
    try {
      if (!provider?.request) throw sessionError("PROVIDER_NOT_FOUND");
      const accounts = await provider.request({ method: interactive ? "eth_requestAccounts" : "eth_accounts" });
      if (superseded()) return;
      const account = Array.isArray(accounts) ? accounts.find(isWalletAddress) : null;
      if (!account) {
        if (interactive) throw sessionError("ACCOUNT_NOT_FOUND");
        return;
      }
      const session = await loginWallet({ provider, account, tolerateMissingAccount: interactive });
      if (superseded()) return;
      emit({ ...session, error: "" });
    } catch (error) {
      if (superseded()) return;
      emit({ account: "", token: "", error: describeSessionError(error) });
    } finally {
      if (attempt === attemptId) emit({ busy: false });
    }
  }

  const onAccounts = (accounts) => { if (!manuallyDisconnected && accounts?.[0]) void connect(false); else clear(); };
  const onChain = (chain) => { if (Number(chain) !== Number(BSC_CHAIN_ID)) clear("wrongChain"); };
  const onDisconnect = () => clear();

  provider?.on?.("accountsChanged", onAccounts);
  provider?.on?.("chainChanged", onChain);
  provider?.on?.("disconnect", onDisconnect);

  return {
    connect,
    expire() {},
    async disconnect() {
      manuallyDisconnected = true;
      attemptId += 1;
      clear();
      try {
        await disconnectInjectedWallet(provider);
      } catch {
        // The local session is already cleared; a wallet that refuses to revoke
        // permissions must not surface as a disconnect failure.
      }
    },
    dispose() {
      attemptId += 1;
      clear();
      disposed = true;
      provider?.removeListener?.("accountsChanged", onAccounts);
      provider?.removeListener?.("chainChanged", onChain);
      provider?.removeListener?.("disconnect", onDisconnect);
    },
  };
}
