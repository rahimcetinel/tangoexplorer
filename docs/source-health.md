# Kaynak sağlığı: iki seviye, iki saat, iki kırmızı

Bir kaynak iki farklı yerden bozulabilir ve ikisi aynı tepkiyi hak etmiyor:

| Seviye | Örnek | Ne kaybedilir | Kimin işi |
|---|---|---|---|
| **(a) uç nokta** | `https://tango-calendar.de/kalender.ics` hiç yanıt vermiyor, tüm site kapalı | o kaynağın bütün verisi bayatlar | üçüncü taraf |
| **(b) tek sayfa** | site sağlam ama `…/jan/example-festival.html` 404 | tek bir kart | bizim içerik işimiz |

Tek seferlik kesinti hiçbir yerde kırmızı üretmez. Ama "sonsuza kadar sarı" da
bir cevap değil: `17f75b1`'den sonra erişilemeyen uç nokta WARN olduğu için bir
kaynak aylarca ölü kalıp koşuyu yeşil tutabiliyordu. Aşağıdaki iki saat bu
boşluğu kapatıyor.

## (a) Uç nokta ölümü — `source_health.py`

Saat, kaynağın `generatedAt`'i değil: hoy-milonga her fetch başarısız olsa bile
dosyayı taze zaman damgasıyla yeniden yazıyor. Saat, `lastOkAt` —
`src/data/source-freshness.json` içinde tutulan **son taze ve dolu veri** anı.
Sadece veri gerçekten iyiyse ilerler.

| Uç nokta | Veri | Karar | Nerede kırmızı |
|---|---|---|---|
| erişilemiyor | `lastOkAt` yaşı ≤ `max_age_h + 48 sa` | WARN — yok sayıldı | hiçbir yerde |
| erişilemiyor | yaş > `max_age_h + 48 sa` | **FAIL-EXT** | `source-watch` |
| 404 / 410 / 451 | — | **FAIL** (uç nokta kaldırılmış) | `Update site` |
| 200 ama marker yok | — | **FAIL** (uç nokta tanınmıyor) | `Update site` |
| sağlam | `max_age_h` aşıldı / `min_items` altı | **FAIL** (ingest bozuk) | `Update site` |

Tolerans sabit üç gün değil, **kadans + 48 saat**: altı saatlik kaynaklarda
~3.2 gün, haftalıklarda (`max_age_h = 8 gün`) ~10 gün. Sabit 72 saat haftalık
kaynakları normal çalışırken "ölü" gösterirdi. Kaynak başına ayar: `SOURCES`
tablosundaki `grace_h` (varsayılan `EXTERNAL_GRACE_H = 48`).

Kırmızının yeri ikiye ayrıldı:

- `Update site` yalnızca **bizim** arızamızda kırmızı (exit 1). Yayın hattı
  "kırmızı = bizde bir şey bozuk" anlamını korur.
- `source-watch` günde bir kez, **ağa çıkmadan** (`--from-state`) aynı defteri
  okur ve tolerans aşıldıysa kırmızı olur (exit 2). Böylece "3 gün sürerse haber
  ver" isteği karşılanır, ama bunun için on beş siteye günlük istek atılmaz ve
  Cloudflare'in GitHub runner IP'sine bakan bot duvarı sonucu çarpıtmaz.

Defter ilk kez yoksa her satır WARN'dır: ilk koşu kimseyi kırmızıya çevirmez, bir
sonraki altı saatlik koşu defteri doldurur. Defter 12 saatten eskiyse
`source-watch` "hat durmuş olabilir" uyarısı yazar — o saatler artık kaynağı
değil hattı anlatır.

## (b) Tek sayfa ölümü — `check_links.py` + `link-health.json`

`link-health.json` her URL için `firstBadAt` taşır. `news.ts` bir kartı ancak
link **üç gün** (`SOURCE_GONE_AFTER_H = 72`) kesintisiz `dead`/`gone` kaldıysa
düşürür. Üç günden önce kart sitede kalır ve `EventBox` "kaynağa ulaşılamıyor"
uyarısını gösterir.

Sayılan durumlar yalnızca `dead` (404/410/451) ve `gone` (kaynak ilanı geri
çekti, ör. Tangocat 302 → `/en/festivals`). `blocked`, `unreachable`, `error`
saati ne başlatır ne sıfırlar: bir bot duvarı ya da zaman aşımı, etkinliğin
kalktığının kanıtı değildir. Bu yüzden CI'dan gelen tek bir ölçümle kart
silinmez — silinseydi GitHub runner'ına 403 veren sağlam bir siteyi kaybederdik.

Kart **silinmez**, listeden düşer: içerik dosyası ve verisi yerinde kalır, link
tekrar 200 verirse `status` `ok` olur, `firstBadAt` temizlenir ve kart kendiliğinden
geri gelir. `--limit`/bitmiş etkinlik gibi nedenlerle bu koşuda kontrol
edilmeyen URL'lerin geçmişi korunur.

## Ayarlar ve yerel komutlar

| Ne | Nerede | Varsayılan |
|---|---|---|
| Dış kesinti toleransı | `source_health.py` → `EXTERNAL_GRACE_H`, kaynak başına `grace_h` | 48 sa |
| Kart düşme süresi | `check_links.py` → `SOURCE_GONE_AFTER_H`, `src/lib/link-health.ts` → aynı ad | 72 sa |

İki `SOURCE_GONE_AFTER_H` birlikte değişmeli; Python saatleri yazar, TypeScript
okur.

```powershell
# tam kontrol (ağa çıkar)
python agentic-python/source_health.py
# veri dosyaları yalnız
python agentic-python/source_health.py --no-probe
# günlük hat ne yapıyorsa o: defteri oku, ağa çıkma
python agentic-python/source_health.py --from-state --fail-on-external
# link defterini güncelle (72 saatlik saatleri yazar)
python agentic-python/check_links.py --write --timeout 12
```

## Bilinen sınırlar

- CI ölçümleri GitHub runner IP'sinden yapılır. Bir site bu IP'ye 403 verip
  kullanıcıya açık olabilir; bu yüzden `blocked` hiçbir zaman kart düşürmez ve
  (a) tarafında da yalnızca *süre* kırmızıya götürür.
- `lastOkAt` yalnızca veri taze ve `min_items` üstündeyken ilerler. Bir ingest
  çöküp dosyayı hiç yazmazsa saat ilerlemez — istenen davranış budur.
- GitHub zamanlanmış hatları yoğun saatlerde atlayabilir ve 60 gün hareketsizlikte
  kapatır. Saatler koşu sayısına değil duvar saatine bağlı olduğu için atlanan
  koşu sonucu bozmaz; hat tamamen durursa defterin yaşı uyarı verir.
