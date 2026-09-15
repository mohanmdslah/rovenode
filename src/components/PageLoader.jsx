import { useEffect, useState } from "react";

const MINIMUM_DISPLAY_MS = 700;
const MAXIMUM_WAIT_MS = 2200;

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function decodeCriticalImages() {
  return ["/assets/rove-logo.webp", "/assets/rove-hero.webp"].map((src) => {
    const image = new Image();
    image.src = src;
    if (typeof image.decode === "function") return image.decode();
    return new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; });
  });
}

export function PageLoader({ onReady, onComplete }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let active = true;
    let exitTimer;
    const fontReady = document.fonts?.ready ?? Promise.resolve();
    const resourcesReady = Promise.allSettled([fontReady, ...decodeCriticalImages()]);
    const guardedReady = Promise.race([resourcesReady, wait(MAXIMUM_WAIT_MS)]);

    Promise.all([guardedReady, wait(MINIMUM_DISPLAY_MS)]).then(() => {
      if (!active) return;
      setLeaving(true);
      onReady();
      exitTimer = window.setTimeout(onComplete, 480);
    });

    return () => { active = false; window.clearTimeout(exitTimer); };
  }, [onComplete, onReady]);

  return (
    <div className={`page-loader ${leaving ? "is-leaving" : ""}`} role="status" aria-live="polite" aria-label="ROVE loading">
      <div className="loader-center">
        <img src="/assets/rove-logo.webp" alt="" width="132" height="132" />
        <strong>ROVE</strong><span>CAPITAL WITHOUT BOUNDARIES</span>
        <div className="loader-track" aria-hidden="true"><i /></div>
        <div className="loader-meta"><span>BOOTING DEFLATION ENGINE</span><b>BSC / 56</b></div>
      </div>
    </div>
  );
}
