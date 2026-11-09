// Builds the self-contained palette mockup from the template:
// fonts + posters are inlined as data URIs, and the before/after markup is
// generated once per panel so the two panels differ only by their token block.
//
// Onaylanan yön (9 Kas 2026): tek aksan MOR. Bordo kalıntıları mora taşınıyor,
// ülke/şehir renk kodlaması tamamen kalkıyor.
//
// Usage: node agentic-python/build-mockup.mjs
// Output: docs/palette-mockup-scenario-m.html
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const TEMPLATE = path.join(ROOT, 'agentic-python', 'mockup', 'palette-scenario.template.html');
const OUT = path.join(ROOT, 'docs', 'palette-mockup-scenario-m.html');

/* ---------- scenario: the only place the palette decision lives ---------- */
const SCENARIO = {
  accent: { hex: '#5a2d82', dark: '#4a2569', name: 'mor', ratio: '9.16' },
  focus: { hex: '#5a2d82', name: 'mor', ratio: '9.16' },
  tagNew: 'Mor tek aksan',
  titleTag: 'Senaryo M · mor',
};

/* ---------- colour maths (same formula as palette-audit.mjs) ---------- */
const hex2rgb = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
const rgb2hex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (h) => {
  const [r, g, b] = hex2rgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (fg, bg, a) => rgb2hex(hex2rgb(fg).map((v, i) => a * v + (1 - a) * hex2rgb(bg)[i]));
const fmt = (n) => n.toFixed(2);
const mark = (n, min = 4.5) => (n >= min ? `<b class="ok">${fmt(n)} ✓</b>` : `<b class="bad">${fmt(n)} ✗</b>`);

/* ---------- real colour producers from the codebase ---------- */
const PALETTE = [
  '#b91c1c', '#c2410c', '#a16207', '#4d7c0f', '#15803d', '#0f766e', '#0e7490', '#0369a1',
  '#1d4ed8', '#4338ca', '#6d28d9', '#a21caf', '#be185d', '#9f1239', '#78350f', '#334155',
];
const hashColor = (key) => {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};
const hslHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]);
};

const COUNTRIES = [
  ['Turkey', 'turkey'], ['Italy', 'italy'], ['Germany', 'germany'], ['Spain', 'spain'],
  ['France', 'france'], ['Poland', 'poland'], ['Portugal', 'portugal'], ['United States', 'united-states'],
  ['Argentina', 'argentina'], ['Greece', 'greece'],
];
const CITIES = [
  ['Bologna', 63], ['Firenze', 145], ['Pavia', 235], ['Fossano', 153],
  ['San Prospero', 310], ['Senigallia', 333], ['Perugia', 243], ['Torino', 348],
];

/* ---------- assets ---------- */
const asset = async (file, width) => {
  const buf = await sharp(path.join(ROOT, 'src', 'assets', 'events', file))
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
};
const font = async (file) =>
  `data:font/woff2;base64,${(await fs.readFile(path.join(ROOT, 'public', 'fonts', file))).toString('base64')}`;

/* ---------- shared markup builders ---------- */
const topbar = () => `
  <header class="topbar">
    <span class="menu-square"><span class="burger"></span></span>
    <span class="brand">Tango<em>Explorer</em></span>
    <span class="topdate">Mon, 9 Nov 2026</span>
    <nav class="topnav">
      <a href="#" class="is-active">Home</a><a href="#">Turkey</a><a href="#">Regions ⌄</a>
      <a href="#">Search</a><a href="#">Plan</a><a href="#">Milongas</a><a href="#">About</a>
    </nav>
    <div class="search"><input value="" placeholder="Search events, cities…"></div>
  </header>
  <section class="hero">
    <h2>Find your next tango weekend</h2>
    <p class="hero-meta">
      <span><b>418</b> upcoming events</span><span>·</span>
      <span><b>57</b> countries</span><span>·</span>
      <span class="is-accent"><b>21</b> today</span><span>·</span>
      <a class="filter" href="#"><b>21</b> this weekend</a><span>·</span>
      <a class="filter" href="#"><b>21</b> this week</a><span>·</span>
      <a class="filter" href="#">Happening now</a>
    </p>
  </section>
  <div class="ribbon">
    <span class="mchip"><b>62</b> Nov 2026</span>
    <span class="mchip is-active"><b>66</b> Dec 2026</span>
    <span class="mchip"><b>38</b> Jan 2027</span>
    <span class="mchip"><b>43</b> Feb 2027</span>
    <span class="mchip"><b>47</b> Mar 2027</span>
    <span class="mchip"><b>45</b> Apr 2027</span>
  </div>`;

