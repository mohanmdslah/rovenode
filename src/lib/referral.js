import { BrowserProvider, Contract, getAddress } from "ethers";
import {
  NODE_SALE_ADDRESS,
  REFERRAL_MAX_PAGE_SIZE,
  REFERRAL_PAGE_SIZE,
  REFERRAL_ROOT_ADDRESS,
} from "./network.js";
import { ensureWalletChain, isWalletAddress } from "./wallet.js";

export { REFERRAL_MAX_PAGE_SIZE, REFERRAL_PAGE_SIZE, REFERRAL_ROOT_ADDRESS };

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Referral surface of the NodeSale contract. */
export const REFERRAL_ABI = [
  "function root() view returns (address)",
  "function isRegistered(address account) view returns (bool)",
  "function registeredCount() view returns (uint256)",
  "function getUpline(address account) view returns (address upline, uint8 uplineLevel)",
  "function getNodeLevel(address account) view returns (uint8)",
  "function getDirectDownlineCount(address account) view returns (uint256)",
  "function getDirectDownlines(address account, uint256 offset, uint256 limit) view returns (address[] accounts, uint8[] levels)",
  "function getRegisteredPage(uint256 offset, uint256 limit) view returns (address[] accounts, address[] uplines, uint8[] levels)",
  "function getUplineChain(address account, uint256 maxDepth) view returns (address[] chain)",
  "function bindUpline(address upline)",
  "function paused() view returns (bool)",
  "function version() view returns (string)",
  "function usdc() view returns (address)",
  "function usdcReceiver() view returns (address)",
  "function swapRouter() view returns (address)",
  "function getSwapPath() view returns (address[])",
  "function slippageBps() view returns (uint256)",
  "function MAX_SLIPPAGE_BPS() view returns (uint256)",
  "function treasury() view returns (address)",
  "event UplineBound(address indexed account, address indexed upline)",
  "event Swapped(address indexed buyer, uint256 usdtIn, uint256 usdcOut, address indexed receiver)",
];

function referralError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function isZeroAddress(value) {
  return typeof value === "string" && /^0x0{40}$/i.test(value.trim());
}

export function sameWalletAddress(left, right) {
  const a = typeof left === "string" ? left.trim() : "";
  const b = typeof right === "string" ? right.trim() : "";
  if (!isWalletAddress(a) || !isWalletAddress(b)) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    // Some mobile wallets return a mixed-case address that is not a valid
    // EIP-55 checksum; compare case-insensitively instead of failing.
    return a.toLowerCase() === b.toLowerCase();
  }
}

/**
 * Map a referral revert or wallet outcome to a stable copy key. The contract
 * stays the authority: the custom errors it raises (MustBindUpline,
 * UplineNotNode, AlreadyBound, CannotBindSelf) drive the message the user
 * sees, so the UI never has to guess why a binding was refused.
 */
export function describeReferralError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "rejected";
  if (error?.code === "MUST_BIND_UPLINE") return "mustBindUpline";
  if (error?.code === "ALREADY_BOUND") return "alreadyBound";
  if (error?.code === "INVALID_UPLINE") return "invalidUpline";
  if (error?.code === "CANNOT_BIND_SELF") return "cannotBindSelf";
  if (error?.code === "UPLINE_NOT_NODE") return "uplineNotNode";
  if (error?.code === "PROVIDER_NOT_FOUND") return "walletMissing";
  if (error?.code === "WALLET_TIMEOUT") return "timeout";
  const name = String(error?.revert?.name ?? error?.errorName ?? error?.info?.error?.name ?? "");
  const text = String(error?.shortMessage ?? error?.reason ?? error?.message ?? "");
  const haystack = `${name} ${text}`;
  if (haystack.includes("MustBindUpline")) return "mustBindUpline";
  // v2 renamed this revert: the upline must own a node, not merely have joined.
  if (haystack.includes("UplineNotNode") || haystack.includes("UplineNotRegistered")) return "uplineNotNode";
  if (haystack.includes("AlreadyBound")) return "alreadyBound";
  if (haystack.includes("CannotBindSelf")) return "cannotBindSelf";
  if (haystack.includes("EnforcedPause")) return "paused";
  return "failed";
}

/**
 * ethers rejects a mixed-case address whose EIP-55 checksum does not match, and
 * users paste addresses straight out of chat apps. Normalise to a form the
 * contract accepts: checksum when valid, lowercase otherwise.
 */
