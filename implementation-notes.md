# Tango News — implementation notes

## Assumptions

- Dil: İngilizce varsayılan (`/`), Türkçe `/tr`. Haberler `src/content/news/en` ve `.../tr`.
- Instagram/Facebook Graph: `tangoxplorer` Professional + Facebook Sayfası bağlı. Business Discovery development token ile başka Professional hesapların feed’ini okuyabiliyor. Takip listesi `sources/instagram/following.txt`. Token `C:\Projects\17.tango-news\.env` içinde (`META_ACCESS_TOKEN`, `META_IG_USER_ID`); git’e yok.
- Instagram aday filtresi: caption’da takvim tarihi olmalı; etkinlik bitişi bugün ile +6 ay arasında. Yıl tek başına yetmez. Hesap başına son 10 feed post. Başka hesapların story’si Graph’ta yok; story-only duyuru kaçabilir, feed’de de varsa son 10 postta yakalanır.

- Yayın: Cloudflare Pages. Ücretsiz adres `tango-news.pages.dev`; kamu adresi `tangoexplorer.com` (Cloudflare Registrar).
- Bu ağda `*.pages.dev` DNS’i localhost/Turk Telekom’a çözülüyor; vitrin için özel alan adı şart.
- Agent: günde bir kez yerelde `ingest.py` + `publish.py` (veya Cursor). LLM şart değil; publish yapısal özet yazar.
- Ana sayfa sırası: etkinlik tarihi yakından uzağa (`eventStart` artan). Bitişi geçmiş olanlar alta; tarihi olmayanlar en sona. Derleme anındaki güne göre.

## Deviations

