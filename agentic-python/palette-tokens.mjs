// Offline palette gate: reads src/styles/global.css, checks the token set, the
// contrast matrix, forbidden leftovers and micro-label sizes. No browser needed,
// so it runs in CI and in a sandbox where Chromium IPC is blocked.
//
// Usage:
//   node agentic-python/palette-tokens.mjs                 # gate, exit 1 on error
//   node agentic-python/palette-tokens.mjs --label before   # writes tokens-before.json
//   node agentic-python/palette-tokens.mjs --json           # machine readable only
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.join('src', 'styles', 'global.css');
const OUT_DIR = path.join('agentic-python', 'out', 'palette');
const args = process.argv.slice(2);
const labelArg = args.find((a) => a.startsWith('--label='));
const label = labelArg ? labelArg.split('=')[1] : null;
const jsonOnly = args.includes('--json');

const css = fs.readFileSync(CSS_PATH, 'utf8');

/* ---------- colour maths ---------- */
const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};
const lum = ({ r, g, b }) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [l1, l2] = [lum(hexToRgb(a)), lum(hexToRgb(b))];
  return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
};

/* ---------- token extraction ---------- */
const themeBlock = (css.match(/@theme\s*\{([\s\S]*?)\n\}/) ?? [, ''])[1];
const rootBlock = (css.match(/:root\s*\{([\s\S]*?)\n\}/) ?? [, ''])[1];
const tokens = {};
for (const m of themeBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) tokens[m[1]] = m[2];
const root = {};
for (const m of rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) root[m[1]] = m[2].trim();

/* ---------- expected vocabulary ---------- */
const REQUIRED = [
  '--color-cream', '--color-paper', '--color-ink', '--color-ink-soft',
  '--color-accent', '--color-accent-dark', '--color-orange', '--color-teal',
  '--color-rule', '--color-rule-strong',
];
const FORBIDDEN = ['--color-burgundy', '--color-burgundy-dark', '--color-gold', '--color-indigo'];
const FORBIDDEN_HEX = ['#a83250', '#8a2640'];

const errors = [];
const warnings = [];

/* 1. token vocabulary */
for (const t of REQUIRED) if (!tokens[t]) errors.push(`eksik token: ${t}`);
for (const t of FORBIDDEN) if (tokens[t]) errors.push(`kaldırılması gereken token hâlâ var: ${t}`);

/* 2. contrast matrix */
const T = tokens;
const matrix = [
  ['ink / cream', T['--color-ink'], T['--color-cream'], 4.5, 'gövde metni'],
  ['ink-soft / cream', T['--color-ink-soft'], T['--color-cream'], 4.5, 'meta, ikincil'],
  ['ink-soft / paper', T['--color-ink-soft'], T['--color-paper'], 4.5, 'çekmece meta'],
  ['ink-soft / muted', T['--color-ink-soft'], root['--surface-muted'], 4.5, 'hover satır'],
  ['accent / cream', T['--color-accent'], T['--color-cream'], 4.5, 'bağlantı, saat, tarih'],
  ['accent / paper', T['--color-accent'], T['--color-paper'], 4.5, 'kart üstü bağlantı'],
  ['white / accent', '#ffffff', T['--color-accent'], 4.5, 'dolu buton, aktif sekme'],
  ['accent-dark / cream', T['--color-accent-dark'], T['--color-cream'], 4.5, 'hover'],
  ['white / accent-dark', '#ffffff', T['--color-accent-dark'], 4.5, 'hover dolgu'],
  ['orange / cream', T['--color-orange'], T['--color-cream'], 4.5, '"bugün" metni'],
  ['white / orange', '#ffffff', T['--color-orange'], 4.5, 'TODAY rozeti'],
  ['teal / cream', T['--color-teal'], T['--color-cream'], 4.5, 'MILONGA / kayıt açık'],
  ['white / teal', '#ffffff', T['--color-teal'], 4.5, 'dolu teal rozet'],
  ['rule-strong / cream', T['--color-rule-strong'], T['--color-cream'], 3, 'girdi sınırı (WCAG 1.4.11)'],
  ['rule / cream', T['--color-rule'], T['--color-cream'], 1, 'dekoratif hairline (bilgi)'],
];
const contrasts = matrix.map(([name, fg, bg, min, where]) => {
  if (!fg || !bg) return { name, ratio: null, min, where, ok: false, missing: true };
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) errors.push(`kontrast: ${name} = ${ratio} (< ${min}) — ${where}`);
  return { name, fg, bg, ratio, min, where, ok };
});

