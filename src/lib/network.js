import contracts from "../contracts/mainnet.json" with { type: "json" };

export const CHAIN_ID = contracts.chainId;
export const BSC_CHAIN_ID = "0x38";
export const BSCSCAN_TX_URL = "https://bscscan.com/tx/";
export const BSCSCAN_ADDRESS_URL = "https://bscscan.com/address/";
export const NODE_SALE_ADDRESS = "0x7898694127B7375CE9e497AC309F657936C877Bf";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
// Legacy exports remain for unrelated dashboard modules.
export const HUB_ADDRESS = contracts.hub;
export const TOKEN_ADDRESS = contracts.token;
export const PAIR_ADDRESS = contracts.pairLP ?? "";
export const DEPOSIT_CONTRACT_ADDRESS = NODE_SALE_ADDRESS;
