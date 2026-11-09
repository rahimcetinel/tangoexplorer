// Palette audit: screenshots + rendered-colour/contrast measurements of the
// live site, as a user actually sees it.
// Usage: node agentic-python/palette-audit.mjs            (report only)
//        node agentic-python/palette-audit.mjs --check    (exit 1 on any failure)
// Output: agentic-python/out/palette/*.png + palette-report.json
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://tangoexplorer.com';
const OUT = path.join('agentic-python', 'out', 'palette');
const SERVER_LOG = path.join('.logs', 'playwright-server.log');
const checkMode = process.argv.includes('--check');

async function externalEndpoint() {
  if (process.env.PW_WS_ENDPOINT === 'local') return null;
  if (process.env.PW_WS_ENDPOINT) return process.env.PW_WS_ENDPOINT;
  try {
    const log = await fs.readFile(SERVER_LOG, 'utf8');
    const m = /Listening on (ws:\/\/\S+)/.exec(log);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

await fs.mkdir(OUT, { recursive: true });

const endpoint = await externalEndpoint();
const browser = endpoint
  ? await chromium.connect(endpoint)
  : await chromium.launch();

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// One news URL is resolved up front so the article template is audited too.
const newsPath = await (async () => {
  const probe = await browser.newPage({ viewport: DESKTOP });
  try {
    await probe.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    return await probe.evaluate(
      () => document.querySelector('a[href*="/news/"]')?.getAttribute('href') ?? null,
    );
  } finally {
    await probe.close();
  }
})();

// Coverage: the home board, both milonga country filters (the city-badge palette
// only exists there), every secondary page, one article, and the open drawer.
const pages = [
  { name: 'home', path: '/' },
  { name: 'milongas', path: '/milongas/' },
  { name: 'milongas-italy', path: '/milongas/?region=italy' },
  { name: 'milongas-germany', path: '/milongas/?region=germany' },
  { name: 'now', path: '/now/' },
  { name: 'plan', path: '/plan/' },
  { name: 'search', path: '/search/' },
  { name: 'about', path: '/about/' },
  { name: 'saved', path: '/saved/' },
  ...(newsPath ? [{ name: 'article', path: newsPath }] : []),
  { name: 'drawer', path: '/', openDrawer: true },
];

const results = [];

for (const p of pages) {
  for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    if (p.path.startsWith('/milongas')) {
      await page.waitForSelector('.app-mitem', { timeout: 15_000 }).catch(() => {});
    }
    if (p.openDrawer) {
      await page.locator('.app-ev a').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForSelector('.app-detail.is-open', { timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(700);

    await page.screenshot({ path: path.join(OUT, `${p.name}-${label}-fold.png`) });
    if (label === 'desktop') {
      await page.screenshot({ path: path.join(OUT, `${p.name}-desktop-full.png`), fullPage: true });
    }

    // ---- contrast audit over visible text ----
    const contrast = await page.evaluate(() => {
      const parse = (s) => {
        const m = /rgba?\(([^)]+)\)/.exec(s || '');
        if (!m) return null;
        const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
      };
      const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const lum = ({ r, g, b }) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const l1 = lum(a);
        const l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const bgOf = (el) => {
        const layers = [];
        let node = el;
        while (node && node.nodeType === 1) {
          const cs = getComputedStyle(node);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return { image: true };
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0) layers.push(c);
          if (c && c.a >= 1) break;
          node = node.parentElement;
        }
        let base = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
        return base;
      };
      const selector = (el) => {
        const bits = [];
        let node = el;
        for (let i = 0; i < 4 && node && node.nodeType === 1; i += 1) {
          const cls = [...node.classList].slice(0, 2).join('.');
          bits.unshift(node.tagName.toLowerCase() + (cls ? '.' + cls : ''));
          node = node.parentElement;
        }
        return bits.join('>');
      };
      const out = [];
      const seen = new Set();
      const els = [...document.querySelectorAll('body *')].filter((el) => {
        if (el.closest('script,style,svg,head')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
        return own;
      });
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        // Element opacity dims the text too (e.g. the milonga end time at .62),
        // so fold it into the foreground alpha instead of trusting `color`.
        const opacity = Number(cs.opacity);
        if (!Number.isFinite(opacity) || opacity < 0.05) continue;
        const fg = parse(cs.color);
        const bg = bgOf(el);
        if (!fg || bg.image) continue;
        const solid = over({ ...fg, a: fg.a * opacity }, bg);
        const cr = ratio(solid, bg);
        const size = Number.parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const min = large ? 3 : 4.5;
        if (cr < min - 0.05) {
          const key = selector(el) + cs.color + cs.backgroundColor + size;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            sel: selector(el),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
            color: cs.color,
            opacity,
            bg: `rgb(${bg.r.toFixed(0)}, ${bg.g.toFixed(0)}, ${bg.b.toFixed(0)})`,
            size: +size.toFixed(1),
            weight,
            ratio: +cr.toFixed(2),
            min,
          });
        }
      }
      return out.sort((a, b) => a.ratio - b.ratio).slice(0, 40);
    });

    // ---- rendered pixel palette (fold only) ----
    const shot = await page.screenshot();
    const pixels = await page.evaluate(async (b64) => {
      const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 600 / bmp.width);
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const counts = new Map();
      let satSum = 0;
      let lightSum = 0;
      let n = 0;
      const hueBins = new Array(12).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const cur = counts.get(key) || [0, 0, 0, 0];
        cur[0] += 1;
        cur[1] += r;
        cur[2] += g;
        cur[3] += b;
        counts.set(key, cur);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 510;
        const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
        satSum += Number.isFinite(s) ? s : 0;
        lightSum += l;
        n += 1;
        if (s > 0.18 && l > 0.12 && l < 0.9) {
          let hue;
          if (max === r) hue = ((g - b) / (max - min)) % 6;
          else if (max === g) hue = (b - r) / (max - min) + 2;
          else hue = (r - g) / (max - min) + 4;
          hue = (hue * 60 + 360) % 360;
          hueBins[Math.floor(hue / 30)] += 1;
        }
      }
      const top = [...counts.values()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 14)
        .map((c) => ({
          hex:
            '#' +
            [c[1] / c[0], c[2] / c[0], c[3] / c[0]]
              .map((v) => Math.round(v).toString(16).padStart(2, '0'))
              .join(''),
          share: +((c[0] / n) * 100).toFixed(1),
        }));
      return {
        meanSaturation: +(satSum / n).toFixed(3),
        meanLightness: +(lightSum / n).toFixed(3),
        hueBins,
        top,
      };
    }, shot.toString('base64'));

    results.push({ page: p.name, device: label, contrast, pixels });
    await page.close();
  }
}

