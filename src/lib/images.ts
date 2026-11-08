import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<{ default: ImageMetadata }>('../assets/events/*.{png,jpg,jpeg,webp,avif,gif}', {
  eager: true,
});

export function eventImage(path?: string): ImageMetadata | undefined {
  if (!path) {
    return undefined;
  }
  const name = path.split('/').pop()?.split('?')[0];
  if (!name) {
    return undefined;
  }
  const entry = Object.entries(modules).find(([file]) => file.endsWith(`/${name}`));
  const meta = entry?.[1].default;
  // Some ingests pick up a site favicon or icon instead of the event artwork.
  // Anything that small is not usable as a card or hero image, so fall back to
  // the deterministic illustration instead.
  if (!meta || meta.width < 400 || meta.height < 250) {
    return undefined;
  }
  return meta;
}

export const OG_FALLBACK = '/og-default.jpg';
