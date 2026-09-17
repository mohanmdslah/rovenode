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
export const NODE_SALE_ADDRESS = "0x88D6b4963680844c933347E210e45A0FB4E29B9D";
export const NODE_SALE_IMPLEMENTATION_ADDRESS = "0x6F5FA88B0584575C5fE7548Bf3de02FB6cb61008";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
/** v2 settles each purchase by swapping the buyer's USDT into USDC. */
export const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const USDC_RECEIVER_ADDRESS = "0x206DB845F3AB4DE1Fc41f456fCC4a21cBa95D168";
/** Fixed vertex of the referral tree; the contract reports ROOT as always registered. */
export const REFERRAL_ROOT_ADDRESS = "0x35f8198F9BbE7b08187b2b59C75289b6e1108455";
/** Referral console page size; the contract caps a single page at MAX_PAGE_SIZE (100). */
export const REFERRAL_PAGE_SIZE = 10;
export const REFERRAL_MAX_PAGE_SIZE = 100;
// Legacy exports remain for unrelated dashboard modules.
export const HUB_ADDRESS = contracts.hub;
export const TOKEN_ADDRESS = contracts.token;
export const PAIR_ADDRESS = contracts.pairLP ?? "";
export const DEPOSIT_CONTRACT_ADDRESS = NODE_SALE_ADDRESS;
