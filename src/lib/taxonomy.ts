/**
 * Client-safe taxonomy constants (no astro:content import).
 * Shared by content.config.ts (server schema) and lib/i18n.ts (used in client scripts).
 */

export const categories = ['etkinlik', 'festival', 'turkiye', 'dunya', 'topluluk'] as const;

export const eventKinds = ['festival', 'marathon', 'encuentro', 'workshop', 'ders', 'pratik'] as const;

export const contentFormats = ['etkinlik', 'blog'] as const;

export const sourceKeys = ['instagram', 'facebook', 'tangocat', 'hoymilonga', 'tangoverse', 'tmd'] as const;