- Hoy Milonga `guideAPI/web/2.0` uçları 404 verdi. Conservative yol: Türkiye milongas sayfasındaki gömülü `appProps.events` JSON’u.
- Tangocat: ana sayfa değil ay sayfaları (`/YYYY/M`), bugünden +6 ay, tüm dünya etkinlikleri (eski 12’lik tavan kalktı). Enrich yalnızca Türkiye kayıtlarında.
- WordPress/Wix yok; plan Cloudflare Pages dediği için Astro statik kaldı.
- Wrangler OAuth `zone` için yalnızca okuma veriyor. Pages’e `tangoexplorer.com` / `www` eklendi; CNAME kaydı dashboard’dan (Zone DNS Edit) yazılmak zorunda.
- Instagram story: Business Discovery başka hesabın story’sini vermiyor. Conservative yol: yalnızca feed (son 10 post). Story-only duyuru `sources/inbox/` ile elle.
- 2026-09-10 Graph taraması 135/297’de `#4 Application request limit` ile durdu. Conservative yol: kayıtlı 105 Professional hesaptan 12 adayı yayınla; kalan hesaplar saat dolunca `--fresh` olmadan resume.
- Faz 1 app shell: üç kolon `lg` (1024px) değil **1280px**’te açılıyor; spec’teki “&lt;1280px paneli gizle” kuralı Tailwind `lg` ile çelişiyordu.
- Haber sayfaları 291 kartlık board’u HTML’e basmaz (statik HTML şişmesin diye). Aynı rail + makale + sağ özet. Board yalnız ana sayfada. Faz 3 zaten kartları tembelleştirecek.
- El Huracán Poznań (Eki 2026) ile El Huracan Montpellier (Eyl 2026) ayrı etkinlik; birleştirilmedi.
- Lunatico (Grajów) ile “2 edition” (Kraków, aynı hafta sonu) tek kayıtda tutuldu; eski slug 301.
- Eski filtre query (`year`, `month`, `format`, `city`, `source`, `when`) bırakıldı; yeni state `?kind=&country=&q=`.
- Ülke adları veri setinde EN/TR karışık (Almanya / Germany); faz 1’de toplu rename yok.
- Boş `kinds`: pratikte yalnızca blog kaydı (`tango-news-neden-var`). Kategori alanı şemada zorunlu, boş yok.
- Mobilde timeline yatay kaydırılır (faz 2.5); kolonlar 252px.
- Marka metni mockup ve domain ile `TangoExplorer`; cream/burgundy tokenlar aynı.
- Faz 2 görseller: kaynak dosyalar `src/assets/events/`; webp/avif `astro:assets` build’de üretilir (ayrı Pillow webp yok).
- OG görsel fallback `public/og-default.svg`.
- Cloudflare Pages tek kök `404.html` sunar. `/tr/404` TR AppShell; bilinmeyen `/tr/*` kök 404’ü inline script ile TR metne çevirir, rail İngilizce kalabilir.
- Görsel ingest: Tangocat/event OG; Instagram `media_url` yalnız `sourceKey=instagram` ve Graph token varsa, son feed post (etkinlik afişi olmayabilir).
- Faz 3 fontları `public/fonts/` woff2 (latin + latin-ext); Google Fonts yok. Kritik preload yalnız Source Sans 3 400 latin.
- Faz 3 board: mevcut + sonraki ay (ve seçili kartın ayı) tam `TimelineCard`; diğer aylar görselsiz `CompactCard`. IntersectionObserver `/fragments/{locale}/{month}` ile tam karta yükseltir. JS kapalıyken tüm etkinlikler listede kalır.
- `getNews()` locale başına cache (build’de tekrar `getCollection` yok).
- Cloudflare Web Analytics (3.4) atlandı: beacon token yok, çerez/gelir hedefi yok.
- Diakritik slug: NFKD + ł/ø eşlemesi. `tango-news-neden-var` gibi bilinçli id’ler dokunulmadı. Astro `redirects` meta-refresh’i kaldırıldı; 301’ler `public/_redirects`.
- Milongalar sayfası: `/milongas` + `/tr/milongalar`. Veri `ingest_hoy.py` ile Hoy Milonga’nın 8 bölgesinden (`turkiye, buenos-aires, berlin, nordrhein-westfalen, england, athens, miami, sao-paulo`) çekilir; `src/data/hoy-milongas.json` yazılır ve `/hoy-milongas.json` uç noktasından sunulur (sayfaya gömülmez). Liste/filtreler istemcide çalışır. Hoy `eventType` çoğunlukla `milonga`; gerçek tür `genre` alanından (practica) türetilir. İptal/`hasEnded` kayıtlar elenir. Uzun ömürlü Meta token gerekmez (Hoy public sayfa).
- İçerik tutarlılığı: `content.config` sabitleri `src/lib/taxonomy.ts`’e taşındı (istemci script’leri `i18n` üzerinden `astro:content` çekmesin diye).
- Faz 3 düzen revizyonu: sabit sol rail kaldırıldı. Yerine üst bar (marka + birincil nav + arama + dil) ve onun altında **“Menü & Filtreler”** çizgisi; tıklanınca sayfanın üstüne açılan panel (`.app-menupanel`) gelir. Ana görünüm artık **2 kolon** (liste + sağ detay). Panel içindeki bölümler (`data-acc`) masaüstünde açık, **mobilde akordeon** (kapalı başlar). `Rail.astro` ve `ui/SectionHeading.astro` kaldırıldı; footer panele taşındı. `--head-h` üst bar yüksekliğini verir.
- Kaynak: **Tangoverse** (`ingest_tangoverse.py`). Public Supabase REST (anon key JS bundle’dan otomatik bulunur), salt-okuma. `--images` mevcut görselsiz kayıtların kapaklarını eşleştirip indirir (sıkı eşleştirme: başlık token’ı veya aynı gün; yanlış görsel riskini düşürür). `--publish` yalnızca üst düzey `festival/marathon/weekend/milonga` kayıtlarını ekler (alt etkinlikler `parent_event_id` ile atlanır), mevcut içerikle dedupe eder. Atıf: `source: Tangoverse` + etkinlik sayfası linki; görselde `imageCredit: Tangoverse`. `sourceKey: tangoverse` (şema + `sourceLabels`).
- Kaynak: **TMD / Tango Marathon Directory** (`ingest_tmd.py`). Public WordPress REST (`/wp-json/tmd/v3/events`, `start_date_min` + `meta_fields=end_date,website` + `include_taxonomies`), salt-okuma; robots sinyali `use=reference` ile uyumlu, atıf “TMD”. `--enrich` mevcut kayıtlara **edisyon** ve **kayıt açılışı** (`registrationStart`) + eksik `eventWebsite` ekler; `--publish` yeni maraton/festival/encuentro ekler; görseller etkinlik sayfasından `wp-post-image` kazınarak alınır. Şemada yeni alanlar: `edition`, `registrationStart`; `sourceKey: tmd`.
- Ülke adları kanonikleştirildi (`src/lib/countries.ts`). Frontmatter’da EN/TR karışık yazım sürüyor (“Almanya” + “Germany”); filtre/URL artık ASCII `id` (`germany`) kullanıyor, etiket locale’e göre üretiliyor. Şehir haritası, arama indeksi (`co`) ve `countryColor` aynı id’yi kullanır; arama her iki dildeki adı da bulur. Eski `?country=Almanya` linkleri `readUrl`’de eşlenir. Önceki “toplu rename yok” notu geçersiz.
- Milonga listesinde başlangıç/bitiş saati **iki satır** (`.app-mitem-time` flex column, bitiş %62 opaklık). Mobilde 56px kolona “20:00–01:00” sığmıyor, isim kolonuna taşıyordu.
- Yerel build: Node 24 + Vite 8.2.2’de `astro sync` `require is not defined` (picomatch 2 CJS, Vite module runner) hatası veriyor; CI Node 22 kullandığı için orada sorun yok. Build doğrulaması CI’da (veya Node 22 ile) yapılmalı.
- Yerel build düzeltmesi: hata, `picomatch` (CJS) modülünün Vite SSR runner’ında ESM’e çevrilmeden inline edilmesinden geliyordu (Windows’a özgü). `astro.config.mjs` artık `picomatch` bare specifier’ını `picomatch-esm.mjs` sarmalayıcısına alias’lıyor (`createRequire` ile gerçek paketi yükler); `astro sync` ve content tipleri üretimi çalışıyor. Bu sandbox’ta tam `astro build` yine koşmaz: esbuild’i alt süreç olarak açamıyor (`spawn EPERM`); normal terminalde esbuild açılabildiği için build alınabilir.
- 2026-11-05: `npm audit fix` sonrası astro 7.4.5, vite 8.3.6, zod 4.6.7, sharp 0.35.5; `npm audit` **0 açık**. Yerel Windows build doğrulandı: **940 sayfa**, `Complete!` (alias bu sürümlerle de çalışıyor).
- Astro **7.4.0**'a sabitlenmişti çünkü 7.4.1+ `node >=22.23.4` istiyor, GitHub runner'ı `node-version: "22"` ile 22.23.3 veriyordu. Kalıcı çözüm uygulandı: **CI artık Node 24** (`.github/workflows/update.yml`) ve astro `^7.4.5` (pin kalktı); `npm audit` 0 açık. Yerel build Node 24 ile doğrulandı.
- `tangoexplorer-cf-details.md` / `tangoexplorer-secrets.txt` `.gitignore`’a eklendi (sırlar repoya girmesin).
- Görsel doğrulama: `agentic-python/visual-check.mjs` (`npm run check:visual`) 5 sayfa × mobil/masaüstü ekran görüntüsü alır (`agentic-python/out/visual/`), yatay taşma ve milonga saat kolonu çakışmasını ölçer. Tarayıcı: `PW_WS_ENDPOINT`, yoksa `.logs/playwright-server.log`’daki adres, yoksa süreç içi Chromium (sandbox’ta tam erişim ister). DSH sandbox’ı tarayıcı alt süreci açamadığı için sunucu DSH dışında çalışmalı: `start-dsh.cmd` bunu tek komuta indirir (sunucu + dsh); sadece sunucu için `node_modules\.bin\playwright run-server > .logs\playwright-server.log 2>&1`.
- Visual check artık `agentic-python/out/visual/report.json` de yazıyor. CI’da deploy’dan sonra çalışıyor (`Install Chromium` + `Visual check (live site)`), sorun varsa koşu kırmızı olur ve ekran görüntüleri `visual-check` artifact’i olarak yüklenir. Not: bu adım deploy’dan **sonra** çalıştığı için kırmızı koşu “site güncellenmedi” demek değildir; deploy olmuş, görsel kontrol düşmüş olur.
- Üst bar tarihi mobilde kısalıyor: `≤640px`’de `6 Kas` / `6 Nov`, üstünde `Fri, 6 Nov 2026`. Uzun tarih 390px’te marka yüzünden kırpılıyordu (`FRI, 6 N…`).

## Test suite

- Vitrin Playwright testleri `e2e/` altında. Varsayılan hedef `https://tangoexplorer.com`; yerel için `BASE_URL`. `npm run test:e2e`. 2026-10-06'da yazıldı, çalıştırılmadı.
- Kapsam: sayfalar, menü, filtre, arama, zaman çizelgesi, detay paneli, milonga, dil, 404, mobil ve JS kapalı. Ingest/publish yok.

## Günlük döngü

```
python agentic-python/ingest.py
python agentic-python/publish.py --dry-run
python agentic-python/publish.py
python agentic-python/ingest_hoy.py
python agentic-python/ingest_tangoverse.py --images
python agentic-python/ingest_tangoverse.py --publish
python agentic-python/ingest_tmd.py
npm run build
npx wrangler pages deploy dist --project-name tango-news
```

Instagram duman testi (yayın yok): `python agentic-python/ingest_instagram.py --usernames chillouttangomarathon,istanbultangoweekend,laturcatango_istanbul`

Yerel vitrin: `npm run dev`

Wrangler ilk deploy’da Cloudflare girişi ister. Domain ve Pages projesi dashboard’dan önceden açılmak zorunda değil.
