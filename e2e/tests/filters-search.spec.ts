import { expect, test } from '@playwright/test';
import {
  NO_MATCH,
  focusSearch,
  isMobile,
  loadIndex,
  openFilters,
  searchParams,
  suggestBox,
} from '../support/site';

test('kind chip filters, toggles off, and can be cleared', async ({ page }, testInfo) => {
  await page.goto('/');
  await openFilters(page);
  const chip = page.locator('[data-filter-chip="kind"][data-value="festival"]');
  await expect(chip).toBeVisible();
  await chip.click();
  await expect.poll(() => searchParams(page).get('kind')).toBe('festival');
  await expect(page.locator('[data-results]')).toBeVisible();
  await expect(page.locator('.app-viewport')).toBeHidden();
  await expect(page.locator('.app-results-count')).toContainText(/stories|haber/);
  if (isMobile(testInfo)) {
    await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);
  } else {
    await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
  }

  await openFilters(page);
  await chip.click();
  await expect.poll(() => searchParams(page).get('kind')).toBeNull();
  await expect(page.locator('.app-viewport')).toBeVisible();
  await expect(page.locator('[data-results]')).toBeHidden();
});

test('country narrows cities and changing country drops the city', async ({ page }) => {
  await page.goto('/');
  await openFilters(page);
  const country = page.locator('[data-filter-select="country"]');
  const city = page.locator('[data-filter-select="city"]');
  const countries = await country.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean),
  );
  expect(countries.length).toBeGreaterThan(1);
  const first = countries[0]!;
  const second = countries[1]!;

  await country.selectOption(first);
  await expect.poll(() => searchParams(page).get('country')).toBe(first);
  const citiesForFirst = await city.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean),
  );
  if (citiesForFirst.length > 0) {
    await openFilters(page);
    await city.selectOption(citiesForFirst[0]!);
    await expect.poll(() => searchParams(page).get('city')).toBe(citiesForFirst[0]);
  }

  await openFilters(page);
  await country.selectOption(second);
  await expect.poll(() => searchParams(page).get('country')).toBe(second);
  await expect.poll(() => searchParams(page).get('city')).toBeNull();
});

test('clear removes kind, country, city, and query', async ({ page }) => {
  await page.goto('/');
  await openFilters(page);
  await page.locator('[data-filter-select="country"]').selectOption({ index: 1 });
  await openFilters(page);
  await page.locator('[data-filter-chip="kind"]').first().click();
  await expect.poll(() => searchParams(page).get('kind')).not.toBeNull();

  await openFilters(page);
  await page.locator('[data-filter-clear]').click();
  await expect.poll(() => page.url()).not.toMatch(/[?&](kind|country|city|q)=/);
  await expect(page.locator('.app-viewport')).toBeVisible();
  await expect(page.locator('[data-results]')).toBeHidden();
});

test('a query with no hits shows the empty copy', async ({ page }) => {
  await page.goto(`/?q=${NO_MATCH}`);
  await expect(page.locator('[data-results]')).toContainText('No stories match these filters.');
  await expect(page.locator('.app-viewport')).toBeHidden();
});

test('Turkish empty search uses Turkish copy', async ({ page }) => {
  await page.goto(`/tr?q=${NO_MATCH}`);
  await expect(page.locator('[data-results]')).toContainText('Bu filtrelere uyan haber yok.');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-i18n-count', '{n} haber');
});

test('legacy filter params are ignored and stripped', async ({ page }) => {
  await page.goto('/?year=2026&month=10&format=etkinlik&source=tangocat&when=this-week');
  await expect.poll(() => searchParams(page).toString()).toBe('');
  await expect(page.locator('[data-board]')).toBeVisible();
  await expect(page.locator('[data-results]')).toBeHidden();
});

test('deep link restores kind filter on load', async ({ page }, testInfo) => {
  await page.goto('/?kind=marathon');
  await expect(page.locator('[data-results]')).toBeVisible();
  await expect(page.locator('.app-viewport')).toBeHidden();
  await expect.poll(() => searchParams(page).get('kind')).toBe('marathon');
  if (!isMobile(testInfo)) {
    await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
  }
});

