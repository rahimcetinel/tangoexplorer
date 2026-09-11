# Tango News

Arjantin tangosu haber vitrini. Kaynak özeti + link; tam metin kopyası yok.

```
npm install
npm run dev
```

Haber toplama:

```
python agentic-python/ingest.py
python agentic-python/publish.py --dry-run
python agentic-python/publish.py
```

Cloudflare Pages (ücretsiz):

```
npm run build
npx wrangler pages deploy dist --project-name tango-news
```

Ayrıntı: `implementation-notes.md`.
