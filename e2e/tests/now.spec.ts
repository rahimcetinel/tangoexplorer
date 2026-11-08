import { expect, test } from '@playwright/test';

test('happening now scopes the page to the chosen city', async ({ page }) => {
  await page.goto('/now?city=Istanbul');
  await expect(page.locator('[data-now-status]')).toContainText('Istanbul');
  await expect(page.locator('[data-now-city]')).toHaveValue('Istanbul');
  await expect(page.locator('.app-now-heading').first()).toContainText('Events on now');

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
