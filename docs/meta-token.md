# Meta / Instagram token'ı — kontrol ve yenileme

`META_ACCESS_TOKEN` uzun ömürlü bir Instagram token'ıdır ve **60 günde** dolar.
2026-11-11'de sessizce doldu: `ingest_instagram.py` `|| true` ile koştuğu için
hata yutuldu, `source_health.py` yalnızca `out/instagram.json`'ın yaşına baktığı
için koşular yeşil kaldı ve on iki koşu boyunca Instagram verisi yazılmadı.

## Kontrol

```bash
python agentic-python/meta_token.py --check
# OK: token geçerli — @hesap (id 1784…)
# FAIL: token süresi dolmuş (Meta: Wednesday, 11-Nov-26 03:00:50 PST)
```

Çıkış kodları CI'ın dallanması için sabittir: `0` geçerli, `2` süresi dolmuş,
`3` yedi günden az kaldı, `1` beklenmeyen hata.

`META_ACCESS_TOKEN` ve `META_IG_USER_ID` sırayla `.env`'den, ortam
değişkeninden okunur. Token hiçbir zaman stdout'a yazılmaz.

## Yenileme (token hâlâ geçerliyken)

```bash
python agentic-python/meta_token.py --refresh --write-env
```

Yeni token `.env`'e ve `.secrets/meta-access-token.txt`'ye yazılır (ikisi de
git dışında). Ardından GitHub secret'ını güncelleyin:

```bash
gh secret set META_ACCESS_TOKEN --repo rahimcetinel/tangoexplorer \
  --body "$(cat .secrets/meta-access-token.txt)"
```

Süresi **dolmuş** token yenilenemez (Meta `ig_refresh_token` akışı reddeder).
O durumda Meta app panelinden yeni uzun ömürlü token üretilip secret
değiştirilir.

## CI'da

`Update site` workflow'unda `Meta token health` adımı ingest'ten önce koşar:
token ölmüşse `::error::` annotation'ı ve adım özeti satırı bırakır; koşuyu
kırmızıya çeviren adım `Source health`'dir (artık `pipefail` ile gerçek kapı).

## Duraklatma

Instagram çekimi `INSTAGRAM_INGEST=off` ile duraklatıldığında (bkz.
`implementation-notes.md` → “Instagram'ı geçici durdurma”) `Meta token health`
adımı da atlanır: Graph'a hiç istek gitmez, token süresi uyarısı da görünmez.
Duraklatma 60 günü aşarsa token sessizce dolar; devam etmeden önce
`python agentic-python/meta_token.py --check` çalıştırıp gerekirse `--refresh
--write-env` ile yenileyin.

## Otomasyon (opsiyonel)

`--refresh` her ay bir kez çalıştırılıp secret güncellenirse token hiç dolmaz.
Bunu tam otomatik yapmak `secrets: write` yetkili bir PAT gerektirir; mevcut
`GITHUB_TOKEN` secret yazamaz. O yüzden yenileme bilinçli olarak manuel.
