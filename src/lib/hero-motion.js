function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getHeroParallax(pointerX, pointerY, viewportWidth, viewportHeight) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return { x: 0, y: 0 };

  const normalizedX = clamp((pointerX / viewportWidth - 0.5) * 2, -1, 1);
  const normalizedY = clamp((pointerY / viewportHeight - 0.5) * 2, -1, 1);
  return {
    x: Number((normalizedX * 10).toFixed(2)),
    y: Number((normalizedY * 6).toFixed(2)),
  };
}
