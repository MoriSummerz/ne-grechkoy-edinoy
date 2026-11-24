// Перегенерировать QR для таблички и адреса в мета-тегах из одного места — SITE_URL в js/config.js.
//   node tools-site/make-qr.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { qrcode } from './vendor/qrcode.mjs';
import { SITE_URL, REPO_URL } from '../js/config.js';

const root = new URL('../', import.meta.url);
const target = SITE_URL + '?s=korob';

const qr = qrcode(0, 'M');
qr.addData(target, 'Byte');
qr.make();
const n = qr.getModuleCount();
const quiet = 4;
let d = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
const size = n + quiet * 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR-код: ${target}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>\n`;
writeFileSync(new URL('img/qr-korob.svg', root), svg);

// Абсолютные адреса нужны только там, где их требует формат: og:image и ссылка на код в подвале.
for (const f of ['index.html', 'kak-schitaem.html', 'tablichka.html']) {
  const p = new URL(f, root);
  let html;
  try { html = readFileSync(p, 'utf8'); } catch { continue; }
  const next = html
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${SITE_URL}img/og.png$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE_URL}$2`)
    .replace(/(id="repo-link"[^>]*href=")[^"]*(")/, `$1${REPO_URL}$2`);
  if (next !== html) writeFileSync(p, next);
}
console.log(`QR ${n}×${n} для ${target} → img/qr-korob.svg`);
