import { expect, test } from '@playwright/test';

test('an Istanbul event lists the city milongas that run during it', async ({ page, request }) => {
  const response = await request.get('/search-index.json');
  const items = (await response.json()) as { s: string; ci?: string; st?: string }[];
  const today = new Date().toISOString().slice(0, 10);
  const event = items.find((item) => item.ci === 'Istanbul' && item.st && item.st > today);
  test.skip(!event, 'no upcoming Istanbul event in the index');

  await page.goto(`/news/${event!.s}`);
  const section = page.locator('.app-ev-milongas');
  await expect(section).toBeVisible();
  await expect(section.locator('.app-ev-milonga-day').first()).toBeVisible();
  await expect(section.locator('.app-ev-milongas-all')).toHaveAttribute('href', /city=Istanbul/);
});
