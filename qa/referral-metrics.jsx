/**
 * Reports the geometry of the referral console so the layout can be reasoned
 * about numerically (this environment cannot view screenshots).
 */
import "../src/lib/polyfills.js";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../src/i18n.jsx";
import { ReferralConsole } from "../src/components/ReferralConsole.jsx";
import "../src/styles.css";
import { installMockNodeSale } from "./mock-node-sale.js";

const params = new URLSearchParams(window.location.search);
const mock = installMockNodeSale({ bound: params.get("bound") !== "0", downlineCount: Number(params.get("downlines") ?? 23) });
createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <div className="app-shell is-ready">
      <main className="page-main">
        <ReferralConsole walletAddress={mock.account} walletBusy={false} onConnect={() => {}} provider={mock.provider} refreshKey={0} />
      </main>
    </div>
  </LocaleProvider>,
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value);
const box = (element) => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: round(rect.left), width: round(rect.width), right: round(rect.right), height: round(rect.height) };
};
const gapFrom = (outer, inner) => (outer && inner ? round(outer.getBoundingClientRect().right - inner.getBoundingClientRect().right) : null);

async function main() {
  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (document.querySelector(".referral-record")) break;
    await wait(100);
  }
  const section = document.querySelector(".referral-section");
  const cells = [...section.querySelectorAll(".referral-metric")];
  const records = [...section.querySelectorAll(".referral-record")];
  const columns = [...(records[0]?.children ?? [])];
  const report = {
    viewport: window.innerWidth,
    shell: box(section.querySelector(".section-shell")),
    metrics: box(section.querySelector(".referral-metrics")),
    metricCells: cells.map((cell) => ({
      label: cell.querySelector(".referral-metric-label")?.textContent,
      width: round(cell.getBoundingClientRect().width),
      trailingGap: gapFrom(cell, cell.querySelector(".referral-metric-value")),
    })),
    list: box(section.querySelector(".referral-list")),
    listColumns: (() => {
      const list = section.querySelector(".referral-list");
      return list ? getComputedStyle(list).gridTemplateColumns : null;
    })(),
    recordWidth: records[0] ? round(records[0].getBoundingClientRect().width) : null,
    columnWidths: columns.map((cell) => round(cell.getBoundingClientRect().width)),
    levelBadgeWidth: (() => {
      const badge = section.querySelector(".referral-record .referral-level");
      return badge ? round(badge.getBoundingClientRect().width) : null;
    })(),
    addressLinkWidth: (() => {
      const link = section.querySelector(".referral-record .referral-address");
      return link ? round(link.getBoundingClientRect().width) : null;
    })(),
    recordTrailingGap: gapFrom(records[0], records[0]?.querySelector(".referral-level")),
    recordCount: records.length,
    strayGutter: (() => {
      // A lone record in the final row must not draw a divider beside an empty cell.
      const last = records[records.length - 1];
      if (!last) return null;
      return getComputedStyle(last).borderRightWidth;
    })(),
    lastRowCount: records.length % 2 === 0 ? 2 : 1,
    recordHeight: records[0] ? round(records[0].getBoundingClientRect().height) : null,
    addressLines: (() => {
      const visible = [...(records[0]?.querySelectorAll(".referral-address span") ?? [])].find((span) => span.offsetParent !== null);
      if (!visible) return null;
      const style = getComputedStyle(visible);
      const lineHeight = parseFloat(style.lineHeight) || 16;
      return Math.round(visible.getBoundingClientRect().height / lineHeight);
    })(),
    addressBox: (() => {
      const visible = [...(records[0]?.querySelectorAll(".referral-address span") ?? [])].find((span) => span.offsetParent !== null);
      return visible ? { client: visible.clientWidth, scroll: visible.scrollWidth, truncated: visible.scrollWidth > visible.clientWidth + 1 } : null;
    })(),
    addressTrailingGap: gapFrom(records[0]?.querySelector(".referral-address"), records[0]?.querySelector(".referral-address span")),
    foot: box(section.querySelector(".referral-foot")),
    pager: box(section.querySelector(".referral-pager")),
  };
  document.getElementById("qa-result").textContent = JSON.stringify(report, null, 1);
}

main().catch((error) => {
  document.getElementById("qa-result").textContent = JSON.stringify({ error: String(error?.stack ?? error) }, null, 1);
});