/* 3. forbidden leftovers in the stylesheet (token declarations excluded) */
const cssBody = css
  .replace(/@theme\s*\{[\s\S]*?\n\}/, '')
  .replace(/:root\s*\{[\s\S]*?\n\}/, '');
const leftovers = [
  ['Vivid accent layer', /Vivid accent layer/, 'error'],
  ['--color-indigo', /--color-indigo/, 'error'],
  ['--color-gold', /--color-gold/, 'error'],
  ['--color-burgundy', /--color-burgundy/, 'error'],
  ['hardcoded burgundy', /#a83250|#8a2640/i, 'error'],
  ['hardcoded teal pair', /#e7f2ee|#0f6b5f/i, 'warn'],
  ['--cc badge hook (P4)', /var\(--cc/, 'error'],
];
const leftoverHits = leftovers.map(([name, re, level]) => {
  const hits = [...cssBody.matchAll(new RegExp(re, 'g'))].length;
  if (hits > 0) (level === 'error' ? errors : warnings).push(`${name}: ${hits} eşleşme`);
  return { name, hits, level, ok: hits === 0 };
});

/* 3b. the badge colour producers must stay gone (P4) */
const srcFiles = fs
  .readdirSync('src', { recursive: true })
  .map((f) => path.join('src', String(f)))
  .filter((f) => /\.(ts|astro|css)$/.test(f));
const srcText = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
for (const [name, re] of [
  ['countryColor (hash palette)', /countryColor/],
  ['distinctPalette (HSL city hues)', /distinctPalette/],
  ['cityColorsFor', /cityColorsFor/],
  ['--cc in markup', /--cc/],
]) {
  const hits = [...srcText.matchAll(new RegExp(re, 'g'))].length;
  if (hits > 0) errors.push(`${name}: ${hits} eşleşme (P4 kalıntısı)`);
  leftoverHits.push({ name, hits, level: 'error', ok: hits === 0 });
}

/* 4. type floor: nothing below 11px (P3 — enforced) */
const small = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
  const body = m[2];
  const size = body.match(/font-size:\s*(0?\.\d+)rem/);
  if (!size) continue;
  const px = +(Number(size[1]) * 16).toFixed(2);
  if (px < 11) small.push({ selector: selector.slice(0, 70), px });
}
if (small.length) errors.push(`${small.length} kural 11 px altında metin kullanıyor (taban: --text-mini)`);

/* 5. orphan tokens */
const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
const orphans = Object.keys(tokens).filter((t) => !used.has(t));

/* ---------- report ---------- */
const report = {
  generatedAt: new Date().toISOString(),
  label,
  file: CSS_PATH,
  tokens,
  root,
  contrasts,
  leftoverHits,
  smallLabels: small,
  orphanTokens: orphans,
  errors,
  warnings,
  ok: errors.length === 0,
};

if (label) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `tokens-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  report.written = out;
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`palette gate — ${CSS_PATH}\n`);
  console.log('tokenlar:');
  for (const [k, v] of Object.entries(tokens)) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log('\nkontrast (krem/papier zemin):');
  for (const c of contrasts) {
    const r = c.ratio === null ? 'n/a' : c.ratio.toFixed(2).padStart(6);
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name.padEnd(24)} ${r}  ≥${c.min}   ${c.where}`);
  }
  console.log('\nkalıntı kontrolü:');
  for (const l of leftoverHits) console.log(`  ${l.ok ? '✓' : l.level === 'error' ? '✗' : '!'} ${l.name.padEnd(26)} ${l.hits} eşleşme`);
  if (small.length) {
    console.log('\n11 px altı etiketler (P3 hedefi):');
    for (const s of small) console.log(`  ${String(s.px).padEnd(6)} ${s.selector}`);
  }
  if (orphans.length) console.log(`\natıl token: ${orphans.join(', ')}`);
  if (warnings.length) {
    console.log('\nuyarılar:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (errors.length) {
    console.log('\nhatalar:');
    for (const e of errors) console.log(`  ✗ ${e}`);
  }
  if (report.written) console.log(`\nyazıldı: ${report.written}`);
  console.log(`\n${errors.length === 0 ? 'GEÇTİ' : `KALDI — ${errors.length} hata`}`);
}

process.exit(errors.length === 0 ? 0 : 1);
