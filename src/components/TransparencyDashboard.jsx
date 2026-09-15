import { useState } from "react";
import { ChartLineUp, Database, ShieldCheck, StarFour } from "@phosphor-icons/react";
import { useLocale } from "../i18n.jsx";

const icons = [Database, ChartLineUp, StarFour];

export function TransparencyDashboard() {
  const { copy } = useLocale();
  const [tab, setTab] = useState(0);
  const columns = copy.dashboardColumns[tab];
  const rows = copy.dashboardRows[tab];

  const moveTabFocus = (event, index) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const nextTab = (index + direction + copy.dashboardTabs.length) % copy.dashboardTabs.length;
    setTab(nextTab);
    event.currentTarget.parentElement?.querySelector(`#dashboard-tab-${nextTab}`)?.focus();
  };

  return (
    <section className="dashboard-section section-shell" id="dashboard">
      <div className="section-heading split-heading" data-reveal="item">
        <div><p className="section-kicker">{copy.dashboardKicker}</p><h2>{copy.dashboardTitle}</h2></div>
        <p>{copy.dashboardBody}</p>
      </div>
      <div className="dashboard-frame" data-reveal="item">
        <div className="dashboard-topline"><span><i />ROVE CONTROL ROOM</span><strong><ShieldCheck size={16} weight="fill" />{copy.plannedData}</strong></div>
        <div className="dashboard-tabs" role="tablist" aria-label={copy.dashboardTitle}>
          {copy.dashboardTabs.map((label, index) => {
            const Icon = icons[index];
            return (
              <button id={`dashboard-tab-${index}`} key={label} type="button" role="tab" aria-selected={tab === index} aria-controls="dashboard-panel" tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={(event) => moveTabFocus(event, index)}>
                <Icon size={18} weight={tab === index ? "fill" : "regular"} />{label}<span>0{index + 1}</span>
              </button>
            );
          })}
        </div>
        <div className="dashboard-table-wrap" id="dashboard-panel" role="tabpanel" aria-labelledby={`dashboard-tab-${tab}`}>
          <table className="dashboard-table">
            <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${tab}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td data-label={columns[cellIndex]} key={cellIndex}>{cellIndex === 3 && <span className="status-dot" />}{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
