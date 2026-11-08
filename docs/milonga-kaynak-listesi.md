# Milonga kaynakları — Bailaspot'un üst kaynakları (araştırma)

Tarih: 2026-11-08 · Durum: **araştırma / plan** (kod yok, ingest yok)

> **Karar (2026-11-08):** Milongalara odaklanılıyor; ilk kaynak **tango-calendar.de**;
> filtre **ülke** (şehir ikinci kesim); Londra gibi örtüşen yerlerde yeni kaynak yalnız
> boşlukları doldurur. Bailaspot ertelendi.
>
> **Uygulanan (Faz 0 + 1 + 2):** `ingest_tango_de.py` (13), `ingest_sweden.py` (31),
> `ingest_milongas_ch.py` (18), `ingest_oslo.py` (9), `ingest_vienna.py` (21),
> `ingest_italy.py` (81), `ingest_spain.py` (183), `ingest_london.py` (37),
> `ingest_netherlands.py` (42 → 39 NL + 3 DE), `ingest_france.py` (37),
> `ingest_czechia.py` (9), `ingest_poland.py` (11), `ingest_romania.py` (4);
> `src/lib/milongas.ts` birleşik veri (**899 kayıt, 18 ülke**), ülke seçici
> (Argentina 208 · Spain 183 · Germany 116 · Italy 81 · Türkiye 46 ·
> United Kingdom 44 · Netherlands 39 · **France 37** · Sweden 31 · Greece 25 ·
> Austria 21 · Switzerland 18 · **Poland 11** · **Czechia 9** · Norway 9 ·
> US 9 · Brazil 8 · **Romania 4**), metro normalizasyonu
> (BA/Atina/Miami), eski `?region=` alias’ları, `/milongas.json` uç noktası,
> kaynak atfı ve `schedule` alanı, tarayıcı + **Cloudflare IP**
> (`request.cf.country`) ile varsayılan ülke. Sıradaki: Kanada (Toronto),
> tangoevents.au, Brüksel/Belçika.

Bailaspot'tan veri almayı erteliyoruz. Bu belge, Bailaspot'un kendi yayınladığı
`sourceUrl` alanından çıkarılan **üst kaynakların** listesini, teknik
okunabilirliğini ve entegrasyon planını içerir.

---

## 1. Yöntem

| Adım | Ne yapıldı | Sonuç |
|---|---|---|
| 1 | Bailaspot'un 41 ülke sayfası (`/xx/tango`) çekildi, her etkinliğin `sourceUrl` alanı ayrıştırıldı | **167 tekil üst alan adı** |
| 2 | Bunlardan platform/sosyal olanlar ayrıldı, kalan 154 alan adı probe edildi (ana sayfa + robots.txt) | **142 açık** |
| 3 | WordPress sitelerinde `/wp-json/wp/v2/types` ve eklenti REST uçları denendi | **22 WP etkinlik API'si** |
| 4 | Öne çıkan 22 takvimde feed taraması (ICS, JSON, RSS, MEC/TEC) | **3 ICS · 1 JSON API · ~10 WP etkinlik sitesi** |

Yardımcı scriptler (tekrar çalıştırılabilir):

```
python agentic-python/explore_bailaspot_sources.py   # üst alan adları haritası
python agentic-python/analyze_upstream.py            # 154 alan adı probe
python agentic-python/probe_calendars.py             # kısa liste derin probe
```

Çıktılar: `agentic-python/out/bailaspot-sources.json`, `upstream-probe.json`,
`calendar-probe.json`.

> Not: `sourceUrl` yalnızca o sayfada görünen 18 etkinlik için okunabildi; yani
> 167 sayı bir **alt sınır**. Bailaspot'un sitemap'inde 6.159 etkinlik sayfası var.

---

## 2. Katmanlar

**A. Doğrudan makine-okunur (feed/API).** Entegrasyon maliyeti en düşük, veri en
temiz. Aşağıdaki 4 kaynak tek başına ~1.260 kayıt veriyor.

**B. HTML + JSON-LD.** Sayfa içinde `schema.org/Event` var; parser yazılır ama
alan eşlemesi kaynak başına değişir (milongas.ch, tango-wien.at, faitango.it).

**C. Platform / sosyal.** Instagram (47), Facebook (46), Telegram (9), VK (8),
Google Calendar (8), Meetup (4), Daum Cafe (4), Google Sites (3). Bunlar site
değil; Instagram tarafı zaten `ingest_instagram.py` ile bizde.

---

## 3. A katmanı — hazır feed'ler (doğrulanmış)

