import { expect, test } from '@playwright/test';

test('happening now scopes the page to the chosen city', async ({ page }) => {
  await page.goto('/now?city=Istanbul');
  await expect(page.locator('[data-now-status]')).toContainText('Istanbul');
  await expect(page.locator('[data-now-city]')).toHaveValue('Istanbul');
  await expect(page.locator('.app-now-heading').first()).toContainText('Events');

  await page.goto('/now?city=K%C3%B6ln');
  await expect(page.locator('[data-now-status]')).toContainText('Köln');
  await expect(page.locator('.app-now-section').nth(1).locator('.app-now-item-title').first()).toBeVisible();
});

test('the place field is a plain search box that also accepts a country', async ({ page }) => {
  await page.goto('/now');
  const input = page.locator('[data-now-city]');
  await expect(input).toHaveAttribute('type', 'search');
  await expect(input).not.toHaveAttribute('list', /.+/);
  await expect(page.locator('datalist')).toHaveCount(0);
  await expect(input).toHaveAttribute('data-1p-ignore', 'true');

  await page.goto('/now?city=Germany');
  await expect(page.locator('[data-now-status]')).toContainText('Germany');
  await expect(input).toHaveValue('Germany');

  await page.goto('/now?city=Romania');
  await expect(page.locator('[data-now-status]')).toContainText('Romania');

  await page.goto('/now?city=zzz');
  await expect(page.locator('[data-now-status]')).toContainText('No city or country matches');
});

test('the time scopes change the result window', async ({ page }) => {
  await page.goto('/now');
  // Pick a city that really has an event inside the seven-day window, instead of
  // assuming Istanbul always does (it did not on 2026-11-17).
  const target = await page.evaluate(() => {
    const all = JSON.parse(
      document.querySelector('[data-now-all-events]')?.textContent ?? '[]',
    ) as { ci: string; st: string; en: string }[];
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 6 * 86_400_000);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    // Overlap the tighter of the two windows so both scopes render the event.
    const end = iso(weekEnd < monthEnd ? weekEnd : monthEnd);
    const start = iso(now);
    return all.find((event) => event.ci && event.st <= end && event.en >= start)?.ci ?? null;
  });
  expect(target, 'no event within the next seven days').not.toBeNull();

  await page.goto(`/now?city=${encodeURIComponent(target!)}&when=week`);
  await expect(page.locator('[data-now-status]')).toContainText('this week');
  await expect(page.locator('[data-now-when="week"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-now-section').first().locator('.app-now-item-title').first()).toBeVisible();

  await page.locator('[data-now-when="month"]').click();
  await expect(page).toHaveURL(/when=month/);
  await expect(page.locator('[data-now-status]')).toContainText('this month');
  expect(await page.locator('.app-now-section').first().locator('.app-now-item-title').count()).toBeGreaterThan(0);
  await expect(page.locator('.app-now-section').first().locator('.app-now-tag').first()).toHaveText(
    /Festival|Marathon|Encuentro|Workshop|Practica/,
  );
  // The milonga section is city-dependent (the derived city may have events but
  // no weekly milonga); its tag rendering is covered by milongas.spec.ts.
});

test('an event opens in the right panel and close returns to the filters', async ({ page }) => {
  await page.goto('/now?city=Istanbul&when=month');
  await page.locator('.app-now-section').first().locator('a[data-detail-link]').first().click();
  const panel = page.locator('[data-detail-panel]');
  await expect(panel).toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/news\//);
  await page.locator('[data-detail-close]').click();
  await expect(panel).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/now\?city=Istanbul&when=month/);
});

test('the home page shows a happening-now strip for the saved city', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('te-city', 'Istanbul');
    } catch {
      // storage can be unavailable; the test then falls back to the timezone
    }
  });
  await page.goto('/');
  await expect(page.locator('[data-now-strip]')).toBeVisible();
  await expect(page.locator('[data-now-strip-text]')).toContainText('Istanbul');
});

test('the home page links to happening now', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-hero a[href="/now"]')).toBeVisible();
});
