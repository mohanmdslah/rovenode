import { BrowserProvider, Contract, getAddress, parseUnits } from "ethers";
import { ensureWalletChain, isWalletAddress } from "./wallet.js";
import { BSC_CHAIN_ID, NODE_SALE_ADDRESS, USDT_ADDRESS } from "./network.js";
export { BSC_CHAIN_ID, BSCSCAN_TX_URL, BSCSCAN_ADDRESS_URL } from "./network.js";

export const DEPOSIT_CONTRACT_ADDRESS = NODE_SALE_ADDRESS;
export const USDT_CONTRACT_ADDRESS = USDT_ADDRESS;
export const NODE_PRICE_USDT = parseUnits("150", 18);

const SALE_ABI = [
  "function paused() view returns (bool)",
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
    onStatus({ phase: "purchasing" }); const buy = await sale.buyNode(tier); onStatus({ phase: "purchasePending", hash: buy.hash }); const receipt = await buy.wait(); assertSuccessfulReceipt(receipt);
    onStatus({ phase: "success", hash: buy.hash }); return { approvalHash, depositHash: buy.hash, tier };
  };
}
export const purchaseNode = createNodePurchase();

export function describeNodePurchaseError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "rejected";
  if (error?.code === "PROVIDER_NOT_FOUND") return "walletMissing";
  if (error?.code === "CHAIN_NOT_CONFIGURED") return "chainNotConfigured";
  if (error?.code === "PAUSED") return "disabled";
  if (error?.code === "ALREADY_NODE") return "alreadyPurchased";
  if (error?.code === "SOLD_OUT") return "soldOut";
  if (error?.code === "INSUFFICIENT_USDT") return "insufficientUsdt";
  if (error?.code === "ACCOUNT_CHANGED") return "accountChanged";
  return "failed";
}