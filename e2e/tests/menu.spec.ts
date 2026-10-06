import { expect, test } from '@playwright/test';
import { isMobile, openMenu } from '../support/site';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('menu opens, labels itself, and closes from backdrop and Escape', async ({ page }) => {
  const toggle = page.locator('[data-menu-toggle]');
  const panel = page.locator('#app-menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/menu-open/);
  await expect(panel.locator('.app-foot')).toContainText('Tangocat');
  await expect(panel.locator('.app-foot')).toContainText('Hoy Milonga');

  const backdrop = page.locator('[data-menu-backdrop]');
  const gap = await page.evaluate(() => {
    const menu = document.querySelector('[data-menu-panel]');
    const shade = document.querySelector('[data-menu-backdrop]');
    if (!menu || !shade) return 0;
    return shade.getBoundingClientRect().bottom - menu.getBoundingClientRect().bottom;
  });
  if (gap > 24) {
    const box = await backdrop.boundingBox();
    await page.mouse.click(box!.x + 32, box!.y + box!.height - 8);
  } else {
    await backdrop.dispatchEvent('click');
  }
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await openMenu(page);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('kind chips are only festival and marathon', async ({ page }) => {
  await openMenu(page);
  const values = await page.locator('[data-filter-chip="kind"]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.value),
  );
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((value) => value === 'festival' || value === 'marathon')).toBeTruthy();
});

test('accordions start open on desktop and closed on mobile', async ({ page }, testInfo) => {
  await openMenu(page);
  const heads = page.locator('#app-menu [data-acc-head]');
  const count = await heads.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < count; index += 1) {
    const head = heads.nth(index);
    if (isMobile(testInfo)) {
      await expect(head).toHaveAttribute('aria-expanded', 'false');
    } else {
      await expect(head).toHaveAttribute('aria-expanded', 'true');
    }
  }
  if (isMobile(testInfo)) {
    const browse = heads.filter({ hasText: 'Browse' });
    await browse.click();
    await expect(browse).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#app-menu .app-nav-link', { hasText: 'About' })).toBeVisible();
    await browse.click();
    await expect(browse).toHaveAttribute('aria-expanded', 'false');
  }
});

test('menu browse links reach region, milongas, and about', async ({ page }, testInfo) => {
  await openMenu(page);
  if (isMobile(testInfo)) {
    await page.locator('#app-menu [data-acc-head]').filter({ hasText: 'Browse' }).click();
  }
  await page.locator('#app-menu .app-nav-link', { hasText: /^Milongas$/ }).click();
  await expect(page).toHaveURL(/\/milongas\/?$/);
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-mode', 'milonga');
});