const EVENT_CARDS = [
  {
    img: 'tangocat-13-sultans-of-istanbul-tango-marathon-festival-cup-2026.jpg',
    day: '10–16 Nov', cat: 'TURKEY · MARATHON', title: '13 Sultans of Istanbul Tango Marathon Festival Cup 2026',
    place: 'Turkey, Istanbul', cc: hashColor('turkey'), open: true,
  },
  {
    img: 'tangocat-bronice-tango-camp-2.jpg',
    day: '11–15 Nov', cat: 'EUROPE · WORKSHOP', title: 'Bronice Tango Camp 2',
    place: 'Poland, Nałęczów', cc: hashColor('poland'), open: false,
  },
  {
    img: 'tangocat-berlin-encuentro-milonguero.jpg',
    day: '12–15 Nov', cat: 'EUROPE · ENCUENTRO', title: 'Berlin Encuentro Milonguero',
    place: 'Germany, Berlin', cc: hashColor('germany'), open: false,
  },
  {
    img: 'tangoverse-tuga-tango-lisbon-tango-marathon-5c391c.jpg',
    day: '12–15 Nov', cat: 'EUROPE · MARATHON', title: 'TUGA TANGO — Lisbon Tango Marathon',
    place: 'Portugal, Lisbon', cc: hashColor('portugal'), open: false,
  },
];

const cards = (images) => `
  <div class="board">
    <p class="month">November 2026 <span>62 events</span></p>
    <div class="cards">
      ${EVENT_CARDS.map((c, i) => `
      <article class="card${i === 0 ? ' is-hover' : ''}">
        <a href="#">
          <div class="card-ph">
            <img src="${images[c.img]}" alt="">
            <span class="badge-day">${c.day}</span>
          </div>
          <div class="card-in">
            <p class="cat">${c.cat}</p>
            <h3>${c.title}</h3>
            <p class="loc"><span class="badge" data-kind="country" style="--cc:${c.cc}">${c.place}</span></p>
            ${c.open ? '<span class="ev-open">Registration open</span>' : ''}
          </div>
        </a>
        <button type="button" class="star" aria-label="Save this event">☆</button>
      </article>`).join('')}
    </div>
  </div>`;

const MILONGA_ROWS = [
  { group: 'Friday', today: true, count: 3 },
  { start: '20:00', end: '01:00', name: 'Milonga del Corazón', meta: 'Beyoğlu · weekly', type: 'milonga', price: 'TRY 400', selected: true },
  { start: '21:30', end: '02:00', name: 'La Viruta İstanbul', meta: 'Kadıköy · biweekly', type: 'milonga', price: 'TRY 450' },
  { start: '19:00', end: '22:00', name: 'Práctica Tango Soho', meta: 'Şişli · weekly', type: 'practica', price: 'TRY 150' },
  { group: 'Saturday', count: 2 },
  { start: '21:00', end: '02:30', name: 'El Abrazo Milonga', meta: 'Beşiktaş · monthly', type: 'milonga', price: 'TRY 500' },
];
const ISTANBUL_CC = 'hsl(40 62% 38%)';

const row = (r) => `
      <button type="button" class="mitem${r.selected ? ' is-selected' : ''}">
        <span class="mitem-time"><span>${r.start}</span><span class="end">${r.end}</span></span>
        <span class="mitem-body">
          <span class="mitem-name">${r.name}</span>
          <span class="mitem-meta">${r.meta}</span>
        </span>
        <span class="mitem-tags">
          <span class="badge" data-kind="city" style="--cc:${ISTANBUL_CC}">İstanbul</span>
          <span class="pill is-${r.type}">${r.type.toUpperCase()}</span>
          <span class="mitem-price">${r.price}</span>
        </span>
      </button>`;

const milongas = () => `
  <div class="mtoolbar">
    <select><option>Turkey (74)</option><option>Italy (198)</option></select>
  </div>
  <div class="tabs">
    <span class="mtab">All days</span>
    <span class="mtab is-active is-today">Fri</span>
    <span class="mtab is-today">Sat</span>
    <span class="mtab">Sun</span>
    <span class="mtab">Mon</span>
  </div>
  <div class="mlist">
    ${MILONGA_ROWS.map((r) =>
      r.group
        ? `<h2 class="mgroup-head">${r.group}${r.today ? '<em>TODAY</em>' : ''}<span>${r.count}</span></h2>`
        : row(r),
    ).join('')}
  </div>`;

