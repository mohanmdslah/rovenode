import contracts from "../contracts/mainnet.json" with { type: "json" };

export const CHAIN_ID = contracts.chainId;
export const BSC_CHAIN_ID = "0x38";
export const BSCSCAN_TX_URL = "https://bscscan.com/tx/";
export const BSCSCAN_ADDRESS_URL = "https://bscscan.com/address/";
/**
 * NodeSale runs behind a UUPS proxy: all reads and writes must target the proxy
 * address, which keeps its state across upgrades. The implementation contract
 * below is listed only so nobody wires it up by mistake.
 */
export const NODE_SALE_ADDRESS = "0xf7fc027D0175073E2afC71B8E02491da06358F4d";
export const NODE_SALE_IMPLEMENTATION_ADDRESS = "0x3AbE19423E8c56B0785aC618e55537f6B44c08c8";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
/** v2 settles each purchase by swapping the buyer's USDT into USDC. */
export const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const USDC_RECEIVER_ADDRESS = "0x206DB845F3AB4DE1Fc41f456fCC4a21cBa95D168";
/** Fixed vertex of the referral tree; the contract reports ROOT as always registered. */
export const REFERRAL_ROOT_ADDRESS = "0x2467991B37FF411F8f7a74c5BBA0B16D12F39D45";
/** Referral console page size; the contract caps a single page at MAX_PAGE_SIZE (100). */
export const REFERRAL_PAGE_SIZE = 10;
export const REFERRAL_MAX_PAGE_SIZE = 100;
// Legacy exports remain for unrelated dashboard modules.
export const HUB_ADDRESS = contracts.hub;
export const TOKEN_ADDRESS = contracts.token;
export const PAIR_ADDRESS = contracts.pairLP ?? "";
export const DEPOSIT_CONTRACT_ADDRESS = NODE_SALE_ADDRESS;
