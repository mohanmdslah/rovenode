import { ArrowUp, Circle } from "@phosphor-icons/react";
import { useLocale } from "../i18n.jsx";

function goTop() {
  document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
}

export function RoadmapFooter() {
  const { copy } = useLocale();
  const footerAnchors = ["engine", "tokenomics", "genesis", "node"];

  return (
    <>
      <section className="roadmap-section" id="roadmap">
        <div className="roadmap-media" aria-hidden="true"><img src="/assets/rove-ip-03-rider.webp" alt="" width="1014" height="1014" loading="lazy" decoding="async" /></div>
        <div className="roadmap-shade" />
        <div className="section-shell">
          <div className="section-heading split-heading" data-reveal="item">
            <div><p className="section-kicker">{copy.roadmapKicker}</p><h2>{copy.roadmapTitle}</h2></div>
            <p>ROVE / CAPITAL WITHOUT BOUNDARIES / 2026</p>
          </div>
          <div className="roadmap-list" data-reveal="stagger">
            {copy.roadmap.map(([title, body], index) => (
              <article className={index === 0 ? "is-active" : ""} key={title}>
                <Circle size={16} weight={index === 0 ? "fill" : "regular"} />
                <div><h3>{title}</h3><p>{body}</p></div>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main" data-reveal="item">
          <div className="footer-brand">
            <img src="/assets/rove-logo.webp" alt="ROVE" width="84" height="84" />
            <div><strong>ROVE</strong><span>CAPITAL WITHOUT BOUNDARIES</span><p>{copy.footerBody}</p></div>
          </div>
          <nav aria-label="Footer navigation">
            {copy.footerNav.map((item, index) => <a href={`#${footerAnchors[index]}`} key={item}>{item}</a>)}
          </nav>
        </div>
        <div className="footer-bottom">
          <span>{copy.rights}</span><span>BNB CHAIN · ON-CHAIN FINANCE · UNOFFICIAL</span>
          <button type="button" onClick={goTop} aria-label="Back to top"><ArrowUp size={19} weight="bold" /></button>
        </div>
      </footer>
    </>
  );
}
