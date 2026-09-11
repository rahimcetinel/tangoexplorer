# Inbox

Instagram veya Facebook’tan gördüğün bir duyuruyu buraya `.txt` veya `.md` olarak bırak.

İlk satır başlık olur. Metnin içinde bir `https://...` linki varsa kaynak (Instagram/Facebook) olarak kullanılır.

Facebook grubu yazısı blog ise dosya adına `blog` koy veya gövdeye `format: blog` yaz. Aksi halde etkinlik sayılır.

Örnek: `ornek-instagram-notu.txt`

Sonra:

```
python agentic-python/ingest.py
python agentic-python/publish.py --dry-run
python agentic-python/publish.py
```
