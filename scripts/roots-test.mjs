// Roots: they wind, they are one merged shape with the trunk, and each main root can be selected, bent, lengthened, thickened and reset.
import { readFileSync } from 'node:fs';
import { chromium, open, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errs = await open(pg);
await tab(pg, 'style'); await pg.selectOption('#design', 'tree'); await pg.fill('#leaves', '0'); await pg.dispatchEvent('#leaves', 'input');
await pg.fill('#twigs', '0'); await pg.dispatchEvent('#twigs', 'input'); await pg.fill('#zoom', '30'); await pg.dispatchEvent('#zoom', 'input'); await pg.waitForTimeout(400);
const rootsHtml = () => pg.$eval('#roots', (e) => e.innerHTML);
const hitD = (i) => pg.$eval(`#edgehits .hit[data-k="root:${i}"]`, (e) => e.getAttribute('d'));

// the base is three passes (outline, body, detail), so the trunk and roots read as one shape
ok(await pg.$$eval('#roots > g', (g) => g.length) === 3, 'the base is painted in three passes: outlines, bodies, detail (one merged shape, no seams)');
ok(!(await rootsHtml()).includes('trunkShade'), 'no separate gradient-filled trunk piece is stacked on the roots');

// roots wind: a straight root would have a near-constant heading; measure how far the outline wanders from its chord
const wander = await pg.evaluate(() => {
  const g = document.querySelectorAll('#roots > g')[1], ps = [...g.querySelectorAll('path')].filter((p) => p.getTotalLength() > 120);
  const p = ps[0], n = 40, pts = Array.from({ length: n }, (_, i) => p.getPointAtLength((p.getTotalLength() * 0.45 * i) / (n - 1))); // one edge of the closed outline
  const a = pts[0], z = pts[n - 1], L = Math.hypot(z.x - a.x, z.y - a.y); return Math.max(...pts.map((q) => Math.abs((z.y - a.y) * (q.x - a.x) - (z.x - a.x) * (q.y - a.y)) / L));
});
ok(wander > 6, `a root's outline wanders ${wander.toFixed(1)} px off its chord, so it is not a straight line`);
await pg.fill('#wind', '0'); await pg.dispatchEvent('#wind', 'input'); await pg.waitForTimeout(300);
const flat = await rootsHtml();
await pg.fill('#wind', '100'); await pg.dispatchEvent('#wind', 'input'); await pg.waitForTimeout(300);
ok((await rootsHtml()) !== flat && (await pg.textContent('#windVal')) === '100%', 'the Root winding slider changes the roots');

// select a root, see 3 handles
await tab(pg, 'edit');
const select = (i) => pg.evaluate((k) => document.querySelector(`#edgehits .hit[data-k="root:${k}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })), i);
await select(4); await pg.waitForSelector('#ui .handle');
ok((await pg.textContent('#inspector h4')).startsWith('Root 5'), `clicking a root selects it (${await pg.textContent('#inspector h4')})`);
ok(await pg.locator('#ui .handle').count() === 3 && await pg.locator('#tww').count() === 1, 'a root shows three handles (two controls and the tip) and a winding slider');
const centre = async (sel) => { await pg.locator(sel).first().scrollIntoViewIfNeeded(); const r = await pg.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
const dragHandle = async (n, dx, dy) => { const [x, y] = await centre(`#ui .handle[data-h="${n}"]`); await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await pg.mouse.move(x + dx, y + dy, { steps: 4 }); await pg.mouse.up(); await pg.waitForTimeout(250); };
const r0 = await rootsHtml(), d0 = await hitD(4);
await dragHandle(1, 20, 60);
const d1 = await hitD(4); ok(d1 !== d0 && (await rootsHtml()) !== r0, 'dragging a control handle bends that root');
const [bx0] = await (async () => { const m = d1.match(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/); return [+m[5]]; })();
await dragHandle(3, 70, 30);
const m1 = (await hitD(4)).match(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/);
ok(Math.abs(+m1[5] - bx0) > 20, `dragging the tip handle moves the end of the root (${bx0.toFixed(0)} -> ${(+m1[5]).toFixed(0)})`);
const others = await Promise.all([0, 1, 2, 3, 5].map(hitD)); await select(4);
await pg.fill('#tw', '2'); await pg.dispatchEvent('#tw', 'change'); await pg.waitForTimeout(200);
ok((await pg.textContent('#twv')) === '200%', 'the thickness slider works on a root');
await pg.fill('#tww', '0'); await pg.dispatchEvent('#tww', 'change'); await pg.waitForTimeout(200);
ok((await pg.textContent('#twwv')) === '0%', 'and so does the per-root winding slider');
ok((await Promise.all([0, 1, 2, 3, 5].map(hitD))).every((d, i) => d === others[i]), 'the other roots are untouched by editing this one');

// project round trip keeps the root edits
await tab(pg, 'export');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#save')]); await dl.saveAs('/tmp/roots.json');
const proj = JSON.parse(readFileSync('/tmp/roots.json', 'utf8')), tw = proj.edges['root:4'];
ok(tw && tw.e && tw.c1 && tw.w === 2 && tw.wind === 0 && proj.opts.wind === 100, 'the saved project holds the root edit (handles, tip, thickness, winding)');
const edited = await rootsHtml();
await pg.reload(); await pg.setInputFiles('#proj', '/tmp/roots.json'); await pg.waitForSelector('#roots');
ok((await rootsHtml()) === edited, 'reopening the project restores the edited root exactly');

// undo walks back, reset clears
await tab(pg, 'edit'); await pg.fill('#zoom', '30'); await pg.dispatchEvent('#zoom', 'input'); await select(4); await pg.waitForSelector('#trst');
await pg.click('#trst'); await pg.waitForTimeout(250);
ok((await hitD(4)) === d0 && (await pg.locator('#trst').count()) === 1, 'Reset root puts it back to the automatic shape');
await pg.click('#undo'); await pg.waitForTimeout(250); ok((await hitD(4)) !== d0, 'undo brings the edit back');
await pg.click('#tstr'); await pg.waitForTimeout(250);
const sd = (await hitD(4)).match(/M([\d.-]+),([\d.-]+)C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/).slice(1).map(Number);
const chord = Math.hypot(sd[6] - sd[0], sd[7] - sd[1]), off1 = Math.abs((sd[7] - sd[1]) * (sd[2] - sd[0]) - (sd[6] - sd[0]) * (sd[3] - sd[1])) / chord;
ok(off1 < 1.5, `Straighten puts the control points on the line between the ends (off by ${off1.toFixed(2)} px)`);

// a root person that is dragged takes the base with it, and the print copy has the roots
await tab(pg, 'export'); await pg.evaluate(() => { window.print = () => {}; document.getElementById('print').click(); });
ok(await pg.$eval('#sheet', (s) => !!s.querySelector('#roots-p') && !s.querySelector('#ui') && !s.querySelector('#edgehits')), 'the print copy has the roots and none of the editing overlay');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
