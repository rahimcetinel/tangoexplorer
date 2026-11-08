import { expect, test } from '@playwright/test';

function nextFriday(): string {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + ((5 - day + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

test('the planner combines events and milongas for a city weekend', async ({ page }) => {
  await page.goto(`/plan?city=Istanbul&weekend=${nextFriday()}`);
  await expect(page.locator('[data-plan-summary]')).toContainText('in Istanbul');
  await expect(page.locator('.app-plan-section').first().locator('.app-plan-item-title').first()).toBeVisible();
  await expect(page.locator('.app-plan-day').first()).toBeVisible();
  await expect(page.locator('.app-plan-section').nth(1)).toContainText('Friday');
});

test('the planner asks for a city first', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.locator('.app-plan-hint')).toContainText('Istanbul');
  await page.locator('[data-plan-example="Berlin"]').click();
  await expect(page.locator('[data-plan-city]')).toHaveValue('Berlin');
  await expect(page).toHaveURL(/city=Berlin/);
});
