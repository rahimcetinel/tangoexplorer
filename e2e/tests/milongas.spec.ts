import { expect, test } from '@playwright/test';
import { NO_MATCH, focusSearch, isMobile, openFilters, searchParams } from '../support/site';

test('milonga JSON is public and the page opens on a country', async ({ page, request }) => {
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
  // The edge preselects the visitor's country, so a ?region=… parameter is
  // expected on Cloudflare; locally the page falls back to the Türkiye default.
  await expect(page.locator('[data-milonga-region-top]')).not.toHaveValue('');
  await expect(page.locator('[data-milonga-tabs] [data-day=""]')).toHaveClass(/is-active/);
});

test('the toolbar surfaces cities and the country switch', async ({ page }) => {
  await page.goto('/milongas?region=germany');
  const berlin = page.locator('[data-milonga-city-chip="Berlin"]');
  await expect(berlin).toBeVisible();
  await berlin.click();
  await expect.poll(() => searchParams(page).get('city')).toBe('Berlin');
  await expect(page.locator('.app-mitem-city').first()).toHaveText('Berlin');
  await expect(page.locator('[data-milonga-total]')).toHaveText(/^\d+$/);

  await page.locator('[data-milonga-region-top]').selectOption('turkiye');
  await expect.poll(() => searchParams(page).get('region')).toBeNull();
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
});

test('the German source fills Frankfurt and names its source', async ({ page }) => {
  await page.goto('/milongas?region=germany&city=Frankfurt');
  const item = page.locator('[data-milonga-id]', { hasText: 'Noche Azul' });
  await expect(item).toBeVisible();
  await expect(page.locator('[data-milonga-region]')).toHaveValue('germany');

  await item.click();
  await expect(page.locator('[data-milonga-detail] .app-source a')).toHaveAttribute(
    'href',
    /tango-calendar\.de/,
  );
});

test('region, city, day, and type filters rewrite the URL', async ({ page }) => {
  await page.goto('/milongas');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
  await openFilters(page);

  await page.locator('[data-milonga-region]').selectOption('germany');
  await expect.poll(() => searchParams(page).get('region')).toBe('germany');
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

test('clear drops day, type, city, and query but keeps the country', async ({ page }) => {
  await page.goto('/milongas?region=greece&day=friday&type=milonga');
  await expect(page.locator('[data-milonga-id], [data-milonga-empty]').first()).toBeVisible();
  await openFilters(page);
  await page.locator('[data-milonga-clear]').click();
  await expect.poll(() => searchParams(page).get('region')).toBe('greece');
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
  const source = page.locator('[data-milonga-detail] a', { hasText: 'Open source page' });
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

test('the milonga list is server-rendered before JavaScript runs', async ({ request }) => {
  const html = await (await request.get('/milongas')).text();
  expect(html).toContain('data-milonga-id');
  expect(html).toContain('app-mgroup-head');
  expect(html).toContain('data-milonga-data');
});

test('deep link restores country and type', async ({ page }) => {
  await page.goto('/milongas?region=united-states&type=practica');
  await expect(page.locator('[data-milonga-id], [data-milonga-empty]').first()).toBeVisible();
  await expect.poll(() => searchParams(page).get('region')).toBe('united-states');
  await expect.poll(() => searchParams(page).get('type')).toBe('practica');
  await openFilters(page);
  await expect(page.locator('[data-milonga-region]')).toHaveValue('united-states');
  await expect(page.locator('[data-milonga-type="practica"]')).toHaveClass(/is-active/);
});

test('legacy region links still resolve to a country', async ({ page }) => {
  await page.goto('/milongas?region=berlin');
  await expect.poll(() => searchParams(page).get('region')).toBe('germany');
  await expect(page.locator('[data-milonga-region]')).toHaveValue('germany');
  await expect(page.locator('[data-milonga-id]').first()).toBeVisible();
});

test('the Swedish source fills Stockholm and names its source', async ({ page }) => {
  await page.goto('/milongas?region=sweden');
  const item = page.locator('[data-milonga-id]').first();
  await expect(item).toBeVisible();
  await expect(page.locator('[data-milonga-region]')).toHaveValue('sweden');
  await item.click();
  await expect(page.locator('[data-milonga-detail] .app-source a')).toHaveAttribute(
    'href',
    /tangokalendern\.se/,
  );
});
