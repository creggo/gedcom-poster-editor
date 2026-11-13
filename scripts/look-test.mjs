// Style tab: colours, looks, title + border, aged finish, and that an aged poster survives a real PDF export.
import { statSync } from 'node:fs';
import { chromium, open, ok, tab, PY } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = await open(pg);
await tab(pg, 'style'); await pg.selectOption('#design', 'tree');
const svg = () => pg.$eval('#stage svg', (s) => s.outerHTML);
const frames = () => pg.$$eval('#stage svg > rect[fill="none"]', (r) => r.length);

await pg.fill('#c-trunk', '#ff0000'); await pg.waitForTimeout(300);
ok((await svg()).includes('#ff0000'), 'editing the trunk colour recolours the branches');
await pg.fill('#title', 'Test Title'); await pg.waitForTimeout(250);
ok((await svg()).includes('TEST TITLE'), 'the title is drawn');
ok(await pg.$eval('#stage svg g rect[fill]', (r) => !!r) , 'the title sits on a plate that breaks the border');
for (const [v, n] of [['none', 0], ['thin', 1], ['double', 2], ['ornate', 2]]) { await pg.selectOption('#border', v); await pg.waitForTimeout(200); ok((await frames()) === n, `border "${v}" draws ${n} frame line(s)`); }

await pg.click('[data-look="parchment"]'); await pg.waitForTimeout(400);
let s = await svg();
ok(s.includes('id="agePaper"') && s.includes('id="ageVig"') && s.includes('id="agePhoto"'), 'Parchment look adds paper, burnt edges and photo fading');
ok(+(await pg.inputValue('#age')) > 0 && (await pg.inputValue('#c-bgTop')) === '#efe0bd', 'Parchment look sets the antique colours and an age');
await pg.click('[data-look="winter"]'); await pg.waitForTimeout(300);
ok((await pg.inputValue('#leaves')) === '0' && !(await svg()).includes('agePaper'), 'Winter look is bare and un-aged');
await pg.click('[data-look="spring"]'); await pg.fill('#age', '50'); await pg.dispatchEvent('#age', 'input'); await pg.waitForTimeout(300);
ok((await svg()).includes('id="agePaper"'), 'moving the age slider turns the old-paper effects on');
await pg.uncheck('#ag-paper'); await pg.waitForTimeout(300);
ok(!(await svg()).includes('id="agePaper"') && (await svg()).includes('id="ageVig"'), 'each aged effect can be switched off on its own');
await pg.fill('#age', '0'); await pg.dispatchEvent('#age', 'input'); await pg.waitForTimeout(300);
ok(!(await svg()).includes('<filter'), 'age 0 removes every filter');

// the aged poster prints: vector tree + raster texture on one A1 page
await pg.click('[data-look="parchment"]'); await pg.waitForTimeout(400);
await tab(pg, 'export'); await pg.selectOption('#paper', 'A1');
await pg.evaluate(() => { window.print = () => {}; document.getElementById('print').click(); });
await pg.emulateMedia({ media: 'print' });
const t0 = Date.now(); await pg.pdf({ path: '/tmp/aged.pdf', preferCSSPageSize: true, printBackground: true });
const kb = Math.round(statSync('/tmp/aged.pdf').size / 1024), pdf = (await import('node:fs')).readFileSync('/tmp/aged.pdf', 'latin1');
ok((pdf.match(/\/Type\s*\/Page[^s]/g) || []).length === 1, `aged poster exports as one PDF page (${kb} kB, ${Date.now() - t0} ms)`);
// look inside the PDF with MuPDF: the page must be tan (not white) and carry the texture tiles
const { execFileSync } = await import('node:child_process');
const stats = !PY ? null : JSON.parse(execFileSync(PY, ['-W', 'ignore', '-c', `
import pymupdf, json, statistics
p = pymupdf.open('/tmp/aged.pdf')[0]
clip = pymupdf.Rect(p.rect.width*0.04, p.rect.height*0.10, p.rect.width*0.20, p.rect.height*0.30)  # empty paper, no tree
c = p.get_pixmap(dpi=40, clip=clip); s = list(c.samples)[0::c.n]
ch = [statistics.mean(list(c.samples)[i::c.n]) for i in range(3)]
print(json.dumps({'r': [round(v) for v in ch], 'mean': statistics.mean(s), 'std': statistics.pstdev(s)}))
`]).toString());
if (!stats) console.log('skip  PDF pixel checks (set PYMUPDF_PYTHON to a python with pymupdf)'); else {
ok(stats.std > 5, `PDF paper is textured, not flat (luminance std ${stats.std.toFixed(1)})`);
ok(stats.r[2] < 215 && stats.r[0] > 150, `PDF page is aged tan, not white (rgb ${stats.r})`);
}
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
