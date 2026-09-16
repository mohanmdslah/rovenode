import { ArrowRight, CheckCircle, Export, LinkSimple, SpinnerGap, Wallet } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocale } from "../i18n.jsx";
import { formatWalletAddress } from "../lib/wallet.js";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import { BSCSCAN_ADDRESS_URL, BSCSCAN_TX_URL, DEPOSIT_CONTRACT_ADDRESS, describeNodePurchaseError, purchaseNode } from "../lib/node-purchase.js";
import { REFERRAL_ROOT_ADDRESS, bindUpline, confirmRegistration, describeReferralError, validateUplineAddress } from "../lib/referral.js";

const SALE_ABI = [
  "function paused() view returns (bool)",
  "function isRegistered(address account) view returns (bool)",
  "function getNodeLevel(address account) view returns (uint8)",
  "function getTierConfig(uint8 tier) view returns (uint256 priceUsdt, uint256 priceRaw, uint256 maxSupply, uint256 sold)",
];
const tiers = [1, 2, 3];
const busyPhases = new Set(["switching", "checking", "approving", "approvalPending", "purchasing", "purchasePending"]);
const bindBusyPhases = new Set(["binding", "bindPending"]);
const IDLE_GATE = { registered: false, paused: false, level: 0, ready: false };

export function NodeProgram({ walletAddress, walletBusy, onConnect, provider, onReferralChange }) {
  const { copy } = useLocale();
  const purchaseCopy = copy.nodePurchase ?? {};
  const errorCopy = purchaseCopy.errors ?? {};
  const [configs, setConfigs] = useState([]);
  const [gate, setGate] = useState(IDLE_GATE);
  const [selectedTier, setSelectedTier] = useState(1);
  const [uplineInput, setUplineInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [purchaseStatus, setPurchaseStatus] = useState({ phase: "idle", hash: "", errorKey: "" });
  const [bindStatus, setBindStatus] = useState({ phase: "idle", hash: "", errorKey: "" });
  const purchaseBusy = busyPhases.has(purchaseStatus.phase);
  const bindBusy = bindBusyPhases.has(bindStatus.phase);
  const connected = Boolean(walletAddress);
  const hasPurchased = gate.level > 0;
  const registered = gate.registered;

  useEffect(() => {
    let active = true;
    if (!provider) return undefined;
    const load = async () => {
      try {
        const sale = new Contract(DEPOSIT_CONTRACT_ADDRESS, SALE_ABI, new BrowserProvider(provider));
        const rows = await Promise.all(tiers.map(async (tier) => { const c = await sale.getTierConfig(tier); const max = BigInt(c.maxSupply); const sold = BigInt(c.sold); return { tier, price: formatUnits(c.priceRaw, 18), max, sold, remaining: max > sold ? max - sold : 0n }; }));
        let registered = false; let level = 0;
        const paused = Boolean(await sale.paused());
        if (walletAddress) {
          const [isIn, nodeLevel] = await Promise.all([sale.isRegistered(walletAddress), sale.getNodeLevel(walletAddress)]);
          registered = Boolean(isIn);
          level = Number(nodeLevel);
        }
        if (active) { setConfigs(rows); setGate({ registered, paused, level, ready: true }); }
      } catch { if (active) { setConfigs([]); setGate(IDLE_GATE); } }
    };
    void load(); return () => { active = false; };
  }, [provider, walletAddress, reloadKey]);

  const startBind = async () => {
    if (!connected || walletBusy || bindBusy || registered) return;
    const invalid = validateUplineAddress(uplineInput, { account: walletAddress });
    if (invalid) { setBindStatus({ phase: "error", hash: "", errorKey: invalid }); return; }
    const upline = uplineInput.trim();
    setBindStatus({ phase: "binding", hash: "", errorKey: "" });
    try {
      // bindUpline preflights registration state and the upline's own network
      // membership on-chain before opening a wallet transaction.
      const result = await bindUpline({ provider, account: walletAddress, upline, onStatus: (status) => setBindStatus({ ...status, errorKey: "" }) });
      // Re-read the chain instead of trusting local state.
      const stillRegistered = await confirmRegistration({ provider, account: walletAddress });
      if (!stillRegistered) { setBindStatus({ phase: "error", hash: result.hash, errorKey: "bindFailed" }); return; }
      setBindStatus({ phase: "success", hash: result.hash, errorKey: "" });
      setUplineInput("");
      setReloadKey((key) => key + 1);
      onReferralChange?.();
    } catch (error) {
      setBindStatus({ phase: "error", hash: "", errorKey: describeReferralError(error) });
    }
  };

  const startPurchase = async () => {
    if (!connected || walletBusy || purchaseBusy || hasPurchased || !registered) return;
    setPurchaseStatus({ phase: "checking", hash: "", errorKey: "" });
    try {
      await purchaseNode({ provider, expectedAccount: walletAddress, tier: selectedTier, onStatus: (status) => setPurchaseStatus({ ...status, errorKey: "" }) });
      // purchaseNode already reported phase "success" with its transaction hash.
      setReloadKey((key) => key + 1);
    } catch (error) { setPurchaseStatus({ phase: "error", hash: "", errorKey: describeNodePurchaseError(error) }); }
  };

  const actionLabel = !connected
    ? copy.nodeAction
    : hasPurchased
      ? `${purchaseCopy.alreadyPurchasedAction ?? errorCopy.alreadyPurchased} · L${gate.level}`
      : !registered
        ? purchaseCopy.bindLocked
        : purchaseBusy
          ? (purchaseCopy.phases?.[purchaseStatus.phase] ?? copy.nodeConnectedAction)
          : copy.nodeConnectedAction;
  const status = purchaseStatus.errorKey
    ? (errorCopy[purchaseStatus.errorKey] ?? errorCopy.failed)
    : purchaseStatus.phase === "success"
      ? purchaseCopy.success
      : purchaseCopy.phases?.idle;
  const bindMessage = bindStatus.errorKey
    ? (errorCopy[bindStatus.errorKey] ?? errorCopy.failed)
    : bindStatus.phase === "success"
      ? purchaseCopy.bindSuccess
      : bindStatus.phase === "idle"
        ? ""
        : purchaseCopy.phases?.[bindStatus.phase];

  return <section className="node-section" id="node"><div className="section-shell">
    <div className="section-heading split-heading" data-reveal="item"><div><p className="section-kicker">{copy.nodeKicker}</p><h2>{copy.nodeTitle}</h2></div><p>{copy.nodeBody}</p></div>
    <div className="node-stage">
      <figure className="node-visual" data-reveal="item"><img src="/assets/rove-ip-01-street.webp" alt="ROVE consensus node operator in the neon capital district" width="1014" height="1014" loading="lazy" decoding="async" /><div className="node-visual-code" aria-hidden="true"><span>CONSENSUS NODE</span><strong>ROVE // BSC</strong><small>VERIFY · CONNECT · PARTICIPATE</small></div></figure>
      <div className="node-offer" data-reveal="item">
        <div className="node-offer-head"><span><i />NODE SALE · BSC MAINNET</span><a href={`${BSCSCAN_ADDRESS_URL}${DEPOSIT_CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">{formatWalletAddress(DEPOSIT_CONTRACT_ADDRESS)} <Export size={13} /></a></div>
        <div className="node-offer-intro"><strong>{purchaseCopy.offerTitle}</strong><span>{purchaseCopy.offerBody}</span></div>

        {connected && !hasPurchased && (
          <div className={`node-bind-step ${registered ? "is-bound" : ""}`}>
            <div className="node-bind-head">
              <strong><LinkSimple size={16} weight="bold" aria-hidden="true" />{purchaseCopy.bindStepTitle}</strong>
              {registered && <span className="node-bind-state"><CheckCircle size={15} weight="fill" aria-hidden="true" />{purchaseCopy.bindBound}</span>}
            </div>
            <p className="node-bind-body">{purchaseCopy.bindStepBody}</p>
            {!registered && <>
              <div className="node-bind-row">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck="false"
                  value={uplineInput}
                  onChange={(event) => setUplineInput(event.target.value)}
                  placeholder={purchaseCopy.bindPlaceholder}
                  aria-label={purchaseCopy.bindPlaceholder}
                  disabled={bindBusy}
                />
                <button className="text-button node-bind-root" type="button" onClick={() => setUplineInput(REFERRAL_ROOT_ADDRESS)} disabled={bindBusy}>{purchaseCopy.bindRootButton}</button>
                <button className="primary-button node-bind-submit" type="button" onClick={startBind} disabled={walletBusy || bindBusy || !uplineInput.trim()} aria-busy={bindBusy}>
                  {bindBusy ? purchaseCopy.phases?.bindPending : purchaseCopy.bindButton}
                  {bindBusy ? <SpinnerGap className="node-spinner" size={18} /> : <ArrowRight size={18} weight="bold" />}
                </button>
              </div>
              <p className="node-bind-note">{purchaseCopy.bindStepNote}<span className="node-bind-root-label">{purchaseCopy.bindRootLabel}: {formatWalletAddress(REFERRAL_ROOT_ADDRESS)}</span></p>
            </>}
            {bindMessage && <div className={`node-bind-status ${bindStatus.errorKey ? "is-error" : ""} ${bindStatus.phase === "success" ? "is-success" : ""}`} aria-live="polite"><p>{bindMessage}</p>{bindStatus.hash && <a className="node-transaction-link" href={`${BSCSCAN_TX_URL}${bindStatus.hash}`} target="_blank" rel="noreferrer">{purchaseCopy.viewTransaction}<Export size={13} /></a>}</div>}
          </div>
        )}

        <div className="node-tier-grid">{configs.map((item) => <button key={item.tier} className={selectedTier === item.tier ? "is-selected" : ""} type="button" onClick={() => setSelectedTier(item.tier)}><span>L{item.tier}<em>{selectedTier === item.tier ? "SELECTED" : ""}</em></span><strong>{item.price} USDT</strong><small>{purchaseCopy.remaining} {item.remaining.toString()} · {purchaseCopy.sold} {item.sold.toString()}</small></button>)}</div><div className="node-offer-facts">{(copy.nodeOfferFacts ?? []).map(([title, body], index) => <div key={title}><strong>0{index + 1}</strong><span>{title}</span><small>{body}</small></div>)}</div>
        <div className={`node-transaction-status ${purchaseStatus.errorKey ? "is-error" : ""} ${purchaseStatus.phase === "success" || hasPurchased ? "is-success" : ""}`} aria-live="polite"><p>{status}</p>{purchaseStatus.hash && <a className="node-transaction-link" href={`${BSCSCAN_TX_URL}${purchaseStatus.hash}`} target="_blank" rel="noreferrer">{purchaseCopy.viewTransaction}<Export size={13} /></a>}</div>
        <div className="node-action-row"><button className="primary-button" type="button" onClick={connected ? startPurchase : onConnect} disabled={walletBusy || purchaseBusy || hasPurchased || (connected && !registered)} aria-busy={purchaseBusy}>{actionLabel}{purchaseBusy ? <SpinnerGap className="node-spinner" size={18} /> : hasPurchased ? <CheckCircle size={18} weight="fill" /> : <ArrowRight size={18} weight="bold" />}</button><span className={connected ? "is-connected" : ""}><Wallet size={15} />{connected ? formatWalletAddress(walletAddress) : "EIP-1193 · BSC MAINNET"}</span></div>
      </div>
    </div>
  </div></section>;
}
