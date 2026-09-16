import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, Export, SpinnerGap, TreeStructure, Users, Wallet } from "@phosphor-icons/react";
import { formatCopy, useLocale } from "../i18n.jsx";
import { formatWalletAddress } from "../lib/wallet.js";
import { BSCSCAN_ADDRESS_URL, NODE_SALE_ADDRESS } from "../lib/network.js";
import { REFERRAL_PAGE_SIZE, describeNodeLevel, referralReader } from "../lib/referral.js";

const EMPTY = {
  status: "idle",
  registered: false,
  upline: { address: "", level: 0, isRoot: false },
  ownLevel: 0,
  networkSize: 0,
  rows: [],
  count: 0,
  page: 1,
  pageCount: 1,
  start: 0,
  end: 0,
};

function AddressLink({ address, short = false }) {
  return (
    <a className="referral-address" href={`${BSCSCAN_ADDRESS_URL}${address}`} target="_blank" rel="noreferrer" title={address}>
      <span>{short ? formatWalletAddress(address) : address}</span>
      <Export size={13} aria-hidden="true" />
    </a>
  );
}

/** Node identity for one address: L1-L3, the root vertex, or not a node yet. */
function LevelTag({ level, isRoot, copy }) {
  const label = describeNodeLevel(level);
  if (label) return <span className="referral-level" data-level={level}>{label}</span>;
  return <span className="referral-level is-empty">{isRoot ? copy.uplineRoot : copy.levelNone}</span>;
}

/** One labelled figure in the console summary strip. */
function Metric({ name, label, children, note, wide = false }) {
  return (
    <div className={`referral-metric referral-metric-${name} ${wide ? "is-wide" : ""}`}>
      <span className="referral-metric-label">{label}</span>
      <div className="referral-metric-value">{children}</div>
      {note && <small className="referral-metric-note">{note}</small>}
    </div>
  );
}

/**
 * Referral console: the connected wallet's upline, its own node identity and
 * its direct downlines, read straight from NodeSale and paged 10 rows at a time.
 */
