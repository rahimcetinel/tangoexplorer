import { expect, test } from '@playwright/test';
import { NO_MATCH, focusSearch, isMobile, openFilters, searchParams } from '../support/site';

test('milonga JSON is public and the page lists Türkiye by default', async ({ page, request }) => {
  const response = await request.get('/hoy-milongas.json');
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as {
    items: { id: string; region: string; name: string; type: string; days: string[] }[];
  };
  expect(data.items.length).toBeGreaterThan(0);
  expect(data.items.every((item) => item.id && item.region && item.name)).toBeTruthy();
  expect(data.items.every((item) => item.type === 'milonga' || item.type === 'practica')).toBeTruthy();

  await page.goto('/milongas');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'milonga');
  await expect(page.locator('h1, .app-page-title, [data-milonga-list]').first()).toBeAttached();
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
  await expect.poll(() => searchParams(page).get('region')).toBeNull();
  await expect(page.locator('[data-milonga-tabs] [data-day=""]')).toHaveClass(/is-active/);
});

test('region, city, day, and type filters rewrite the URL', async ({ page }) => {
  await page.goto('/milongas');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
  await openFilters(page);

  await page.locator('[data-milonga-region]').selectOption('berlin');
  await expect.poll(() => searchParams(page).get('region')).toBe('berlin');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();

  const city = page.locator('[data-milonga-city]');
  const cities = await city.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean),
  );
  expect(cities.length).toBeGreaterThan(0);
  await city.selectOption(cities[0]!);
  await expect.poll(() => searchParams(page).get('city')).toBe(cities[0]);

  await page.locator('[data-milonga-day="saturday"]').click();
  await expect.poll(() => searchParams(page).get('day')).toBe('saturday');
  await expect(page.locator('[data-milonga-day="saturday"]')).toHaveClass(/is-active/);

  await page.locator('[data-milonga-type="practica"]').click();
  await expect.poll(() => searchParams(page).get('type')).toBe('practica');

  const listed = await page.locator('[data-milonga-id]').count();
  const empty = page.locator('[data-milonga-empty]');
  if (listed === 0) {
    await expect(empty).toBeVisible();
  } else {
    await expect(empty).toBeHidden();
    await expect(page.locator('.app-mitem-type.is-practica').first()).toBeVisible();
  }
});

test('clear drops day, type, city, and query but keeps the region', async ({ page }) => {
  await page.goto('/milongas?region=athens&day=friday&type=milonga');
  await expect(page.locator('[data-milonga-id], [data-milonga-empty]').first()).toBeVisible();
  await openFilters(page);
  await page.locator('[data-milonga-clear]').click();
  await expect.poll(() => searchParams(page).get('region')).toBe('athens');
  await expect.poll(() => searchParams(page).get('day')).toBeNull();
  await expect.poll(() => searchParams(page).get('type')).toBeNull();
  await expect.poll(() => searchParams(page).get('city')).toBeNull();
  await expect.poll(() => searchParams(page).get('q')).toBeNull();
});

test('search with no hits shows the empty milonga state', async ({ page }, testInfo) => {
  await page.goto('/milongas');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
  const input = await focusSearch(page, testInfo);
  await input.fill(NO_MATCH);
  await expect(page.locator('[data-milonga-empty]')).toBeVisible();
  await expect(page.locator('[data-milonga-empty]')).toContainText('No milongas match these filters.');
  await expect.poll(() => searchParams(page).get('q')).toBe(NO_MATCH);
  await expect(page.locator('[data-milonga-id]')).toHaveCount(0);
});

test('picking a milonga opens details and close or Escape dismisses them', async ({ page }, testInfo) => {
  await page.goto('/milongas');
  const item = page.locator('[data-milonga-id]').first();
  await expect(item).toBeVisible();
  const name = (await item.locator('.app-mitem-name').innerText()).trim();
  await item.click();
  await expect(page.locator('[data-milonga-detail] h2')).toHaveText(name);
  await expect(page.locator('.app-detail')).toHaveClass(/is-open/);
  const source = page.locator('[data-milonga-detail] a', { hasText: 'Open on Hoy Milonga' });
  if ((await source.count()) > 0) {
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(source).toHaveAttribute('rel', /noopener/);
  }

  if (isMobile(testInfo)) {
    const box = await page.locator('.app-detail').boundingBox();
    expect(box!.width).toBeGreaterThan(page.viewportSize()!.width * 0.9);
  }

  await page.locator('[data-milonga-close]').click();
  await expect(page.locator('.app-detail')).not.toHaveClass(/is-open/);
  await expect(page.locator('[data-milonga-detail]')).toContainText('Pick a milonga');

  await item.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-detail')).not.toHaveClass(/is-open/);
});

test('day tabs filter the list', async ({ page }) => {
  await page.goto('/milongas');
  const tab = page.locator('[data-milonga-tabs] [data-day]:not([data-day=""])').first();
  await expect(tab).toBeVisible();
  const day = await tab.getAttribute('data-day');
  await tab.click();
  await expect.poll(() => searchParams(page).get('day')).toBe(day);
  await expect(tab).toHaveClass(/is-active/);
  await page.locator('[data-milonga-tabs] [data-day=""]').click();
  await expect.poll(() => searchParams(page).get('day')).toBeNull();
});

test('Turkish milongas page uses Turkish labels', async ({ page }) => {
  await page.goto('/tr/milongalar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
  await openFilters(page);
  await expect(page.locator('[data-milonga-type="practica"]')).toHaveText('Praktika');
  await expect(page.locator('[data-milonga-region] option[value="athens"]')).toHaveText('Atina');
  await expect(page.locator('[data-milonga-region] option[value="nordrhein-westfalen"]')).toHaveText('Almanya: NRW');
  await page.locator('[data-milonga-region]').selectOption('nordrhein-westfalen');
  await expect.poll(() => searchParams(page).get('region')).toBe('nordrhein-westfalen');
});

test('a failed milonga feed shows the empty state', async ({ page }) => {
  await page.route('**/hoy-milongas.json', (route) => route.abort());
  await page.goto('/milongas');
  await expect(page.locator('[data-milonga-empty]')).toBeVisible();
  await expect(page.locator('[data-milonga-id]')).toHaveCount(0);
});

test('deep link restores region and type', async ({ page }) => {
  await page.goto('/milongas?region=miami&type=practica');
  await expect(page.locator('[data-milonga-id], [data-milonga-empty]').first()).toBeVisible();
  await expect.poll(() => searchParams(page).get('region')).toBe('miami');
  await expect.poll(() => searchParams(page).get('type')).toBe('practica');
  await openFilters(page);
  await expect(page.locator('[data-milonga-region]')).toHaveValue('miami');
  await expect(page.locator('[data-milonga-type="practica"]')).toHaveClass(/is-active/);
});
