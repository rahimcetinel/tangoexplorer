const FALLBACK = '';

export function countryHue(country?: string): string {
  if (!country) {
    return FALLBACK;
  }
  const key = country.trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return String(hash % 360);
}
