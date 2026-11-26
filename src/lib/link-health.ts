import health from '../data/link-health.json';

export type LinkStatus = 'ok' | 'dead' | 'gone' | 'blocked' | 'unreachable' | 'error';

export type LinkHealthEntry = {
  status: LinkStatus;
  checkedAt: string;
  /** Ölü linkin ilk görüldüğü an (yalnızca dead/gone için yazılır). */
  firstBadAt?: string;
  lastOkAt?: string;
  badCount?: number;
};

// Bir kartın "kaynağı kaldırıldı" sayılması için ölü linkin bu kadar süre üst
// üste görülmesi gerekir: üç gün. `agentic-python/check_links.py` aynı sayıyı
// kullanır; ikisi birlikte değişmeli.
export const SOURCE_GONE_AFTER_H = 72;

const links = (health as { links: Record<string, LinkHealthEntry> }).links ?? {};

export function healthFor(...urls: Array<string | undefined>): LinkHealthEntry | undefined {
  for (const url of urls) {
    if (url && links[url]) return links[url];
  }
  return undefined;
}

/** Ölü link kaç saattir ölü? Canlıysa ya da saat hiç yazılmamışsa null. */
export function badForHours(entry: LinkHealthEntry | undefined, now: Date = new Date()): number | null {
  if (!entry || (entry.status !== 'dead' && entry.status !== 'gone')) return null;
  if (!entry.firstBadAt) return null;
  const since = Date.parse(entry.firstBadAt);
  if (Number.isNaN(since)) return null;
  return Math.max(0, (now.getTime() - since) / 3_600_000);
}

/**
 * Kaynak üç gündür ölü mü? Kartı düşüren tek kural budur: tek bir 404 (bakım,
 * yanlış yönlendirme, GitHub runner'ına bakan bot duvarı) kart düşürmez; üç gün
 * süren 404 düşürür. `blocked`/`unreachable` hiç sayılmaz — onlar sayfa
 * hakkında kanıt değil.
 */
export function sourceRetired(...urls: Array<string | undefined>): boolean {
  for (const url of urls) {
    const entry = url ? links[url] : undefined;
    if (!entry || (entry.status !== 'dead' && entry.status !== 'gone')) continue;
    // Geçiş: 2026-11-25'ten önce yazılmış defterlerde saat yok ve o kartlar eski
    // davranışla hemen düşüyordu. Bir deploy'da hepsini geri getirmemek için
    // "süresi dolmuş" sayıyoruz; `check_links.py` bir sonraki koşuda gerçek
    // `firstBadAt`'i (süresi dolmuş olarak) yazar. Yeni arızalarda alan her
    // zaman dolu gelir, yani bu dal yalnızca eski kayıtlar için çalışır.
    if (!entry.firstBadAt) return true;
    const hours = badForHours(entry);
    if (hours !== null && hours >= SOURCE_GONE_AFTER_H) return true;
  }
  return false;
}
