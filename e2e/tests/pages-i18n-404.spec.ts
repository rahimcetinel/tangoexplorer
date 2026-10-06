import { expect, test } from '@playwright/test';

test('about page cites sources in both languages', async ({ page }) => {
  await page.goto('/about');
  await expect(page.locator('h1')).toHaveText('About');
  await expect(page.locator('#main')).toContainText('TangoExplorer');
  await expect(page.locator('#main a[href="https://tangocat.net/"]')).toHaveAttribute('target', '_blank');
  await expect(page.locator('.app-crumb')).toContainText('Home');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('.app-topbar [data-search-input]')).toHaveCount(0);

  await page.goto('/tr/hakkinda');
  await expect(page.locator('h1')).toHaveText('Hakkında');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('.app-crumb')).toContainText('Ana Sayfa');
});

test('unknown English URL uses the English 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-xyz');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('[data-404-home]')).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.locator('[data-404-home]').click();
  await expect(page).toHaveURL(/tangoexplorer.com\/?$/);
  await expect(page.locator('[data-board]')).toBeVisible();
});

test('unknown Turkish URL is rewritten to Turkish copy', async ({ page }) => {
  const response = await page.goto('/tr/bu-sayfa-yok-xyz');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('h1')).toHaveText('Sayfa bulunamadı');
  await expect(page.locator('[data-404-home]')).toHaveText('Zaman çizelgesine dön');
  await expect(page.locator('[data-404-home]')).toHaveAttribute('href', '/tr');
});

test('dedicated Turkish 404 does not depend on the rewrite script', async ({ page }) => {
  const response = await page.goto('/tr/404');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('h1')).toHaveText('Sayfa bulunamadı');
  await expect(page.locator('[data-404-home]')).toHaveAttribute('href', '/tr');
});

test('old diacritic slugs redirect to the canonical story', async ({ request }) => {
  const response = await request.get('/news/tangocat-lunatico-tango-marathon', { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(response.headers().location ?? '').toMatch(/tangocat-lunatico-tango-marathon-2-edition/);

  const turkish = await request.get('/tr/haber/tangocat-el-hurac-n-pozna-tango-marathon', { maxRedirects: 0 });
  expect([301, 308]).toContain(turkish.status());
  expect(turkish.headers().location ?? '').toMatch(/tangocat-el-huracan-poznan-tango-marathon/);
});

test('www host redirects to the apex', async ({ request }) => {
  const response = await request.get('https://www.tangoexplorer.com/', { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(response.headers().location ?? '').toMatch(/^https:\/\/tangoexplorer.com\/?$/);
});

test('unprefixed Turkish paths redirect under /tr', async ({ request }) => {
  const response = await request.get('/hakkinda', { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(response.headers().location ?? '').toMatch(/\/tr\/hakkinda\/?$/);
});

test('sitemap lists public pages and skips internal routes', async ({ request }) => {
  const index = await request.get('/sitemap-index.xml');
  expect(index.ok()).toBeTruthy();
  const parts = [await index.text()];
  const locs = [...parts[0]!.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
  for (const loc of locs) {
    if (loc.endsWith('.xml')) {
      const child = await request.get(loc);
      expect(child.ok()).toBeTruthy();
      parts.push(await child.text());
    }
  }
  const xml = parts.join('\n');
  expect(xml).toContain('https://tangoexplorer.com/');
  expect(xml).toContain('https://tangoexplorer.com/tr');
  expect(xml).toContain('/milongas');
  expect(xml).not.toContain('/fragments/');
  expect(xml).not.toContain('/search-index/');
  expect(xml).not.toContain('/hoy-milongas.json');
  expect(xml).not.toContain('/404');
});

test('search index and month fragments match the board contract', async ({ request }) => {
  const index = await request.get('/search-index/en.json');
  expect(index.ok()).toBeTruthy();
  const items = (await index.json()) as { s: string; t: string; m: string; k: string; c: string }[];
  expect(items.length).toBeGreaterThan(10);
  expect(items.every((item) => item.s && item.t && item.m && item.c)).toBeTruthy();

  const month = items[0]!.m;
  const fragment = await request.get(`/fragments/en/${month}`);
  expect(fragment.ok()).toBeTruthy();
  const html = await fragment.text();
  expect(html).toContain('data-month-cards');
  expect(html).toContain('data-card');
  expect(html).toContain('noindex');

  const missing = await request.get('/fragments/en/1999-01');
  expect(missing.status()).toBe(404);

  const turkish = await request.get('/search-index/tr.json');
  expect(turkish.ok()).toBeTruthy();
  const trItems = (await turkish.json()) as { s: string }[];
  expect(trItems.length).toBeGreaterThan(10);
});

test('category and region routes 404 when the slug is unknown', async ({ page }) => {
  expect((await page.goto('/category/not-a-category'))?.status()).toBe(404);
  expect((await page.goto('/region/antarctica'))?.status()).toBe(404);
  expect((await page.goto('/tr/kategori/yok'))?.status()).toBe(404);
  expect((await page.goto('/tr/bolge/yok'))?.status()).toBe(404);
});
