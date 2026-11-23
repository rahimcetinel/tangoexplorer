"""Instagram Graph erişimi için tek açma/kapama anahtarı.

Site altı saatte bir Instagram Graph API'sinden feed çeker (`ingest_instagram.py`),
adayları habere çevirir (`publish_instagram.py`) ve kapak görseli için son postun
`media_url`'ünü sorar (`collect_images.py`). Bu üçü `INSTAGRAM_INGEST=off` iken
hiç Graph çağrısı yapmaz; `source_health.py` de Instagram satırını FAIL yerine
SKIP yazar, böylece koşu "bozuk kaynak" diye kırmızıya dönmez.

Duraklatmak için `.github/workflows/update.yml` içindeki tek satır:

    env:
      INSTAGRAM_INGEST: "off"

Devam etmek için aynı satırı "on" yap (veya sil; varsayılan "on"dur).
Yerelde: `INSTAGRAM_INGEST=off python agentic-python/ingest_instagram.py`
"""

from __future__ import annotations

import os

# "off" dışında yaygın yazımlar da kapalı saysın: anahtar yanlış yazıldığında
# sessizce açık kalmak yerine kapalı kalsın diye cömert davranıyoruz.
PAUSED_VALUES = {"off", "0", "false", "no", "paused", "duraklat", "durdu"}


def is_paused() -> bool:
    return os.environ.get("INSTAGRAM_INGEST", "on").strip().lower() in PAUSED_VALUES
