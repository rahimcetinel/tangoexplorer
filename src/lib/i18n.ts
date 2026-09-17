import { categories, eventKinds, contentFormats } from './taxonomy';

export type Category = (typeof categories)[number];

export const locales = ['en', 'tr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function homePath(locale: Locale): string {
  return locale === 'en' ? '/' : '/tr';
}

export function aboutPath(locale: Locale): string {
  return locale === 'en' ? '/about' : '/tr/hakkinda';
}

export function newsPath(locale: Locale, slug: string): string {
  return locale === 'en' ? `/news/${slug}` : `/tr/haber/${slug}`;
}

export function categoryPath(locale: Locale, category: string): string {
  return locale === 'en' ? `/category/${category}` : `/tr/kategori/${category}`;
}

export function milongasPath(locale: Locale): string {
  return locale === 'en' ? '/milongas' : '/tr/milongalar';
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'tr' : 'en';
}

export function switchLocalePath(locale: Locale, pathname: string, slug?: string): string {
  const target = otherLocale(locale);
  const parts = pathname.split('/').filter(Boolean);
  if (parts.includes('news') || parts.includes('haber')) {
    return newsPath(target, slug ?? parts.at(-1) ?? '');
  }
  if (parts.includes('category') || parts.includes('kategori')) {
    return categoryPath(target, parts.at(-1) ?? '');
  }
  if (parts.includes('region') || parts.includes('bolge')) {
    return target === 'en' ? `/region/${parts.at(-1) ?? ''}` : `/tr/bolge/${parts.at(-1) ?? ''}`;
  }
  if (parts.includes('about') || parts.includes('hakkinda')) {
    return aboutPath(target);
  }
  if (parts.includes('milongas') || parts.includes('milongalar')) {
    return milongasPath(target);
  }
  return homePath(target);
}

export const categoryLabels: Record<Locale, Record<Category, string>> = {
  en: {
    etkinlik: 'Events',
    festival: 'Festival',
    turkiye: 'Turkey',
    dunya: 'World',
    topluluk: 'Community',
  },
  tr: {
    etkinlik: 'Etkinlik',
    festival: 'Festival',
    turkiye: 'Türkiye',
    dunya: 'Dünya',
    topluluk: 'Topluluk',
  },
};

export const kindLabels: Record<Locale, Record<(typeof eventKinds)[number], string>> = {
  en: {
    festival: 'Festival',
    marathon: 'Marathon',
    encuentro: 'Encuentro',
    workshop: 'Workshop',
    ders: 'Class',
    pratik: 'Practica',
  },
  tr: {
    festival: 'Festival',
    marathon: 'Marathon',
    encuentro: 'Encuentro',
    workshop: 'Workshop',
    ders: 'Ders',
    pratik: 'Pratik',
  },
};

export const formatLabels: Record<Locale, Record<(typeof contentFormats)[number], string>> = {
  en: { etkinlik: 'Event', blog: 'Blog' },
  tr: { etkinlik: 'Etkinlik', blog: 'Blog' },
};

export const monthLabels: Record<Locale, readonly string[]> = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  tr: [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ],
};

export const monthShort: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
};

export const weekdaysShort: Record<Locale, readonly string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
};

export const weekdaysLong: Record<Locale, readonly string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  tr: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
};

export const whenPresets: Record<Locale, readonly { id: string; label: string }[]> = {
  en: [
    { id: 'this-week', label: 'This Week' },
    { id: 'this-weekend', label: 'This Weekend' },
    { id: 'next-week', label: 'Next Week' },
  ],
  tr: [
    { id: 'this-week', label: 'Bu hafta' },
    { id: 'this-weekend', label: 'Bu hafta sonu' },
    { id: 'next-week', label: 'Gelecek hafta' },
  ],
};