const mobile = () => `
  <div class="mlist" style="padding-top:14px">
    <h2 class="mgroup-head" style="margin-top:0">Friday<em>TODAY</em><span>3</span></h2>
    ${MILONGA_ROWS.filter((r) => r.start).slice(0, 3).map(row).join('')}
  </div>`;

const drawer = () => `
  <div class="drawer">
    <div class="drawer-main">
      <p class="eyebrow"><span>MILONGAS</span><span class="x">×</span></p>
      <h3>Berlin Encuentro Milonguero</h3>
      <p class="lede">Five days of traditional milongas across three Berlin venues, with live orchestras
        on Friday and Saturday night. Registration closes once the ronda fills.</p>
      <p style="margin:18px 0 0;display:flex;gap:10px;flex-wrap:wrap">
        <span class="btn">See what&rsquo;s on →</span>
        <span class="btn ghost">Save</span>
        <span class="btn ghost is-focus">Focus ring</span>
      </p>
    </div>
    <div class="facts">
      <dl>
        <dt>When</dt><dd>12–15 Nov 2026</dd>
        <dt>Where</dt><dd>Germany, Berlin</dd>
        <dt>Venue</dt><dd>Ballhaus Berlin</dd>
        <dt>Type</dt><dd>Encuentro milonguero</dd>
        <dt>Source</dt><dd>tangocat.de</dd>
      </dl>
    </div>
  </div>`;

/* ---------- badge sections ---------- */
const countryBadges = () =>
  COUNTRIES.map(([name, id]) => {
    const cc = hashColor(id);
    const n = ratio(cc, mix(cc, '#ffffff', 0.12));
    return `<span style="display:inline-flex;align-items:center;gap:6px">
      <span class="badge" data-kind="country" style="--cc:${cc}">${name}</span>
      <span class="mono" style="font-size:10.5px;color:#6b5e54">${mark(n)}</span>
    </span>`;
  }).join('');

const cityBadges = () =>
  CITIES.map(([name, hue]) => {
    const n = ratio('#ffffff', hslHex(hue, 62, 38));
    return `<span style="display:inline-flex;align-items:center;gap:6px">
      <span class="badge" data-kind="city" style="--cc:hsl(${hue} 62% 38%)">${name}</span>
      <span class="mono" style="font-size:10.5px;color:#6b5e54">${mark(n)}</span>
    </span>`;
  }).join('');

const neutralBadges = () =>
  ['Turkey, Istanbul', 'Poland, Nałęczów', 'Germany, Berlin', 'Portugal, Lisbon',
   'Bologna', 'Firenze', 'Pavia', 'Torino']
    .map((label) => `<span style="display:inline-flex;align-items:center;gap:6px">
      <span class="badge" data-kind="neutral">${label}</span>
      <span class="mono" style="font-size:10.5px;color:#6b5e54">${mark(ratio('#1e1a17', '#f0e8de'))}</span>
    </span>`)
    .join('');

/* ---------- token table ---------- */
const sw = (hex) => `<span class="sw"><i style="background:${hex}"></i><span class="mono">${hex}</span></span>`;
const NO = '<span class="none">yok</span>';
const DROPPED = '<span class="none">kaldırıldı</span>';

const TOKEN_ROWS = [
  ['--color-accent', NO + ' <span class="none">(bugün burgundy + indigo)</span>', sw(SCENARIO.accent.hex), '9.16', 'tek aksan; iki token tek isimde birleşiyor', true],
  ['--color-accent-dark', sw('#8a2640'), sw(SCENARIO.accent.dark), '8.03 → 11.10', 'hover / pressed', true],
  ['--color-burgundy', sw('#a83250'), DROPPED, '6.03 → —', 'aksandan çıktı; yıldız, bağlantı, marka "Explorer" mora geçti', false],
  ['--color-indigo', sw('#5a2d82'), sw('#5a2d82') + ' <span class="none">ad: accent</span>', '9.16', 'değer kalıyor, isim anlamlı oluyor', true],
  ['--color-ink-soft', sw('#6b5e54'), sw('#5c5048'), '5.82 → 7.24', 'ikincil metin koyulaştı', true],
  ['--color-orange', sw('#d15a28'), sw('#b4471c'), '3.75 → 5.06', '"bugün" ailesi', true],
  ['--color-teal', sw('#1a8a7a'), sw('#0f6b5f'), '3.94 → 5.94', 'yalnız "kayıt açık"', true],
  ['--color-rule', sw('#e4d8cc'), sw('#d9c7b4'), '1.30 → 1.53', 'dekoratif hairline', true],
  ['--color-rule-strong', NO, sw('#8f7a63'), '3.81', 'girdi + odak sınırı (3:1)', true],
  ['--color-gold', sw('#9a7230'), DROPPED, '4.05 ✗ → —', 'zaten AA altı; kullanıldığı 2 yer nötre dönüyor', false],
  ['--shadow-card', '<span class="mono">rgba(90,45,130,.14)</span>', '<span class="mono">rgba(60,40,25,.10)</span>', '—', 'soğuk mor gölge → sıcak nötr', true],
  ['mikro etiket', '<span class="mono">8.8–10.6 px</span>', '<span class="mono">≥ 11 px</span>', '—', 'kategori · tarih · tür · şehir · TODAY', true],
  ['bitiş saati', '<span class="mono">opacity .62</span> <b class="bad">3.45 ✗</b>', '<span class="mono">ink-soft</span>', '3.45 → 7.24', 'saydamlık yerine renk', true],
];

