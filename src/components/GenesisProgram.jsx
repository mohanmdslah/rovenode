import { ArrowRight, CalendarDots, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { useLocale } from "../i18n.jsx";

export function GenesisProgram() {
  const { copy } = useLocale();
  const goToParticipation = () => document.getElementById("node")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="genesis-section" id="genesis">
      <div className="section-shell">
        <div className="genesis-layout">
          <div className="genesis-copy" data-reveal="item">
            <p className="section-kicker">{copy.genesisKicker}</p>
            <h2>{copy.genesisTitle}</h2>
            <p>{copy.genesisBody}</p>
            <div className="genesis-facts" data-reveal="stagger">
              {copy.genesisFacts.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
            </div>
            <button className="primary-button" type="button" onClick={goToParticipation}>{copy.genesisAction}<ArrowRight size={18} weight="bold" /></button>
          </div>
          <figure className="genesis-visual" data-reveal="item">
            <img src="/assets/rove-ip-06-emblem.webp" alt="ROVE founding consensus officer on the emblem stage" width="1014" height="1014" loading="lazy" decoding="async" />
            <figcaption><span>GENESIS OPEN</span><strong>FOUNDING CONSENSUS OFFICER</strong></figcaption>
          </figure>
        </div>

        <div className="vesting-panel" data-reveal="item">
          <div className="vesting-copy"><CalendarDots size={28} weight="fill" /><div><h3>{copy.vestingTitle}</h3><p>{copy.vestingBody}</p></div></div>
          <div className="vesting-track" aria-label={copy.vestingTitle}>
            {copy.releaseStages.map(([trigger, label, allocation], index) => <div key={trigger}><span>{index + 1}</span><strong>{trigger}</strong><small>{allocation} · {label}</small></div>)}
          </div>
          <p><LockKey size={17} weight="fill" /><ShieldCheck size={17} weight="fill" />PUBLIC ISSUANCE CONTRACT · ON-CHAIN DISCLOSURE · LEGAL REVIEW REQUIRED</p>
        </div>
      </div>
    </section>
  );
}