test('suggestions open the matching story from click and keyboard', async ({ page }, testInfo) => {
  const index = await loadIndex(page, 'en');
  const item = index.find((entry) => entry.t.length > 12);
  expect(item).toBeTruthy();
  await page.goto('/');
  const input = await focusSearch(page, testInfo);
  await input.fill(item!.t);
  const box = suggestBox(page, testInfo);
  const option = box.locator(`[data-href="/news/${item!.s}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/news/${item!.s}`));
  await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'home');

  await page.goto('/');
  const again = await focusSearch(page, testInfo);
  await again.fill(item!.t);
  await expect(box.locator('.app-suggest-item').first()).toBeVisible();
  await again.press('ArrowDown');
  const href = await box.locator('.app-suggest-item.is-active').getAttribute('data-href');
  expect(href).toBeTruthy();
  await again.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('Escape closes suggestions before it closes the menu', async ({ page }, testInfo) => {
  const index = await loadIndex(page, 'en');
  const item = index[0];
  expect(item).toBeTruthy();
  await page.goto('/');
  const input = await focusSearch(page, testInfo);
  await input.fill(item!.t.slice(0, 12));
  const box = suggestBox(page, testInfo);
  await expect(box.locator('.app-suggest-item').first()).toBeVisible();
  await input.press('Escape');
  await expect(box).toBeHidden();
  if (isMobile(testInfo)) {
    await expect(page.locator('#app-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-menu')).toBeHidden();
  }
});

test('Enter submits a search and shows a count', async ({ page }, testInfo) => {
  const index = await loadIndex(page, 'en');
  const item = index.find((entry) => entry.ci);
  expect(item).toBeTruthy();
  await page.goto('/');
  const input = await focusSearch(page, testInfo);
  await input.fill(item!.ci);
  await input.press('Enter');
  await expect.poll(() => searchParams(page).get('q')).toBe(item!.ci);
  await expect(page.locator('.app-results-count')).toBeVisible();
  await expect(page.locator('[data-result]').first()).toBeVisible();
  if (isMobile(testInfo)) {
    await expect(page.locator('#app-menu')).toBeHidden();
  }
});

test('category board and its search stay inside that category', async ({ page }, testInfo) => {
  const index = await loadIndex(page, 'en');
  await page.goto('/category/festival');
  await expect(page.locator('[data-board]')).toHaveAttribute('data-board-category', 'festival');
  const cards = page.locator('[data-month-col][data-lazy="false"] [data-card]');
  await expect(cards.first()).toBeVisible();
  const categories = await cards.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.category));
  expect(categories.every((category) => category === 'festival')).toBeTruthy();

  const outside = index.find((entry) => entry.c !== 'festival' && entry.t.length > 16);
  expect(outside).toBeTruthy();
  const input = await focusSearch(page, testInfo);
  await input.fill(outside!.t);
  await input.press('Enter');
  const titles = await page.locator('[data-result] .app-result-title').allTextContents();
  const festivalTitles = new Set(index.filter((entry) => entry.c === 'festival').map((entry) => entry.t));
  if (titles.length === 0) {
    await expect(page.locator('[data-results]')).toContainText('No stories match these filters.');
  } else {
    expect(titles.every((title) => festivalTitles.has(title))).toBeTruthy();
  }
});

test('region board only lists that region', async ({ page }) => {
  await page.goto('/region/turkiye');
  await expect(page.locator('[data-board]')).toHaveAttribute('data-board-region', 'turkiye');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-close-path', '/region/turkiye');
  const cards = page.locator('[data-month-col][data-lazy="false"] [data-card]');
  await expect(cards.first()).toBeVisible();
  const regions = await cards.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.region));
  expect(regions.every((region) => region === 'turkiye')).toBeTruthy();
});

test('both search fields stay in sync', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'desktop has both fields on screen');
  await page.goto('/');
  await page.locator('.app-topbar [data-search-input]').fill('istanbul');
  await expect(page.locator('.app-menu-search [data-search-input]')).toHaveValue('istanbul');
});
