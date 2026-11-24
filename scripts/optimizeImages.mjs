// Image pipeline for the virtual filesystem assets.
//
//   node scripts/optimizeImages.mjs                     generate missing/stale thumbnails
//   node scripts/optimizeImages.mjs --resize-originals  also shrink oversized originals IN PLACE first
//   node scripts/optimizeImages.mjs --force             regenerate every thumbnail
//
// Thumbnails land in src/assets/thumbs/<path relative to src/assets>.webp
// (e.g. src/assets/thumbs/images/achievements/ExploitX/IMG_0028.JPG.webp), which is exactly
// what fs.thumb() in src/os/fs.js looks up: `../assets/thumbs/${asset}.webp`.
//
// --resize-originals is lossy and overwrites files; the untouched originals stay in git history.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "../src/assets");
const THUMBS = path.join(ASSETS, "thumbs");

// Must stay in sync with assetMappings in generateFileSystemData.js.
const ROOTS = ["Documents", "images/Wallpappers", "images/personal", "images/achievements"];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const THUMB_EDGE = 480;
const THUMB_QUALITY = 72;
const MAX_EDGE = 2560;
const MAX_BYTES = 900 * 1024;
const JPEG_QUALITY = 82;
// A re-encode must save at least this much to be written, which also makes the pass idempotent:
// an already optimized file re-encodes to about the same size and is left alone.
const MIN_SAVING = 0.1;

const args = new Set(process.argv.slice(2));
const RESIZE = args.has("--resize-originals");
const FORCE = args.has("--force");

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const kb = (n) => `${Math.round(n / 1024)} KB`;
const rel = (p) => path.relative(ASSETS, p).split(path.sep).join("/");

async function walk(dir) {
  const out = [];
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const item of items) {
    if (item.name.startsWith(".")) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function listImages() {
  const files = [];
  for (const root of ROOTS) files.push(...(await walk(path.join(ASSETS, root))));
  return files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase())).sort();
}

async function totalSize(files) {
  let sum = 0;
  for (const f of files) sum += (await fs.stat(f)).size;
  return sum;
}

// ---- pass 1 (optional): shrink oversized originals in place --------------------------------
async function resizeOriginal(file) {
  const ext = path.extname(file).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) return null;

  const before = (await fs.stat(file)).size;
  const input = await fs.readFile(file); // buffer: never read and write the same path at once
  const meta = await sharp(input).metadata();
  // Dimensions as displayed (EXIF orientations 5-8 swap the axes).
  const swapped = (meta.orientation || 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  const tooBig = Math.max(width, height) > MAX_EDGE;
  if (before <= MAX_BYTES && !tooBig) return null;

  let pipeline = sharp(input)
    .rotate() // bake EXIF orientation into the pixels
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });

  if (ext === ".png") {
    // Keep PNG as PNG. Fully opaque images are quantized to an 8-bit palette (a large visual
    // no-op for wallpapers/posters and several times smaller than truecolor); images that
    // really use alpha are only recompressed losslessly.
    const { isOpaque } = await sharp(input).stats();
    pipeline = pipeline.png(
      isOpaque
        ? { compressionLevel: 9, effort: 10, palette: true, quality: 90, dither: 0.5 }
        : { compressionLevel: 9, effort: 10 }
    );
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true });
  }

  const output = await pipeline.toBuffer();
  // Never write a bigger file, even when the dimensions were over the limit.
  if (output.length >= before) return null;
  if (!tooBig && output.length > before * (1 - MIN_SAVING)) return null;

  const tmp = `${file}.tmp-opt`;
  await fs.writeFile(tmp, output);
  await fs.rename(tmp, file);
  return { before, after: output.length };
}

// ---- pass 2: thumbnails ---------------------------------------------------------------------
async function makeThumb(file) {
  const out = path.join(THUMBS, `${rel(file)}.webp`);
  if (!FORCE) {
    try {
      const [src, dst] = await Promise.all([fs.stat(file), fs.stat(out)]);
      if (dst.mtimeMs >= src.mtimeMs && dst.size > 0) return null;
    } catch {
      /* no thumbnail yet */
    }
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  const info = await sharp(file)
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: 5 })
    .toFile(out);
  return info.size;
}

/** Delete thumbnails whose source image no longer exists. */
async function pruneThumbs(sources) {
  const wanted = new Set(sources.map((f) => path.join(THUMBS, `${rel(f)}.webp`)));
  let removed = 0;
  for (const thumb of await walk(THUMBS)) {
    if (!wanted.has(thumb)) {
      await fs.rm(thumb);
      removed++;
    }
  }
  return removed;
}

async function main() {
  const images = await listImages();
  console.log(`optimizeImages: ${images.length} images under ${ROOTS.join(", ")}`);

  if (RESIZE) {
    const before = await totalSize(images);
    let changed = 0;
    for (const file of images) {
      try {
        const r = await resizeOriginal(file);
        if (r) {
          changed++;
          console.log(`  resized ${rel(file)}  ${kb(r.before)} -> ${kb(r.after)}`);
        }
      } catch (err) {
        console.warn(`  ! could not resize ${rel(file)}: ${err.message}`);
      }
    }
    const after = await totalSize(images);
    console.log(`originals: ${changed} re-encoded, ${mb(before)} -> ${mb(after)}`);
  }

  let made = 0;
  let failed = 0;
  for (const file of images) {
    try {
      if ((await makeThumb(file)) != null) made++;
    } catch (err) {
      failed++;
      console.warn(`  ! could not thumbnail ${rel(file)}: ${err.message}`);
    }
  }
  const pruned = await pruneThumbs(images);
  const thumbs = await walk(THUMBS);
  console.log(
    `thumbnails: ${made} generated, ${images.length - made - failed} up to date, ${pruned} pruned, ` +
      `${thumbs.length} total (${mb(await totalSize(thumbs))})`
  );
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
