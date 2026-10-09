# TangoExplorer — Günlük Instagram Otomasyonu (Plan)

> Durum: **Planlama / requirements** aşaması. Geliştirmeye henüz başlanmadı.
> Onay verildikten sonra development ve test case'leri hazırlanacak.

## 1) Kapsam

- Günde **1 kez**: aynı etkinliği **hem feed post** hem **Story** olarak paylaş.
- Etkinlik, **içinde bulunulan ay veya bir sonraki ay** içinde **başlayan** etkinlikler arasından seçilir
  (ör. "19 October 2026'da başlayan" bir etkinlik).
- Dil: **İngilizce**.
- Görseller **Cloudflare Pages** üzerinden herkese açık URL ile Instagram'a verilir.
- Mevcut yapı içinde (agentic-python + GitHub Actions) veya ayrı bir workflow olarak kurgulanır.

## 2) Fonksiyonel gereksinimler (öneri)

- **FR1 Havuz:** `eventStart` bugünden itibaren, içinde bulunulan ay veya gelecek ay olan etkinlikler.
  Zaman dilimi: **Europe/Istanbul**.
- **FR2 Rotasyon:** Havuzdaki etkinlikler deterministik sırayla (`eventStart` → `title`), günde bir tane.
  Aynı etkinlik havuz bitene kadar tekrar etmez; havuz bitince baştan başlar.
- **FR3 Görsel üretimi:** Playwright ile markalı şablon render'ı (zaten dev bağımlılığı).
  - Feed: **1080×1350 (4:5)**, Story: **1080×1920 (9:16)**, format **JPEG** (IG API görselde JPEG ister).
- **FR4 İçerik alanları:** etkinlik görseli (gerçek görsel yoksa fallback fotoğraf), başlık, tarih aralığı,
  şehir/ülke, bölge·tür; caption'da kısa açıklama + `tangoexplorer.com` + hashtag seti.
- **FR5 Yayınlama:** Graph API 2 adım — `POST /{ig-user-id}/media` (konteyner) → durum `FINISHED` bekle →
  `POST /{ig-user-id}/media_publish`. Story için `media_type=STORIES`.
- **FR6 Yayın URL'si:** Üretilen görseller `public/ig/<YYYY-MM-DD>/post.jpg` & `story.jpg` altına yazılır,
  Cloudflare Pages'e deploy edilir, sonra `https://tangoexplorer.com/ig/...` URL'si IG'ye verilir.
- **FR7 İdempotency:** Günde 1 kez garantisi. Ay/rotasyon durumu dosyada tutulur; tekrar çalıştırmada
  mükerrer paylaşım yapılmaz.
- **FR8 Hata yönetimi:** Yayın başarısızsa durum ilerlemez, loglanır; (opsiyonel) uyarı.

## 3) Ön koşul — Instagram API güncellemesi (KRİTİK)

- Mevcut token yetkileri: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`,
  `pages_show_list`, `business_management`, `ads_read`, `public_profile`.
- **`instagram_content_publish` yetkisi eksik** — bu olmadan paylaşım yapılamaz. Gerekenler:
  1. Meta app'e `instagram_content_publish` eklenip **yeni uzun ömürlü token** üretilmeli
     (GitHub secret olarak saklanacak).
  2. Instagram hesabı **Profesyonel (Business/Creator)** ve bir **Facebook Sayfası'na bağlı** olmalı.
  3. Graph API sürümü güncellenmeli (kodda şu an `v21.0`).
- **Risk:** content publishing izni App Review gerektirebilir. Kendi hesabına yayın, uygulama üzerinde
  rolü olan hesapla test edilebilir; netleştirilecek.

## 4) Mimari (mevcut yapı içinde)

- Yeni workflow: **`.github/workflows/instagram-daily.yml`** (günlük cron + `workflow_dispatch`).
- Python modülleri:
  - `agentic-python/ig_select.py` — havuz + rotasyon seçimi,
  - `agentic-python/ig_render.py` — Playwright ile JPEG üretimi,
  - `agentic-python/ig_publish.py` — Graph API yayını,
  - `ig-state.json` — durum dosyası.
- Akış: `checkout → npm ci → görsel üret (public/ig) → build + deploy → ig_publish (post + story) → state commit`.
- Secrets: `META_ACCESS_TOKEN` (publish yetkili), `META_IG_USER_ID`, mevcut Cloudflare secret'ları.

## 5) Test planı (özet)

- **Birim:** havuz filtreleme (ay sınırı/TZ), rotasyon & tekrar engeli, caption üretici, state okuma/yazma.
- **Entegre (dry-run):** görsel üretimini çalıştır; çıktı **JPEG**, boyut/aspect doğru, dosya < 8 MB;
  caption doğru; **yayın yok** (`DRY_RUN=1`).
- **API (kontrollü):** yalnızca **test/business IG hesabına** gerçek post + story; URL erişilebilirlik
  kontrolü; konteyner durum (`FINISHED`/`ERROR`) davranışı.
- **Kabul:** 3 gün üst üste mükerrersiz paylaşım; görsel okunabilir; caption doğru; story 9:16 düzgün.

## 6) Açık sorular (karar bekleniyor)

1. **Post ve Story aynı etkinlik mi** olsun, yoksa Story farklı bir seçim mi?
2. **Seçim kuralı/öncelik:** yalnızca **görselli** etkinlikler mi? Hangi kaynaklar (Tangocat/Tangoverse/TMD/Instagram)?
   Öncelik: **en yakın tarihli** mi, çeşitlilik (bölge/tür) mi?
3. **Paylaşım saati** (TSİ)?
4. Ayın son günlerinde ağırlık **gelecek aya** mı kaysın (ör. son 7 gün)?
5. **Caption politikası:** hashtag seti sabit mi; "link in bio / tangoexplorer.com" nasıl olsun?
   (Not: API ile Story'ye link sticker eklenemiyor.)
6. **Fallback görsel** (fotoğrafı olmayan etkinlik) bu paylaşımlarda kullanılsın mı?
7. **Test hesabı** var mı (gerçek yayını test edeceğimiz ayrı bir Business IG hesabı)?
8. Instagram hesabı Business + FB Page bağlı mı ve `instagram_content_publish` eklenebilir mi?
