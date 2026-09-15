import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, ChartBar, Export, HandCoins, X } from "@phosphor-icons/react";
import { api, formatRoundedWei } from "../lib/api.js";
import { useApiResource } from "../lib/use-api-resource.js";
import { BSCSCAN_TX_URL } from "../lib/network.js";
import { dividendCopy } from "../lib/dividend-copy.js";
import { WITHDRAWAL_PAGE_SIZE } from "../lib/withdrawal-history.js";

function date(value, locale) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : "—";
}
function amount(value, locale) {
  try { return `${formatRoundedWei(value, locale)} ROVE`; } catch { return "—"; }
}
function RecordDate({ value, locale }) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const parsed = new Date(time);
  return <time dateTime={parsed.toISOString()} className="record-date">{parsed.toLocaleDateString(locale)}<small>{parsed.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</small></time>;
}
function Pager({ page, onPage, next, disabled, copy }) {
  return <div className="dividend-pager"><button type="button" title={copy.previous} aria-label={copy.previous} onClick={() => onPage(page - 1)} disabled={page <= 1 || disabled}><ArrowLeft size={17} /></button><span>{copy.page} {page}</span><button type="button" title={copy.next} aria-label={copy.next} onClick={() => onPage(page + 1)} disabled={!next || disabled}><ArrowRight size={17} /></button></div>;
}
function Receipt({ hash, copy }) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash ?? "") ? <a href={`${BSCSCAN_TX_URL}${hash}`} target="_blank" rel="noreferrer" title={hash}>{copy.receipt}<Export size={14} aria-hidden="true" /></a> : null;
}

const HIDDEN_RECORD_FIELDS = new Set(["signature", "token", "withdrawnAmount", "refundedAmount"]);

function RecordDetailsDialog({ record, copy, columnLabel, cell, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (record && !element.open) element.showModal();
    if (!record && element.open) element.close();
  }, [record]);
  return <dialog ref={dialog} className="record-details-dialog" aria-labelledby="dividend-details-title" onCancel={onClose} onClose={onClose}>
    <div className="record-dialog-heading"><h3 id="dividend-details-title">{copy.details}</h3><button type="button" onClick={onClose} title={copy.close} aria-label={copy.close} autoFocus><X size={20} aria-hidden="true" /></button></div>
    <dl>{record && Object.entries(record).filter(([key]) => !HIDDEN_RECORD_FIELDS.has(key)).map(([key, value]) => <div key={key}><dt>{columnLabel(key)}</dt><dd>{cell(key, value)}</dd></div>)}</dl>
  </dialog>;
}

