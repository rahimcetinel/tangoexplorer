#!/usr/bin/env node
/**
 * Build öncesi görsel kapısı.
 *
 * `Ingest and publish` ne indirirse indirsin `Persist collected images` onu
 * doğrudan commit'liyor. Bozuk bir JPEG (eksik segment uzunluğu, araya karışmış
 * dolgu baytları, yarım indirme) ancak dakikalar sonra Build adımında
 * `NoImageMetadata` olarak patlıyor ve o commit main'e çoktan girmiş oluyor
 * (2026-11-21'de tam olarak bu oldu: tangocat-nackter-tango.jpg).
 *
 * Bu script Astro'nun build sırasında kullandığı **aynı** başlık
 * ayrıştırıcısını (astro/dist/assets/utils/vendor/image-size) çalıştırır; yani
 * "Astro bu dosyayı okuyamayacak" kararını build'den önce, saniyeler içinde ve
 * dosya adıyla verir.
 *
 * Kullanım:
 *   node agentic-python/verify-event-images.mjs
 *   node agentic-python/verify-event-images.mjs --dir src/assets/events
 *
 * Çıkış kodları: 0 = hepsi okunabilir, 1 = en az bir dosyayı Astro okuyamaz.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const targetDir = join(ROOT, argValue('--dir') ?? 'src/assets/events');

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (IMAGE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Astro'nun kendi ayrıştırıcısı. Paketin "exports" haritası bu alt yolu
// açmayabileceği için doğrudan dosya yolundan yüklüyoruz.
const lookupPath = join(
  ROOT,
  'node_modules',
  'astro',
  'dist',
  'assets',
  'utils',
  'vendor',
  'image-size',
  'lookup.js',
);

let lookup;
try {
  ({ lookup } = await import(pathToFileURL(lookupPath).href));
} catch (error) {
  // Astro iç yapısı değişirse kapıyı sessizce devre dışı bırak; yanlış
  // pozitifle deploy'u kilitlemek daha kötü.
  console.warn(`verify-event-images: Astro image-size bulunamadı, kontrol atlandı (${error.message})`);
  process.exit(0);
}

const files = await walk(targetDir);
const failures = [];

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/');
  let buffer;
  try {
    buffer = await readFile(file);
  } catch (error) {
    failures.push({ rel, size: 0, reason: `okunamadı: ${error.message}` });
    continue;
  }
  try {
    const meta = lookup(buffer);
    if (!meta.width || !meta.height) {
      failures.push({ rel, size: buffer.length, reason: `boyut okunamadı (${meta.type ?? 'bilinmeyen tür'})` });
    }
  } catch (error) {
    failures.push({ rel, size: buffer.length, reason: error.message });
  }
}

if (failures.length === 0) {
  console.log(`verify-event-images: ${files.length} görsel okunabilir (${relative(ROOT, targetDir)})`);
  process.exit(0);
}

for (const { rel, size, reason } of failures) {
  console.error(`::error file=${rel}::Astro bu görseli okuyamaz, build NoImageMetadata ile düşer: ${reason}`);
  console.error(`  ${rel} (${Math.round(size / 1024)} kB) — ${reason}`);
}

const total = failures.reduce((sum, f) => sum + f.size, 0);
console.error(
  `\nverify-event-images: ${failures.length}/${files.length} görsel bozuk (${Math.round(total / 1024)} kB). ` +
    "Kaynağı yeniden indirin ya da dosyayı yeniden kodlayın; bozuk görseli commit'lemeyin.",
);
process.exit(1);
