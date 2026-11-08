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
- CI’da deploy sonrası **e2e** de koşuyor (`npm run test:e2e`, `if: always()`), Playwright HTML raporu `playwright-report` artifact’i olarak yükleniyor. Suite canlı siteye karşı çalışır; 119 test, ~1 dk. 2026-11-06 ilk koşuda 1 gerçek hata buldu: detay `fetch`’i sürerken Escape/Back gelince geç yanıt paneli yeniden açıyordu (`detail-panel.ts` sıra numarası koruması, commit `09f8403`).
- Kaynak: **tango-calendar.de** (`ingest_tango_de.py`, 2026-11-08). Public iCalendar (`/kalender.ics`, 456 VEVENT) yalnız dizin olarak kullanılır; gerçek veriler etkinlik sayfasındaki `DanceEvent` JSON-LD’den gelir (offset’li `startDate`, yapısal adres, breadcrumb’dan `kind`). Feed UTC, sayfa yerel saat verir; **saatler sayfadan** alınır. Tarihler (mekân, haftagünü) kümelere ayrılır; saat farkı ≤1 ve tarihleri çakışmayan kümeler birleşir (aynı mekândaki ders ve milonga ayrı kalsın diye). `schedule` `weekly`/`biweekly`/`monthly`; tek seferlik etkinlikler, atölyeler ve festival/maraton başlıkları elenir. Çıktı `src/data/milongas-de.json` (13 kayıt), `src/lib/milongas.ts` içinde Hoy ile birleşir. Atıf `source: tangocalendar` + etkinlik sayfası; görsel yok. Yeni uç nokta `/milongas.json`; `/hoy-milongas.json` geriye dönük uyum için duruyor.
- **Ülke modeli** (2026-11-08): milonga filtresi artık ülke. Hoy’un editoryal bölgeleri (`berlin`, `nordrhein-westfalen`, `buenos-aires`, `athens`, `miami`, `england`, `sao-paulo`) `region` alanında ülke id’sine çevrilir; Hoy slug’ı yalnız `id` öneki olarak kalır (ICS UID’leri stabil kalsın diye). Metro bölgeleri (Buenos Aires, Atina, Miami) tek şehre indirgenir, kaynağın semt adı `locality` alanında saklanır ve detayda “Area” olarak görünür (CABA/Athina gibi eş anlamlılar atılır). `LEGACY_REGIONS` eski `?region=berlin|frankfurt|miami` linklerini ülkeye çözer; URL yine `region=` parametresini kullanır. Seçenekler ülke adı + kayıt sayısı; sıra Türkiye ilk, sonra hacme göre. Varsayılan ülke tarayıcıdan: saat dilimi (Europe/Berlin → Germany), yoksa dil, yoksa Türkiye (`src/lib/geo.ts`). Not: 2026-11-08 itibarıyla Hoy’un Türkiye sayfası **yalnız İstanbul** döndürüyor (74 → 46 kayıt); Ankara/İzmir/Adana vb. kaynakta görünmüyor, ayrı kaynak gerekir.
- **IP bazlı ülke** (`functions/_middleware.ts` + `functions/lib/country.ts`): Cloudflare’ın `request.cf.country` değeri `TR/AR/DE/GR/BR/GB/US/SE/CH` → ülke id’sine eşlenir; `/milongas` (ve `/milongas/`) `region` parametresi yoksa 302 ile `?region=<ülke>` adresine gider. Bot UA’ları (Googlebot, bingbot, sosyal önizleme vb.) muaf — aksi halde arama motoru her veri merkezinden farklı bir URL indekslerdi. Ülke kapsam dışıysa (AT, FR…) yönlendirme yok; sayfa varsayılanı ve istemci tespiti devrede. Mantık `countryRedirect()` saf fonksiyonunda, node ile test edildi.
- **Kaynak: tangokalendern.se** (`ingest_sweden.py`, 2026-11-08). Ana sayfadaki `#tk-event-list-jsonld` ItemList tüm occurrence’ları yerel saat + ofsetle verir (API’nin UTC saatine göre kayma yok). Kategori, `description`’ın ilk kelimesinden (`Milonga på…`, `Praktika på…`) — API `type` ile birebir. Bitiş saati kaynakta yok; `end` boş kalır. 319 milonga/praktika occurrence → **31 seri** (24 haftalık, 6 iki haftada bir, 1 aylık), 7 şehir; kurs/workshop/festival elenir.
- **Kaynak: milongas.ch** (`ingest_milongas_ch.py`, 2026-11-08). Ana sayfa MEC takvimi: her occurrence bir `<article class="mec-event-article">` kartı; tarih linkteki `?occurrence=YYYY-MM-DD`, saat `19:30 - 21:30`, kategori “NN. Milonga régulière / Practica libre / Milonga ponctuelle”, mekân/şehir `mec-event-loc-place`. Geçmiş kartlar `mec-past-event` ile atlanır; konser/maraton/festival kategorileri elenir. 84 occurrence → **18 seri** (14 haftalık, 4 iki haftada bir), 7 şehir (Genève 10).
- **Kaynak: tango.oslo.no** (`ingest_oslo.py`, 2026-11-08). Public iCalendar (`/kalender.ics`, 233 VEVENT), her occurrence ayrı kayıt; `CATEGORIES` alanı (`Milonga`, `Practica`, `Kurs`…) doğrudan tür veriyor. Saatler **UTC** (`DTSTART:…Z`), feed’in `X-WR-TIMEZONE` değeri Europe/Oslo; `cet_to_local()` (AB yaz saati kuralı, stdlib) ile yerel saate çevrilir — 7 Aralık 19:00Z → 20:00, sayfadaki “20:00–00:00” ile doğrulandı. `Pris:` ve `Arrangør:` satırları açıklamadan alınır. 17 iptal + 93 kurs + 10 workshop + 7 festival elenir; 101 occurrence → **9 seri** (6 haftalık, 3 iki haftada bir), hepsi Oslo.
- **Kaynak: tango-wien.at** (`ingest_vienna.py`, 2026-11-08). Takvim ISO hafta sayfaları (`/kalender/woche/YYYY-WW`); her occurrence bir `<article class="week-event-card">` kartı: `data-category` (Milonga/Practica/Kurs/Workshop/Diverses/Bodywork), `data-occurrence-date`, `<time datetime>` başlangıç/bitiş, `event-venue` (mekân · posta kodu), `data-organizer-name`. 12 hafta taranır (haftada ~100 kart, çoğu kurs). 202 milonga/praktika occurrence → **21 seri** (18 haftalık, 2 iki haftada bir, 1 aylık), hepsi Wien. Not: JSON-LD ItemList 50 kayıtta kesiliyor, bu yüzden HTML kartları kullanılıyor.
- **Kaynak: FAItango** (`ingest_italy.py`, 2026-11-08). `/agenda-eventi?f[tE][6]=6&f[tE][7]=7&cerca=1&page=N` (tip 6 = Milonga, 7 = Pratica) sunucu-render tablo; satırlar `<h1>` gün başlığı altında, şehir/il, başlık, organizatör ve etkinlik linki var; **saat yok**. Bu yüzden seri başına yalnız *sonraki* occurrence’ın sayfası çekilir: `Ora evento/Ora fine evento/Locale/Localita`. 120 günlük pencere, 997 occurrence → 130 aday → **81 seri** (50 haftalık, 16 iki haftada bir, 15 aylık), 198 şehir (Torino 9, Bologna 6, Firenze 6). Takvim haftalık döndüğü için script **en fazla 5 günde bir** yenilenir (`--max-age-days`, `--force` ile atlanır); aksi halde CI’da her 6 saatte ~130 sayfa çekilirdi.
- **Kaynak: Agenda del Tango / İspanya** (`ingest_spain.py`, 2026-11-08). `/milongas/` ülke çapında **haftalık dizin**: kart başına gün, saat, şehir, tür + JSON-LD `ItemList` (199 milonga). Her milonga sayfasında `EventSeries` JSON-LD var (mekân, adres, `startTime/endTime`, fiyat); **kadans** yalnız sayfa metninde — “(semanal) / (quincenal) / (mensual)”; JSON-LD hepsinde `P1W` diyor, bu yüzden metne güvenilir. 199 → **183 milonga** (153 haftalık, 26 aylık, 4 iki haftada bir; 171 milonga + 12 práctica), Madrid 28 · Barcelona 21 · Valencia 10 · Zaragoza 9. 7 günde bir yenilenir.
- **Kaynak: London Milongas** (`ingest_london.py`, 2026-11-08). `/calendar/` MEC aylık takvimleri: gün başına `div[data-mec-cell]`, occurrence başına `article.mec-event-article` (saat, başlık+link, mekân). Basılan pencere ~5 hafta (30 gün): 167 occurrence → **37 seri** (30 haftalık, 4 iki haftada bir, 3 aylık). `region: united-kingdom` olduğu için Hoy’un England kayıtlarıyla birleşir (44 kayıt). Uyarı: kaynak “Londra ve çevresi”ni kapsıyor; şehir alanı şimdilik hep **London** (Oxford/Hove gibi birkaç etkinlik de London görünür). 7 günde bir yenilenir.
- **Kaynak: tangokalender.nl / Hollanda** (`ingest_netherlands.py`, 2026-11-08). Eski ASP.NET WebForms: `evenementagenda.aspx` tek gün gösterir, takvim **postback** ile gezinir (`__EVENTTARGET=…Calendar1`, `__EVENTARGUMENT=<2000-01-01’den gün sayısı>`). Oturum + `__VIEWSTATE` zinciriyle 56 gün gezilir (1 GET + 56 POST, sıralı); `GridView1` tablosundan plaats/tijd/evenement/locatie/prijs okunur, `<strike>` (iptal) ve “geen salon” satırları atlanır. 417 occurrence → **42 seri** (28 haftalık, 10 aylık, 4 iki haftada bir). Kaynak “Nederland en omstreken”i kapsar: **Aken/Keulen** Almanya’ya yazılır (3 kayıt), Belçika şehirleri (Antwerpen/Gent/Deurne (B)…) atlanır. 7 günde bir yenilenir.
- **Kırık kaynak linkleri** (2026-11-08): `check_links.py` artık yönlendirmeleri kendisi izliyor (no-redirect opener). Web dışı şema (`Xhttps://…`) → `dead`; Tangocat’ın kaldırdığı etkinliklerde 302 → `/en/festivals` → yeni **`gone`** durumu. `gone` kayıtlar sayfa olarak kalır (“The source no longer lists this event.” uyarısıyla) ama board, arama ve RSS’ten düşer (`getNews` filtresi); `news/[slug].astro` artık `getCollection` + `hasNotEnded` ile üretiliyor ki bu sayfalar 404 olmasın. İlk taramada 11 kayıt `gone`, 2 kayıt `dead` çıktı. Örnek: **5th Tangoaires Marathon** — Tangocat’ın `/go/` yönlendirmesi bozuk (`Xhttps://tangoaires.gr/…`), etkinlik tangoaires.gr’de yaşıyor; kayda çalışan `eventWebsite` eklendi.
- Üst bar tarihi mobilde kısalıyor: `≤640px`’de `6 Kas` / `6 Nov`, üstünde `Fri, 6 Nov 2026`. Uzun tarih 390px’te marka yüzünden kırpılıyordu (`FRI, 6 N…`).

