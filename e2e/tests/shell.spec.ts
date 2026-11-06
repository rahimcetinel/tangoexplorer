import { expect, test } from '@playwright/test';
import { isMobile } from '../support/site';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('home renders the English shell', async ({ page }) => {
  await expect(page).toHaveTitle(/TangoExplorer/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'home');
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-locale', 'en');
  await expect(page.locator('.app-brand')).toHaveText(/Tango\s*Explorer/);
  await expect(page.locator('.app-topbar-date')).not.toBeEmpty();
  await expect(page.locator('h1#hero-title')).toHaveText('Find your next tango weekend');
  await expect(page.locator('.app-hero-search input[name="q"]')).toBeVisible();
  await expect(page.locator('[data-board]')).toBeVisible();
  await expect(page.locator('[data-month-ribbon]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tangoexplorer.com/');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'TangoExplorer');
  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(jsonLd).toContain('TangoExplorer');
});

test('self-hosted fonts load and Google Fonts is not requested', async ({ page }) => {
  const google: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('fonts.googleapis.com') || request.url().includes('fonts.gstatic.com')) {
      google.push(request.url());
    }
  });
  await page.goto('/');
  await expect(page.locator('link[rel="preload"][href="/fonts/fraunces-latin.woff2"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][href="/fonts/inter-latin.woff2"]')).toHaveCount(1);
  expect(google).toEqual([]);
});

test('skip link is the first tab stop', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#main');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('desktop shows top nav and search; mobile hides them', async ({ page }, testInfo) => {
  const nav = page.locator('.app-topnav');
  const search = page.locator('.app-topbar [data-search-input]');
  if (isMobile(testInfo)) {
    await expect(nav).toBeHidden();
    await expect(search).toBeHidden();
  } else {
    await expect(nav).toBeVisible();
    await expect(search).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await expect(nav.getByRole('link', { name: 'Turkey' })).toHaveAttribute('href', '/region/turkiye');
    await expect(nav.getByRole('link', { name: 'Milongas' })).toHaveAttribute('href', '/milongas');
    await expect(nav.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    await expect(nav.locator('summary')).toHaveText(/Regions/);
  }
});

test('the regions menu groups the world into browseable clusters', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'the regions menu is desktop-only');
  const nav = page.locator('.app-topnav');
  await nav.locator('summary').click();
  const links = nav.locator('.app-regions-panel a');
  await expect(links).toHaveCount(6);
  await expect(nav.locator('.app-regions-panel a', { hasText: 'Balkans' })).toHaveAttribute(
    'href',
    '/region/balkans',
  );
  await expect(nav.locator('.app-regions-panel a', { hasText: 'Middle East & Africa' })).toHaveAttribute(
    'href',
    '/region/middle-east',
  );
});

test('active section is marked in the top nav', async ({ page }) => {
  await page.goto('/milongas');
  await expect(page.locator('.app-topnav a', { hasText: /^Milongas$/ })).toHaveClass(/is-active/);
  await page.goto('/about');
  await expect(page.locator('.app-topnav a', { hasText: /^About$/ })).toHaveClass(/is-active/);
  await page.goto('/region/europe');
  await expect(page.locator('.app-topnav summary')).toHaveClass(/is-active/);
});