const tokenTable = () => `
  <table class="tok">
    <thead><tr><th>Token</th><th>Şu an</th><th>Yeni</th><th>Krem üzerinde</th><th>Not</th></tr></thead>
    <tbody>
      ${TOKEN_ROWS.map(([name, from, to, r, note, keep]) => `
        <tr>
          <td class="mono">${name}</td>
          <td>${from}</td>
          <td>${to}</td>
          <td class="${keep ? '' : 'none'}">${r}</td>
          <td style="color:#5c5048">${note}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;

/* ---------- copy ---------- */
const CHIPS = `
    <span class="decision"><i style="background:${SCENARIO.accent.hex}"></i>Tek aksan: mor <span class="mono" style="color:#6b5e54">#5a2d82</span></span>
    <span class="decision"><i style="background:#a83250;opacity:.45"></i>Bordo kaldırılıyor (6.03 → mor 9.16)</span>
    <span class="decision"><i style="background:#f0e8de;border:1px solid #d9c7b4"></i>Ülke/şehir rengi yok</span>
    <span class="decision"><i style="background:#5a2d82"></i>Odak halkası mor (zaten öyle)</span>`;

const INTRO = `
    Her bölümde iki panel var: <b>üstte bugünkü site</b>, <b>altta önerilen palet</b>. İki panelin HTML'i birebir aynı;
    tek fark panelin taşıdığı token bloğu (<span class="mono">.p-old</span> / <span class="mono">.p-new</span>).
    <b>Mor kararı:</b> mor zaten ekranın baskın aksanı olduğu için tek aksan ilan ediliyor; dağınık duran bordo
    kalıntıları (kaydet yıldızı, "See what's on →", "12 tonight", marka "Explorer") mora taşınıyor.
    Geriye kalan iş: renkli rozetlerin kaldırılması, mikro etiketlerin 11 px'e çıkması, turuncu/teal tonlarının
    koyulaşması ve gölgenin ısınması. Görseller gerçek etkinlik afişleri; tipografi değişmiyor (Fraunces + Inter).`;

const SEC1_TAIL = `Mor zaten etkileşim rengi olduğu için <b>tek aksan mor</b> ilan ediliyor ve marka "Explorer"ı da
       mora geçiyor. Böylece satırdaki iki "birincil" renkten biri ortadan kalkıyor; kalan renk hem daha yüksek
       kontrastlı (6.03 → 9.16) hem de mor zaten saatlerde, sekmelerde ve butonlarda kullanıldığı için ekranda
       <i>yeni</i> bir renk belirmiyor.`;

const SEC2_TAIL = `Tarih rozeti ve saatler zaten mor olduğu için onlara dokunulmuyor; değişen tek "aksiyon" rengi
       kaydet yıldızı (bordo → mor) ve "Registration open" (teal koyulaştı).`;

const SEC3_TAIL = `Saat kolonu zaten mor: burada düzelen şey soluk bitiş saati (3.45 → 7.24), rozetin okunurluğu
       ve 11 px tabanı.`;

