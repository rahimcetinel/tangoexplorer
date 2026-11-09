// Static palette audit of the deployed site: colour inventory, contrast maths,
// and hue spread. No browser needed (the sandbox blocks Chromium IPC).
// Usage: node agentic-python/palette-static.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://tangoexplorer.com';
const OUT = path.join('agentic-python', 'out', 'palette');
await fs.mkdir(OUT, { recursive: true });

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 palette-audit' } });
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
};

const home = await get(BASE + '/');
await fs.writeFile(path.join(OUT, 'home.html'), home.text);

const cssLinks = [...home.text.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const inlineStyles = [...home.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const cssFiles = [];
for (const href of cssLinks) {
  const url = new URL(href, BASE).href;
  const r = await get(url);
  const name = path.basename(new URL(url).pathname) || 'style.css';
  await fs.writeFile(path.join(OUT, name), r.text);
  cssFiles.push({ url, name, status: r.status, bytes: r.text.length, text: r.text });
}

const allCss = cssFiles.map((f) => f.text).join('\n') + '\n' + inlineStyles.join('\n');

// ---------- colour helpers ----------
const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};
const hsl = ({ r, g, b }) => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l, hex: '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') };
};
const lum = ({ r, g, b }) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const l1 = lum(hexToRgb(a)), l2 = lum(hexToRgb(b));
  return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
};
const mix = (hex, over, pct) => {
  const a = hexToRgb(hex), o = hexToRgb(over);
  return '#' + ['r', 'g', 'b'].map((k) => Math.round(a[k] * pct + o[k] * (1 - pct)).toString(16).padStart(2, '0')).join('');
};

// ---------- token extraction ----------
const tokens = {};
for (const m of allCss.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) tokens[m[1]] = m[2];
const surfaces = {};
for (const m of allCss.matchAll(/--(surface|surface-muted|line|cc):\s*([^;]+);/g)) surfaces[m[1]] = m[2].trim();

// ---------- hex usage frequency ----------
const hexCount = new Map();
for (const m of allCss.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
  const h = m[0].toLowerCase();
  hexCount.set(h, (hexCount.get(h) ?? 0) + 1);
}
const colourRows = [...hexCount.entries()]
  .map(([hex, count]) => ({ hex, count, ...hsl(hexToRgb(hex)) }))
  .sort((a, b) => b.count - a.count);

const chromatic = colourRows.filter((c) => c.s > 0.15 && c.l > 0.05 && c.l < 0.97);
const neutrals = colourRows.filter((c) => !(c.s > 0.15 && c.l > 0.05 && c.l < 0.97));

// Distinct accent hues (chromatic, >=2 uses) and how far apart they are.
const accents = chromatic.filter((c) => c.count >= 2);
const hueList = accents.map((c) => ({ ...c, hue: Math.round(c.h) })).sort((a, b) => a.hue - b.hue);

