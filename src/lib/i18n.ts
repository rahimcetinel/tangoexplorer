import { categories, eventKinds, contentFormats } from './taxonomy';

export type Category = (typeof categories)[number];

export const locales = ['en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function homePath(_locale: Locale): string {
  return '/';
}

export function aboutPath(_locale: Locale): string {
  return '/about';
}

export function newsPath(_locale: Locale, slug: string): string {
  return `/news/${slug}`;
}

export function categoryPath(_locale: Locale, category: string): string {
  return `/category/${category}`;
}

export function milongasPath(_locale: Locale): string {
  return '/milongas';
}

export const categoryLabels: Record<Locale, Record<Category, string>> = {
  en: {
    etkinlik: 'Events',
    festival: 'Festival',
    turkiye: 'Turkey',
    dunya: 'World',
    topluluk: 'Community',
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
};

export const formatLabels: Record<Locale, Record<(typeof contentFormats)[number], string>> = {
  en: { etkinlik: 'Event', blog: 'Blog' },
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
};

export const monthShort: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export const weekdaysShort: Record<Locale, readonly string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

export const weekdaysLong: Record<Locale, readonly string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

export const whenPresets: Record<Locale, readonly { id: string; label: string }[]> = {
  en: [
    { id: 'this-week', label: 'This Week' },
    { id: 'this-weekend', label: 'This Weekend' },
    { id: 'next-week', label: 'Next Week' },
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
    relatedNearby: 'Nearby events',
    breaking: 'Breaking',
    browse: 'Browse',
    regions: 'Regions',
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
    registrationOpen: 'Registration open',
    eventWebsite: 'Event website',
    openInMaps: 'Open in Maps',
    addedOn: 'Added',
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
    heroKicker: 'Argentine tango · one calendar',
    heroTitle: 'Find your next tango weekend',
    heroLede:
      'Festivals, marathons, encuentros and milongas from around the world — every listing links to its original source.',
    heroSearchPlaceholder: 'City, festival or country',
    heroSearchCta: 'Search',
    heroStatEvents: 'upcoming events',
    heroStatCountries: 'countries',
    heroStatCities: 'cities',
    heroThisWeekend: 'This weekend',
    heroThisWeek: 'This week',
    heroToday: 'Today',
    notFoundTitle: 'Page not found',
    notFoundLead: 'That address is not on TangoExplorer. Back to the timeline, or try a search from the home page.',
    notFoundHome: 'Back to the timeline',
    notFoundUpcoming: 'Upcoming events',
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
  },
} as const;

export function formatNewsDate(date: Date, _locale: Locale): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatMastheadDate(date: Date, _locale: Locale): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
