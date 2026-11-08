import { expect, test } from '@playwright/test';

test('every page has one h1 and no duplicate ids', async ({ page }) => {
  for (const path of ['/', '/milongas', '/about', '/search']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    const dupIds = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(dupIds, path).toEqual([]);
  }
});

test('images declare an alt attribute and controls have names', async ({ page }) => {
  for (const path of ['/', '/milongas', '/about']) {
    await page.goto(path);
    await expect(page.locator('img:not([alt])')).toHaveCount(0);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim())
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed, path).toEqual([]);
  }
});

test('keyboard focus stays visible on cards', async ({ page }) => {
  await page.goto('/');
  const card = page.locator("[data-month-col][data-lazy='false'] a[data-detail-link]").first();
  await card.focus();
  const outline = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return `${style.outlineWidth} ${style.outlineStyle}`;
  });
  expect(outline).not.toContain('0px');
  expect(outline).not.toContain('none');
});
