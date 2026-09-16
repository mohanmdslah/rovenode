import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, List, RocketLaunch, SignOut, Wallet, X } from "@phosphor-icons/react";
import { useLocale } from "./i18n.jsx";
import { SpaceStory } from "./components/SpaceStory.jsx";
import { EconomySections } from "./components/EconomySections.jsx";
import { TransparencyDashboard } from "./components/TransparencyDashboard.jsx";
import { GenesisProgram } from "./components/GenesisProgram.jsx";
import { NodeProgram } from "./components/NodeProgram.jsx";
import { ReferralConsole } from "./components/ReferralConsole.jsx";
import { RoadmapFooter } from "./components/RoadmapFooter.jsx";
import { LocaleMenu } from "./components/LocaleMenu.jsx";
import { PageLoader } from "./components/PageLoader.jsx";
import { ParticleField } from "./components/ParticleField.jsx";
import { getHeroParallax } from "./lib/hero-motion.js";
import { discoverInjectedWallet, formatWalletAddress, watchInjectedWallet } from "./lib/wallet.js";
import { createWalletSession } from "./lib/wallet-session.js";

const anchors = ["story", "engine", "dashboard", "genesis", "node", "network", "roadmap"];

function scrollTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="ROVE home">
      <img src="/assets/rove-logo.webp" alt="" width="46" height="46" />
      <span><strong>ROVE</strong><small>CAPITAL WITHOUT BOUNDARIES</small></span>
    </a>
  );
}

