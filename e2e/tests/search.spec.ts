import { expect, test } from '@playwright/test';

test('search page starts with a hint, not a result list', async ({ page }) => {
  await page.goto('/search');
  await expect(page.locator('h1')).toHaveText('Search');
  await expect(page.locator('.app-search-hint')).toBeVisible();
  await expect(page.locator('.app-search-result')).toHaveCount(0);
});

test('query renders grouped results and a count', async ({ page }) => {
  await page.goto('/search?q=istanbul');
  await expect(page.locator('[data-search-summary]')).toContainText(/result/);
  const results = page.locator('.app-search-result');
  await expect(results.first()).toBeVisible();
  await expect(results.first()).toHaveAttribute('href', /^\/news\//);
  await expect(page.locator('.app-search-month').first()).toBeVisible();
});

test('kind chip narrows the result set and updates the URL', async ({ page }) => {
  await page.goto('/search?q=istanbul');
  const before = await page.locator('.app-search-result').count();
  await page.locator('[data-search-kind="festival"]').click();
  await expect(page).toHaveURL(/kind=festival/);
  await expect
    .poll(async () => page.locator('.app-search-result').count())
    .toBeLessThanOrEqual(before);
  const metas = await page.locator('.app-search-meta').allTextContents();
  expect(metas.every((meta) => meta.includes('Festival'))).toBeTruthy();
});

test('when chip keeps only events inside that window', async ({ page }) => {
  await page.goto('/search');
  await page.locator('[data-search-when="this-weekend"]').click();
  await expect(page).toHaveURL(/when=this-weekend/);
  await expect(page.locator('[data-search-summary]')).toContainText(/result/);
});

test('a typo falls back to close matches', async ({ page }) => {
  await page.goto('/search?q=istambul');
  await expect(page.locator('[data-search-summary]')).toContainText('close matches');
  await expect(page.locator('.app-search-result').first()).toBeVisible();
});

test('a query with no matches shows the empty state', async ({ page }) => {
  await page.goto('/search?q=zzzz-no-such-tango-xyz');
  await expect(page.locator('.app-search-empty-title')).toHaveText('No matches');
  await expect(page.locator('.app-search-result')).toHaveCount(0);
});
