import { ArrowDown, ChartDonut, Coins, DropHalf, Recycle, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { useLocale } from "../i18n.jsx";

const flowIcons = [Coins, ChartDonut, DropHalf, ShieldCheck];
const vaultIcons = [Coins, DropHalf, UsersThree, Recycle];
const allocationValues = [70, 8, 7, 5, 4, 3, 3];
const allocationColors = ["#e8b949", "#d94d38", "#83b8cc", "#f0eee7", "#8b7a58", "#a9a39a", "#675c49"];

export function EconomySections() {
  const { copy } = useLocale();

  return (
    <>
      <section className="engine-section" id="engine">
        <div className="section-shell">
          <div className="section-heading split-heading" data-reveal="item">
            <div><p className="section-kicker">{copy.engineKicker}</p><h2>{copy.engineTitle}</h2></div>
            <p>{copy.engineBody}</p>
          </div>

          <div className="engine-stage" data-reveal="item">
            <img src="/assets/rove-ip-05-arena.webp" alt="ROVE deflation engine artwork: the eagle trading blows with sell pressure" width="1014" height="1014" loading="lazy" decoding="async" />
            <div className="engine-flow" data-reveal="stagger">
              {copy.engineFlow.map(([title, body], index) => {
                const Icon = flowIcons[index];
                return (
                  <article key={title}>
                    <span>0{index + 1}</span><Icon size={26} weight="fill" />
                    <h3>{title}</h3><p>{body}</p>
                    {index < 3 && <ArrowDown className="flow-arrow" size={18} weight="bold" />}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="vault-header" data-reveal="item"><h3>{copy.vaultTitle}</h3><span>BURN ROUTING · TARGET MODEL</span></div>
          <div className="vault-grid" data-reveal="stagger">
            {copy.vaults.map(([title, body, rate], index) => {
              const Icon = vaultIcons[index];
              return <article key={title}><Icon size={28} weight="fill" /><strong>{rate}</strong><h3>{title}</h3><p>{body}</p></article>;
            })}
          </div>
          <p className="verification-note" data-reveal="item"><ShieldCheck size={18} weight="fill" />{copy.treasuryNote}</p>
        </div>
      </section>

      <section className="token-section" id="tokenomics">
        <div className="section-shell token-layout">
          <div className="token-copy" data-reveal="item">
            <p className="section-kicker">{copy.tokenKicker}</p>
            <h2>{copy.tokenTitle}</h2>
            <p>{copy.tokenBody}</p>
            <div className="supply-total"><span>TOTAL SUPPLY</span><strong>210,000,000 <small>ROVE</small></strong></div>
            <div className="deflation-panel">
              <div><span>DEFLATION FLOOR</span><h3>{copy.deflationTitle}</h3><p>{copy.deflationBody}</p></div>
              <div className="deflation-facts">
                {copy.deflationFacts.map(([value, label]) => <span key={label}><strong>{value}</strong><small>{label}</small></span>)}
              </div>
            </div>
          </div>
          <div className="allocation-panel" data-reveal="item">
            <div className="allocation-orbit" aria-label="ROVE token allocation">
              <span>70%<small>MARKET</small></span>
            </div>
            <div className="allocation-list">
              {allocationValues.map((value, index) => (
                <div key={copy.allocations[index]}>
                  <span><i style={{ backgroundColor: allocationColors[index] }} />{copy.allocations[index]}</span>
                  <strong>{value}%</strong>
                </div>
              ))}
            </div>
            <div className="allocation-track" aria-hidden="true">
              {allocationValues.map((value, index) => <span key={`${value}-${index}`} style={{ width: `${value}%`, backgroundColor: allocationColors[index] }} />)}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