function Header({ walletAddress, walletBusy, onConnect, onDisconnect }) {
  const { copy, locale } = useLocale();
  const auth = { login: copy.connect, signing: copy.connecting };
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const navigate = (id) => {
    setMenuOpen(false);
    scrollTo(id);
  };

  return (
    <header className="site-header">
      <Brand />
      <nav className="desktop-nav" aria-label="Primary navigation">
        {copy.nav.map((item, index) => (
          <button key={anchors[index]} type="button" onClick={() => navigate(anchors[index])}>{item}</button>
        ))}
      </nav>
      <div className="header-actions">
        <LocaleMenu />
        {walletAddress ? (
          <div className="wallet-connected-group">
            <span className="wallet-address" aria-label={`${copy.connected}: ${walletAddress}`} title={walletAddress}>
              <Wallet size={17} weight="fill" aria-hidden="true" /><span>{formatWalletAddress(walletAddress)}</span>
            </span>
            <button className="disconnect-wallet-button" type="button" onClick={onDisconnect} disabled={walletBusy} aria-label={copy.disconnect} title={copy.disconnect}>
              <SignOut size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button className="wallet-button" type="button" onClick={onConnect} disabled={walletBusy} aria-busy={walletBusy} aria-label={walletBusy ? auth.signing : auth.login} title={walletBusy ? auth.signing : auth.login}>
            <Wallet size={18} weight="fill" aria-hidden="true" /><span>{walletBusy ? auth.signing : auth.login}</span>
          </button>
        )}
        <button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <X size={22} /> : <List size={22} />}
        </button>
      </div>
      {menuOpen && (
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">
          {copy.nav.map((item, index) => (
            <button key={anchors[index]} type="button" onClick={() => navigate(anchors[index])}>
              <span>0{index + 1}</span>{item}<ArrowRight size={18} />
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

function Hero({ particlesActive }) {
  const { copy } = useLocale();
  const heroRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    const hero = heroRef.current;
    const media = mediaRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const saveData = Boolean(navigator.connection?.saveData);
    if (!hero || !media || reducedMotion || !finePointer || saveData) return undefined;

    let frame = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    const render = () => {
      frame = 0;
      const shift = getHeroParallax(pointerX, pointerY, window.innerWidth, window.innerHeight);
      media.style.transform = `translate3d(${shift.x}px, ${shift.y}px, 0) scale(1.025)`;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(render); };
    const handlePointerMove = (event) => { pointerX = event.clientX; pointerY = event.clientY; schedule(); };
    const resetPosition = () => { pointerX = window.innerWidth / 2; pointerY = window.innerHeight / 2; schedule(); };
    hero.addEventListener("pointermove", handlePointerMove, { passive: true });
    hero.addEventListener("pointerleave", resetPosition, { passive: true });
    return () => {
      hero.removeEventListener("pointermove", handlePointerMove);
      hero.removeEventListener("pointerleave", resetPosition);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="hero" id="top" ref={heroRef}>
      <div className="hero-media-frame" aria-hidden="true">
        <img ref={mediaRef} className="hero-media" src="/assets/rove-hero.webp" alt="" width="1277" height="1280" decoding="async" fetchPriority="high" />
      </div>
      <div className="hero-shade" />
      <ParticleField active={particlesActive} />
      <div className="hero-content">
        <div className="hero-copy">
          <p className="eyebrow"><span />{copy.eyebrow}</p>
          <h1>{copy.heroTitle}</h1>
          <p className="hero-lead">{copy.heroLead}</p>
          <p className="hero-body">{copy.heroBody}</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => scrollTo("engine")}>{copy.exploreEngine}<ArrowDownRight size={20} weight="bold" /></button>
            <button className="text-button" type="button" onClick={() => scrollTo("genesis")}>{copy.viewGenesis}<ArrowRight size={18} /></button>
          </div>
        </div>
        <div className="hero-meta">
          <p className="network-live"><span />{copy.live}</p>
          <div className="hero-stats">
            {copy.heroStats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
          </div>
        </div>
      </div>
      <button className="scroll-cue" type="button" onClick={() => scrollTo("story")} aria-label={copy.nav[0]}><span>DESCEND</span><ArrowDownRight size={20} /></button>
    </section>
  );
}

function SideRail() {
  return (
    <aside className="side-rail" aria-hidden="true">
      <div className="rail-mark"><RocketLaunch size={30} weight="fill" /></div>
      <p>CAPITAL WITHOUT BOUNDARIES</p>
          <div className="rail-index"><span>MAINNET</span><strong>56</strong></div>
    </aside>
  );
}

export function App() {
  const { copy, locale } = useLocale();
  const [session, setSession] = useState({ account: "", token: "", busy: false, error: "" });
  const walletSession = useRef(null);
  const [walletProvider, setWalletProvider] = useState(null);
  const [walletIssue, setWalletIssue] = useState("");
  // Bumped when a binding lands so the referral console re-reads the chain.
  const [referralVersion, setReferralVersion] = useState(0);
  const walletAddress = session.account;
  const walletBusy = session.busy;
  const issueKey = walletIssue || session.error;
  const toast = {
    wrongChain: copy.wrongChain,
    chainNotConfigured: copy.walletChainMissing,
    rejected: copy.walletRejected,
    timeout: copy.walletTimeout,
    missing: copy.walletMissing,
    noAccount: copy.walletNoAccount,
    loginFailed: copy.walletError,
    accountChanged: copy.walletError,
    insecure: copy.walletInsecure,
  }[issueKey] ?? "";
  const [pageReady, setPageReady] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);

  useEffect(() => {
    document.body.classList.toggle("is-booting", loaderVisible);
    return () => document.body.classList.remove("is-booting");
  }, [loaderVisible]);

  useEffect(() => {
    if (!pageReady) return undefined;
    document.documentElement.classList.add("motion-reveals");
    const elements = [...document.querySelectorAll("[data-reveal]")];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
    const hashTarget = document.getElementById(window.location.hash.slice(1));
    hashTarget?.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
    return () => observer.disconnect();
  }, [pageReady]);

  const attachWalletProvider = useCallback((provider) => {
    setWalletProvider(provider);
    walletSession.current?.dispose();
    const manager = createWalletSession({ provider, onChange: setSession });
    walletSession.current = manager;
    setWalletIssue("");
    void manager.connect(false);
  }, []);

  useEffect(() => {
    // Wallets inject late inside Huawei WebViews and wallet in-app browsers, so
    // keep watching for the rest of the page life instead of probing once.
    const stop = watchInjectedWallet({ onProvider: attachWalletProvider });
    return () => {
      stop?.();
      walletSession.current?.dispose();
      walletSession.current = null;
    };
  }, [attachWalletProvider]);

  const connectWallet = useCallback(async () => {
    setWalletIssue("");
    const manager = walletSession.current;
    if (manager) {
      await manager.connect();
      return;
    }
    // No wallet is known yet: give a slow WebView one more chance before we
    // report the real reason, so tapping connect is never a silent no-op.
    const provider = await discoverInjectedWallet({ timeoutMs: 2500 });
    if (!provider) {
      setWalletIssue(window.isSecureContext === false ? "insecure" : "missing");
      return;
    }
    attachWalletProvider(provider);
    await walletSession.current?.connect();
  }, [attachWalletProvider]);

  const disconnectWallet = useCallback(() => { void walletSession.current?.disconnect(); }, []);
  const expireSession = useCallback((token) => walletSession.current?.expire(token), []);

  const finishPageLoad = useCallback(() => setPageReady(true), []);
  const hidePageLoader = useCallback(() => setLoaderVisible(false), []);

  return (
    <>
      {loaderVisible && <PageLoader onReady={finishPageLoad} onComplete={hidePageLoader} />}
      <div className={`app-shell ${pageReady ? "is-ready" : "is-loading"}`} aria-hidden={!pageReady} inert={!pageReady ? true : undefined}>
        <Header walletAddress={walletAddress} walletBusy={walletBusy} onConnect={connectWallet} onDisconnect={disconnectWallet} />
        <Hero particlesActive={pageReady} />
        <main className="page-main">
          <NodeProgram
            walletAddress={walletAddress}
            walletBusy={walletBusy}
            onConnect={connectWallet}
            provider={walletProvider}
            onReferralChange={() => setReferralVersion((version) => version + 1)}
          />
          <ReferralConsole
            walletAddress={walletAddress}
            walletBusy={walletBusy}
            onConnect={connectWallet}
            provider={walletProvider}
            refreshKey={referralVersion}
          />
          <SpaceStory />
          <EconomySections />
          <TransparencyDashboard />
          <GenesisProgram />
          <RoadmapFooter />
        </main>
        <SideRail />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </>
  );
}
