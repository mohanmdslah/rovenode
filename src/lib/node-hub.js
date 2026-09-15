import { BrowserProvider, Contract, Interface } from "ethers";
import hubArtifact from "../contracts/LabdogNodeHub.json" with { type: "json" };
import tokenArtifact from "../contracts/LabdogToken.json" with { type: "json" };
import { readWei } from "./api.js";
import { CHAIN_ID, HUB_ADDRESS, TOKEN_ADDRESS } from "./network.js";
import { isWalletAddress } from "./wallet.js";

export const DIVIDEND_CLAIM_ABI = [
  "function claimDividend((address user,address token,uint256 amount,uint256 nonce,uint256 deadline),bytes signature)",
  "event DividendClaimed(address indexed user,address indexed token,uint256 amount,uint256 nonce,uint256 deadline,address claimer)",
];
const hubInterface = new Interface(hubArtifact.abi);
const dividendInterface = new Interface(DIVIDEND_CLAIM_ABI);
const fail = (code) => Object.assign(new Error(code), { code });
const sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

export function encodeDividendClaimData(claim, signature) {
  return dividendInterface.encodeFunctionData("claimDividend", [claim, signature]);
}

// The backend order is the source of truth for the signed payload. This only
// converts decimal strings to bigint for ABI encoding; it deliberately does
// not inspect deadline, nonce, domain, signer, token or signature validity.
export function createDividendClaim(order) {
  if (!order || typeof order !== "object") throw fail("INVALID_ORDER");
  try {
    return {
      user: order.user,
      token: order.token,
      amount: readWei(order.amount),
      nonce: readWei(order.nonce),
      deadline: readWei(order.deadlineSec),
    };
  } catch { throw fail("INVALID_ORDER"); }
}

export async function assertHubWallet(provider, account, signal) {
  signal?.throwIfAborted();
  if (!provider?.request) throw fail("PROVIDER_NOT_FOUND");
  if (!isWalletAddress(account)) throw fail("ACCOUNT_CHANGED");
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" }),
  ]);
  signal?.throwIfAborted();
  if (!sameAddress(accounts?.[0], account)) throw fail("ACCOUNT_CHANGED");
  if (Number(chain) !== CHAIN_ID) throw fail("WRONG_CHAIN");
}

async function createClient(provider, account, write) {
  const browser = new BrowserProvider(provider, undefined, { cacheTimeout: -1 });
  try {
    const runner = write ? await browser.getSigner(account) : browser;
    return {
      hub: new Contract(HUB_ADDRESS, hubArtifact.abi, runner),
      dividend: new Contract(HUB_ADDRESS, DIVIDEND_CLAIM_ABI, runner),
      token: new Contract(TOKEN_ADDRESS, tokenArtifact.abi, browser),
      blockNumber: () => browser.getBlockNumber(),
      dispose: () => browser.destroy(),
    };
  } catch (error) { browser.destroy(); throw error; }
}

async function snapshot(client, account) {
  // All fields use one block, so changing tiers cannot produce an inconsistent snapshot.
  const blockTag = await client.blockNumber();
  const options = { blockTag };
  const [nodeId, paused, walletBalance] = await Promise.all([
    client.hub.nodeOf(account, options), client.hub.paused(options), client.token.balanceOf(account, options),
  ]);
  const empty = { nodeId, paused, walletBalance, blockTag, lockedTotal: 0n, initialClaimable: 0n, claimed: 0n, claimable: 0n, unlocked: 0n, lpRegistered: 0n, lpCustodied: 0n, lpRemoved: false, exited: false, lpShare: 0n };
  if (nodeId === 0n) return empty;
  const [node, claimable, unlocked] = await Promise.all([
    client.hub.getNode(account, options), client.hub.claimableLocked(account, options), client.hub.unlockedLocked(account, options),
  ]);
  if (!sameAddress(node.wallet, account) || ![0n, 1n].includes(BigInt(node.status))) throw fail("INVALID_NODE");
  const exited = BigInt(node.status) === 1n;
  return {
    ...empty, lockedTotal: node.lockedTotal, initialClaimable: node.initialClaimable, claimed: node.claimed,
    claimable, unlocked, lpRegistered: node.lpRegistered, lpCustodied: node.lpCustodied,
    lpRemoved: node.lpRemoved, exited, lpShare: exited || node.lpRemoved ? 0n : node.lpRegistered,
  };
}

export function hubActionBlock(data, action) {
  if (!data) return "loading";
  if (data.nodeId === 0n) return "NodeNotFound";
  if (data.exited) return "NodeAlreadyExited";
  if (data.paused) return "EnforcedPause";
  if (action === "claimDividend") return "";
  if (action === "claimLocked") return data.claimable > 0n ? "" : "NothingToClaim";
  if (data.lpRemoved) return "LpAlreadyRemoved";
  // The Hub only requires a positive registered LP amount here. Whether the
  // Hub actually holds enough pair LP and reward tokens is enforced by the
  // removeLP transaction itself.
  if (data.lpRegistered <= 0n) return "NoExitLp";
  return "";
}

