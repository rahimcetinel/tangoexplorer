import { expect, test } from '@playwright/test';
import { isMobile, sharedSlug } from '../support/site';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('month columns are chronological and eager months have real cards', async ({ page }) => {
  await page.goto('/');
  const keys = await page.locator('[data-month-col]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.month ?? ''),
  );
  expect(keys.length).toBeGreaterThan(1);
  const sorted = [...keys].sort((a, b) => a.localeCompare(b));
  expect(keys).toEqual(sorted);

  const eager = page.locator('[data-month-col][data-lazy="false"]');
  await expect(eager.first()).toBeVisible();
  await expect(eager.first().locator('[data-card]').first()).toBeVisible();
  await expect(eager.first().locator('.app-card-skeleton')).toHaveCount(0);

  const lazy = page.locator('[data-month-col][data-lazy="true"]');
  if ((await lazy.count()) > 0) {
    await expect(lazy.first().locator('[data-card]')).toHaveCount(0);
    await expect(lazy.first().locator('.app-card-skeleton').first()).toBeAttached();
    const fragment = await lazy.first().getAttribute('data-fragment');
    expect(fragment).toMatch(/^\/fragments\/en\/\d{4}-\d{2}$/);
  }
});

test('month ribbon isolates one month and a second click restores the board', async ({ page }) => {
  await page.goto('/');
  const chip = page.locator('[data-month-ribbon] [data-month]').nth(1);
  await expect(chip).toBeVisible();
  const key = await chip.getAttribute('data-month');
  expect(key).toBeTruthy();
  await chip.click();
  await expect(page.locator('[data-board]')).toHaveAttribute('data-view', 'single');
  await expect(page.locator(`#col-${key}`)).toBeVisible();
  await expect(page.locator(`#col-${key} [data-card]`).first()).toBeVisible();
  await expect(page.locator('[data-month-col]:visible')).toHaveCount(1);

  await chip.click();
  await expect(page.locator('[data-board]')).toHaveAttribute('data-view', 'all');
  await expect(page.locator('[data-month-col]:visible').nth(1)).toBeVisible();
});

test('lazy month fragment hydrates into cards', async ({ page }) => {
  await page.goto('/');
  const key = await page.evaluate(() => {
    const ribbon = new Set(
      [...document.querySelectorAll('[data-month-ribbon] [data-month]')].map(
        (node) => (node as HTMLElement).dataset.month,
      ),
    );
    const column = [...document.querySelectorAll('[data-month-col][data-lazy="true"]')].find((node) =>
      ribbon.has((node as HTMLElement).dataset.month),
    );
    return column?.getAttribute('data-month') ?? '';
  });
  test.skip(!key, 'no lazy month on the ribbon');
  const column = page.locator(`#col-${key}`);
  await page.locator(`[data-month-ribbon] [data-month="${key}"]`).click();
  await expect(column).toHaveAttribute('data-lazy', 'ready');
  await expect(column.locator('[data-card]').first()).toBeVisible();
  await expect(column.locator('.app-card-skeleton')).toHaveCount(0);
});

test('arrow keys scroll the board only in the all-months view', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'mobile board grows with the page instead of scrolling inside');
  await page.goto('/');
  const board = page.locator('[data-board]');
  await board.focus();
  const before = await board.evaluate((node) => node.scrollTop);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => board.evaluate((node) => node.scrollTop)).toBeGreaterThan(before + 40);

  const chip = page.locator('[data-month-ribbon] [data-month]').first();
  await chip.click();
  await expect(board).toHaveAttribute('data-view', 'single');
  const locked = await board.evaluate((node) => node.scrollTop);
  await board.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => board.evaluate((node) => node.scrollTop)).toBe(locked);
});

test('card click opens the detail drawer without leaving the home shell', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first();
  const href = await card.getAttribute('href');
  expect(href).toMatch(/^\/news\//);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}`));
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'home');
  await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
  await expect(page.locator('[data-detail-panel]')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('[data-article-frame] [data-article] h2').first()).toBeVisible();
  await expect(page.locator('[data-card].is-selected')).toHaveCount(1);

  await page.locator('[data-detail-close]').click();
  await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(/tangoexplorer.com\/?$/);
  await expect(page.locator('[data-card].is-selected')).toHaveCount(0);
});

