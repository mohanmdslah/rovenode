export function getParticleCount(width, preferences = {}) {
  if (preferences.reducedMotion || preferences.saveData || width <= 0) return 0;
  return width <= 720 ? 16 : 30;
}

export function getParticleOpacity(y, height) {
  if (height <= 0) return 0;
  const progress = 1 - y / height;
  if (progress <= 0 || progress >= 1) return 0;
  return Math.min(progress * 4, 1) * Math.min((1 - progress) * 4, 1);
}