function confirmsAction(receipt, action, account, claim) {
  const expected = action === "claimLocked" ? "LockedTokensClaimed" : action === "claimDividend" ? "DividendClaimed" : "NodeExited";
  return receipt.logs?.some((log) => {
    if (!sameAddress(log.address, HUB_ADDRESS)) return false;
    try {
      const event = hubInterface.parseLog(log);
      if (event?.name !== expected) return false;
      // claimDividend permits a relayer to submit on behalf of req.user; the
      // signed user and the claim fields, not claimer, establish the payout.
      if (claim) return sameAddress(event.args.user, account) && sameAddress(event.args.token, claim.token) && event.args.amount === claim.amount && event.args.nonce === claim.nonce && event.args.deadline === claim.deadline;
      return sameAddress(event.args.wallet, account);
    } catch { return false; }
  });
}

export function createNodeHub({ clientFactory = createClient } = {}) {
  return {
    async read({ provider, account, signal }) {
      await assertHubWallet(provider, account, signal);
      const client = await clientFactory(provider, account, false);
      try {
        const result = await snapshot(client, account);
        await assertHubWallet(provider, account, signal);
        return result;
      } finally { client.dispose?.(); }
    },
    async execute({ provider, account, action, order, expectedAmount, signal, onStatus = () => {} }) {
      if (!["claimLocked", "removeLP", "claimDividend"].includes(action)) throw fail("INVALID_ACTION");
      await assertHubWallet(provider, account, signal);
      onStatus({ phase: "checking" });
      const client = await clientFactory(provider, account, true);
      let hash = "";
      try {
        const data = action === "claimDividend" ? null : await snapshot(client, account);
        const blocked = data && hubActionBlock(data, action);
        if (blocked) throw fail(blocked);
        let claim;
        if (action === "claimDividend") {
          claim = createDividendClaim(order);
        }
        const args = claim ? [claim, order.signature] : [];
        const actionContract = claim ? client.dividend : client.hub;
        // claimDividend is sent directly; the Hub is authoritative for all
        // signature, nonce, expiry and reward-pool validation.
        if (action !== "claimDividend") await actionContract[action].staticCall(...args);
        await assertHubWallet(provider, account, signal);
        onStatus({ phase: "signing" });
        const tx = await actionContract[action](...args);
        hash = tx.hash;
        onStatus({ phase: "pending", hash });
        let receipt;
        try { receipt = await tx.wait(); } catch (error) {
          if (error.code !== "TRANSACTION_REPLACED") throw error;
          if (error.cancelled || !sameAddress(error.replacement?.to, HUB_ADDRESS) || error.replacement?.data !== tx.data) throw fail("TRANSACTION_CANCELLED");
          receipt = error.receipt;
          hash = receipt?.hash ?? error.replacement.hash;
          onStatus({ phase: "pending", hash });
        }
        if (!receipt || Number(receipt.status) !== 1) throw fail("TRANSACTION_FAILED");
        if (!confirmsAction(receipt, action, account, claim)) throw fail("EVENT_NOT_CONFIRMED");
        onStatus({ phase: "success", hash });
        return { hash, receipt };
      } catch (error) {
        if (hash) {
          error.transactionHash = hash;
          if (error.receipt && Number(error.receipt.status) === 0) error.code = "TRANSACTION_FAILED";
          else if (!["TRANSACTION_CANCELLED", "TRANSACTION_FAILED", "EVENT_NOT_CONFIRMED"].includes(error.code)) error.confirmationPending = true;
        }
        throw error;
      } finally { client.dispose?.(); }
    },
  };
}

export function hubErrorKey(error) {
  if (error?.confirmationPending) return "EVENT_NOT_CONFIRMED";
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "rejected";
  if (error?.code === "INSUFFICIENT_FUNDS") return "gas";
  if (error?.revert?.name) return error.revert.name === "InsufficientRewardPool" ? "failed" : error.revert.name;
  const data = [error?.data, error?.info?.error?.data, error?.error?.data].find((value) => typeof value === "string" && value.startsWith("0x"));
  if (data) {
    try {
      const name = hubInterface.parseError(data)?.name;
      // Reward-pool state is owned by the Hub; do not turn it into a
      // frontend-specific funding instruction.
      return name === "InsufficientRewardPool" ? "failed" : name ?? "failed";
    } catch { /* Non-Hub revert data falls back to a generic error. */ }
  }
  return error?.code ?? "failed";
}

export const nodeHub = createNodeHub();
