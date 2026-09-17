/**
 * Shared mock of the deployed NodeSale contract for the QA fixtures.
 *
 * It answers `eth_call`/`eth_sendTransaction` using ethers' own ABI coder and
 * the real contract interface, so the fixtures exercise the actual ABI and
 * encoding rather than a hand-written stub.
 */
import { Interface, getAddress } from "ethers";
import { REFERRAL_ABI } from "../src/lib/referral.js";
import { NODE_SALE_ADDRESS, REFERRAL_ROOT_ADDRESS } from "../src/lib/network.js";

// De-duplicated: the referral surface and the purchase surface overlap.
const SALE_ABI = [...new Set([
  ...REFERRAL_ABI,
  "function getNodeLevel(address account) view returns (uint8)",
  "function getTierConfig(uint8 tier) view returns (uint256 priceUsdt, uint256 priceRaw, uint256 maxSupply, uint256 sold)",
  "function buyNode(uint8 tier)",
])];
const V2 = {
  version: "2.1.0",
  usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  usdcReceiver: "0x206DB845F3AB4DE1Fc41f456fCC4a21cBa95D168",
  swapRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  slippageBps: 100n,
};

const USDT_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const MOCK_ACCOUNT = getAddress("0x1234567890abcdef1234567890abcdef12345678");

