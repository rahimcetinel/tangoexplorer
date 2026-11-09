// Detail pass: computed-colour histogram + 2x crops of the parts that carry the
// palette (header, card, milonga rows, facts box).
// Usage: PW_WS_ENDPOINT=local node agentic-python/palette-detail.mjs
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://tangoexplorer.com';
const OUT = path.join('agentic-python', 'out', 'palette');
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const histogram = async () =>
  page.evaluate(() => {
    const text = new Map();
    const bg = new Map();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden') continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (hasText) {
        const key = cs.color;
        const cur = text.get(key) ?? { color: key, count: 0, sizes: new Set(), sample: '' };
        cur.count += 1;
        cur.sizes.add(Math.round(parseFloat(cs.fontSize) * 10) / 10);
        if (!cur.sample) cur.sample = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
        text.set(key, cur);
      }
      const b = cs.backgroundColor;
      if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') {
        const cur = bg.get(b) ?? { color: b, count: 0, sample: '' };
        cur.count += 1;
        if (!cur.sample && el.className) cur.sample = String(el.className).slice(0, 40);
        bg.set(b, cur);
      }
    }
    const fmt = (m) =>
      [...m.values()]
        .map((v) => ({ color: v.color, count: v.count, sizes: v.sizes ? [...v.sizes].sort((a, b) => a - b) : [], sample: v.sample }))
        .sort((a, b) => b.count - a.count);
    return { text: fmt(text), bg: fmt(bg) };
  });

const shot = async (name, selector) => {
  const el = page.locator(selector).first();
  if (await el.count()) {
    await el.screenshot({ path: path.join(OUT, `crop-${name}.png`) }).catch(() => {});
  }
};

const out = {};

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
out.home = await histogram();
await shot('header', 'header, .app-topbar');
await shot('home-card', '.app-ev');
await shot('home-ribbon', '.app-ribbon, [class*="ribbon"]');
await shot('home-hero', '.app-hero');

await page.goto(BASE + '/milongas/', { waitUntil: 'networkidle', timeout: 60_000 });
out.milongas = await histogram();
await shot('milonga-rows', '.app-milonga-list');
await shot('milonga-toolbar', '.app-milonga-toolbar');

const articleHref = await page.evaluate(() => document.querySelector('a[href*="/news/"]')?.getAttribute('href') ?? null);
if (articleHref) {
  await page.goto(new URL(articleHref, BASE).href, { waitUntil: 'networkidle', timeout: 60_000 });
  out.article = await histogram();
  await shot('article-head', '.app-article');
}

await fs.writeFile(path.join(OUT, 'palette-detail.json'), JSON.stringify(out, null, 2));
await browser.close();
console.log(JSON.stringify({
  homeText: out.home.text.slice(0, 14),
  homeBg: out.home.bg.slice(0, 12),
  milongasText: out.milongas.text.slice(0, 14),
  articleText: out.article?.text.slice(0, 10) ?? [],
}, null, 2));
