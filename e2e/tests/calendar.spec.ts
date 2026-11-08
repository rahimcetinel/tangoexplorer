import { expect, test } from '@playwright/test';

test('calendar feeds list events as ICS', async ({ request }) => {
  const all = await request.get('/cal/all.ics');
  expect(all.ok()).toBeTruthy();
  expect(all.headers()['content-type']).toContain('text/calendar');
  const text = await all.text();
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('BEGIN:VEVENT');
  expect(text).toContain('DTSTART;VALUE=DATE:');

  const turkey = await request.get('/cal/turkiye.ics');
  expect(turkey.ok()).toBeTruthy();
  expect(await turkey.text()).toContain('BEGIN:VEVENT');
});