export function installMockNodeSale({ bound = false, downlineCount = 23, paused = false } = {}) {
  const sale = new Interface(SALE_ABI);
  const usdt = new Interface(USDT_ABI);
  const root = getAddress(REFERRAL_ROOT_ADDRESS);
  const downlines = Array.from({ length: downlineCount }, (_, index) => ({
    address: getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
    level: index % 4,
  }));

  const blockNumber = "0x64";
  const state = {
    accounts: true,
    paused,
    bound,
    upline: bound ? root : "0x0000000000000000000000000000000000000000",
    nodeLevel: bound ? 2 : 0,
    networkSize: 42,
    downlineCount,
    downlines,
  };
  const sent = [];
  const calls = [];
  const trace = [];
  const errors = [];
  const pending = new Map();
  let txCounter = 0;

  const receiptFor = (hash, target) => {
    const event = sale.encodeEventLog(sale.getEvent("UplineBound"), [MOCK_ACCOUNT, target]);
    return {
      transactionHash: hash, transactionIndex: "0x0", blockHash: `0x${"b".repeat(64)}`, blockNumber,
      from: MOCK_ACCOUNT, to: NODE_SALE_ADDRESS, cumulativeGasUsed: "0x5208", gasUsed: "0x5208",
      contractAddress: null, status: "0x1", type: "0x2", effectiveGasPrice: "0x1",
      logsBloom: `0x${"0".repeat(512)}`,
      logs: [{
        address: NODE_SALE_ADDRESS, topics: event.topics, data: event.data, blockNumber,
        blockHash: `0x${"b".repeat(64)}`, transactionHash: hash, transactionIndex: "0x0", logIndex: "0x0", removed: false,
      }],
    };
  };

  const readSale = (data) => {
    const parsed = sale.parseTransaction({ data });
    if (!parsed) throw new Error(`unknown selector ${data.slice(0, 10)}`);
    const { name, args } = parsed;
    calls.push(name);
    switch (name) {
      case "paused": return sale.encodeFunctionResult(name, [Boolean(state.paused)]);
      case "root": return sale.encodeFunctionResult(name, [root]);
      case "version": return sale.encodeFunctionResult(name, [V2.version]);
      case "usdc": return sale.encodeFunctionResult(name, [V2.usdc]);
      case "usdcReceiver": return sale.encodeFunctionResult(name, [V2.usdcReceiver]);
      case "treasury": return sale.encodeFunctionResult(name, [V2.usdcReceiver]);
      case "swapRouter": return sale.encodeFunctionResult(name, [V2.swapRouter]);
      case "slippageBps": return sale.encodeFunctionResult(name, [V2.slippageBps]);
      case "registeredCount": return sale.encodeFunctionResult(name, [BigInt(state.bound ? state.networkSize + 1 : 1)]);
      case "isRegistered": {
        const account = getAddress(args[0]);
        return sale.encodeFunctionResult(name, [account === root || (account === MOCK_ACCOUNT && state.bound)]);
      }
      case "getUpline":
        return sale.encodeFunctionResult(name, state.bound ? [state.upline, 0] : ["0x0000000000000000000000000000000000000000", 0]);
      case "getDirectDownlineCount":
        return sale.encodeFunctionResult(name, [BigInt(state.bound ? state.downlineCount : 0)]);
      case "getDirectDownlines": {
        const offset = Number(args[1]);
        const limit = Number(args[2]);
        const slice = state.downlines.slice(offset, offset + limit);
        return sale.encodeFunctionResult(name, [slice.map((row) => row.address), slice.map((row) => row.level)]);
      }
      case "getNodeLevel": {
        // v2 rule: ROOT owns no node; a direct downline's own tier is its level.
        const account = getAddress(args[0]);
        const level = account === root ? 0
          : account === MOCK_ACCOUNT ? state.nodeLevel
            : (state.downlines.find((row) => row.address === account)?.level ?? 0);
        return sale.encodeFunctionResult(name, [level]);
      }
      case "getTierConfig": {
        const tier = Number(args[0]);
        return sale.encodeFunctionResult(name, [BigInt(tier), BigInt(tier) * 10n ** 18n, BigInt([0, 1000, 600, 400][tier]), 0n]);
      }
      default: throw new Error(`unmocked view ${name}`);
    }
  };

  const readUsdt = (data) => {
    const parsed = usdt.parseTransaction({ data });
    calls.push(`usdt.${parsed.name}`);
    switch (parsed.name) {
      case "decimals": return usdt.encodeFunctionResult(parsed.name, [18]);
      case "balanceOf": return usdt.encodeFunctionResult(parsed.name, [10n ** 24n]);
      case "allowance": return usdt.encodeFunctionResult(parsed.name, [10n ** 24n]);
      default: throw new Error(`unmocked view usdt.${parsed.name}`);
    }
  };

  const provider = {
    isMetaMask: true,
    async request({ method, params = [] }) {
      trace.push(method.startsWith("eth_getTransaction") ? `${method}(${String(params[0]).slice(0, 12)})` : method);
      switch (method) {
        // `accounts` lets a fixture defer the connected state to reproduce
        // elements that mount after the page-reveal scan has already run.
        case "eth_accounts": return state.accounts ? [MOCK_ACCOUNT] : [];
        case "eth_requestAccounts": return [MOCK_ACCOUNT];
        case "eth_chainId": return "0x38";
        case "eth_blockNumber": return blockNumber;
        case "eth_getBlockByNumber":
          return { number: blockNumber, hash: `0x${"b".repeat(64)}`, transactions: [], baseFeePerGas: "0x1", timestamp: "0x1", gasLimit: "0x1e8480", gasUsed: "0x0", miner: MOCK_ACCOUNT, extraData: "0x", difficulty: "0x0", nonce: "0x0000000000000000" };
        case "eth_gasPrice": return "0x1";
        case "eth_maxPriorityFeePerGas": return "0x1";
        case "eth_feeHistory": return { oldestBlock: blockNumber, baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0.5], reward: [["0x1"]] };
        case "eth_getBalance": return "0xde0b6b3a7640000";
        case "eth_getCode": return "0x6000";
        case "eth_getTransactionCount": return "0x0";
        case "eth_estimateGas": return "0x5208";
        case "eth_call": {
          const to = getAddress(params[0].to);
          return to === getAddress(NODE_SALE_ADDRESS) ? readSale(params[0].data) : readUsdt(params[0].data);
        }
        case "eth_sendTransaction": {
          const parsed = sale.parseTransaction({ data: params[0].data });
          txCounter += 1;
          const hash = `0x${txCounter.toString(16).padStart(64, "0")}`;
          sent.push(parsed.name);
          if (parsed.name === "bindUpline") {
            state.bound = true;
            state.upline = getAddress(parsed.args[0]);
          }
          if (parsed.name === "buyNode") state.nodeLevel = Number(parsed.args[0]);
          pending.set(hash, receiptFor(hash, state.upline === "0x0000000000000000000000000000000000000000" ? MOCK_ACCOUNT : state.upline));
          return hash;
        }
        case "eth_getTransactionReceipt": return pending.get(params[0]) ?? null;
        case "eth_getTransactionByHash":
          // ethers refuses a transaction without signature fields ("missing r").
          return {
            hash: params[0], blockNumber, blockHash: `0x${"b".repeat(64)}`, from: MOCK_ACCOUNT, to: NODE_SALE_ADDRESS,
            nonce: "0x0", value: "0x0", gas: "0x5208", gasLimit: "0x5208", gasPrice: "0x1", input: "0x", data: "0x",
            transactionIndex: "0x0", type: "0x0", chainId: "0x38", accessList: null,
            v: 27, r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`,
          };
        default: errors.push(`unhandled ${method}`); return null;
      }
    },
    on() {},
    removeListener() {},
  };

  window.ethereum = provider;
  return { provider, account: MOCK_ACCOUNT, state, sent, calls, trace, errors };
}