export function normalizeWalletAddress(value) {
  const address = typeof value === "string" ? value.trim() : "";
  if (!isWalletAddress(address)) return "";
  try {
    return getAddress(address);
  } catch {
    return address.toLowerCase();
  }
}

/**
 * Client-side preflight for an upline address. This only avoids a pointless
 * transaction - the contract is the real gate, and in v2 it requires the upline
 * to already own a node, with ROOT as the only exception.
 */
export function validateUplineAddress(input, { account, isUplineNode = () => true } = {}) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!isWalletAddress(value) || isZeroAddress(value)) return "invalidUpline";
  if (account && sameWalletAddress(value, account)) return "cannotBindSelf";
  if (!isUplineNode(value)) return "uplineNotNode";
  return "";
}

/**
 * Translate a 1-based page request into contract offsets and display bounds.
 * The contract returns an empty array past the end instead of reverting, so the
 * page count is derived from the total the caller already read.
 */
export function describeReferralPage(count, page, pageSize = REFERRAL_PAGE_SIZE) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize) || REFERRAL_PAGE_SIZE), REFERRAL_MAX_PAGE_SIZE);
  const total = Math.max(0, Math.trunc(count) || 0);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const offset = (current - 1) * size;
  return {
    page: current,
    pageCount,
    pageSize: size,
    offset,
    total,
    hasPrevious: current > 1,
    hasNext: current < pageCount,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(total, offset + size),
  };
}

/** Node identity label for a tier level; 0 means the address is not a node yet. */
export function describeNodeLevel(level) {
  const value = Number(level);
  return Number.isFinite(value) && value > 0 ? `L${value}` : "";
}

function defaultCreateSale(provider) {
  return new Contract(NODE_SALE_ADDRESS, REFERRAL_ABI, new BrowserProvider(provider));
}

/**
 * Resolve the signing client through the connected wallet. The wallet owns the
 * signer; the page never supplies an RPC endpoint of its own.
 */
async function defaultCreateBindClient(provider) {
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner();
  return { signer, sale: new Contract(NODE_SALE_ADDRESS, REFERRAL_ABI, signer) };
}

function assertWallet({ provider, account }) {
  if (!provider?.request) throw referralError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
  if (!isWalletAddress(account)) throw referralError("INVALID_ACCOUNT", "Invalid wallet account");
}

/** Read-only referral queries through the connected injected wallet. */
export function createReferralReader({ createSale = defaultCreateSale } = {}) {
  async function isRegistered({ provider, account }) {
    assertWallet({ provider, account });
    return Boolean(await createSale(provider).isRegistered(account));
  }

  /** Upline plus the upline's node identity (level 0 = not a node yet). */
  async function readUpline({ provider, account }) {
    assertWallet({ provider, account });
    const result = await createSale(provider).getUpline(account);
    const address = String(result.upline ?? result[0] ?? "");
    const level = Number(result.uplineLevel ?? result[1] ?? 0);
    if (!isWalletAddress(address) || isZeroAddress(address)) return { address: "", level: 0, isRoot: false };
    return { address, level, isRoot: sameWalletAddress(address, REFERRAL_ROOT_ADDRESS) };
  }

  /**
   * One page of direct downlines. `count` comes from the contract so the UI can
   * page even though the tree itself is unbounded on-chain.
   */
  async function readDirectDownlines({ provider, account, page = 1, pageSize = REFERRAL_PAGE_SIZE }) {
    assertWallet({ provider, account });
    const sale = createSale(provider);
    const count = Number(await sale.getDirectDownlineCount(account));
    const info = describeReferralPage(count, page, pageSize);
    if (count === 0) return { count: 0, rows: [], ...info };
    const result = await sale.getDirectDownlines(account, info.offset, info.pageSize);
    const accounts = Array.from(result.accounts ?? result[0] ?? []);
    const levels = Array.from(result.levels ?? result[1] ?? []);
    const rows = accounts
      .map((address, index) => ({ address: String(address), level: Number(levels[index] ?? 0) }))
      .filter((row) => isWalletAddress(row.address))
      .map((row) => ({ ...row, isRoot: sameWalletAddress(row.address, REFERRAL_ROOT_ADDRESS) }));
    return { count, rows, ...info };
  }

  /** The connected wallet's own node identity (0 = not a node yet). */
  async function readOwnLevel({ provider, account }) {
    assertWallet({ provider, account });
    return Number(await createSale(provider).getNodeLevel(account));
  }

  /**
   * v2 metadata: the deployed implementation version and the USDT->USDC
   * settlement route. Handy for verifying which contract the page is talking to
   * through the proxy.
   */
  async function readSaleMetadata({ provider }) {
    if (!provider?.request) throw referralError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
    const sale = createSale(provider);
    const [version, usdc, usdcReceiver, swapRouter, swapPath, slippageBps] = await Promise.all([
      sale.version(),
      sale.usdc(),
      sale.usdcReceiver(),
      sale.swapRouter(),
      sale.getSwapPath(),
      sale.slippageBps(),
    ]);
    return {
      version: String(version),
      usdc: String(usdc),
      usdcReceiver: String(usdcReceiver),
      swapRouter: String(swapRouter),
      swapPath: Array.from(swapPath ?? []).map(String),
      slippageBps: Number(slippageBps),
    };
  }

  /** Everything the referral console shows for one wallet. */
  async function readOverview({ provider, account, page = 1, pageSize = REFERRAL_PAGE_SIZE }) {
    const [registered, upline, ownLevel] = await Promise.all([
      isRegistered({ provider, account }),
      readUpline({ provider, account }),
      readOwnLevel({ provider, account }),
    ]);
    const downlines = await readDirectDownlines({ provider, account, page, pageSize });
    return { registered, upline, ownLevel, ...downlines };
  }

  return { isRegistered, readUpline, readOwnLevel, readSaleMetadata, readDirectDownlines, readOverview };
}

