import { expect, test } from '@playwright/test';

test('the RSS feed lists upcoming events', async ({ request }) => {
  const response = await request.get('/feed.xml');
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain('<rss');
  expect(xml).toContain('<item>');
  expect(xml).toContain('/news/');
});

test('the About page offers the feeds and no off-site submission links', async ({ page }) => {
  await page.goto('/about#contribute');
  await expect(page.locator('#contribute')).toBeVisible();
  await expect(page.locator('#contribute ~ ul a', { hasText: 'RSS feed' })).toHaveAttribute('href', '/feed.xml');
  await expect(page.locator('#contribute ~ ul a', { hasText: 'Calendar feed' })).toHaveAttribute(
    'href',
    '/cal/all.ics',
  );
  await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
});
