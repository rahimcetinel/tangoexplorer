const FALLBACK_COUNT = 100;

// Deterministic per-event pick so a card keeps the same fallback art on every
// render (avoids the "random image changes on reload" problem).
export function fallbackImage(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const index = hash % FALLBACK_COUNT;
  return `/fallbacks/fb-${String(index).padStart(3, '0')}.svg`;
}
