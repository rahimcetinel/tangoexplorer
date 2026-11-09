// Rainbow check: how the per-city palette behaves in a region with many cities.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://tangoexplorer.com';
const OUT = path.join('agentic-python', 'out', 'palette');
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const lum = (r, g, b) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const parse = (s) => {
  const m = /rgb\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((v) => Number(v.trim()));
  return { r, g, b };
};
const contrastWhite = (rgb) => {
  const l = lum(rgb.r, rgb.g, rgb.b);
  return +((1.05) / (l + 0.05)).toFixed(2);
};

await page.goto(BASE + '/milongas/', { waitUntil: 'networkidle', timeout: 60_000 });

const options = await page.evaluate(() =>
  [...document.querySelectorAll('.app-milonga-region select option')].map((o) => ({ value: o.value, label: o.textContent.trim() })),
);
console.log('regions: ' + options.map((o) => o.label).join(' | '));

const report = [];
for (const opt of options) {
  await page.selectOption('.app-milonga-region select', opt.value).catch(() => {});
  await page.waitForTimeout(900);
  const pills = await page.evaluate(() =>
    [...document.querySelectorAll('.app-mitem-city')].map((el) => ({
      city: el.textContent.trim(),
      bg: getComputedStyle(el).backgroundColor,
      cc: el.style.getPropertyValue('--cc'),
      size: getComputedStyle(el).fontSize,
    })),
  );
  const unique = [...new Map(pills.map((p) => [p.city, p])).values()];
  const rows = unique.map((p) => {
    const rgb = parse(p.bg) ?? { r: 0, g: 0, b: 0 };
    return { city: p.city, bg: p.bg, cc: p.cc, white: contrastWhite(rgb), size: p.size };
  });
  report.push({ region: opt.label, count: rows.length, rows });
  console.log(`\n${opt.label}: ${rows.length} cities, ${pills.length} rows`);
  for (const r of rows) console.log(`  ${r.city.padEnd(18)} ${r.cc.padEnd(22)} white ${r.white}`);
  if (rows.length >= 4 && ['İtalya', 'Almanya', 'İspanya', 'Fransa'].includes(opt.label)) {
    await page.locator('.app-milonga-list').screenshot({ path: path.join(OUT, `cities-${opt.value || 'x'}.png`) }).catch(() => {});
  }
}

await fs.writeFile(path.join(OUT, 'city-colours.json'), JSON.stringify(report, null, 2));
await browser.close();
