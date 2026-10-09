import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/fallbacks/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));

// Deterministic per-event pick so a card keeps the same fallback photo on every
// render (avoids the "random image changes on reload" problem).
export function fallbackImage(seed: string): ImageMetadata {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return entries[hash % entries.length]![1].default;
}
