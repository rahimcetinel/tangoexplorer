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
  return entry?.[1].default;
}

export const OG_FALLBACK = '/og-default.svg';