export const ui = {
  en: {
    htmlLang: 'en',
    brand: 'TangoExplorer',
    brandLead: 'Tango',
    brandAccent: 'Explorer',
    tagline: 'Argentine tango news',
    kicker: 'Source-cited tango digest',
    home: 'Home',
    about: 'About',
    latest: 'Upcoming',
    category: 'Category',
    emptyCategory: 'No stories in this category yet.',
    related: 'More in this category',
    breaking: 'Breaking',
    browse: 'Browse',
    menu: 'Menu & filters',
    filters: 'Filters',
    jumpTo: 'Jump to',
    searchPlaceholder: 'Search events, cities…',
    searchLabel: 'Search',
    filterByKind: 'Filter by kind',
    filterKind: 'Kind',
    filterFormat: 'Format',
    filterCountry: 'Country',
    filterCountryCity: 'Country / City',
    filterCity: 'City',
    filterWhen: 'When',
    filterYear: 'Year',
    filterMonth: 'Month',
    filterSource: 'Source',
    filterAll: 'All',
    filterUpcoming: 'Upcoming',
    filterClear: 'Clear',
    filterEmpty: 'No stories match these filters.',
    filterCount: (n: number) => (n === 1 ? '1 story' : `${n} stories`),
    event: 'Event',
    date: 'Dates',
    place: 'Place',
    links: 'Links',
    source: 'Source',
    web: 'Web',
    eventImage: 'Event image',
    kind: 'Kind',
    duration: 'Duration',
    durationDays: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    edition: 'Edition',
    registrationOpens: 'Registration opens',
    addToCalendar: 'Add to calendar',
    googleCalendar: 'Google Calendar',
    share: 'Share',
    copyLink: 'Copy link',
    openPage: 'Open page',
    loading: 'Loading',
    loadError: 'Could not load this story. Open the full page instead.',
    imageCredit: 'Image',
    linkCopied: 'Link copied',
    closeDetail: 'Close',
    skipToContent: 'Skip to content',
    notFoundTitle: 'Page not found',
    notFoundLead: 'That address is not on TangoExplorer. Back to the timeline, or try a search from the home page.',
    notFoundHome: 'Back to the timeline',
    detailEyebrow: 'Event detail',
    timelinePosition: 'Position in timeline',
    whenToday: 'Today',
    whenTomorrow: 'Tomorrow',
    whenThisWeek: 'This week',
    defaultDescription: 'Argentine tango news: festivals, milongas, Turkey and the world.',
    footerBlurb: 'Updated daily from Tangocat, Hoy Milonga and Instagram.',
    sourcesLabel: 'Sources',
    aboutTitle: 'About',
    aboutP1:
      'TangoExplorer is a short digest of Argentine tango events and notes, gathered in one place. The same idea as a club news desk: cite the source, summarize, and send the reader on.',
    aboutP2:
      'We do not copy source pages verbatim. Each story has a date, a short summary, and a link back to the original.',
    aboutSources: 'Sources',
    aboutTangocat: 'world festival and marathon calendar',
    aboutHoy: 'milonga and class listings',
    aboutSocial: 'Instagram and Facebook — for now, notes dropped by hand into',
    aboutEventLinks:
      'Event stories keep the Tangocat listing as the source. If the event has its own website, Instagram, or Facebook, those open in a new tab.',
    aboutFilters:
      'The homepage filters by kind and country, with a jump-to month strip and a search over titles, summaries, cities and countries. Facebook group posts can be filed as event or blog.',
    milongas: 'Milongas',
    milongaTitle: 'Milongas & practicas',
    milongaIntro: 'Weekly milonga and practica listings by city, day and time.',
    milongaPick: 'Pick a milonga to see its details.',
    milongaEmpty: 'No milongas match these filters.',
    milongaRegion: 'Region',
    milongaCity: 'City',
    milongaDay: 'Day',
    milongaType: 'Type',
    milongaAllDays: 'All days',
    milongaTypeMilonga: 'Milonga',
    milongaTypePractica: 'Practica',
    milongaTime: 'Time',
    milongaVenue: 'Venue',
    milongaAddress: 'Address',
    milongaPrice: 'Price',
    milongaOrganizers: 'Organizers',
    milongaVerified: 'Last verified',
    milongaMap: 'Map',
    milongaOpenSource: 'Open on Hoy Milonga',
    milongaSource: 'Source',
    milongaUpdated: 'Listing data',
    langEn: 'EN',
    langTr: 'TR',
    langSwitch: 'Türkçe',
  },
  tr: {
    htmlLang: 'tr',
    brand: 'TangoExplorer',
    brandLead: 'Tango',
    brandAccent: 'Explorer',
    tagline: 'Arjantin tangosu haberleri',
    kicker: 'Kaynak atıflı tango derlemesi',
    home: 'Ana Sayfa',
    about: 'Hakkında',
    latest: 'Yaklaşan etkinlikler',
    category: 'Kategori',
    emptyCategory: 'Bu kategoride henüz haber yok.',
    related: 'Aynı kategoriden',
    breaking: 'Son dakika',
    browse: 'Göz at',
    menu: 'Menü ve filtreler',
    filters: 'Filtreler',
    jumpTo: 'Git',
    searchPlaceholder: 'Etkinlik, şehir ara…',
    searchLabel: 'Ara',
    filterByKind: 'Türe göre filtre',
    filterKind: 'Tür',
    filterFormat: 'Biçim',
    filterCountry: 'Ülke',
    filterCountryCity: 'Ülke / Şehir',
    filterCity: 'Şehir',
    filterWhen: 'Zaman',
    filterYear: 'Yıl',
    filterMonth: 'Ay',
    filterSource: 'Kaynak',
    filterAll: 'Tümü',
    filterUpcoming: 'Yaklaşan',
    filterClear: 'Temizle',
    filterEmpty: 'Bu filtrelere uyan haber yok.',
    filterCount: (n: number) => `${n} haber`,
    event: 'Etkinlik',
    date: 'Tarih',
    place: 'Yer',
    links: 'Bağlantılar',
    source: 'Kaynak',
    web: 'Web',
    eventImage: 'Etkinlik görseli',
    kind: 'Tür',
    duration: 'Süre',
    durationDays: (n: number) => (n === 1 ? '1 gün' : `${n} gün`),
    edition: 'Edisyon',
    registrationOpens: 'Kayıt açılışı',
    addToCalendar: 'Takvime ekle',
    googleCalendar: 'Google Takvim',
    share: 'Paylaş',
    copyLink: 'Linki kopyala',
    openPage: 'Sayfayı aç',
    loading: 'Yükleniyor',
    loadError: 'Bu haber yüklenemedi. Tam sayfayı açın.',
    imageCredit: 'Görsel',
    linkCopied: 'Link kopyalandı',
    closeDetail: 'Kapat',
    skipToContent: 'İçeriğe geç',
    notFoundTitle: 'Sayfa bulunamadı',
    notFoundLead: 'Bu adres TangoExplorer’da yok. Zaman çizelgesine dönün veya ana sayfadan arayın.',
    notFoundHome: 'Zaman çizelgesine dön',
    detailEyebrow: 'Etkinlik detayı',
    timelinePosition: 'Zaman çizelgesindeki yeri',
    whenToday: 'Bugün',
    whenTomorrow: 'Yarın',
    whenThisWeek: 'Bu hafta',
    defaultDescription: 'Arjantin tangosu haberleri: festivaller, milongalar, Türkiye ve dünya.',
    footerBlurb: 'Tangocat, Hoy Milonga ve Instagram’dan günlük derleme.',
    sourcesLabel: 'Kaynaklar',
    aboutTitle: 'Hakkında',
    aboutP1:
      'TangoExplorer, Arjantin tangosu etrafındaki etkinlik ve haberleri tek yerde toplayan kısa bir derlemedir. Bir kulüp bülteninin yaptığı iş: kaynak göster, özetle, linkle.',
    aboutP2:
      'Metinleri kaynak sitelerden olduğu gibi kopyalamayız. Her haberde tarih, kısa özet ve orijinal sayfaya giden bir kaynak linki bulunur.',
    aboutSources: 'Kaynaklar',
    aboutTangocat: 'dünya festival ve maraton takvimi',
    aboutHoy: 'milonga ve ders ajandası',
    aboutSocial: 'Instagram ve Facebook — şimdilik elle',
    aboutEventLinks:
      'Etkinlik haberlerinde Tangocat kaydı kaynak olarak durur. Etkinliğin kendi web, Instagram ve Facebook adresleri varsa ayrı link olarak, yeni pencerede açılır.',
    aboutFilters:
      'Ana sayfada tür ve ülke çipleri, aya atlama şeridi ve başlık, özet, şehir, ülke araması vardır. Facebook grubundan gelen yazılar etkinlik veya blog olarak ayrılabilir.',
    milongas: 'Milongalar',
    milongaTitle: 'Milongalar & praktikalar',
    milongaIntro: 'Şehir, gün ve saate göre haftalık milonga ve praktika listeleri.',
    milongaPick: 'Detaylar için bir milonga seçin.',
    milongaEmpty: 'Bu filtrelere uyan milonga yok.',
    milongaRegion: 'Bölge',
    milongaCity: 'Şehir',
    milongaDay: 'Gün',
    milongaType: 'Tür',
    milongaAllDays: 'Tüm günler',
    milongaTypeMilonga: 'Milonga',
    milongaTypePractica: 'Praktika',
    milongaTime: 'Saat',
    milongaVenue: 'Mekân',
    milongaAddress: 'Adres',
    milongaPrice: 'Fiyat',
    milongaOrganizers: 'Organizatör',
    milongaVerified: 'Son doğrulama',
    milongaMap: 'Harita',
    milongaOpenSource: 'Hoy Milonga’da aç',
    milongaSource: 'Kaynak',
    milongaUpdated: 'Liste verisi',
    langEn: 'EN',
    langTr: 'TR',
    langSwitch: 'English',
  },
} as const;

export function formatNewsDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatMastheadDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
