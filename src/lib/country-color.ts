export const PALETTE = [
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#4d7c0f',
  '#15803d',
  '#0f766e',
  '#0e7490',
  '#0369a1',
  '#1d4ed8',
  '#4338ca',
  '#6d28d9',
  '#a21caf',
  '#be185d',
  '#9f1239',
  '#78350f',
  '#334155',
];

export function countryColor(country?: string): string {
  if (!country) {
    return '';
  }
  const key = country.trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