| # | Kaynak | Kapsam | Format / uç nokta | Kayıt | robots | Hoy örtüşmesi | Zorluk |
|---|---|---|---|---|---|---|---|
| 1 | **tango-calendar.de** | Almanya: Frankfurt, Heidelberg, Wiesbaden, Münih (51 mekân) | `GET /kalender.ics` — `text/calendar` | **456 VEVENT** | yalnız `/konto/`, `/redaktion/` kapalı | yok (Hoy: NRW/Berlin) | **S** |
| 2 | **tangokalendern.se** | İsveç: Stockholm, Göteborg… | `GET /api/events` — JSON dizi | **426** | `Allow: /` | yok | **S** |
| 3 | **tango.oslo.no** (tangokalender.github.io) | Norveç: Oslo | `GET /kalender.ics` (+ `webcal://`) | **233 VEVENT** | robots yok | yok | **S** |
| 4 | **milongas.ch** | İsviçre: Genève, Lausanne, Fribourg, Neuchâtel | HTML'de 147 adet `Event` JSON-LD | **147** | kural yok | yok | **M** |
| 5 | londonmilongas.co.uk | İngiltere: Londra | WP REST `mec-events` (+ sayfa LD) | 100+ (sayfalı) | yalnız `wp-admin` | **var** (Hoy: England) | M |
| 6 | tangokalender.dk | Danimarka: Middelfart, Aarhus, Kopenhag | WP REST `mec-events` | 251 (toplam) | `Disallow:` boş = açık | yok | M |
| 7 | canarytango.com | İspanya: Kanarya Adaları | WP REST `mec-events` | 1.087 (toplam) | `Disallow:` boş | yok | M |
| 8 | www.elgaragetango.com | İspanya: Zaragoza | WP REST `mec-events` | 161 | yalnız sistem dizinleri | yok | M |
| 9 | tango-md.de | Almanya: Magdeburg | WP REST `mec-events` | 137 | `Disallow:` boş | yok | M |
| 10 | cc25.org | Arjantin (CC25 salonu) | WP REST `mec-events` | 100+ | yalnız `wp-admin` | kısmi (Hoy: BA) | M |
| 11 | milanotango.it | İtalya: Milano, Bardonecchia | WP REST `tribe_events` | 100+ | yalnız `wp-admin` | yok | M |
| 12 | tangoevents.au | Avustralya: Sidney, Melbourne, Perth… | TEC sayfaları (REST 403) | 6 şehir takvimi | çok kural, etkinlik yolu açık | yok | L |
| 13 | mambocha.com / tangherault-montpellier.com | Fransa: Montpellier, Hérault | WP REST `tribe_events` | onlarca | açık | yok | M |
| 14 | artsharmony.hu · grenlandtango.no · tangokristiansand.no · tangosynergy.com · melbournesocialtango.com · tangonewengland.com | HU · NO · NO · AU · AU · US | WP REST `tribe_events` | küçük | açık | yok | M |

**Bailaspot'un kendi kaynaklarından çıkan ilk dalga: 1–4.** Dördü de abonelik/API
olarak yayınlanmış veri; tek bir adapter ailesiyle alınabilir.

---

## 4. B katmanı — HTML ayrıştırma gerekenler

| Kaynak | Kapsam | Neden B | Not |
|---|---|---|---|
| tango-wien.at | Avusturya: Viyana | `/kalender` HTML, Event LD yok | Aylık/haftalık görünüm; tablo yapısı düzenli |
| www.faitango.it | İtalya | SPA + HTML liste | Alanlar sayfa metninde |
| www.tango-argentin.fr | Fransa: Paris | Haftalık **poster** (RSS tek item, PNG) | Yapısal veri yok; OCR/manual gerekir |
| tangohub.ro | Romanya: Cluj-Napoca | WP, etkinlik eklentisi yok | Bükreş değil; düşük öncelik |
| milongi.krakow.pl | Polonya: Kraków | Özel PHP, haftalık liste | Düzenli HTML |
| www.tangokalender.nl | Hollanda | ASP.NET WebForms (`__doPostBack`) | En zor; ertelenebilir |
| tangolx.com | Portekiz | Wix | Ortak yapı yok |
| tangocalendar.kr | Güney Kore | PWA/SPA; sitemap 203 KB | Sitemap + sayfa LD ile mümkün |
| www.newyorktango.com | ABD: New York | Statik takvim | Aylık HTML |
| isratango.org | İsrail | Statik takvim | 200+ tarih işareti |

---

