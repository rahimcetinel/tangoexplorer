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

## Günlük döngü

```
python agentic-python/ingest.py
python agentic-python/publish.py --dry-run
python agentic-python/publish.py
npm run build
npx wrangler pages deploy dist --project-name tango-news
```

Instagram duman testi (yayın yok): `python agentic-python/ingest_instagram.py --usernames chillouttangomarathon,istanbultangoweekend,laturcatango_istanbul`

Yerel vitrin: `npm run dev`

Wrangler ilk deploy’da Cloudflare girişi ister. Domain ve Pages projesi dashboard’dan önceden açılmak zorunda değil.
