# TangoExplorer — Renk Paleti Aksiyon Planı

> **Girdi:** [`tangoexplorer-website-feedback.md`](../tangoexplorer-website-feedback.md) (inceleme: 8 Kasım 2026)
> **Bu plan:** 8 Kasım 2026 · kod tabanı `C:\Projects\17.tango-news` (astro 7.4.5, 471 sayfa)
> **Kapsam kararı:** plan yalnız palet/erişilebilirlik işini kapsar; veri toplama, CI ve içerik hattına dokunmaz.

---

## 0. Özet

> **Onaylanan yön (9 Kasım 2026):** Tek aksan **mor**; bordo token'ı kalkıyor, ülke/şehir rengi tamamen kalkıyor.
> Görsel önizleme: [`palette-mockup-scenario-m.html`](palette-mockup-scenario-m.html) (üretimi: `node agentic-python/build-mockup.mjs`).

Rapor **ölçüm tarafında güvenilir**: tablodaki 22 kontrast değerinin tamamını WCAG bağıl parlaklık formülüyle yeniden hesapladım, hepsi tutuyor (16.07 · 5.82 · 6.03 · 9.16 · 3.75 · 3.94 · 4.04 · 4.20 · 4.27 · 1.08 · 1.30 · 1.53 · 3.81 · 5.06 · 5.94 · 5.89 · 7.24 …). Yani **yeniden ölçüme gerek yok**, doğrudan uygulanabilir.

Üç bulgu planı şekillendiriyor:

1. **Tek bir kök neden var.** On eleştirinin sekizi `global.css` sonundaki `Vivid accent layer` bloğundan (satır 2133–2212) veya iki paralel renk üreticisinden (hash paleti + eşit aralıklı HSL) kaynaklanıyor. Bu blok silinip niyetler taban kurallara taşınmadan **hiçbir token değişikliği görünür olmaz** — katman, taban kuralları eziyor.
2. **Sıra değişmeli.** Rapor §5.4 "tek aksan"ı 1. sıraya koyuyor. Mekanik olarak önce kaskad temizliği gelmeli; aksi hâlde her renk düzeltmesi yarım kalır.
3. **Kapsam tahmini:** 6 PR, ~2 iş günü. Aksan kararı verildi (mor); mor senaryosunda P1+P2 bordo senaryosundan **daha küçük**, çünkü renk token üzerinden geliyor. Tek "yüksek eforlu" iş karanlık mod.

Buna karşılık raporda **düzeltilmesi gereken 6 nokta** var (bölüm 1) — hiçbiri bulguları çürütmüyor, ama üçü yanlış yönlendirir.

---

## 1. Raporda düzeltilecek noktalar

| # | Rapor ne diyor | Kod ne diyor | Plan etkisi |
|---|---|---|---|
| 1 | §3.10: "Altın `#9a7230` hiçbir sayfada görünmüyor (0 öğe)" | Altın **ölü değil, maskeli**: `global.css:716-722` (`.app-crumbbar-kicker`), `:1311` (`.app-ev-cat` — vivid katman mora çeviriyor), `:1195` + `:1274` (görselsiz kart gradyanı bordo→altın) | "Altını kaldır" kararı doğru ama gerekçesi "kullanılmıyor" değil "iki yerde yanlış iş yapıyor". Ayrıca **altın kremde 4.05:1** — 8.8 px metinde AA altı. Geri getirmek istersek koyulaştırmak zorunlu (`#7a5a22` → 5.89) |
| 2 | §5.4: "Şehir/ülke rozetlerini nötrleştir — Yüksek / **Düşük** efor, `--cc` üretimi kaldırılır" | Rozet rengi **iki ayrı hattan** geliyor: (a) ülke hash paleti → `--cc` **metin rengi** olarak tint üzerinde; (b) `distinctPalette()` → `--cc` **arka plan**, beyaz metin. İki hat, iki farklı hata modu, 6 dosya | İş "Düşük efor" değil: `milonga-html.ts`, `scripts/milongas.ts`, `MilongaView.astro`, `TimelineCard.astro`, `country-color.ts` + CSS |
| 3 | §3.3: rozetler "beyaz metin okunmuyor" | Ülke rozeti **beyaz metin değil**: `color: var(--cc)` + %12 tint (bu yüzden ölçüm 4.27, 2.98 değil). Şehir rozeti beyaz metin (4.20 / 2.93) | Rozet düzeltmesi "arka planı koyulaştır" ile değil, **renk kodlamasını kaldır** ile çözülür. HSL parlaklığını düşürmek ülke rozetini kurtarmaz |
| 4 | §4 tablosu "Bitiş saati 3.45" | Doğru, ama mevcut denetim betiği bunu **yakalayamaz**: `palette-audit.mjs:119` yalnız `opacity < 0.35` olanları atlıyor, `opacity: 0.62` orana katılmıyor → 9.16 "geçti" görünür | Kabul testi olarak kullanmadan önce denetim betiği düzeltilmeli (bölüm 6) |
| 5 | §5.2: teal `#0f6b5f` öneriliyor | Bu renk zaten kodda var ama **token değil**: `global.css:2866-2877` `.app-ev-open` `#e7f2ee` / `#0f6b5f` (5.57:1) | İyi örnek: aynı çifti token'a bağla, hardcode'u sil |
| 6 | — (raporda yok) | `agentic-python/visual-check.mjs:30` hâlâ `/tr/milongalar/` sayfasını çekiyor; rota kaldırıldığı için **404 ekran görüntüsü alıp "temiz" diyor** | Palet işine başlarken düzeltilmeli, yoksa görsel regresyon kapısı sahte yeşil verir |

