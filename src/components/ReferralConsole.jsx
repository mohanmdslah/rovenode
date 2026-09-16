import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, Export, SpinnerGap, TreeStructure, UserFocus, Users, Wallet } from "@phosphor-icons/react";
import { formatCopy, useLocale } from "../i18n.jsx";
import { formatWalletAddress } from "../lib/wallet.js";
import { BSCSCAN_ADDRESS_URL, NODE_SALE_ADDRESS } from "../lib/network.js";
import { REFERRAL_PAGE_SIZE, describeNodeLevel, referralReader } from "../lib/referral.js";

const EMPTY = {
  status: "idle",
  registered: false,
  upline: { address: "", level: 0, isRoot: false },
  rows: [],
  count: 0,
  page: 1,
  pageCount: 1,
  start: 0,
  end: 0,
};

function AddressLink({ address }) {
  return (
    <a className="referral-address" href={`${BSCSCAN_ADDRESS_URL}${address}`} target="_blank" rel="noreferrer" title={address}>
      <span>{formatWalletAddress(address)}</span>
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

function Pager({ page, pageCount, total, onPage, disabled, copy }) {
  return (
    <div className="referral-pager">
      <button type="button" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label={copy.previous} title={copy.previous}>
        <ArrowLeft size={17} aria-hidden="true" />
      </button>
      <span>{formatCopy(copy.pageSummary, { page, pages: pageCount, total })}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={disabled || page >= pageCount} aria-label={copy.next} title={copy.next}>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Referral console: the connected wallet's upline plus its direct downlines,
 * read straight from NodeSale and paged 10 rows at a time.
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
  const showDownlineTable = state.rows.length > 0;

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
          <div className="referral-grid" data-reveal="item">
            <article className="referral-card referral-upline">
              <div className="referral-card-head">
                <h3><UserFocus size={18} weight="fill" aria-hidden="true" />{c.uplineTitle}</h3>
                <span className="referral-hint">{c.boundHint}</span>
              </div>
              {loading && state.status === "loading" && !upline.address && !state.rows.length
                ? <p className="referral-empty" role="status">{c.loading}</p>
                : upline.address
                  ? <div className="referral-upline-row">
                      <AddressLink address={upline.address} />
                      <LevelTag level={upline.level} isRoot={upline.isRoot} copy={c} />
                    </div>
                  : <p className="referral-empty">{c.uplineNone}</p>}
            </article>

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
              {state.status !== "error" && state.registered && !loading && !showDownlineTable && <p className="referral-empty">{c.empty}</p>}
              {state.status !== "error" && showDownlineTable && (
                <div className="dividend-table-scroll" tabIndex={0} role="region" aria-label={c.downlineTitle}>
                  <table className="dividend-table">
                    <thead><tr><th scope="col">{c.columnAddress}</th><th scope="col">{c.columnLevel}</th></tr></thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr key={row.address}>
                          <td className="record-id" data-label={c.columnAddress}><AddressLink address={row.address} /></td>
                          <td data-label={c.columnLevel}><LevelTag level={row.level} isRoot={row.isRoot} copy={c} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {state.count > 0 && (
                <Pager page={state.page} pageCount={state.pageCount} total={state.count} onPage={setPage} disabled={loading} copy={c} />
              )}
              {state.count > 0 && <p className="referral-range">{formatCopy(c.rangeSummary, { start: state.start, end: state.end })}</p>}
            </article>

            <p className="referral-source">
              <TreeStructure size={15} aria-hidden="true" />
              <a href={`${BSCSCAN_ADDRESS_URL}${NODE_SALE_ADDRESS}`} target="_blank" rel="noreferrer">{c.contractLabel} · {formatWalletAddress(NODE_SALE_ADDRESS)} <Export size={13} /></a>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
