import { expect, test } from '@playwright/test';

test('saving an event survives a reload and appears on the saved page', async ({ page }) => {
  await page.goto('/');
  const save = page.locator('.app-ev-save').first();
  const slug = await save.getAttribute('data-save');
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.locator(`.app-ev-save[data-save="${slug}"]`).first()).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/saved');
  await expect(page.locator('.app-saved-link').first()).toBeVisible();
  await expect(page.locator('[data-saved-total]')).toHaveText('1');
  await expect(page.locator('[data-saved-ics]')).toBeVisible();

  await page.locator('[data-unsave]').first().click();
  await expect(page.locator('[data-saved-empty]')).toBeVisible();
});
