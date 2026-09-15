import { ArrowRight, Atom, Circuitry, GlobeHemisphereWest, RocketLaunch, Shapes } from "@phosphor-icons/react";
import { useLocale } from "../i18n.jsx";

const pillarIcons = [RocketLaunch, GlobeHemisphereWest, Circuitry, Atom, Shapes];

export function SpaceStory() {
  const { copy } = useLocale();

  return (
    <section className="story-section section-shell" id="story">
      <div className="story-layout">
        <figure className="story-visual" data-reveal="item">
          <img src="/assets/rove-ip-04-summit.webp" alt="ROVE eagle overlooking the capital network at sunrise" width="1014" height="1014" loading="lazy" decoding="async" />
          <figcaption><span>01</span> OBSERVE · ALLOCATE · COMPOUND</figcaption>
        </figure>
        <div className="story-copy" data-reveal="item">
          <p className="section-kicker">{copy.storyKicker}</p>
          <h2>{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
          <blockquote>{copy.storyQuote}</blockquote>
          <div className="pillar-list" data-reveal="stagger">
            {copy.pillars.map((pillar, index) => {
              const Icon = pillarIcons[index];
              return <span key={pillar}><Icon size={18} weight="fill" />{pillar}<ArrowRight size={14} /></span>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
