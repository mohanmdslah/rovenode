import contracts from "../contracts/mainnet.json" with { type: "json" };

export const CHAIN_ID = contracts.chainId;
export const BSC_CHAIN_ID = "0x38";
export const BSCSCAN_TX_URL = "https://bscscan.com/tx/";
export const BSCSCAN_ADDRESS_URL = "https://bscscan.com/address/";
export const NODE_SALE_ADDRESS = "0xA1bcfD8BdAe3459F4FDcc3B2573244C456a0756a";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
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