## Deploy hattı (CI)

- **İki workflow, tek concurrency grubu** (`site-deploy`, `cancel-in-progress: false`): üst üste binmezler, sıraya girerler. Önceden `deploy-site` / `update-site` diye ayrıydılar; aynı commit iki kez build edilip iki kez deploy edilebiliyordu (2026-11-08'de 19:46'da tam olarak bu oldu).
- **Deploy** (`deploy.yml`): `push: main` + **`workflow_dispatch`**. Yalnız `npm ci → build → wrangler pages deploy`. Kod değişikliğini yayına almanın hızlı yolu budur; push sonrası ayrıca `Update site` tetiklemeye gerek yok.
- **Update site** (`update.yml`): `schedule` (6 saatte bir) + `workflow_dispatch` (boolean `checks`). İçerik toplar, link sağlığını ve görselleri commit eder, build + deploy eder. Deploy sonrası görsel kontrol + E2E yalnız **schedule**'da ya da manuel tetiklemede `checks` işaretliyse koşar; hızlı manuel deploy ~3 dk kazanır. 19:27 koşusundaki 18 dk 24 sn'nin dökümü: ingest 3:24, link check 0:53, build 10:56, deploy 0:11, Chromium+görsel+E2E 2:33.
- **Astro görsel cache'i**: optimize görseller `node_modules/.astro/assets` içinde; `npm ci` dizini sildiği için her koşu 4.648 sharp dönüşümünü sıfırdan yapıyordu. İki hatta da `actions/cache` ile (`astro-images-<os>-<assets+lock hash>`) `npm ci`'den **sonra** geri yükleniyor. Yalnız `assets/` alt dizini cache'leniyor (`.astro` içindeki üretilen tipler/dosya listeleri bayatlamasın). Anahtar görsel içeriğiyle değişir; eski girdiler GitHub tarafından LRU ile atılır.
- **Görsel çıktısı**: `<Picture>` kullanımlarında `fallbackFormat="jpg"` (Astro varsayılanı `png`; 260 kB kaynaktan 4 MB PNG üretiyordu → `dist` 339 MB, 111 MB'ı PNG). Toplanan kapaklar `agentic-python/normalize-event-images.mjs` ile JPEG'e çevriliyor (149 PNG → 36 MB tasarruf, frontmatter referansları da güncellenir); `--check` kalan PNG'leri raporlar, `--dry-run` sadece listeler. Update hattı bu scripti ingest'ten sonra çalıştırır.

## Test suite

- Vitrin Playwright testleri `e2e/` altında. Varsayılan hedef `https://tangoexplorer.com`; yerel için `BASE_URL`. `npm run test:e2e`. 2026-10-06'da yazıldı, çalıştırılmadı.
- Kapsam: sayfalar, menü, filtre, arama, zaman çizelgesi, detay paneli, milonga, dil, 404, mobil ve JS kapalı. Ingest/publish yok.

## Günlük döngü

```
python agentic-python/ingest.py
python agentic-python/publish.py --dry-run
python agentic-python/publish.py
python agentic-python/ingest_hoy.py
python agentic-python/ingest_tango_de.py --publish
python agentic-python/ingest_sweden.py --publish
python agentic-python/ingest_milongas_ch.py --publish
python agentic-python/ingest_oslo.py --publish
python agentic-python/ingest_vienna.py --publish
python agentic-python/ingest_italy.py --publish
python agentic-python/ingest_spain.py --publish
python agentic-python/ingest_london.py --publish
python agentic-python/ingest_netherlands.py --publish
python agentic-python/ingest_tangoverse.py --images
python agentic-python/ingest_tangoverse.py --publish
python agentic-python/ingest_tmd.py
npm run build
npx wrangler pages deploy dist --project-name tango-news
```

Instagram duman testi (yayın yok): `python agentic-python/ingest_instagram.py --usernames chillouttangomarathon,istanbultangoweekend,laturcatango_istanbul`

Yerel vitrin: `npm run dev`

Wrangler ilk deploy’da Cloudflare girişi ister. Domain ve Pages projesi dashboard’dan önceden açılmak zorunda değil.
