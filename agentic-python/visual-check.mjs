// Live visual smoke check: screenshots + layout assertions.
// Usage: node agentic-python/visual-check.mjs
// Output: agentic-python/out/visual/*.png + report JSON on stdout.
//
// Browser: PW_WS_ENDPOINT, else the endpoint printed by start-dsh.cmd in
// .logs/playwright-server.log, else a browser launched in-process (needs full
// sandbox access). The external server route needs no extra sandbox permission.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://tangoexplorer.com';
const OUT = path.join('agentic-python', 'out', 'visual');
const SERVER_LOG = path.join('.logs', 'playwright-server.log');

async function externalEndpoint() {
  if (process.env.PW_WS_ENDPOINT) return process.env.PW_WS_ENDPOINT;
  try {
    const log = await fs.readFile(SERVER_LOG, 'utf8');
    const m = /Listening on (ws:\/\/\S+)/.exec(log);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

const SHOTS = [
  { name: 'home-mobile', path: '/', viewport: { width: 390, height: 844 } },
  { name: 'milongas-mobile', path: '/milongas/', viewport: { width: 390, height: 844 } },
  { name: 'milongas-tr-mobile', path: '/tr/milongalar/', viewport: { width: 390, height: 844 } },
  { name: 'home-desktop', path: '/', viewport: { width: 1440, height: 900 } },
  { name: 'milongas-desktop', path: '/milongas/', viewport: { width: 1440, height: 900 } },
];

await fs.mkdir(OUT, { recursive: true });

const browser = await (async () => {
  const endpoint = await externalEndpoint();
  if (endpoint) {
    console.error(`[visual] connecting to ${endpoint}`);
    return chromium.connect(endpoint);
  }
  console.error('[visual] no server endpoint; launching locally');
  return chromium.launch();
})();

const report = [];
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: shot.viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  await page.goto(BASE + shot.path, { waitUntil: 'networkidle', timeout: 60_000 });
  if (shot.path.includes('milonga')) {
    await page.waitForSelector('.app-mitem', { timeout: 30_000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });

  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > window.innerWidth + 1;
    // Milonga rows: the time column must not overlap the name column.
    const rows = [...document.querySelectorAll('.app-mitem')].map((row) => {
      const time = row.querySelector('.app-mitem-time');
      const body = row.querySelector('.app-mitem-body');
      if (!time || !body) return null;
      const t = time.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const style = getComputedStyle(time);
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      return {
        time: time.textContent.trim(),
        stacked: t.height > lineHeight * 1.4,
        overlapsBody: t.right > b.left + 1,
        clipped: time.scrollWidth > time.clientWidth + 1,
      };
    }).filter(Boolean);
    const overlapping = rows.filter((r) => r.overlapsBody || r.clipped);
    return {
      overflowX,
      rows: rows.length,
      rowsWithTwoLines: rows.filter((r) => r.stacked).length,
      badRows: overlapping.length,
      badSample: overlapping.slice(0, 3),
      countryOptions: document.querySelectorAll('[data-filter-select="country"] option').length,
    };
  });

  report.push({ shot: shot.name, status: 'ok', viewport: shot.viewport, ...layout, errors: errors.slice(0, 5) });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));

const problems = report.filter((r) => r.overflowX || r.badRows > 0 || r.errors.length);
if (problems.length) {
  console.log(`\n${problems.length} page(s) with layout problems`);
  process.exit(2);
}
console.log('\nall pages clean; screenshots in ' + OUT);
