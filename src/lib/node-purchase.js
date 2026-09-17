import { BrowserProvider, Contract, getAddress, parseUnits } from "ethers";
import { ensureWalletChain, isWalletAddress } from "./wallet.js";
import { BSC_CHAIN_ID, NODE_SALE_ADDRESS, USDT_ADDRESS } from "./network.js";
export { BSC_CHAIN_ID, BSCSCAN_TX_URL, BSCSCAN_ADDRESS_URL } from "./network.js";

export const DEPOSIT_CONTRACT_ADDRESS = NODE_SALE_ADDRESS;
export const USDT_CONTRACT_ADDRESS = USDT_ADDRESS;
export const NODE_PRICE_USDT = parseUnits("150", 18);

const SALE_ABI = [
  "function paused() view returns (bool)",
  "function isRegistered(address account) view returns (bool)",
  "function getNodeLevel(address account) view returns (uint8)",
  "function getTierConfig(uint8 tier) view returns (uint256 priceUsdt, uint256 priceRaw, uint256 maxSupply, uint256 sold)",
  "function buyNode(uint8 tier)",
];
const STATUS_ABI = ["function getNodeLevel(address account) view returns (uint8)"];
const USDT_ABI = [
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

function purchaseError(code, message) { const error = new Error(message); error.code = code; return error; }

/** Contract guards the purchase can still revert with, mapped to their copy key. */
const BUY_REVERT_CODES = {
  AlreadyNode: "ALREADY_NODE",
  EnforcedPause: "PAUSED",
  TierSoldOut: "SOLD_OUT",
  MustBindUpline: "MUST_BIND_UPLINE",
  UplineNotNode: "UPLINE_NOT_NODE",
};

function revertName(error) {
  return String(error?.revert?.name ?? error?.errorName ?? error?.info?.error?.name ?? "");
}

/**
 * v2 settles a purchase by swapping the buyer's USDT into USDC inside the same
 * transaction and pays the receiver directly. Any swap failure - thin pool, bad
 * route, slippage - reverts the whole purchase, and the buyer only loses gas.
 * Report that as "try again shortly" instead of letting it read like a balance,
 * allowance or user-cancellation problem.
 */
function normalizeBuyError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return error;
  const name = revertName(error);
  if (BUY_REVERT_CODES[name]) return purchaseError(BUY_REVERT_CODES[name], `The purchase reverted with ${name}`);
  const text = String(error?.shortMessage ?? error?.reason ?? error?.message ?? "");
  if (/slippage|swap|uniswap|pancake|insufficient output|k$|router/i.test(text)) {
    return purchaseError("SWAP_UNAVAILABLE", "The USDT to USDC settlement swap failed");
  }
  // Every preflight guard already ran, so an unexplained revert at this point is
  // the settlement swap, not something the buyer can fix.
  if (error?.code === "CALL_EXCEPTION" || error?.code === "TRANSACTION_FAILED") {
    return purchaseError("SWAP_UNAVAILABLE", "The purchase transaction reverted");
  }
  return error;
}
function isSameAddress(left, right) { try { return getAddress(left) === getAddress(right); } catch { return false; } }
function assertSuccessfulReceipt(receipt) { if (receipt && Number(receipt.status) === 0) throw purchaseError("TRANSACTION_FAILED", "The transaction reverted"); }

/**
 * Chain handling is shared with the wallet session so the purchase path gets
 * the same mobile-wallet tolerance: a Huawei wallet that keeps reporting the
 * old chain for a moment after switching no longer aborts the purchase, and the
 * page still never supplies a hard-coded RPC.
 */
export async function ensureBscChain(provider) {
  try {
    await ensureWalletChain(provider, BSC_CHAIN_ID);
  } catch (error) {
    // Keep the code the purchase UI already maps to its cancelled message.
    if (error?.code === "REJECTED") throw purchaseError(4001, "The wallet cancelled the network switch");
    throw error;
  }
}

export function createNodePurchaseStatusReader({ ensureChain = ensureBscChain, createVault = (provider) => new Contract(NODE_SALE_ADDRESS, STATUS_ABI, new BrowserProvider(provider)) } = {}) {
  return async function readNodePurchaseStatus({ provider, account }) {
    if (!provider?.request) throw purchaseError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
    if (!isWalletAddress(account)) throw purchaseError("INVALID_ACCOUNT", "Invalid wallet account");
    await ensureChain(provider);
    return Number(await createVault(provider).getNodeLevel(account)) !== 0;
  };
}
export const readNodePurchaseStatus = createNodePurchaseStatusReader();

/**
 * Read the full purchase gate in one pass. Registration comes first because
 * `bindUpline` is allowed while sales are paused: an unregistered wallet should
 * still be told it can bind now.
 */