## 5. Neden bu kaynaklar (Hoy'a göre boşluk)

Mevcut kapsam: Hoy Milonga 8 bölge — Türkiye, Buenos Aires, Berlin, NRW, Atina,
São Paulo, İngiltere, Miami (396 kayıt).

İlk dalga şunları ekliyor:

- **Almanya:** Rhein-Main + Münih (Hoy'da yalnız NRW + Berlin)
- **İskandinavya:** İsveç, Norveç, Danimarka — hiç yok
- **İsviçre:** Genève/Lausanne — hiç yok
- **İtalya, İspanya, Romanya, Avustralya, Kore** — hiç yok

Örtüşme riski yalnızca Londra (Hoy: England) ve kısmen Buenos Aires (cc25).

---

## 6. Uygulama planı

### Faz 0 — Veri modeli (her şeyden önce)
- `src/data/hoy-milongas.json` → `src/data/milongas.json` (kaynak alanı eklenmiş).
- `src/lib/hoy.ts` içindeki sabit `HOY_REGIONS` → veriden gelen `regions`.
- [MilongaView.astro](src/components/MilongaView.astro) seçicisi dinamik listeye bağlanır.
- [EventMilongas.astro](src/components/EventMilongas.astro) içindeki "Times and venues
  come from Hoy Milonga" metni kaynak adına göre üretilir.
- Kart/detayda `Source: <ad> ↗` atıf satırı.
- `hoy-milongas.json` ve `/hoy-milongas.json` geriye dönük uyum için korunur;
  yeni uç nokta `/milongas.json`.

### Faz 1 — `ingest_ics.py` (kaynak 1 + 3)
Genel ICS okuyucu: `RRULE`, `LOCATION`, `SUMMARY`, `DTSTART/DTEND`, `URL`.
- `tango-calendar.de/kalender.ics` (456)
- `tango.oslo.no/kalender.ics` (233)
Tuzak: ICS saatleri yerel/floating; `TZID` varsa uygula, yoksa mekân ülkesine göre
sabit ofset kullan.

### Faz 2 — `ingest_jsonld.py` (kaynak 4)
Liste sayfasındaki `Event` JSON-LD bloklarını topla; `startDate`, `location.name`,
`location.address`, `offers.price`, `url` alanlarını eşle.
- `milongas.ch` (147) — ilk hedef; `tango-wien.at` ve `faitango.it` aynı adapter ailesine girer.

### Faz 3 — `ingest_wp_events.py` (kaynak 5–11)
- MEC siteleri: `/wp-json/wp/v2/mec-events?per_page=100&page=N` ile listele, saat/mekân
  için etkinlik sayfasındaki JSON-LD'yi oku (MEC REST gövdesi boş dönüyor).
- TEC siteleri: `/wp-json/wp/v2/tribe_events` aynı desen.
- Sayfalama Başlığı (`X-WP-Total`) ile tavan koy: yalnız `start >= bugün`.

### Faz 4 — `ingest_milongaro.py` (Bükreş)
6 post, `post-sitemap.xml` → HTML; gün/saat/mekân ilk paragraflardan + manuel
override dosyası. (Bailaspot'un Bükreş kayıtları da bu siteyi gösteriyor.)

### Faz 5 — CI ve test
- [update.yml](.github/workflows/update.yml) ingest bloğuna yeni scriptler `|| true` ile.
- `audit_data.py`: kaynak başına kayıt sayısı + "bugün/gelecek hafta" kontrolü.
- e2e: yeni bölge için milonga filtresi smoke testi.

---

## 7. Ortak adapter sözleşmesi

```python
# her adapter şu sözlüğü üretir
{
  "id": "<source>-<stable-key>",     # dedupe ve ICS UID için
  "source": "tango-calendar.de",
  "sourceUrl": "https://...",        # atıf
  "name": "Milonga X",
  "city": "Frankfurt", "country": "Germany",
  "days": ["friday"],                # RRULE → gün listesi
  "start": "21:00", "end": "01:00",
  "venue": "...", "address": "...", "lat": 50.1, "lng": 8.6,
  "price": "12 €", "organizer": "...",
  "updated": "2026-11-01"            # kaynaktaki son değişiklik
}
```

Dedupe anahtarı: `(normalize(name), city, sorted(days))`. Çakışmada **Hoy kaydı
kalır**, yeni kaynak yalnız boş alanları (fiyat, koordinat, adres) doldurur.

---

## 8. Uyum ve riskler

| Konu | Durum / önlem |
|---|---|
| robots.txt | İlk dalga tamamı açık; `Disallow:` boş olanlar (tangokalender.dk, canarytango) tamamen serbest |
| ICS yayını | Abonelik amaçlı yayınlanmış; yine de atıf + kaynak linki zorunlu |
| WP REST | Herkese açık, kimlik doğrulama yok; yük bindirmemek için `per_page=100` + tek seferlik günlük çekim |
| ToS | Bailaspot'un aksine bu sitelerde otomatik erişim yasağı görülmedi; yine de ilk çalıştırmada site sahiplerine kısa bilgi notu önerilir |
| Veri kalitesi | Saat dilimi (ICS'te `TZID` yoksa), iptal edilmiş etkinlikler, geçmiş kayıtlar |
| Bakım | 4 adapter + 8 site = 12 kırılma noktası; her adapter için "boş dönerse uyar" eşiği |

---

## 9. Kararlar

1. **İlk dalga 4 kaynak mı** (tango-calendar.de, tangokalendern.se, tango.oslo.no,
   milongas.ch), yoksa tek kaynakla pilot mu (tango-calendar.de)?
2. **Bölge modeli:** şehir mi (Frankfurt, Stockholm, Genève) ülke mi (Almanya,
   İsveç, İsviçre)? Yeni kaynaklar şehir bazlı olduğu için şehir öneriliyor.
3. **Londra:** Hoy England ile örtüşüyor — birleştirelim mi, yoksa Hoy kalsın,
   londonmilongas yalnız boşlukları mı doldursun?
4. **milonga.ro** Faz 4'te mi kalsın, yoksa ilk dalgaya mı alınsın (Bükreş tek
   başına da anlamlı)?

---

## 10. Fransa · Çekya · Polonya · Romanya eklendi (2026-11-08)

| Ülke | Kaynak | Teknik | Sonuç |
|---|---|---|---|
| Fransa | **tango-argentin.fr** (`/paris`) | Sunucu-render ajanda, 4 ay; `<h6>` gün başlığı, satırda saat/isim/adres/`de 19h00 à 02h00`/ücret/DJ | 573 occurrence → **37 seri** (31 haftalık, 2 iki haftada bir, 4 aylık) |
| Çekya | **tango-prague.info** (Google Calendar ICS) | UTC damga → CET/CEST; `RRULE` haftalık/aylık 150 gün pencerede genişletilir | 113 occurrence → **9 seri** (5 haftalık, 2 iki haftada bir, 2 aylık) |
| Polonya | **milongi.krakow.pl** (`/kalendarz?m=`) | Aylık takvim; `details.calendar-event.confirmed` + `.predicted` (kaynağın tahmini) | 120 occurrence → **11 seri** (9 haftalık, 2 iki haftada bir), Kraków |
| Romanya | **milonga.ro** (`/category/milonga/`) | WordPress; REST 401 (firewall), arşiv + post sayfaları HTML; başlıkta gün “(Sat)”, gövdede `Ora:` / `Locație:` / `Participare:` | **4 seri** (Bükreş: Cum 21:00, Cmt 21:00, Sal 20:00, Paz 20:00) |

Ortak noktalar: dördü de `milonga_series.py` (occurrence → seri kümeleme) kullanıyor,
`src/data/milongas-{fr,cz,pl,ro}.json` yazıyor ve `update.yml`'de `--publish` ile
koşuyor. Ülke kimlikleri `france`, `czechia`, `poland`, `romania`; `functions/lib/country.ts`
(FR/PL/CZ/RO) ve `src/lib/geo.ts` (Europe/Paris, Europe/Warsaw, Europe/Prague,
Europe/Bucharest + fr-FR/pl-PL/cs-CZ/ro-RO) güncellendi.

**Romanya notları.** `milonga.ro` yavaş (istek başına 20–40 sn; `timeout=120`) ve
REST API kapalı, bu yüzden 1 arşiv + 4 post sayfası çekiliyor. “Evenimente” sayfası
2023’te kalmış; milonga postları Ağustos 2026’da güncellenmiş — yeni milonga
eklenirse arşiv otomatik büyür, ama tazelik `audit_data.py` eşiğiyle izlenmeli.
Kullanılmayan adaylar: `tangohub.ro` / `milongaro.ro` / `tangobucuresti.ro` (DNS
yok), `tangopasion.ro` (Cloudflare), `tangocluj.ro` (stüdyo oda rezervasyonu),
`milongas-in.com` (2012–2017 kayıtları), Bailaspot (toplayıcı, Event JSON-LD yok).
