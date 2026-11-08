import { expect, test } from '@playwright/test';

type IndexItem = { s: string; t: string; st?: string; en?: string; k?: string };

async function index(request: import('@playwright/test').APIRequestContext): Promise<IndexItem[]> {
  const response = await request.get('/search-index.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as IndexItem[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test('started events stay off the category boards', async ({ page, request }) => {
  const items = await index(request);
  const started = items.filter((item) => item.st && item.st <= today() && (!item.en || item.en >= today()));
  test.skip(started.length === 0, 'no event is currently running');

  await page.goto('/category/festival');
  const titles = await page.locator('[data-month-col] h3').allTextContents();
  const festivalTitles = new Set(started.filter((item) => item.k?.includes('festival')).map((item) => item.t));
  expect(titles.some((title) => festivalTitles.has(title))).toBeFalsy();
});

test('a running event is still reachable through search', async ({ page, request }) => {
  const items = await index(request);
  const running = items.find((item) => item.st && item.st <= today() && (!item.en || item.en >= today()));
  test.skip(!running, 'no event is currently running');

  await page.goto(`/search?q=${encodeURIComponent(running!.t)}`);
  await expect(page.locator('[data-search-summary]')).toContainText(/result/);
  await expect(page.locator('.app-search-result').first()).toBeVisible();
});
