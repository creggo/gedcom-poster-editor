// Photos end to end in headless Chrome: zip match by id, leftovers, click-to-crop, drop on a card, project round trip.
import { deflateSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { writeFileSync, readFileSync } from 'node:fs';
import { chromium, open, ok, tab, imgs } from './lib.mjs';

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
const png = (w, h, [r, g, b]) => { // portrait with a light "face" block near the top, so the crop is visible
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); const face = y < h * 0.4 && Math.abs(x - w / 2) < w * 0.25; raw[o + 1 + x * 3] = face ? 255 : r; raw[o + 2 + x * 3] = face ? 220 : g; raw[o + 3 + x * 3] = face ? 190 : b; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const files = { 'I1.png': png(300, 420, [60, 90, 160]), 'I2.png': png(300, 420, [160, 60, 60]), 'I3.PNG': png(400, 300, [60, 140, 80]), 'stranger.png': png(300, 300, [120, 120, 120]), '__MACOSX/._I1.png': Buffer.from('junk') };
writeFileSync('/tmp/photos.zip', Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)])))));
writeFileSync('/tmp/one.png', png(500, 500, [200, 120, 40]));

const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const errs = await open(pg);
await tab(pg, 'tree'); await pg.selectOption('#gens', '3'); await pg.uncheck('#hideLiving'); // photos of living people are hidden by default
await tab(pg, 'style'); await pg.selectOption('#design', 'classic'); await pg.selectOption('#card', 'full');
const img = () => imgs(pg);
ok((await img()) === 0, 'starts with no photos');

await tab(pg, 'photos'); await pg.setInputFiles('#photos', '/tmp/photos.zip');
await pg.waitForSelector('#modal:not([hidden]) .urow');
ok((await pg.textContent('#modal h2')).startsWith('3 matched, 1 left over'), 'zip: 3 matched by id (junk ignored), 1 left over — ' + (await pg.textContent('#modal h2')));
ok((await img()) === 3, `3 photos on the chart (${await img()})`);
await pg.fill('#modal .urow input', await pg.$$eval('#people option', (o) => o.find((x) => x.value.endsWith('[I4]')).value));
await pg.click('#modal .urow button'); await pg.waitForFunction(() => !document.querySelector('#modal .urow'));
ok((await img()) === 4, 'leftover attached by hand → 4 photos');
await pg.click('#modal #ok');

// click a card with no photo → choose image → crop → use
const noPhoto = await pg.evaluate(() => [...document.querySelectorAll('.card')].findIndex((g) => !g.querySelector('image')));
const r = await pg.locator(`.card[data-i="${noPhoto}"] rect`).first().boundingBox();
await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
await pg.click('#inspector #pch'); await pg.waitForSelector('#modal #pch2');
await pg.setInputFiles('#pfile', '/tmp/one.png'); await pg.waitForSelector('#modal canvas');
await pg.fill('#cz', '200'); await pg.dispatchEvent('#cz', 'input');
await pg.click('#cok'); await pg.waitForFunction(() => document.getElementById('modal').hidden);
ok((await img()) === 5, 'click card → choose → crop → 5 photos');

// drop an image straight onto another photo-less card
const two = await pg.evaluate(() => [...document.querySelectorAll('.card')].findIndex((g) => !g.querySelector('image')));
const dt = await pg.evaluateHandle(async (path) => { const d = new DataTransfer(); d.items.add(new File([await (await fetch(path)).blob()], 'dropped.png', { type: 'image/png' })); return d; }, 'data:image/png;base64,' + readFileSync('/tmp/one.png').toString('base64'));
await pg.dispatchEvent(`.card[data-i="${two}"]`, 'drop', { dataTransfer: dt });
await pg.waitForSelector('#modal canvas'); await pg.click('#cok'); await pg.waitForFunction(() => document.getElementById('modal').hidden);
ok((await img()) === 6, 'drop on card → crop → 6 photos');

// project round trip keeps photos
await tab(pg, 'export');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#save')]); await dl.saveAs('/tmp/pp.json');
const proj = JSON.parse(readFileSync('/tmp/pp.json', 'utf8')); ok(Object.keys(proj.photos).length === 6 && Object.values(proj.photos).every((u) => u.startsWith('data:image/jpeg')), `project holds 6 photos (${(readFileSync('/tmp/pp.json').length / 1e3) | 0} kB)`);
await pg.reload(); await pg.setInputFiles('#proj', '/tmp/pp.json'); await pg.waitForSelector('.card');
ok((await img()) === 6, 'reopened project shows the 6 photos');
await pg.screenshot({ path: 'out-photos.png' });
await tab(pg, 'tree'); await pg.check('#hideLiving'); await pg.waitForTimeout(300); const hidden = await img(); ok(hidden < 6, `hiding living people also hides their photos (${hidden} of 6 still show)`);
await pg.uncheck('#hideLiving');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