Ayrıca rapor §3.7'deki "hairline 1.30:1" ve §5.2'deki "`--color-rule` → `#d9c7b4` = 1.53" doğru; ama hairline **dekoratif** olduğu için 3:1 hedefi yok — 3:1 yalnız **girdi/odak sınırı** için gerekli. Bu yüzden yeni bir `--color-rule-strong` token'ı (`#8f7a63`, 3.81) plana eklendi; rapor bunu tabloda veriyor ama hiçbir bileşene bağlamıyor.

---

## 2. Dokunulacak yerler (kod haritası)

| Dosya | Satır | Ne var | Faz |
|---|---|---|---|
| `src/styles/global.css` | 39–53 | `@theme` tokenları (6 aksan + krem/mürekkep) | P2 |
| | 55–76 | `:root`: `--shadow-card` (mor), `--surface-muted`, `--line` | P2 |
| | 716–722 | `.app-crumbbar-kicker` altın | P2 |
| | 980–989 | `.app-month` / `:nth-child(even)` mor + teal %5–7 tint (süs) | P2 |
| | 1195, 1274 | `linear-gradient(burgundy, gold)` iki yerde | P2 |
| | 1280–1291 | `.app-ev-day` 9.28 px, bordo | P3 |
| | 1299–1304 | `.app-ev-in` **sabit** `height: 7.6rem` | P3 (risk) |
| | 1306–1313 | `.app-ev-cat` 8.8 px, altın | P2+P3 |
| | 1326–1342 | `.app-ev-loc` / `.is-country` `--cc` metin + tint | P4 |
| | 1447–1456 | `.app-when-badge` bordo (TODAY'de turuncuya eziliyor) | P2 |
| | 1955–1976 | `.app-mitem-time` bordo, `.app-mitem-time-end` `opacity: .62` | P2 |
| | 2004–2038 | `.app-mitem-type` 9.6 px, `.app-mitem-city` `--cc` + beyaz | P3+P4 |
| | 2133–2212 | **`Vivid accent layer`** — tüm mor kaçaklar | P1 |
| | 2209–2211 | `:focus-visible` mor çerçeve (mor senaryosunda **değişmiyor**) | P1 |
| | 2298–2300 | `.app-hero-meta .is-accent b` turuncu ("21 today") | P2 |
| | 2833 | `.app-ev-milonga-time` mor (taban: accent) | P1 |
| | 2866–2877 | `.app-ev-open` hardcode teal çifti | P2 |
| `src/lib/country-color.ts` | 3–33 | 16 renkli hash paleti | P4 |
| `src/lib/milonga-html.ts` | 68–83, 125–150, 158–193 | `distinctPalette`, `cityColorsFor`, inline `--cc` | P4 |
| `src/scripts/milongas.ts` | 7, 61, 146–147 | istemci tarafı yeniden çizimde aynı renkler | P4 |
| `src/components/MilongaView.astro` | 11, 29, 75 | SSR listesi | P4 |
| `src/components/TimelineCard.astro` | 10, 32, 58–73 | `countryColor()` + `.app-ev-day` / `.app-ev-cat` / `.app-ev-loc` | P3+P4 |
| `src/components/ui/Badge.astro` | 9 | `.app-when-badge` | P2 |
| `agentic-python/palette-audit.mjs` | 119, 129–145 | opacity açığı, kapsam | P0 |
| `agentic-python/visual-check.mjs` | 30 | ölü `/tr/` rotası | P0 |

**İyi haber:** CSS dışında hardcode renk yalnız `country-color.ts`'de. Token değişiklikleri tek dosyada kalıyor.

---

## 3. Karar (verildi, 9 Kasım 2026): tek aksan **mor**

> Mor tek aksan; ülke/şehir renk kodlaması tamamen kalkıyor.
> Görsel önizleme: [`palette-mockup-scenario-m.html`](palette-mockup-scenario-m.html) ·
> bordo alternatifi (reddedildi, referans için duruyor): [`palette-mockup-scenario-a.html`](palette-mockup-scenario-a.html)

Bu kararın plana üç somut etkisi var:

**1. `Vivid accent layer` artık "yarım kalmış geçiş" değil, gidilen yön.** O yüzden P1 tersine dönüyor: katmanı bordoya geri almak yerine, **katman taban kurallara terfi ediyor ve blok siliniyor**. Ayrıntı P1'de.

**2. İş, bordo senaryosundan daha küçük — ve tahmin ettiğinden de küçük.** `--color-burgundy` 56 kuralda geçiyor; katman bunların 16'sını maskeliyor, ~25'i ekranda bordo kalıyor (kaydet yıldızı, "12 tonight", arama gönder/submit, `/now` şeridi, `/plan` başlıkları, `/saved` "remove", drop-cap, görselsiz kart gradyanı, arama sonuç başlıkları…). Ama hepsi **tek token** üzerinden geldiği için:

| Adım | Değişiklik |
|---|---|
| 1 | `--color-burgundy: #a83250` → `--color-accent: #5a2d82` |
| 2 | `--color-burgundy-dark: #8a2640` → `--color-accent-dark: #4a2569` |
| 3 | dosyada `--color-burgundy` → `--color-accent`, `-dark` → `-dark` (mekanik rename) |
| 4 | `--color-indigo` ve katman bloğu (2133–2212) silinir |
| 5 | 2 gradient (`:1195`, `:1274`) nötre çevrilir (bordo→altın yerine krem) |
| 6 | 5 Tailwind utility (`text-burgundy`, `bg-burgundy`) → `text-accent`, `bg-accent` |

Seçili 30+ seçiciyi elden geçirmek gerekmiyor: renk zaten token'dan geliyor.

**3. Kazanç ölçülebilir, kayıp yalnız ton.** Aksan kremde **6.03 → 9.16**, beyaz üstünde **6.49 → 9.85**. Odak halkası zaten mor (9.16) olduğu için **değişmiyor** — bir regresyon riski düşüyor.

Katmanın içinde kalıp da **tabana taşınması gereken** 4 istisna var (yoksa silinince kaybolurlar):

| Katman kuralı | Bugün | Tabana taşınacak hâli |
|---|---|---|
| `.app-topnav a.is-active`, `.app-mtab.is-active` | mor zemin (tabanda mürekkep) | aksan zemini — bugünkü görünüm korunur |
| `.app-when-badge`, `.app-mgroup-head.is-today em` | turuncu zemin (tabanda bordo) | turuncu (`--color-orange`, koyulaştırılmış) |
| `.app-mtab.is-today::after` | turuncu nokta (tabanda `currentColor`) | turuncu |
| `.app-ev-cat` | mor (tabanda altın) | `--color-ink-soft` + 11 px |

Geri kalan tüm katman satırları, token mor olduğu için **zaten aynı sonucu verir**; blok toptan silinir.

**Ülke/şehir rengi:** onaylandı — kalkıyor. Amaç "her şehir farklı renk" değil "hangi ülkede olduğunu bir bakışta gör"; ülke adı zaten rozetin metninde, bölge de kart üstündeki etikette.

---

## 4. Fazlar

### P0 — Ölçüm altyapısı ve taban çizgisi — ✅ uygulandı (9 Kas 2026)

1. Dal: `palette/a11y`.
2. `palette-audit.mjs:119` — `opacity`'yi metin alfasına kat (`fg.a *= opacity`) ve atlama eşiğini 0,35'ten 0,05'e indir. Böylece `opacity: .62` bitiş saati 3.45 olarak **yakalanır**.
3. Kapsamı genişlet: `home, milongas?region=italy, milongas?region=germany, now, plan, search, about, /news/<bir slug>, saved` + **açık detay çekmecesi** (`.app-detail.is-open`). Bugünkü kapsam drawer'ı ve haber sayfasını hiç ölçmüyor.
4. `--check` modu: çıkış kodu, `contrast` dizisi boş değilse 1. Tarayıcı gerektirdiği için `check:palette:live` adında; tarayıcısız çalışan token kapısı `check:palette`.
5. `visual-check.mjs:30` — ölü `/tr/milongalar/` girdisini `milongas-tr` yerine `milongas-italy` (`/milongas/?region=italy`) yap; 360 px genişlik ekle.
6. Taban çizgisini yaz: `palette-report.json` → `agentic-python/out/palette/baseline-2026-11-08.json`. Kaç sayfa, kaç ihlal, hangi renkler — sonrasıyla karşılaştırma bu dosyaya göre yapılacak.

**Kabul:** `npm run check:palette` mevcut sitede kırmızı; ihlal listesi rapor §4 tablosuyla örtüşüyor (PRACTICA, MILONGA, TODAY, İstanbul, bitiş saati, "21 today").

### P1 + P2 — Kaskad temizliği ve token seti — ✅ uygulandı (9 Kas 2026)

> P1 ile P2 ayrılmamalı. Katman silindiğinde altındaki **altın** kategori etiketi (4.05) ve **turuncu** (3.75) çıplak kalır; araya sürüm girerse site bilerek daha kötü durumda yayınlanır.

**P1 — `Vivid accent layer`'ı terfi ettir, sonra sil (2133–2212):**

Renk artık token'dan mor geldiği için katmanın 11 kuralı **otomatik olarak aynı sonucu verir**; yalnız 4 istisna tabana taşınmalı:

| Katman kuralı | Aksiyon |
|---|---|
| `color: indigo` grubu (brand em, kicker, detail-eyebrow, related/source/foot/prose/article-body a, crumb a:hover, rail-reset, ev-day, mitem-time, mchip b) | **Sil** — taban kural `--color-accent` (mor) kullanıyor |
| `.app-btn-solid`, `.app-btn-solid:hover`, chip/select/mchip/mtab hover, `.app-ev`/`.app-mitem` sınır ve şeritleri, `:focus-visible` | **Sil** — taban kurallar accent/accent-dark'a bağlı; `:focus-visible` mor kalır |
| `.app-topnav a.is-active`, `.app-mtab.is-active` | Tabanda `--color-ink` → **`--color-accent`** yap (bugünkü mor pill korunur) |
| `.app-when-badge`, `.app-mgroup-head.is-today em`, `.app-mtab.is-today::after` | Tabanda accent → **`--color-orange`** yap (bugünkü turuncu korunur) |
| `.app-ev-cat` | Tabanda altın → **`--color-ink-soft`** (+ 11 px, P3) |
| `.app-month` `:nth-child(even)` mor %5 / teal %7 tint | Tek nötr `--surface-muted` (alternatif hue süs) |

Sonra blok **silinir**. Doğrulama: `grep -c "Vivid accent layer"` = 0 ve `grep -c "color-indigo"` = 0.

**P2 — token seti (tek renk, iki isim):**

```css
@theme {
  --color-cream: #faf6f2;
  --color-paper: #ffffff;
  --color-ink: #1e1a17;          /* 16.07 */
  --color-ink-soft: #5c5048;     /* 7.24  (6b5e54: 5.82) */
  --color-accent: #5a2d82;       /* 9.16  tek aksan (eskiden --color-indigo) */
  --color-accent-dark: #4a2569;  /* 11.10 hover/pressed */
  --color-orange: #b4471c;       /* 5.06  yalnız "bugün" */
  --color-teal: #0f6b5f;         /* 5.94  yalnız "kayıt açık" */
  --color-rule: #d9c7b4;         /* 1.53  dekoratif hairline */
  --color-rule-strong: #8f7a63;  /* 3.81  girdi + odak sınırı */
}
/* kaldırılanlar: --color-burgundy, --color-burgundy-dark, --color-gold, --color-indigo */
:root {
  --shadow-card: 0 10px 24px rgba(60, 40, 25, 0.10); /* sıcak nötr */
  --surface-muted: #f0e8de;
}
```

Ek düzeltmeler (aynı PR):

- 56 kuralda mekanik rename: `--color-burgundy` → `--color-accent`, `--color-burgundy-dark` → `--color-accent-dark`.
- `NewsCard.astro` (`text-burgundy` ×4) ve `BreakingStrip.astro` (`bg-burgundy`) → `text-accent` / `bg-accent`; yoksa Tailwind utility'leri token adı değişince üretilmez.
- `.app-ev-open` (`:2866`) hardcode `#e7f2ee`/`#0f6b5f` → `color-mix(teal 10%, cream)` + `var(--color-teal)`.
- `.app-crumbbar-kicker` altın → `--color-ink-soft`.
- İki `linear-gradient(burgundy, gold)` (`:1195`, `:1274`) → `--surface-muted` zemin + `--color-ink-soft` baş harfler.
- **Kırmızı çizgi:** sayfada kalan tek "sıcak" renk turuncu olmalı (`--color-orange`). Bordo hiçbir yerde `#a83250` olarak durmamalı: `grep -ri "a83250" src/` = 0 (görsel atıflar hariç).

**Kabul:** `check:palette` **yeşil**; `palette-detail.json`'da ana sayfa metin renkleri ≤ 6, arka plan ≤ 4 (bugün 20/21); ekranda bordo yok.

#### Uygulama notu (9 Kas 2026)

Yapılanlar ve sapmalar:

- `--color-burgundy` → `--color-accent` rename'i 56 kuralda tek geçişte yapıldı (prefix paylaştığı için `-dark` da birlikte geldi).
- Katman **silindi**, 4 istisna tabana taşındı: `.app-topnav a.is-active` + `.app-mtab.is-active` → accent; `.app-when-badge` + `.app-mgroup-head.is-today em` + `.app-mtab.is-today::after` → orange; `.app-ev-cat` + `.app-crumbbar-kicker` → ink-soft.
- Planda sayılmayan iki orphan daha çıktı ve düzeltildi: `.app-now-tag-event` `#f3e7ec` (eski bordo tint'i) → `color-mix(accent 8%, cream)`; `.app-now-tag-milonga` hardcode teal çifti → token.
- Girdi sınırları (`--color-rule-strong`, 3.81) 7 bileşene bağlandı: menü araması, `select` sarmalayıcı, milonga ülke seçici, hero arama, arama formu, `/now` alanı, `/plan` seçicisi.
- Tarayıcı gerektirmeyen yeni kapı: `agentic-python/palette-tokens.mjs` (`npm run check:palette`) — token sözlüğü, 15 satırlık kontrast matrisi, kalıntı grepleri, 11 px altı etiket envanteri, atıl token kontrolü. Tarayıcılı denetim `npm run check:palette:live` oldu.
- **Eksik kalan:** `palette-audit.mjs` (canlı sayfa kontrastı) bu ortamda koşamıyor (sandbox Chromium IPC'yi engelliyor). Betik güncellendi (opacity artık orana katılıyor, kapsam 9 sayfa + drawer + makale, `--check` modu) ama ilk gerçek koşu sandbox dışında ya da CI'da yapılmalı; taban çizgisi dosyası o koşudan sonra yazılacak.


### P3 — Mikro etiketler — ✅ uygulandı (9 Kas 2026)

- 10 px altı **tüm caps** etiketleri 11 px tabanına çek: `.app-ev-cat` (8.8), `.app-ev-day` (9.28), `.app-mitem-type` (9.6), `.app-mitem-city` (10.56), `.app-when-badge` (9.92), `.app-mgroup-head.is-today em` (9.6), `.app-ev-open` (9.92), `.app-save` çevresi.
- Tek bir yardımcı ile: `font-size: max(0.6875rem, 11px)` (0.6875rem = 11 px, kök punto büyürse ölçeklenir).
- `letter-spacing` 0.12em → 0.08em (11 px'te 0.12em gözle ayrışmıyor, satırı şişiriyor).

**Risk (raporda yok):** `.app-ev-in` **sabit** `height: 7.6rem` (`:1299`). Başlık 2 satır + kategori + rozet + "Registration open" bugün ~88 px kullanıyor; etiketler +2–3 px büyüyünce taşma/kırpılma başlar. Çözüm: `height` → `min-height`, `-webkit-line-clamp: 2` korunur. `.app-mitem` mobil 56 px saat kolonu ve `auto` etiket kolonu için 360 px'te taşma kontrolü şart.

**Kabul:** denetimde 11 px altı metin **0**; `visual-check` 360/390/1440'ta `overflowX: false`, `badRows: 0`.

#### Uygulama notu

- Planın listelediği 9 seçici gerçekte **24 kural** çıktı (`.app-now-tag`, `.app-acc-sub`, `.app-select-label`, `.app-facts-label`, `.app-facts-dl dt`, `.app-rail-label`, `.app-ribbon-label`, `.app-detail-eyebrow`, `.app-acc-head`, `.app-suggest-meta`, `.app-result-month`, `.app-results-month`, `.app-search-month`, `.app-milonga-cities .app-chip b`, `.app-ev-loc` …). Hepsi tek tabana bağlandı: `:root { --text-mini: max(0.6875rem, 11px) }` (mevcut `--text-xs/sm/base` ölçeğinin yanına), altı küçük değer (`0.55/0.58/0.6/0.62/0.66/0.68rem`) `var(--text-mini)` oldu.
- `.app-ev-in`: `height` → `min-height` (kart etiketle birlikte büyüyebilir, satırlar eşit kalır).
- `.app-ev-cat`: `letter-spacing` 0.12em → **0.06em** (uzun "EUROPE · ENCUENTRO" 11 px'te 150 px'lik kartta sarmasın diye; 360–390 px'te 2 kolon ≈ 160–175 px, iç genişlik ≈ 140 px).
- Kapı artık **hata** veriyor: `palette-tokens.mjs` her kuralı tarayıp 11 px altı `font-size` görürse kırmızı. Kalan tek uyarı P4'ün `--cc` kancası.


### P4 — Rozetleri nötrleştir — ✅ uygulandı (9 Kas 2026)

1. `country-color.ts` **silinir** (dosya), `TimelineCard.astro:10,32` importu ve `--cc` inline stili kalkar.
2. `milonga-html.ts`: `distinctPalette`, `cityColorsFor` kaldırılır; `itemHtml`/`listHtml` imzalarından `cityColors` parametresi çıkar; `<span class="app-mitem-city" style="--cc:…">` → stil yok.
3. `scripts/milongas.ts:7,61,146-147` ve `MilongaView.astro:11,29,75` aynı şekilde sadeleşir.
4. CSS: `.app-mitem-city` ve `.app-ev-loc.is-country` → `background: var(--surface-muted)`, `color: var(--color-ink)` (14.24:1), `border: 1px solid var(--color-rule)`.
5. Ülke ayrımı metinde zaten var ("Turkey, Istanbul") + `.app-ev-cat` bölge etiketi ("EUROPE"). Renk dışı ek işaret gerekmiyorsa **ekleme**.

**Kabul:** ekranda ülke/şehir için üretilen renk sayısı **0** (bugün 13 ülke + 202 şehir kombinasyonu); rozet kontrastı ≥ 4.5:1; aynı şehir iki sayfada aynı görünüm.

#### Uygulama notu

- `src/lib/country-color.ts` silindi; `distinctPalette` / `cityColorsFor` ve `listHtml`/`itemHtml` imzalarındaki `cityColors` parametresi kaldırıldı (3 dosya).
- `.app-ev-loc` artık kartın içinde nötr pill (krem zemin + mürekkep metin + hairline, 14.24:1); `.app-ev-loc.is-country` kuralı silindi, `is-country` sınıfı markup'tan çıktı.
- `.app-mitem-city` nötr pill; renk `--cc` üzerinden hiç gelmiyor.
- Kapı sertleşti: `--cc`, `countryColor`, `distinctPalette`, `cityColorsFor` artık **hata**; `npm run check:palette` bunları `src/` genelinde arıyor.

### P5 — Anlam haritasını sabitle ve belgele (1 saat)

| Renk | Tek anlam |
|---|---|
| Mor (`--color-accent`) | bağlantı, birincil buton, aktif sekme, kaydet yıldızı, tarih ve saat |
| Mor-koyu (`--color-accent-dark`) | hover/pressed |
| Turuncu | "bugün" (TODAY, bugün noktası, "21 today") |
| Teal | yalnız "kayıt açık" (MILONGA/PRACTICA tür etiketleri nötr pill — türü metin söylüyor) |
| Mürekkep-soft | ikincil/meta metin |
| `--color-rule-strong` | girdi sınırı ve odak |

`docs/palette-rules.md` olarak 20 satırlık bir kural dosyası ekle; `implementation-notes.md` "Deviations" bölümüne tek satır: *"Renk: tek aksan mor (#5a2d82); bordo token'ı kaldırıldı, ülke/şehir renk kodlaması yok."*

### P6 — Karanlık mod (ayrı PR, ~1 gün)

Rapor §3.9 haklı: `prefers-color-scheme` **0 eşleşme**. Ama ucuz değil; token'lar P2'de anlamlı hale geldikten sonra yapılmalı.

- `@theme` tokenları `:root`'ta CSS değişkeni olarak yayınlandığı için `@media (prefers-color-scheme: dark) { :root { … } }` ile ezilebilir; `@theme inline` kullanılmadığı için utility'ler de takip eder.
- Yeni token'lar: `--surface`, `--surface-muted`, `--line`, `--shadow-card` (koyu zeminde gölge yerine hairline).
- `color-scheme: light dark` + `BaseLayout.astro`'ya `<meta name="theme-color">` (light/dark iki değer).
- Ölçüm: `palette-audit.mjs`'e `colorScheme: 'dark'` varyantı; karanlıkta da **0 ihlal** şartı.
- Kapsam dışı: OG görselleri ve ekran görüntüleri (statik PNG) — karanlık varyant üretilmeyecek.

---

## 5. Bulgu → faz eşlemesi

| Rapor bulgusu | Etki | Faz | Doğrulama |
|---|---|---|---|
| 3.1 iki birincil renk | Yüksek | P1+P5 | `--color-indigo` referansı 0, bordo token'ı 0; ekranda 1 aksan |
| 3.2 rastgele şehir renkleri | Yüksek | P4 | `distinctPalette` yok; ekranda 0 üretilmiş renk |
| 3.3 rozet kontrastı | Yüksek | P4 | denetimde rozet ihlali 0 |
| 3.4 aynı yer iki renk | Orta | P4 | renk kodlaması kalktığı için yapısal olarak imkânsız |
| 3.5 10 px altı etiketler | Yüksek | P3 | min punto 11 px |
| 3.6 bitiş saati 3.45 | Orta | P1+P2 | `opacity` kaldırıldı, `ink-soft` 7.24 |
| 3.7 soğuk gölge / zayıf hairline | Orta | P2 | `--shadow-card` sıcak; `rule-strong` 3.81 |
| 3.8 renk anlamı örtüşmesi | Orta | P5 | kural dosyası + `docs/` |
| 3.9 karanlık mod yok | Orta | P6 | `prefers-color-scheme` eşleşmesi > 0, karanlıkta 0 ihlal |
| 3.10 palet fazla/eksik | Düşük | P2+P5 | renk tokenı 11 → 10, aksan 6 → 3; metin rengi ≤ 6 |

---

## 6. Kabul kriterleri (ölçülebilir)

| # | Kriter | Araç |
|---|---|---|
| 1 | Denetlenen her sayfada `contrast.length === 0` | `npm run check:palette` |
| 2 | 11 px altı metin 0 (istisna yok) | aynı rapor |
| 3 | Ana sayfada farklı metin rengi ≤ 6, arka plan ≤ 4 | `palette-detail.json` |
| 4 | 360 / 390 / 1440'ta `overflowX: false`, `badRows: 0` | `npm run check:visual` |
| 5 | E2E 144 passed / 2 skipped (renk iddiası yok → kırılma beklenmiyor) | `npm run test:e2e` |
| 6 | Build 471 sayfa, `npm audit` 0 | `npm run build` |
| 7 | Karanlık modda da `contrast.length === 0` | P6'da eklenen varyant |

> Not: Playwright tarayıcı alt süreci DSH sandbox'ında açılamıyor. Görsel/palet kontrolünü **harici Playwright sunucusu** ile çalıştır (`start-dsh.cmd`, ya da `node_modules\.bin\playwright run-server > .logs\playwright-server.log`), betikleri `PW_WS_ENDPOINT` ile bağla. `npm run build` sandbox içinde çalışıyor.

---

## 7. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| P1 tek başına yayınlanır | Altın 4.05 / turuncu 3.75 ihlalleri görünür olur | P1+P2 **tek PR**, tek commit'te token'lar da gelir |
| Katman silinirken `is-active` / `is-today` istisnaları unutulur | Aktif sekme mürekkebe, TODAY bordo'ya döner | P1 tablosundaki 4 istisna ayrı madde; `grep "Vivid accent layer"` = 0 sonrası görsel kontrol |
| Tailwind utility'leri token adı değişince üretilmez | `text-burgundy`/`bg-burgundy` sessizce renksiz kalır | `NewsCard` (4) + `BreakingStrip` (1) → `text-accent`/`bg-accent`; build sonrası `dist.css` içinde `--color-accent` doğrula |
| `.app-ev-in` sabit yükseklik | Etiket büyüyünce kart kırpılır | `min-height`'a çevir, en uzun kartı 360 px'te ölç |
| Mobil etiket kolonu genişler | 56 px saat kolonunda sıkışma | 360 px'te `check:visual`; gerekirse milonga tipini ikonla |
| 202 şehir renginin kalkması görsel kimlik değişimi | Kullanıcı "renk kaybı" algısı | Ülke adı metinde kalıyor; tek ekran görüntüsüyle before/after paylaş |
| Odak halkası ile aksan aynı renk | Mor butonda odak halkası kaybolabilir | Zaten 2 px çizgi + 2 px offset var (krem zemin üzerinde 9.16:1); değiştirmiyoruz, ama klavye testi yapılmalı |
| `--cc` enjeksiyonunu yarım silmek | `style="--cc:"` boş kalır, sessiz bozulma | Grep kapısı: `--cc` / `countryColor` / `distinctPalette` için 0 eşleşme |
| Bordo değerinin bir yerde kalması | "Neden hâlâ kırmızı bir şey var" | Grep kapısı: `#a83250` (ve `8a2640`) için `src/` altında 0 eşleşme |

---

## 8. Kapsam dışı

- **Poster üzerindeki metin kontrastı** (`.app-ev-ph` içi): ölçülmedi; görsel arka plan WCAG 1.4.3 istisnasına giriyor ama okunabilirlik riski gerçek — ayrı bir "image caption scrim" işi.
- `forced-colors` / yüksek kontrast modu (raporda da test edilemedi).
- Tipografi yeniden ölçeklendirme (raporun kapsamı dışı): punto tabanı 11 px'e çekilince `--text-*` clamp'lerinin yeniden dengelenmesi gerekebilir — ayrı iş.
- Türkçe rota (kaldırılmış durumda; `visual-check`'teki ölü referans P0'da temizleniyor).

---

## 9. Açık sorular

**Karara bağlandı (9 Kasım 2026):**
1. ~~Aksan hangisi?~~ → **Mor** tek aksan; bordo token'ı kaldırılıyor.
2. ~~Ülke/şehir rengi kalsın mı?~~ → **Tamamen kalkıyor** (yalnız metin).

**Hâlâ açık:**
3. **Karanlık mod:** otomatik `prefers-color-scheme` mi, kullanıcı anahtarı mı (localStorage)? → Öneri **otomatik**, anahtar sonra.
4. **Kapsam onayı:** `/plan`, `/now`, arama, drawer ve haber sayfası da bu işin içinde mi? → Öneri **evet** (P0'da denetim kapsamına alınır).
5. **Bordo tamamen gitsin mi?** Tek istisna olarak marka "Explorer"ı bordoda kalsın isteyen bir görüş olabilir; o durumda ekranın en görünür yerinde iki aksan yan yana durur ve raporun 3.1 bulgusu kapanmaz. → Öneri **tamamen gitsin** (mockup böyle çizildi).

---

## 10. Sıradaki adım

```
git switch -c palette/a11y
# P0: denetim betiği + taban çizgisi
npm run check:palette          # şu an kırmızı olmalı
# P1+P2: tek PR
npm run build && npm run check:palette && npm run check:visual
```

P1+P2 artık karar bekletmiyor: token adı ve değerleri net, katmanın 4 istisnası tabloda. Onay geldiği an tek PR'da uygulanabilir.
