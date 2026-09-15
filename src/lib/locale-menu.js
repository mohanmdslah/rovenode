export const localeOptions = [
  { id: "zh-CN", label: "简体中文", shortLabel: "简中", flag: "cn" },
  { id: "en", label: "English", shortLabel: "EN", flag: "us" },
  { id: "ko", label: "한국어", shortLabel: "KO", flag: "kr" },
  { id: "ja", label: "日本語", shortLabel: "JA", flag: "jp" },
  { id: "vi", label: "Tiếng Việt", shortLabel: "VI", flag: "vn" },
];

export function getNextLocaleIndex(currentIndex, key) {
  const lastIndex = localeOptions.length - 1;
  if (key === "Home") return 0;
  if (key === "End") return lastIndex;
  if (key === "ArrowDown") return currentIndex === lastIndex ? 0 : currentIndex + 1;
  if (key === "ArrowUp") return currentIndex === 0 ? lastIndex : currentIndex - 1;
  return currentIndex;
}