export function ReferralConsole({ walletAddress, walletBusy, onConnect, provider, refreshKey = 0 }) {
  const { copy } = useLocale();
  const c = copy.referral;
  const [page, setPage] = useState(1);
  const [state, setState] = useState(EMPTY);
  const requestId = useRef(0);
  const connected = Boolean(walletAddress);

  const load = useCallback(async (targetPage = 1) => {
    if (!provider?.request || !walletAddress) return;
    const id = (requestId.current += 1);
    setState((previous) => ({ ...previous, status: "loading" }));
    try {
      const overview = await referralReader.readOverview({ provider, account: walletAddress, page: targetPage, pageSize: REFERRAL_PAGE_SIZE });
      if (requestId.current !== id) return;
      setState({
        status: "ready",
        registered: overview.registered,
        upline: overview.upline,
        ownLevel: overview.ownLevel,
        networkSize: overview.networkSize,
        rows: overview.rows,
        count: overview.count,
        page: overview.page,
        pageCount: overview.pageCount,
        start: overview.start,
        end: overview.end,
      });
    } catch {
      if (requestId.current !== id) return;
      setState({ ...EMPTY, status: "error" });
    }
  }, [provider, walletAddress]);

  // A new account always restarts at page one.
  useEffect(() => { setPage(1); }, [walletAddress]);
  useEffect(() => {
    if (!connected) { requestId.current += 1; setState(EMPTY); return; }
    void load(page);
    // refreshKey lets a successful upline binding refresh this console too.
  }, [connected, load, page, refreshKey]);

  const loading = state.status === "loading";
  const upline = state.upline;
  const ownLevel = describeNodeLevel(state.ownLevel);
  const range = state.count > 0 ? formatCopy(c.rangeSummary, { start: state.start, end: state.end }) : "";

  return (
    <section className="referral-section" id="network" aria-labelledby="referral-title">
      <div className="section-shell">
        <div className="section-heading split-heading" data-reveal="item">
          <div><p className="section-kicker">{c.kicker}</p><h2 id="referral-title">{c.title}</h2></div>
          <p>{c.body}</p>
        </div>

        {!connected ? (
          <div className="referral-connect" data-reveal="item">
            <p><Wallet size={16} weight="fill" aria-hidden="true" />{c.connectPrompt}</p>
            <button className="primary-button" type="button" onClick={onConnect} disabled={walletBusy} aria-busy={walletBusy}>
              {walletBusy ? copy.connecting : copy.connect}
            </button>
          </div>
        ) : (
          <div className="referral-console" data-reveal="item">
            <div className="referral-metrics">
              <Metric name="upline" label={c.uplineTitle} note={c.boundHint} wide>
                {upline.address
                  ? <><AddressLink address={upline.address} short /><LevelTag level={upline.level} isRoot={upline.isRoot} copy={c} /></>
                  : <strong className="referral-none">{loading ? c.loading : c.uplineNone}</strong>}
              </Metric>
              <Metric name="identity" label={c.identityTitle} note={c.identityNote}>
                {ownLevel ? <strong className="referral-figure">{ownLevel}</strong> : <strong className="referral-none">{c.levelNone}</strong>}
              </Metric>
              <Metric name="downline" label={c.downlineTotal} note={range}>
                <strong className="referral-figure">{state.count}</strong>
              </Metric>
              <Metric name="network" label={c.networkTitle} note={c.networkNote}>
                <strong className="referral-figure">{state.networkSize}</strong>
              </Metric>
            </div>

            <article className="referral-card referral-downline">
              <div className="referral-card-head">
                <h3><Users size={18} weight="fill" aria-hidden="true" />{c.downlineTitle}</h3>
                <div className="referral-head-actions">
                  <span className="referral-total">{c.downlineTotal}<strong>{state.count}</strong></span>
                  <button className="node-refresh" type="button" onClick={() => load(page)} disabled={loading} title={c.refresh} aria-label={c.refresh}>
                    {loading ? <SpinnerGap className="node-spinner" size={17} aria-hidden="true" /> : <ArrowClockwise size={17} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {state.status === "error" && <p className="referral-empty is-error" role="status">{c.error}</p>}
              {state.status !== "error" && !state.registered && state.count === 0 && <p className="referral-empty">{c.notRegistered}</p>}
              {state.status !== "error" && state.registered && !loading && state.count === 0 && <p className="referral-empty">{c.empty}</p>}

              {state.status !== "error" && state.rows.length > 0 && (
                <div className="referral-list-wrap" tabIndex={0} role="region" aria-label={c.downlineTitle}>
                  {/* Column labels stay visible so the wrapped grid still reads as a data table. */}
                  <div className="referral-list-head" aria-hidden="true">
                    <span>{c.columnIndex}</span><span>{c.columnAddress}</span><span>{c.columnLevel}</span>
                  </div>
                  <ul className="referral-list">
                    {state.rows.map((row, index) => (
                      <li key={row.address} className="referral-record">
                        <span className="referral-record-index">{state.start + index}</span>
                        <AddressLink address={row.address} />
                        <LevelTag level={row.level} isRoot={row.isRoot} copy={c} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="referral-foot">
                <p className="referral-source">
                  <TreeStructure size={15} aria-hidden="true" />
                  <a href={`${BSCSCAN_ADDRESS_URL}${NODE_SALE_ADDRESS}`} target="_blank" rel="noreferrer">{c.contractLabel} · {formatWalletAddress(NODE_SALE_ADDRESS)} <Export size={13} /></a>
                </p>
                {state.count > 0 && (
                  <div className="referral-pager">
                    <button type="button" onClick={() => setPage(state.page - 1)} disabled={loading || state.page <= 1} aria-label={c.previous} title={c.previous}>
                      <ArrowLeft size={17} aria-hidden="true" />
                    </button>
                    <span>{formatCopy(c.pageSummary, { page: state.page, pages: state.pageCount, total: state.count })}</span>
                    <button type="button" onClick={() => setPage(state.page + 1)} disabled={loading || state.page >= state.pageCount} aria-label={c.next} title={c.next}>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
