import { expect, test } from '@playwright/test';

test('happening now scopes the page to the chosen city', async ({ page }) => {
  await page.goto('/now?city=Istanbul');
  await expect(page.locator('[data-now-status]')).toContainText('Istanbul');
  await expect(page.locator('.app-now-heading').first()).toContainText('Events on now');

  await page.goto('/now?city=K%C3%B6ln');
  await expect(page.locator('[data-now-status]')).toContainText('Köln');
  await expect(page.locator('.app-now-section').nth(1).locator('.app-now-item-title').first()).toBeVisible();
});

test('the home page links to happening now', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-hero a[href="/now"]')).toBeVisible();
});