export function DividendHistory({ account, token, locale, orders, refreshKey, onRefresh, onUnauthorized, onResume, busy }) {
  const copy = dividendCopy[locale];
  const [historyPage, setHistoryPage] = useState(1);
  const [activeTab, setActiveTab] = useState("withdrawals");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const session = `${account}:${token}`;
  useEffect(() => { setHistoryPage(1); }, [session]);
  const load = useCallback((signal) => api.dividendHistory(token, historyPage, signal, 5), [token, historyPage]);
  const authError = useCallback((error) => { if (error.status === 401) onUnauthorized(token); }, [onUnauthorized, token]);
  const history = useApiResource(load, Boolean(account && token), refreshKey, authError);
  const rows = history.data?.rows ?? [];
  const allColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !HIDDEN_RECORD_FIELDS.has(key));
  const primaryKeys = ["settlementDate", "settlementDay", "settlementAt", "day", "date", "createdAt", "amount", "rewardAmount", "dividendAmount", "availableAmount", "status"];
  const columns = primaryKeys.filter((key) => allColumns.includes(key));
  const detailColumns = allColumns.filter((key) => !columns.includes(key));
  const columnLabel = (key) => copy[key] ?? ({ settlementDay: copy.settlementDate, settlementAt: copy.settlementDate, day: copy.date, rewardAmount: copy.amount, dividendAmount: copy.amount }[key]) ?? key;
  const cell = (key, value) => {
    if (value == null) return "—";
    if (/amount/i.test(key)) return amount(value, locale);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return date(value, locale);
    if (key === "status") return copy[value] ?? value;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  };
  const renderWithdrawals = () => !token ? <p className="node-empty-history">{copy.login}</p> : <>
        {orders.storageWarning && <p className="order-message" role="status">{copy.storageWarning}</p>}
        {orders.status !== "ready" ? <p className="node-empty-history" role="status">{orders.status === "error" ? copy.loadError : copy.loading}</p> : !orders.data.rows.length ? <p className="node-empty-history">{copy.noWithdrawals}</p> : <div className="dividend-table-scroll" tabIndex={0} role="region" aria-label={copy.orders}><table className="dividend-table withdrawal-table"><thead><tr>{["orderId", "amount", "status", "createdAt", "deadline"].map((key) => <th scope="col" key={key}>{copy[key]}</th>)}<th scope="col">{copy.receipt}</th></tr></thead><tbody>{orders.data.rows.map((row) => {
          const expired = Date.parse(row.deadline) <= Date.now();
          const resume = !row.loadError && row.status === "PENDING" && !row.hash && !expired;
          return <tr key={row.orderId}><td className="record-id" data-label={copy.orderId}>{row.orderId}</td><td className="record-amount" data-label={copy.amount}>{amount(row.amount, locale)}</td><td data-label={copy.status}><span className={`record-status status-${row.loadError ? "FAILED" : row.status}`}><i aria-hidden="true" />{row.loadError ? copy.loadError : row.status === "PENDING" && row.hash ? copy.SUBMITTED : copy[row.status] ?? row.status}</span>{row.status === "PENDING" && expired && <small>{copy.expired}</small>}{resume && <button className="order-resume" type="button" onClick={() => onResume(row)} disabled={busy}><ArrowRight size={15} aria-hidden="true" />{copy.resume}</button>}</td><td data-label={copy.createdAt}><RecordDate value={row.createdAt} locale={locale} />{row.claimedAt && <small>{copy.claimedAt}: {date(row.claimedAt, locale)}</small>}</td><td data-label={copy.deadline}><RecordDate value={row.deadline} locale={locale} /></td><td data-label={copy.receipt}><Receipt hash={row.claimedTxHash || row.hash} copy={copy} />{!row.claimedTxHash && !row.hash && "—"}</td></tr>;
        })}</tbody></table></div>}
        <Pager page={orders.data?.page ?? orders.page} onPage={orders.setPage} next={orders.data?.total == null ? (orders.data?.rows.length ?? 0) >= WITHDRAWAL_PAGE_SIZE : orders.data.page * orders.data.pageSize < orders.data.total} disabled={orders.status !== "ready"} copy={copy} />
      </>;
  const renderDividends = () => !token ? <p className="node-empty-history">{copy.login}</p> : history.status !== "ready" ? <p className="node-empty-history" role="status">{history.status === "error" ? copy.loadError : copy.loading}</p> : !rows.length ? <p className="node-empty-history">{copy.emptyHistory}</p> : <div className="dividend-table-scroll" tabIndex={0} role="region" aria-label={copy.history}><table className="dividend-table"><thead><tr>{columns.map((key) => <th scope="col" key={key}>{columnLabel(key)}</th>)}{detailColumns.length > 0 && <th scope="col">{copy.details}</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map((key) => <td key={key} data-label={columnLabel(key)} className={/amount/i.test(key) ? "record-amount" : undefined}>{cell(key, row[key])}</td>)}{detailColumns.length > 0 && <td className="record-details-cell" data-label={copy.details}><button type="button" className="record-details-trigger" aria-haspopup="dialog" onClick={() => setSelectedRecord({ row, session, page: historyPage })}>{copy.details}<ArrowRight size={14} aria-hidden="true" /></button></td>}</tr>)}</tbody></table></div>;
  return <>
    <section className="node-center-history fee-history fee-history-unified" aria-labelledby="fee-history-heading">
      <div className="history-heading"><h3 id="fee-history-heading"><HandCoins size={19} weight="fill" aria-hidden="true" />{copy.history}</h3><button className="node-refresh" type="button" onClick={onRefresh} title={copy.refresh} aria-label={copy.refresh}><ArrowClockwise size={17} aria-hidden="true" /></button></div>
      <div className="history-tabs" role="tablist" aria-label={copy.history}>
        <button type="button" role="tab" aria-selected={activeTab === "withdrawals"} aria-controls="fee-withdrawals-panel" className={activeTab === "withdrawals" ? "is-active" : ""} onClick={() => setActiveTab("withdrawals")}><HandCoins size={15} aria-hidden="true" />{copy.orders}</button>
        <button type="button" role="tab" aria-selected={activeTab === "dividends"} aria-controls="fee-dividends-panel" className={activeTab === "dividends" ? "is-active" : ""} onClick={() => setActiveTab("dividends")}><ChartBar size={15} aria-hidden="true" />{copy.history}</button>
      </div>
      <div id={activeTab === "withdrawals" ? "fee-withdrawals-panel" : "fee-dividends-panel"} role="tabpanel" aria-labelledby="fee-history-heading" className="history-panel">{activeTab === "withdrawals" ? renderWithdrawals() : renderDividends()}</div>
    </section>
    <RecordDetailsDialog record={selectedRecord?.session === session && selectedRecord.page === historyPage ? selectedRecord.row : null} copy={copy} columnLabel={columnLabel} cell={cell} onClose={() => setSelectedRecord(null)} />
  </>;
}
