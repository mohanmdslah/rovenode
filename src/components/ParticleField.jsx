import { useEffect, useRef } from "react";
import { getParticleCount, getParticleOpacity } from "../lib/particles.js";

const COLORS = [
  [232, 185, 73],
  [217, 77, 56],
  [131, 184, 204],
  [255, 255, 255],
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createParticles(count, width, height) {
  return Array.from({ length: count }, () => ({
    x: randomBetween(0, width),
    y: randomBetween(height * 0.75, height + 160),
    size: randomBetween(1, 2.4),
    length: randomBetween(1.2, 3.4),
    speed: randomBetween(18, 42),
    drift: randomBetween(-5, 5),
    alpha: randomBetween(0.28, 0.72),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
}

function createParticleCanvas(canvas) {
  const hero = canvas.closest(".hero");
  const context = canvas.getContext("2d", { alpha: true });
  if (!hero || !context) return () => {};

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(navigator.connection?.saveData);
  let width = 0;
  let height = 0;
  let particles = [];
  let animationFrame = 0;
  let running = false;
  let visible = !document.hidden;
  let inViewport = true;

  const draw = (timestamp) => {
    if (!running) {
      animationFrame = 0;
      return;
    }

    const delta = Math.min((timestamp - (draw.lastTime || timestamp)) / 1000, 0.05);
    draw.lastTime = timestamp;
    context.clearRect(0, 0, width, height);

    particles.forEach((particle) => {
      particle.y -= particle.speed * delta;
      particle.x += particle.drift * delta;
      if (particle.y < -12) {
        particle.y = randomBetween(height + 16, height + 160);
        particle.x = randomBetween(0, width);
      }
      if (particle.x < -8) particle.x = width + 8;
      if (particle.x > width + 8) particle.x = -8;

      const opacity = getParticleOpacity(particle.y, height) * particle.alpha;
      if (opacity <= 0) return;
      context.fillStyle = `rgba(${particle.color.join(",")},${opacity.toFixed(3)})`;
      context.fillRect(particle.x, particle.y, particle.size, particle.size * particle.length);
    });

    animationFrame = window.requestAnimationFrame(draw);
  };

  const setRunning = () => {
    const shouldRun = !reducedMotion && !saveData && visible && inViewport && particles.length > 0;
    if (shouldRun && !running) {
      running = true;
      draw.lastTime = 0;
      animationFrame = window.requestAnimationFrame(draw);
      return;
    }
    if (!shouldRun && running) {
      running = false;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      context.clearRect(0, 0, width, height);
    }
  };

  const resize = (entry) => {
    width = Math.max(1, entry.contentRect.width);
    height = Math.max(1, entry.contentRect.height);
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(width * density);
    canvas.height = Math.floor(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    particles = createParticles(getParticleCount(width, { reducedMotion, saveData }), width, height);
    setRunning();
  };

  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(([entry]) => resize(entry)) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  else {
    const fallbackResize = () => resize({ contentRect: canvas.getBoundingClientRect() });
    window.addEventListener("resize", fallbackResize, { passive: true });
    resize.fallbackResize = fallbackResize;
  }

  const viewportObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      setRunning();
    }, { threshold: 0.01 })
    : null;
  viewportObserver?.observe(hero);

  const handleVisibility = () => {
    visible = !document.hidden;
    setRunning();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  if (!resizeObserver) resize({ contentRect: canvas.getBoundingClientRect() });

  return () => {
    running = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    if (resize.fallbackResize) window.removeEventListener("resize", resize.fallbackResize);
    viewportObserver?.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    context.clearRect(0, 0, width, height);
  };
}

export function ParticleField({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let cleanup = () => {};
    const start = () => {
      if (!cancelled && canvasRef.current) cleanup = createParticleCanvas(canvasRef.current);
    };
    const idleCallback = window.requestIdleCallback;
    const idleCancel = window.cancelIdleCallback;
    const task = idleCallback
      ? idleCallback(start, { timeout: 500 })
      : window.setTimeout(start, 120);

    return () => {
      cancelled = true;
      if (idleCallback && idleCancel) idleCancel(task);
      else window.clearTimeout(task);
      cleanup();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="hero-particles" aria-hidden="true" />;
}
