import { expect, type Page, type TestInfo } from '@playwright/test';

export type IndexItem = {
  s: string;
  t: string;
  m: string;
  ml: string;
  c: string;
  k: string;
  co: string;
  ci: string;
  w: string;
  q: string;
};

export const NO_MATCH = 'zzzz-no-such-tango-xyz';

export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mobile';
}

export async function openMenu(page: Page): Promise<void> {
  const toggle = page.locator('[data-menu-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.locator('#app-menu')).toBeVisible();
}

export async function openFilters(page: Page): Promise<void> {
  await openMenu(page);
  const head = page.locator('#app-menu [data-acc-head]').filter({ hasText: /Filters|Filtreler/ });
  if ((await head.getAttribute('aria-expanded')) !== 'true') {
    await head.click();
  }
  await expect(page.locator('#app-menu [data-filter-chip], #app-menu [data-milonga-region]').first()).toBeVisible();
}

export function searchInput(page: Page, testInfo: TestInfo) {
  return isMobile(testInfo)
    ? page.locator('.app-menu-search [data-search-input]')
    : page.locator('.app-topbar [data-search-input]');
}

export function suggestBox(page: Page, testInfo: TestInfo) {
  return isMobile(testInfo)
    ? page.locator('.app-menu-search [data-suggest]')
    : page.locator('.app-search [data-suggest]');
}

export async function focusSearch(page: Page, testInfo: TestInfo) {
  if (isMobile(testInfo)) {
    await openMenu(page);
  }
  const input = searchInput(page, testInfo);
  await expect(input).toBeVisible();
  return input;
}

export async function loadIndex(page: Page, locale: 'en' | 'tr'): Promise<IndexItem[]> {
  const response = await page.request.get(`/search-index/${locale}.json`);
  expect(response.ok(), `search index ${locale}`).toBeTruthy();
  const data = (await response.json()) as IndexItem[];
  expect(Array.isArray(data)).toBeTruthy();
  return data;
}

export async function sharedSlug(page: Page): Promise<string> {
  const en = await loadIndex(page, 'en');
  const tr = new Set((await loadIndex(page, 'tr')).map((item) => item.s));
  const shared = en.find((item) => tr.has(item.s) && item.c !== 'topluluk');
  expect(shared, 'a story published in both locales').toBeTruthy();
  return shared!.s;
}

export function searchParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}
