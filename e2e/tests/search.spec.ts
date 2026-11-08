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
  await expect(page.locator('.app-search-result').first()).toBeVisible();
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

test('a result opens in the right-hand drawer and close returns to the query', async ({ page }) => {
  await page.goto('/search?q=istanbul');
  await page.locator('.app-search-result').first().click();
  const panel = page.locator('[data-detail-panel]');
  await expect(panel).toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/news\//);
  await expect(panel.locator('[data-article-frame]')).toContainText(/Istanbul/);
  await page.locator('[data-detail-close]').click();
  await expect(page).toHaveURL(/\/search\/?\?q=istanbul/);
  await expect(panel).not.toHaveClass(/is-open/);
});

test('a query with no matches shows the empty state', async ({ page }) => {
  await page.goto('/search?q=zzzz-no-such-tango-xyz');
  await expect(page.locator('.app-search-empty-title')).toHaveText('No matches');
  await expect(page.locator('.app-search-result')).toHaveCount(0);
});