// ---------- contrast checks ----------
const checks = [
  ['ink on cream', tokens.ink ?? '#1e1a17', '#faf6f2', 'body copy'],
  ['ink-soft on cream', tokens['ink-soft'] ?? '#6b5e54', '#faf6f2', 'lede / meta'],
  ['ink-soft on white', tokens['ink-soft'] ?? '#6b5e54', '#ffffff', 'drawer meta'],
  ['ink-soft on surface-muted', tokens['ink-soft'] ?? '#6b5e54', '#f0e8de', 'hover rows'],
  ['gold on white', tokens.gold ?? '#9a7230', '#ffffff', 'category label 8.8px'],
  ['gold on cream', tokens.gold ?? '#9a7230', '#faf6f2', 'crumb kicker'],
  ['burgundy on white', tokens.burgundy ?? '#a83250', '#ffffff', 'links'],
  ['burgundy on cream', tokens.burgundy ?? '#a83250', '#faf6f2', 'kicker'],
  ['indigo on white', tokens.indigo ?? '#5a2d82', '#ffffff', 'override accents'],
  ['indigo on cream', tokens.indigo ?? '#5a2d82', '#faf6f2', 'times, links'],
  ['white on burgundy', '#ffffff', tokens.burgundy ?? '#a83250', 'badge'],
  ['white on indigo', '#ffffff', tokens.indigo ?? '#5a2d82', 'active nav'],
  ['white on orange', '#ffffff', tokens.orange ?? '#d15a28', 'TODAY badge'],
  ['white on teal', '#ffffff', tokens.teal ?? '#1a8a7a', 'milonga tag'],
  ['orange on white', tokens.orange ?? '#d15a28', '#ffffff', 'practica tag 9.6px'],
  ['teal on white', tokens.teal ?? '#1a8a7a', '#ffffff', 'milonga tag 9.6px'],
  ['rule on cream', tokens.rule ?? '#e4d8cc', '#faf6f2', 'hairlines'],
  ['rule on white', tokens.rule ?? '#e4d8cc', '#ffffff', 'card borders'],
];
const contrastTable = checks.map(([label, fg, bg, where]) => ({
  label, fg, bg, where, ratio: contrast(fg, bg), passAA: contrast(fg, bg) >= 4.5,
}));

// Country palette: white text on a solid pill, as .app-mitem-city renders it.
const COUNTRY_PALETTE = ['#b91c1c','#c2410c','#a16207','#4d7c0f','#15803d','#0f766e','#0e7490','#0369a1','#1d4ed8','#4338ca','#6d28d9','#a21caf','#be185d','#9f1239','#78350f','#334155'];
const countryTable = COUNTRY_PALETTE.map((hex) => {
  const c = hsl(hexToRgb(hex));
  return { hex, hue: Math.round(c.h), sat: +c.s.toFixed(2), light: +c.l.toFixed(2), whiteContrast: contrast('#ffffff', hex), pillTint: mix(hex, '#ffffff', 0.12), tintContrast: contrast(hex, mix(hex, '#ffffff', 0.12)) };
});

// ---------- structural signals ----------
const signals = {
  cssFiles: cssFiles.map((f) => ({ name: f.name, status: f.status, bytes: f.bytes })),
  tokenCount: Object.keys(tokens).length,
  tokens,
  chromeTokensFound: Object.fromEntries(Object.entries(tokens)),
  colorMixCount: (allCss.match(/color-mix\(/g) ?? []).length,
  hexOccurrences: colourRows.reduce((s, c) => s + c.count, 0),
  chromaticHexes: chromatic.length,
  accentHues: hueList.map((c) => ({ hex: c.hex, hue: c.hue, count: c.count, sat: +c.s.toFixed(2), light: +c.l.toFixed(2) })),
  neutralHexes: neutrals.length,
  usesIndigoOverride: /Vivid accent layer/.test(allCss),
  gradientBurgundyGold: /linear-gradient\(135deg,\s*var\(--color-burgundy\),\s*var\(--color-gold\)/.test(allCss),
  smallestAccentFontRem: (() => {
    const sizes = [...allCss.matchAll(/font-size:\s*(0\.\d+rem)/g)].map((m) => Number(m[1]));
    return sizes.length ? Math.min(...sizes) : null;
  })(),
};

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  status: home.status,
  contentLength: home.text.length,
  signals,
  colours: colourRows.slice(0, 60),
  contrastTable,
  countryTable,
};
await fs.writeFile(path.join(OUT, 'palette-static.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  css: signals.cssFiles,
  tokens: signals.tokens,
  hexOccurrences: signals.hexOccurrences,
  chromaticHexes: signals.chromaticHexes,
  neutralHexes: signals.neutralHexes,
  accentHues: signals.accentHues,
  colorMixCount: signals.colorMixCount,
  smallestAccentFontRem: signals.smallestAccentFontRem,
  contrast: contrastTable,
  countryTable,
}, null, 2));
console.log('report: ' + path.join(OUT, 'palette-static.json'));