test('Escape, backdrop, and browser back close the drawer', async ({ page }, testInfo) => {
  await page.goto('/');
  const card = page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first();
  await card.click();
  await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);

  await card.click();
  await page.goBack();
  await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);

  if (!isMobile(testInfo)) {
    await card.click();
    await expect(page.locator('[data-detail-backdrop]')).toBeVisible();
    await page.locator('[data-detail-backdrop]').click({ position: { x: 8, y: 80 } });
    await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);
  }
});

test('modified click opens the full story in a new tab', async ({ page, context }) => {
  await page.goto('/');
  const card = page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first();
  const popupPromise = context.waitForEvent('page');
  await card.click({ modifiers: ['ControlOrMeta'] });
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/news\//);
  await expect(popup.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'page');
  await expect(popup.locator('#main h1')).toBeVisible();
  await expect(page.locator('[data-detail-panel]')).not.toHaveClass(/is-open/);
});

test('a failed story fetch shows the error and a full-page link', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first();
  const href = await card.getAttribute('href');
  await page.route('**/news/**', (route) => route.fulfill({ status: 500, body: 'fail' }));
  await card.click();
  await expect(page.locator('[data-detail-error]')).toBeVisible();
  await expect(page.locator('[data-detail-error]')).toContainText('Could not load this story');
  await expect(page.locator('[data-detail-error-link]')).toHaveAttribute('href', href!);
  await expect(page.locator('[data-detail-panel]')).toHaveClass(/is-open/);
});

test('direct story URL is a full page with source, calendar, and share', async ({ page }) => {
  const slug = await sharedSlug(page);
  await page.goto(`/news/${slug}`);
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('#main h1')).toBeVisible();
  await expect(page.locator('#main')).toContainText('Source');
  const external = page.locator('#main a[target="_blank"]');
  await expect(external.first()).toBeVisible();
  const rels = await external.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('rel') ?? ''));
  expect(rels.every((rel) => rel.includes('noopener'))).toBeTruthy();

  const calendar = page.locator('#main a[download]');
  if ((await calendar.count()) > 0) {
    await expect(calendar.first()).toHaveAttribute('href', /^data:text\/calendar/);
    await expect(page.locator('#main a[href*="calendar.google.com"]').first()).toHaveAttribute('target', '_blank');
  }

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await page.goto(`/news/${slug}`);
  const share = page.locator('#main [data-share]');
  await share.click();
  await expect(share).toHaveText('Link copied');
});

test('story language switch stays on the same slug', async ({ page }) => {
  const slug = await sharedSlug(page);
  await page.goto(`/news/${slug}`);
  await page.locator('.app-lang').getByRole('link', { name: 'TR', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tr/haber/${slug}`));
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('#main h1')).toBeVisible();
  await page.locator('.app-lang').getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/news/${slug}`));
});

test('mobile drawer fills the screen and desktop drawer stays a side panel', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('[data-month-col][data-lazy="false"] [data-detail-link]').first().click();
  const panel = page.locator('[data-detail-panel]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  if (isMobile(testInfo)) {
    expect(box!.width).toBeGreaterThan(viewport!.width * 0.9);
  } else {
    expect(box!.width).toBeLessThan(viewport!.width * 0.7);
    expect(box!.width).toBeGreaterThan(400);
  }
});

test('result click from an active filter opens that story', async ({ page }) => {
  await page.goto('/?kind=festival');
  const result = page.locator('[data-result]').first();
  await expect(result).toBeVisible();
  const href = await result.getAttribute('data-href');
  expect(href).toMatch(/^\/news\//);
  await result.click();
  await expect(page).toHaveURL(new RegExp(`${href}`));
  await expect(page.locator('[data-article-frame] [data-article]')).toBeVisible();
  await expect(result).toHaveClass(/is-active/);
});