const LEGEND = `
      <div class="legend-card">
        <div class="bar" style="background:${SCENARIO.accent.hex}"></div>
        <b>Mor · bağlantı ve aksiyon</b>
        <span>bağlantılar, birincil buton, aktif sekme, kaydet yıldızı, tarih ve saat. Hover:
          <span class="mono">${SCENARIO.accent.dark}</span>. Krem üzerinde <b>9.16:1</b> — paletin en yüksek
          kontrastlı rengi.</span>
      </div>
      <div class="legend-card">
        <div class="bar" style="background:#b4471c"></div>
        <b>Turuncu · yalnız "bugün"</b>
        <span>TODAY etiketi, gün noktası, "21 today" istatistiği. Koyulaştırıldı: 3.75 → 5.06. Başka hiçbir
          yerde kullanılmıyor.</span>
      </div>
      <div class="legend-card">
        <div class="bar" style="background:#0f6b5f"></div>
        <b>Teal · yalnız "kayıt açık"</b>
        <span>"Registration open" rozeti. MILONGA / PRACTICA tür etiketleri nötr pill oldu: türü metin zaten
          söylüyor, renk ikinci bir anlam yüklemekten vazgeçti.</span>
      </div>`;

const SEC7_TAIL = `Odak halkası bugün de mor (<span class="mono">#5a2d82</span>, krem üzerinde 9.16:1) ve aksan mor
       olduğu için <b>dokunulmuyor</b>: 2 px çizgi + 2 px boşluk mor butonun üstünde de görünür kalıyor.
       Değişen: çekmece başlık etiketi (eyebrow) mor yerine nötr, yıldız ve bağlantılar bordo yerine mor.`;

/* ---------- new scope variables ---------- */
const NEW_VARS = [
  '    --cream: #faf6f2; --paper: #ffffff; --ink: #1e1a17; --muted: #f0e8de;',
  '    --ink-soft: #5c5048;',
  `    --accent: ${SCENARIO.accent.hex}; --accent-dark: ${SCENARIO.accent.dark};`,
  `    --nav-active: ${SCENARIO.accent.hex}; --day: ${SCENARIO.accent.hex}; --time: ${SCENARIO.accent.hex};`,
  `    --btn: ${SCENARIO.accent.hex}; --btn-hover: ${SCENARIO.accent.dark}; --focus: ${SCENARIO.focus.hex};`,
  `    --chip-count: ${SCENARIO.accent.hex}; --selected-bar: ${SCENARIO.accent.hex}; --card-hover: ${SCENARIO.accent.hex};`,
  '    --rule: #d9c7b4; --rule-strong: #8f7a63;',
  '    --shadow: 0 10px 24px rgba(60, 40, 25, .10);',
  '    --today: #b4471c; --teal: #0f6b5f;',
  '    --cat: #5c5048; --cat-size: 11px; --cat-ls: .08em; --day-size: 11px; --pill-size: 11px;',
  '    --city-size: 11px; --loc-size: 11px; --chip-size: 11px; --mgroup-today-size: 11px;',
  '    --time-end-opacity: 1; --time-end-color: var(--ink-soft);',
].join('\n');

/* ---------- assemble ---------- */
const images = Object.fromEntries(
  await Promise.all(EVENT_CARDS.map(async (c) => [c.img, await asset(c.img, 320)])),
);

const replacements = {
  FRAUNCES: await font('fraunces-latin.woff2'),
  INTER: await font('inter-latin.woff2'),
  TITLE_TAG: SCENARIO.titleTag,
  TAG_NEW: SCENARIO.tagNew,
  TAG_BG: SCENARIO.accent.hex,
  NEW_VARS,
  CHIPS,
  INTRO,
  SEC1_TAIL,
  SEC2_TAIL,
  SEC3_TAIL,
  SEC7_TAIL,
  LEGEND,
  TOKEN_TABLE: tokenTable(),
  TOPBAR_OLD: topbar(),
  TOPBAR_NEW: topbar(),
  CARDS_OLD: cards(images),
  CARDS_NEW: cards(images),
  MILONGAS_OLD: milongas(),
  MILONGAS_NEW: milongas(),
  DRAWER_OLD: drawer(),
  DRAWER_NEW: drawer(),
  MOBILE_OLD: mobile(),
  MOBILE_NEW: mobile(),
  COUNTRY_BADGES: countryBadges(),
  CITY_BADGES: cityBadges(),
  NEUTRAL_BADGES: neutralBadges(),
};

let html = await fs.readFile(TEMPLATE, 'utf8');
for (const [key, value] of Object.entries(replacements)) {
  html = html.split(`{{${key}}}`).join(value);
}
const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) throw new Error(`unresolved placeholders: ${[...new Set(leftover)].join(', ')}`);

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024).toFixed(0)} kB)`);
