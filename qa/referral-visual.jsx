/**
 * Renders only the referral console so its layout can be inspected and
 * screenshotted without the rest of the page.
 */
import "../src/lib/polyfills.js";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../src/i18n.jsx";
import { ReferralConsole } from "../src/components/ReferralConsole.jsx";
import "../src/styles.css";
import { installMockNodeSale } from "./mock-node-sale.js";

const params = new URLSearchParams(window.location.search);
const mock = installMockNodeSale({
  bound: params.get("bound") !== "0",
  downlineCount: Number(params.get("downlines") ?? 23),
});

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <div className="app-shell is-ready">
      <main className="page-main">
        <ReferralConsole
          walletAddress={mock.account}
          walletBusy={false}
          onConnect={() => {}}
          provider={mock.provider}
          refreshKey={0}
        />
      </main>
    </div>
  </LocaleProvider>,
);
