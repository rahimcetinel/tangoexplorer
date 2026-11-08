#!/usr/bin/env node
/**
 * Normalize collected event artwork to JPEG.
 *
 * Ingestors save whatever the source serves, so a good part of
 * `src/assets/events` ends up as PNG. Astro then has to rasterize those PNGs
 * for every width/format combination, and the `<Picture>` fallback is a
 * multi-megabyte PNG. Converting at collection time keeps the repo small and
 * keeps the build/upload fast.
 *
 * Usage:
 *   node agentic-python/normalize-event-images.mjs            # convert + rewrite
 *   node agentic-python/normalize-event-images.mjs --dry-run  # report only
 *   node agentic-python/normalize-event-images.mjs --check    # exit 1 if PNGs remain
 */
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets', 'events');
const CONTENT = join(ROOT, 'src', 'content');
const DATA = join(ROOT, 'src', 'data');
const QUALITY = 84;

const dryRun = process.argv.includes('--dry-run');
const checkOnly = process.argv.includes('--check');

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
    } else {
      out.push(full);
    }
  }
  return out;
}

async function convert(file) {
  const png = await sharp(file).metadata();
  const target = file.replace(/\.png$/i, '.jpg');
  await sharp(file)
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
    .toFile(target);
  const [before, after] = await Promise.all([stat(file), stat(target)]);
  await rm(file);
  return {
    name: file.split(/[\\/]/).pop(),
    width: png.width,
    height: png.height,
    beforeKb: Math.round(before.size / 1024),
    afterKb: Math.round(after.size / 1024),
  };
}

const pngs = (await walk(ASSETS)).filter((file) => /\.png$/i.test(file));

if (checkOnly) {
  if (pngs.length > 0) {
    console.error(`${pngs.length} PNG file(s) under src/assets/events; run normalize-event-images.mjs`);
    process.exit(1);
  }
  console.log('event images: all JPEG/WebP');
  process.exit(0);
}

if (pngs.length === 0) {
  console.log('event images: nothing to convert');
  process.exit(0);
}

const converted = [];
for (const file of pngs) {
  const base = file.split(/[\\/]/).pop().replace(/\.png$/i, '');
  if (dryRun) {
    console.log(`would convert ${relative(ROOT, file)}`);
    continue;
  }
  try {
    const result = await convert(file);
    converted.push(result);
    console.log(
      `${result.name} -> .jpg (${result.width}x${result.height}, ${result.beforeKb}kB -> ${result.afterKb}kB)`,
    );
  } catch (error) {
    console.error(`skip ${relative(ROOT, file)}: ${error.message}`);
  }
}

if (dryRun) {
  console.log(`\ndry run: ${pngs.length} PNG file(s) would be converted`);
  process.exit(0);
}

// Rewrite `/events/<slug>.png` references in content frontmatter and data files.
const references = new Map();
for (const file of converted) {
  references.set(file.name.replace(/\.png$/i, '.png'), file.name.replace(/\.png$/i, '.jpg'));
}

const textFiles = [
  ...(await walk(CONTENT)).filter((file) => /\.(md|mdx|json|ya?ml)$/i.test(file)),
  ...(await walk(DATA)).filter((file) => /\.(json|ya?ml|ts)$/i.test(file)),
];

let rewritten = 0;
for (const file of textFiles) {
  const original = await readFile(file, 'utf8');
  let next = original;
  for (const [from, to] of references) {
    next = next.split(`/events/${from}`).join(`/events/${to}`);
  }
  if (next !== original) {
    await writeFile(file, next);
    rewritten += 1;
  }
}

const savedKb = converted.reduce((sum, file) => sum + file.beforeKb - file.afterKb, 0);
console.log(
  `\nconverted ${converted.length} image(s), saved ${(savedKb / 1024).toFixed(1)} MB, ` +
    `rewrote ${rewritten} file(s)`,
);
