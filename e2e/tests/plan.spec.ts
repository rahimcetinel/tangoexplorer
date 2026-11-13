import { expect, test } from '@playwright/test';

function nextFriday(): string {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + ((5 - day + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type PlanEvent = { st: string; en: string; ci: string };
type PlanMilonga = { c: string; d: string[] };

// The planner's content changes every day, so the specs read the city-plus-dates
// straight from the embedded payload instead of hardcoding a fixture that will
// eventually have no events (Istanbul in this window had none on 2026-11-13).
async function firstEventTarget(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = JSON.parse(
      document.querySelector('[data-plan-events]')?.textContent ?? '[]',
    ) as { st: string; en: string; ci: string }[];
    const event = raw.find((item) => item.st && item.ci);
    return event ? { city: event.ci, start: event.st, end: event.en || event.st } : null;
  });
}

async function cityWithFridayMilonga(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = JSON.parse(
      document.querySelector('[data-plan-milongas]')?.textContent ?? '[]',
    ) as { c: string; d: string[] }[];
    const milonga = raw.find((item) => item.c && Array.isArray(item.d) && item.d.includes('friday'));
    return milonga?.c ?? null;
  });
}

test('the planner combines events and milongas for a city and a date range', async ({ page }) => {
  await page.goto('/plan');
  const target = await firstEventTarget(page);
  expect(target).not.toBeNull();
  await page.goto(
    `/plan?city=${encodeURIComponent(target!.city)}&start=${target!.start}&end=${target!.end}`,
  );
  await expect(page.locator('h1')).toHaveText('Plan a tango experience');
  await expect(page.locator('[data-plan-summary]')).toContainText(`in ${target!.city}`);
  await expect(page.locator('.app-plan-section').first().locator('.app-plan-item-title').first()).toBeVisible();
  await expect(page.locator('.app-plan-day').first()).toBeVisible();
});

test('the planner takes a start and an end date', async ({ page }) => {
  await page.goto('/plan');
  const city = await cityWithFridayMilonga(page);
  expect(city).not.toBeNull();
  const start = nextFriday();
  const end = plusDays(start, 2);
  await page.goto(`/plan?city=${encodeURIComponent(city!)}&start=${start}&end=${end}`);
  await expect(page.locator('[data-plan-start]')).toHaveValue(start);
  await expect(page.locator('[data-plan-end]')).toHaveValue(end);
  await expect(page.locator('[data-plan-summary]')).toContainText(`in ${city!}`);
  await expect(page.locator('.app-plan-day').first()).toContainText('Friday');
  await expect(page).toHaveURL(new RegExp(`start=${start}&end=${end}`));
});

test('the city field suggests a short list, not the whole dictionary', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.locator('datalist')).toHaveCount(0);
  await page.locator('[data-plan-city]').fill('ber');
  const options = page.locator('[data-plan-suggest] .app-suggest-item');
  await expect(options.first()).toBeVisible();
  // At most eight rows, however many cities the dataset holds this week.
  const count = await options.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(8);
  await options.first().click();
  await expect(page.locator('[data-plan-city]')).toHaveValue(/^Ber/i);
  await expect(page.locator('[data-plan-suggest]')).toBeHidden();
});

test('changing a date after the results are shown re-renders them', async ({ page }) => {
  const start = nextFriday();
  await page.goto(`/plan?city=Berlin&start=${start}&end=${plusDays(start, 2)}`);
  const summary = page.locator('[data-plan-summary]');
  await expect(summary).toContainText('in Berlin');
  const before = (await summary.textContent()) ?? '';
  await page.locator('[data-plan-end]').fill(plusDays(start, 6));
  await expect(summary).not.toHaveText(before);
  await expect(page.locator('[data-plan-end]')).toHaveValue(plusDays(start, 6));
});

test('an end date before the start clamps to the start', async ({ page }) => {
  const start = nextFriday();
  await page.goto(`/plan?city=Berlin&start=${start}&end=${plusDays(start, 2)}`);
  await page.locator('[data-plan-end]').fill(plusDays(start, -3));
  await expect(page.locator('[data-plan-end]')).toHaveValue(start);
  await expect(page.locator('[data-plan-start]')).toHaveValue(start);
});

test('a planner event opens in the side panel, not a new page', async ({ page }) => {
  await page.goto('/plan');
  // Pick a city/date pair straight from the embedded payload so the test does
  // not depend on which events happen to be in the dataset this week.
  const target = await page.evaluate(() => {
    const raw = JSON.parse(document.querySelector('[data-plan-events]')?.textContent ?? '[]') as {
      st: string;
      en: string;
      ci: string;
    }[];
    const event = raw.find((item) => item.st && item.ci);
    return event ? { city: event.ci, start: event.st, end: event.en || event.st } : null;
  });
  expect(target).not.toBeNull();
  await page.goto(
    `/plan?city=${encodeURIComponent(target!.city)}&start=${target!.start}&end=${target!.end}`,
  );

  const panel = page.locator('[data-detail-panel]');
  await expect(panel).toHaveCount(1);
  await expect(panel).not.toHaveClass(/is-open/);

  await page.locator('.app-plan-section a[data-detail-link]').first().click();
  await expect(panel).toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/news\//);
  await expect(panel.locator('[data-article-frame]')).not.toBeEmpty();

  await page.locator('[data-detail-close]').click();
  await expect(panel).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/plan\?/);
});

test('the planner asks for a city first', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.locator('.app-plan-hint')).toContainText('Istanbul');
  await page.locator('[data-plan-example="Berlin"]').click();
  await expect(page.locator('[data-plan-city]')).toHaveValue('Berlin');
  await expect(page).toHaveURL(/city=Berlin/);
});