export function createNodePurchaseGateReader({ createSale = (provider) => new Contract(NODE_SALE_ADDRESS, SALE_ABI, new BrowserProvider(provider)) } = {}) {
  return async function readNodePurchaseGate({ provider, account }) {
    if (!provider?.request) throw purchaseError("PROVIDER_NOT_FOUND", "No EIP-1193 wallet provider found");
    if (!isWalletAddress(account)) throw purchaseError("INVALID_ACCOUNT", "Invalid wallet account");
    const sale = createSale(provider);
    const [registered, paused, level] = await Promise.all([
      sale.isRegistered(account),
      sale.paused(),
      sale.getNodeLevel(account),
    ]);
    return { registered: Boolean(registered), paused: Boolean(paused), level: Number(level) };
  };
}
export const readNodePurchaseGate = createNodePurchaseGateReader();

async function createClient(provider) {
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner();
  const account = await signer.getAddress();
  return { account, sale: new Contract(NODE_SALE_ADDRESS, SALE_ABI, signer), usdt: new Contract(USDT_ADDRESS, USDT_ABI, signer) };
}

export function createNodePurchase({ ensureChain: chainGuard = ensureBscChain, createClient: clientFactory = createClient } = {}) {
  return async function purchaseNode({ provider, expectedAccount, tier = 1, onStatus = () => {} }) {
    await chainGuard(provider); onStatus({ phase: "checking" });
    const { account, sale, usdt } = await clientFactory(provider);
    if (!isSameAddress(account, expectedAccount)) throw purchaseError("ACCOUNT_CHANGED", "The active wallet account changed");
    // Buying requires an upline binding first; the contract enforces this too.
    if (!(await sale.isRegistered(account))) throw purchaseError("MUST_BIND_UPLINE", "Bind an upline before buying a node");
    if (await sale.paused()) throw purchaseError("PAUSED", "Node purchases are paused");
    if (Number(await sale.getNodeLevel(account)) !== 0) throw purchaseError("ALREADY_NODE", "This address already owns a node");
    const config = await sale.getTierConfig(tier);
    const priceRaw = BigInt(config.priceRaw); const sold = BigInt(config.sold); const maxSupply = BigInt(config.maxSupply);
    if (maxSupply <= sold) throw purchaseError("SOLD_OUT", "This tier is sold out");
    const balance = BigInt(await usdt.balanceOf(account));
    const allowance = BigInt(await usdt.allowance(account, NODE_SALE_ADDRESS));
    if (balance < priceRaw) throw purchaseError("INSUFFICIENT_USDT", "Insufficient USDT balance");
    let approvalHash = null;
    if (allowance < priceRaw) { onStatus({ phase: "approving" }); const approval = await usdt.approve(NODE_SALE_ADDRESS, priceRaw); approvalHash = approval.hash; onStatus({ phase: "approvalPending", hash: approvalHash }); assertSuccessfulReceipt(await approval.wait()); }
    try {
      onStatus({ phase: "purchasing" });
      const buy = await sale.buyNode(tier);
      onStatus({ phase: "purchasePending", hash: buy.hash });
      const receipt = await buy.wait();
      assertSuccessfulReceipt(receipt);
      onStatus({ phase: "success", hash: buy.hash });
      return { approvalHash, depositHash: buy.hash, tier };
    } catch (error) {
      throw normalizeBuyError(error);
    }
  };
}
export const purchaseNode = createNodePurchase();

export function describeNodePurchaseError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "rejected";
  if (error?.code === "PROVIDER_NOT_FOUND") return "walletMissing";
  if (error?.code === "CHAIN_NOT_CONFIGURED") return "chainNotConfigured";
  if (error?.code === "MUST_BIND_UPLINE") return "mustBindUpline";
  if (error?.code === "UPLINE_NOT_NODE") return "uplineNotNode";
  if (error?.code === "SWAP_UNAVAILABLE") return "swapUnavailable";
  if (error?.code === "PAUSED") return "disabled";
  if (error?.code === "ALREADY_NODE") return "alreadyPurchased";
  if (error?.code === "SOLD_OUT") return "soldOut";
  if (error?.code === "INSUFFICIENT_USDT") return "insufficientUsdt";
  if (error?.code === "ACCOUNT_CHANGED") return "accountChanged";
  const name = revertName(error);
  if (name === "MustBindUpline") return "mustBindUpline";
  if (name === "UplineNotNode") return "uplineNotNode";
  if (name === "AlreadyNode") return "alreadyPurchased";
  if (name === "EnforcedPause") return "disabled";
  if (name === "TierSoldOut") return "soldOut";
  return "failed";
}