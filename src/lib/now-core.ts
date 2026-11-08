export const RADIUS_KM = 150;
export const CITY_STORAGE_KEY = 'te-city';

export const TIMEZONE_CITY: Record<string, string> = {
  'Europe/Istanbul': 'Istanbul',
  'Europe/Berlin': 'Berlin',
  'Europe/Vienna': 'Vienna',
  'Europe/Zurich': 'Zürich',
  'Europe/Athens': 'Athens',
  'Europe/Madrid': 'Madrid',
  'Europe/Paris': 'Paris',
  'Europe/Rome': 'Rome',
  'Europe/London': 'London',
  'Europe/Warsaw': 'Warsaw',
  'Europe/Lisbon': 'Lisbon',
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/Brussels': 'Brussels',
  'Europe/Copenhagen': 'Copenhagen',
  'Europe/Stockholm': 'Stockholm',
  'Europe/Helsinki': 'Helsinki',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Sao_Paulo': 'São Paulo',
  'America/New_York': 'New York',
  'America/Chicago': 'Chicago',
  'America/Los_Angeles': 'Los Angeles',
  'America/Mexico_City': 'Mexico City',
};

export function normalizeCity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

export function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function guessCity(): string {
  try {
    const stored = localStorage.getItem(CITY_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage can be blocked in private modes.
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_CITY[zone] ?? '';
}

export function rememberCity(city: string): void {
  try {
    localStorage.setItem(CITY_STORAGE_KEY, city);
  } catch {
    // Ignore storage failures; the city still works for this page.
  }
}

export function nearbyCitySet(city: string, coords: Array<[string, number, number]>): Set<string> {
  const set = new Set<string>([normalizeCity(city)]);
  const origin = coords.find(([name]) => normalizeCity(name) === normalizeCity(city));
  if (!origin) return set;
  for (const entry of coords) {
    if (distanceKm([origin[1], origin[2]], [entry[1], entry[2]]) <= RADIUS_KM) {
      set.add(normalizeCity(entry[0]));
    }
  }
  return set;
}
