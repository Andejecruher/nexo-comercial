/**
 * Derives every brand raster/asset from the vector sources in components/shared/brand/.
 *
 * components/shared/brand/logo-icon.svg          -> master mark (app-icon padding)
 * components/shared/brand/logo-icon-compact.svg  -> small-size variant (tight crop)
 *
 * Run with `pnpm brand:icons` after editing either SVG.
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND_DIR = new URL('../components/shared/brand/', import.meta.url);
const PUBLIC_DIR = new URL('../public/', import.meta.url);
const PUBLIC_IMAGES_DIR = new URL('../public/images/', import.meta.url);
/** Email templates read the logo from disk to attach it inline (cid:brand-logo). */
const BACKEND_EMAIL_ASSETS_DIR = new URL(
  '../../backend/src/services/email/assets/',
  import.meta.url,
);

const rel = (url) => fileURLToPath(url).split('/nexo-comercial/')[1] ?? fileURLToPath(url);

/** Guarantees the vector sources stay real, self-contained vectors. */
function loadSource(name) {
  const url = new URL(name, BRAND_DIR);
  const svg = readFileSync(url, 'utf8');

  const forbidden = [
    ['<image', 'embeds a raster image'],
    ['xlink:href', 'references an external resource'],
    ['<text', 'depends on a font'],
    ['font-family', 'depends on a font'],
    ['<style', 'depends on external/embedded CSS'],
    ['.png', 'references a PNG'],
    ['.jpg', 'references a JPG'],
  ];
  for (const [needle, why] of forbidden) {
    if (svg.toLowerCase().includes(needle)) {
      throw new Error(`${name} ${why} ("${needle}"). The brand mark must stay pure vector.`);
    }
  }

  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error(`${name} is missing a viewBox.`);

  const paths = [...svg.matchAll(/<path\s+fill="([^"]+)"\s+d="([^"]+)"\s*\/>/g)].map((m) => ({
    fill: m[1],
    d: m[2],
  }));
  if (paths.length !== 2) {
    throw new Error(
      `${name} must contain exactly 2 paths (bubble + figure), found ${paths.length}.`,
    );
  }

  return { name, svg, viewBox, bubble: paths[0].d, figure: paths[1].d };
}

const master = loadSource('logo-icon.svg');
const compact = loadSource('logo-icon-compact.svg');

const BURGUNDY = '#711B2C';
const WHITE = '#FFFFFF';

/** Rebuilds a minified, single-line SVG - optionally recoloured or on a solid backdrop. */
function buildSvg({ src, bubbleFill = BURGUNDY, figureFill = WHITE, backdrop, inset = 0 }) {
  const [vx, vy, vw, vh] = src.viewBox.split(/\s+/).map(Number);
  const art =
    `<path fill="${bubbleFill}" d="${src.bubble}"/>` +
    `<path fill="${figureFill}" d="${src.figure}"/>`;

  if (!backdrop && !inset) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${src.viewBox}">${art}</svg>`;
  }

  // pad the viewBox outward so the mark occupies (1 - 2*inset) of the canvas
  const pad = Math.max(vw, vh) * inset;
  const box = `${vx - pad} ${vy - pad} ${vw + pad * 2} ${vh + pad * 2}`;
  const bg = backdrop
    ? `<rect x="${vx - pad}" y="${vy - pad}" width="${vw + pad * 2}" height="${vh + pad * 2}" fill="${backdrop}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${bg}${art}</svg>`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** Minimal ICO container wrapping PNG frames. */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const dir = [];
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dir.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...frames.map((f) => f.data)]);
}

const written = [];
const write = (url, data) => {
  mkdirSync(dirname(fileURLToPath(url)), { recursive: true });
  writeFileSync(url, data);
  written.push(`${rel(url)} (${(data.length / 1024).toFixed(1)} KB)`);
};

// ---------- vector assets ----------
const masterSvg = buildSvg({ src: master });
const compactSvg = buildSvg({ src: compact });
write(new URL('icon.svg', PUBLIC_DIR), masterSvg);
write(new URL('favicon.svg', PUBLIC_DIR), compactSvg);

// ---------- favicons (compact variant: readable at 16-48px) ----------
const icoFrames = [];
for (const size of [16, 32, 48]) {
  const data = await png(compactSvg, size);
  icoFrames.push({ size, data });
  if (size !== 48) write(new URL(`favicon-${size}x${size}.png`, PUBLIC_DIR), data);
}
write(new URL('favicon.ico', PUBLIC_DIR), buildIco(icoFrames));

// ---------- Apple touch icon ----------
// iOS does not honour transparency, so flatten onto white and let iOS apply its mask.
const appleSvg = buildSvg({ src: master, backdrop: WHITE });
const apple = await png(appleSvg, 180);
write(new URL('apple-icon.png', PUBLIC_DIR), apple);
write(new URL('apple-touch-icon.png', PUBLIC_DIR), apple);

// ---------- PWA ----------
for (const size of [192, 512]) {
  write(new URL(`icon-${size}.png`, PUBLIC_DIR), await png(masterSvg, size));
}
// Maskable icons get cropped by the launcher, so keep the mark inside the safe zone.
const maskableSvg = buildSvg({ src: master, backdrop: WHITE, inset: 0.14 });
write(new URL('icon-maskable-512.png', PUBLIC_DIR), await png(maskableSvg, 512));

// ---------- transactional email header ----------
// The header sits on burgundy, so the mark is inverted. Email clients ignore SVG,
// and many block remote images, so the same PNG is attached inline by the backend.
const emailSvg = buildSvg({ src: master, bubbleFill: WHITE, figureFill: BURGUNDY });
const emailLogo = await png(emailSvg, 192);
write(new URL('email-logo.png', PUBLIC_IMAGES_DIR), emailLogo);
write(new URL('email-logo.png', BACKEND_EMAIL_ASSETS_DIR), emailLogo);

// ---------- shared geometry for the React component ----------
const ts = `/**
 * Generated by scripts/generate-brand-icons.mjs - do not edit by hand.
 * Source of truth: components/shared/brand/logo-icon.svg and logo-icon-compact.svg.
 * Regenerate with \`pnpm brand:icons\`.
 */

export const BRAND_VIEW_BOX = '${master.viewBox}';
export const BRAND_BUBBLE_PATH =
  '${master.bubble}';
export const BRAND_FIGURE_PATH =
  '${master.figure}';

export const BRAND_COMPACT_VIEW_BOX = '${compact.viewBox}';
export const BRAND_COMPACT_BUBBLE_PATH =
  '${compact.bubble}';
export const BRAND_COMPACT_FIGURE_PATH =
  '${compact.figure}';
`;
write(new URL('logo-paths.generated.ts', BRAND_DIR), ts);

console.log(`Brand assets generated from ${master.name} + ${compact.name}:`);
for (const line of written) console.log('  ' + line);