// ---- token inventory straight from :root ----
const tokenPage = await browser.newPage({ viewport: DESKTOP });
await tokenPage.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
const tokens = await tokenPage.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const names = [
    'color-cream',
    'color-paper',
    'color-ink',
    'color-ink-soft',
    'color-accent',
    'color-accent-dark',
    'color-orange',
    'color-teal',
    'color-rule',
    'color-rule-strong',
    'surface-muted',
    // removed by the palette cleanup; present only on an older deploy
    'color-burgundy',
    'color-burgundy-dark',
    'color-gold',
    'color-indigo',
  ];
  return names.map((n) => ({ name: n, value: cs.getPropertyValue('--' + n).trim() || null }));
});
await tokenPage.close();

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  check: checkMode,
  tokens,
  pages: results,
};
await fs.writeFile(path.join(OUT, 'palette-report.json'), JSON.stringify(report, null, 2));

const summary = results.map((r) => ({
  page: r.page,
  device: r.device,
  meanSaturation: r.pixels.meanSaturation,
  meanLightness: r.pixels.meanLightness,
  worstContrast: r.contrast[0]?.ratio,
  flagged: r.contrast.length,
}));
console.log(JSON.stringify({ tokens, summary }, null, 2));

const failures = results.flatMap((r) => r.contrast.map((c) => ({ ...c, page: r.page, device: r.device })));
if (failures.length) {
  console.log(`\n${failures.length} kontrast ihlali:`);
  for (const f of failures.sort((a, b) => a.ratio - b.ratio).slice(0, 20)) {
    console.log(`  ${f.ratio} < ${f.min}  ${f.page}/${f.device}  ${f.size}px  "${f.text}"  (${f.sel})`);
  }
} else {
  console.log('\nkontrast ihlali yok');
}
console.log('report: ' + path.join(OUT, 'palette-report.json'));

// Gate mode: CI fails when any audited page has a contrast failure.
if (checkMode && failures.length) {
  console.error(`\n[check] ${failures.length} ihlal — kırmızı`);
  process.exit(1);
}
