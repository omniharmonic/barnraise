/** Deterministic warm gradient for event banners based on title hash */
const BANNER_GRADIENTS = [
  "from-amber-900/40 via-rose-900/20 to-stone-800/30",
  "from-emerald-900/35 via-teal-800/20 to-amber-900/25",
  "from-stone-700/35 via-amber-800/25 to-rose-900/20",
  "from-teal-800/30 via-emerald-900/20 to-amber-800/25",
  "from-rose-900/25 via-amber-800/30 to-stone-700/25",
  "from-amber-800/30 via-stone-700/25 to-emerald-900/20",
  "from-stone-800/35 via-rose-800/20 to-amber-800/25",
  "from-emerald-800/30 via-amber-900/25 to-rose-800/20",
];

export function eventBannerGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BANNER_GRADIENTS[Math.abs(hash) % BANNER_GRADIENTS.length];
}
