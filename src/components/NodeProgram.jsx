import { ArrowRight, CheckCircle, Export, SpinnerGap, Wallet } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocale } from "../i18n.jsx";
import { formatWalletAddress } from "../lib/wallet.js";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import { BSCSCAN_ADDRESS_URL, BSCSCAN_TX_URL, DEPOSIT_CONTRACT_ADDRESS, describeNodePurchaseError, purchaseNode } from "../lib/node-purchase.js";

const SALE_ABI = ["function paused() view returns (bool)", "function getNodeLevel(address account) view returns (uint8)", "function getTierConfig(uint8 tier) view returns (uint256 priceUsdt, uint256 priceRaw, uint256 maxSupply, uint256 sold)"];
const tiers = [1, 2, 3];
const busyPhases = new Set(["switching", "checking", "approving", "approvalPending", "purchasing", "purchasePending"]);

export function NodeProgram({ walletAddress, walletBusy, onConnect, provider }) {
  const { copy, locale } = useLocale();
  const [configs, setConfigs] = useState([]);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [purchasedTier, setPurchasedTier] = useState(0);
  const [selectedTier, setSelectedTier] = useState(1);
  const [purchaseStatus, setPurchaseStatus] = useState({ phase: "idle", hash: "", errorKey: "" });
  const purchaseBusy = busyPhases.has(purchaseStatus.phase);
  const connected = Boolean(walletAddress);

  useEffect(() => {
    let active = true;
    if (!provider) return undefined;
    const load = async () => {
      try {
        const sale = new Contract(DEPOSIT_CONTRACT_ADDRESS, SALE_ABI, new BrowserProvider(provider));
        const level = walletAddress ? Number(await sale.getNodeLevel(walletAddress)) : 0;
        const rows = await Promise.all(tiers.map(async (tier) => { const c = await sale.getTierConfig(tier); const max = BigInt(c.maxSupply); const sold = BigInt(c.sold); return { tier, price: formatUnits(c.priceRaw, 18), max, sold, remaining: max > sold ? max - sold : 0n }; }));
        if (active) { setConfigs(rows); setPurchasedTier(level); setHasPurchased(level > 0); }
      } catch { if (active) setConfigs([]); }
    };
    void load(); return () => { active = false; };
  }, [provider, purchaseStatus.phase]);

  const startPurchase = async () => {
    if (!connected || walletBusy || purchaseBusy || hasPurchased) return;
    setPurchaseStatus({ phase: "checking", hash: "", errorKey: "" });
    try {
      await purchaseNode({ provider, expectedAccount: walletAddress, tier: selectedTier, onStatus: (status) => setPurchaseStatus({ ...status, errorKey: "" }) });
      setHasPurchased(true);
      setPurchasedTier(selectedTier);
    } catch (error) { setPurchaseStatus({ phase: "error", hash: "", errorKey: describeNodePurchaseError(error) }); }
  };

  const errorCopy = copy.nodePurchase?.errors ?? {};
  const actionLabel = !connected ? copy.nodeAction : hasPurchased ? `${copy.nodePurchase.alreadyPurchasedAction ?? errorCopy.alreadyPurchased} · L${purchasedTier}` : purchaseBusy ? (copy.nodePurchase.phases[purchaseStatus.phase] ?? copy.nodeConnectedAction) : copy.nodeConnectedAction;
  const status = purchaseStatus.errorKey ? (errorCopy[purchaseStatus.errorKey] ?? errorCopy.failed) : purchaseStatus.phase === "success" ? copy.nodePurchase.success : copy.nodePurchase.phases.idle;

  return <section className="node-section" id="node"><div className="section-shell">
    <div className="section-heading split-heading" data-reveal="item"><div><p className="section-kicker">{copy.nodeKicker}</p><h2>{copy.nodeTitle}</h2></div><p>{copy.nodeBody}</p></div>
    <div className="node-stage">
      <figure className="node-visual" data-reveal="item"><img src="/assets/rove-ip-01-street.webp" alt="ROVE consensus node operator in the neon capital district" width="1014" height="1014" loading="lazy" decoding="async" /><div className="node-visual-code" aria-hidden="true"><span>CONSENSUS NODE</span><strong>ROVE // BSC</strong><small>VERIFY · CONNECT · PARTICIPATE</small></div></figure>
      <div className="node-offer" data-reveal="item">
        <div className="node-offer-head"><span><i />NODE SALE · BSC MAINNET</span><a href={`${BSCSCAN_ADDRESS_URL}${DEPOSIT_CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">{formatWalletAddress(DEPOSIT_CONTRACT_ADDRESS)} <Export size={13} /></a></div>
        <div className="node-offer-intro"><strong>{copy.nodePurchase.offerTitle ?? "选择节点档位"}</strong><span>{copy.nodePurchase.offerBody ?? "价格、库存和已售数量均从 NodeSale 合约实时读取。每个地址仅可购买一次。"}</span></div><div className="node-tier-grid">{configs.map((item) => <button key={item.tier} className={selectedTier === item.tier ? "is-selected" : ""} type="button" onClick={() => setSelectedTier(item.tier)}><span>L{item.tier}<em>{selectedTier === item.tier ? "SELECTED" : ""}</em></span><strong>{item.price} USDT</strong><small>{copy.nodePurchase.remaining} {item.remaining.toString()} · {copy.nodePurchase.sold} {item.sold.toString()}</small></button>)}</div><div className="node-offer-facts">{(copy.nodeOfferFacts ?? []).map(([title, body], index) => <div key={title}><strong>0{index + 1}</strong><span>{title}</span><small>{body}</small></div>)}</div>
        <div className={`node-transaction-status ${purchaseStatus.errorKey ? "is-error" : ""} ${purchaseStatus.phase === "success" || hasPurchased ? "is-success" : ""}`} aria-live="polite"><p>{status}</p>{purchaseStatus.hash && <a className="node-transaction-link" href={`${BSCSCAN_TX_URL}${purchaseStatus.hash}`} target="_blank" rel="noreferrer">{copy.nodePurchase.viewTransaction}<Export size={13} /></a>}</div>
        <div className="node-action-row"><button className="primary-button" type="button" onClick={connected ? startPurchase : onConnect} disabled={walletBusy || purchaseBusy || hasPurchased} aria-busy={purchaseBusy}>{actionLabel}{purchaseBusy ? <SpinnerGap className="node-spinner" size={18} /> : hasPurchased ? <CheckCircle size={18} weight="fill" /> : <ArrowRight size={18} weight="bold" />}</button><span className={connected ? "is-connected" : ""}><Wallet size={15} />{connected ? formatWalletAddress(walletAddress) : "EIP-1193 · BSC MAINNET"}</span></div>
      </div>
    </div>
  </div></section>;
}