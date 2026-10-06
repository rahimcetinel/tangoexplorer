import { expect, test } from '@playwright/test';

test('@noscript eager cards stay in the HTML and lazy months stay skeletons', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-brand')).toContainText('Explorer');
  const eager = page.locator('[data-month-col][data-lazy="false"] [data-card]');
  await expect(eager.first()).toBeVisible();
  const lazy = page.locator('[data-month-col][data-lazy="true"]');
  if ((await lazy.count()) > 0) {
    await expect(lazy.first().locator('[data-card]')).toHaveCount(0);
    await expect(lazy.first().locator('.app-card-skeleton').first()).toBeAttached();
  }
});

test('@noscript menu and filters do not open without JavaScript', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-menu-toggle]').click();
  await expect(page.locator('#app-menu')).toBeHidden();
  await expect(page.locator('[data-board]')).toBeVisible();
});

test('@noscript a story link is a normal navigation', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first();
  const href = await card.getAttribute('href');
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}`));
  await expect(page.locator('#main h1')).toBeVisible();
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'page');
});

test('@noscript unknown Turkish paths stay on the English 404 shell', async ({ page }) => {
  const response = await page.goto('/tr/bu-sayfa-yok-xyz');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('[data-404-home]')).toHaveAttribute('href', '/');
});

test('@noscript the dedicated Turkish 404 is already Turkish', async ({ page }) => {
  await page.goto('/tr/404');
  await expect(page.locator('h1')).toHaveText('Sayfa bulunamadı');
  await expect(page.locator('[data-404-home]')).toHaveAttribute('href', '/tr');
});