export const referralReader = createReferralReader();

/**
 * Bind the caller's upline. This is a permanent, one-time, single transaction
 * and it is deliberately separate from the purchase so the user approves each
 * wallet prompt on its own.
 */
export function createBindUpline({
  ensureChain = ensureWalletChain,
  createClient = defaultCreateBindClient,
} = {}) {
  return async function bindUpline({ provider, account, upline, onStatus = () => {} }) {
    if (!provider?.request) throw referralError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
    if (!isWalletAddress(account)) throw referralError("INVALID_ACCOUNT", "Invalid wallet account");
    const invalid = validateUplineAddress(upline, { account });
    if (invalid === "invalidUpline") throw referralError("INVALID_UPLINE", "Invalid upline address");
    if (invalid === "cannotBindSelf") throw referralError("CANNOT_BIND_SELF", "An account cannot be its own upline");
    const target = normalizeWalletAddress(upline);

    await ensureChain(provider);
    const { signer, sale } = await createClient(provider);
    const active = await signer.getAddress();
    if (!sameWalletAddress(active, account)) throw referralError("ACCOUNT_CHANGED", "The active wallet account changed");

    if (await sale.isRegistered(active)) throw referralError("ALREADY_BOUND", "This account already bound an upline");
    // v2: the upline must already own a node; ROOT is the single exception. The
    // contract reports its own root, so the rule is never guessed here.
    const rootAddress = await sale.root().catch(() => REFERRAL_ROOT_ADDRESS);
    if (!sameWalletAddress(target, rootAddress) && Number(await sale.getNodeLevel(target)) === 0) {
      throw referralError("UPLINE_NOT_NODE", "The upline does not own a node yet");
    }

    const tx = await sale.bindUpline(target);
    onStatus({ phase: "bindPending", hash: tx.hash });
    const receipt = await tx.wait();
    if (!receipt || Number(receipt.status) !== 1) throw referralError("BIND_FAILED", "The binding transaction reverted");

    // Trust the event, not the local state: only UplineBound for this account
    // proves the binding landed.
    const confirmed = (receipt.logs ?? []).some((log) => {
      try {
        const parsed = sale.interface.parseLog(log);
        return parsed?.name === "UplineBound" && sameWalletAddress(parsed.args?.account, account);
      } catch {
        return false;
      }
    });
    if (!confirmed) throw referralError("BIND_UNCONFIRMED", "The binding transaction did not emit UplineBound");
    return { hash: receipt.hash ?? tx.hash, upline: target };
  };
}

export const bindUpline = createBindUpline();

/** Re-read registration state instead of assuming the binding took effect. */
export async function confirmRegistration({ provider, account, attempts = 4, delayMs = 250 }) {
  const reader = createReferralReader();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reader.isRegistered({ provider, account })) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}
