import { expect, test } from '@playwright/test';

test('the RSS feed lists upcoming events', async ({ request }) => {
  const response = await request.get('/feed.xml');
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain('<rss');
  expect(xml).toContain('<item>');
  expect(xml).toContain('/news/');
});

test('about explains how to submit and correct listings', async ({ page }) => {
  await page.goto('/about#contribute');
  await expect(page.locator('#contribute')).toBeVisible();
  await expect(page.locator('#contribute ~ ul a', { hasText: 'Submit an event' })).toHaveAttribute(
    'href',
    /github\.com\/rahimcetinel\/tangoexplorer\/issues\/new/,
  );
});

test('event pages offer a prefilled correction link', async ({ page }) => {
  const feed = await page.request.get('/search-index.json');
  const items = (await feed.json()) as { s: string }[];
  await page.goto(`/news/${items[0]!.s}`);
  const report = page.locator('.app-report a');
  await expect(report).toBeVisible();
  const href = await report.getAttribute('href');
  expect(href).toContain('issues/new?template=correction.yml');
  expect(href).toContain('Correction');
});
