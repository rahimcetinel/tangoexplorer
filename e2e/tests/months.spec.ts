import { expect, test } from '@playwright/test';

test('a month deep link opens that month alone', async ({ page }) => {
  await page.goto('/?month=2026-12');
  await expect(page.locator('[data-board]')).toHaveAttribute('data-view', 'single');
  await expect(page.locator('.app-mchip.is-active')).toContainText('Dec 2026');
  await expect(page.locator('[data-month-all]')).toBeVisible();
  await expect(page.locator('[data-month-col].is-month-active')).toHaveAttribute('data-month', '2026-12');
});

test('month arrows move to the previous and next month', async ({ page }) => {
  await page.goto('/?month=2026-12');
  await expect(page.locator('[data-board]')).toHaveAttribute('data-view', 'single');
  await page.locator('[data-month-step="1"]').click();
  await expect(page).toHaveURL(/month=2027-01/, { timeout: 20_000 });
  await expect(page.locator('.app-mchip.is-active')).toContainText('Jan 2027', { timeout: 20_000 });
  await page.locator('[data-month-step="-1"]').click();
  await expect(page).toHaveURL(/month=2026-12/, { timeout: 20_000 });
});

test('all-months clears the month focus', async ({ page }) => {
  await page.goto('/?month=2026-12');
  await page.locator('[data-month-all]').click();
  await expect(page).not.toHaveURL(/month=/);
  await expect(page.locator('[data-board]')).toHaveAttribute('data-view', 'all');
});
