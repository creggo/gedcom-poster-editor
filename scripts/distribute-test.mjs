// Node size, tree scale and the Distribute buttons: warnings, cancel, undo, a new shape on every press, uniform restores the rings.
import { readFileSync } from 'node:fs';
import { chromium, URL, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
let dialogs = [], answer = true; pg.on('dialog', (d) => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
await pg.goto(URL); await pg.setInputFiles('#file', 'sample/whitfield-family.ged'); await pg.waitForSelector('#controls:not([hidden])', { state: 'attached' });
await tab(pg, 'tree'); await pg.fill('#root', await pg.$$eval('#people option', (o) => o.find((x) => x.value.endsWith('[I1]')).value)); await pg.dispatchEvent('#root', 'change');
await pg.selectOption('#gens', '6'); await tab(pg, 'style'); await pg.selectOption('#design', 'tree'); await pg.uncheck('#detail'); await pg.waitForTimeout(500);
const pos = () => pg.$$eval('.card', (g) => g.map((x) => x.getAttribute('transform')).join('|'));
const box = () => pg.$eval('#stage svg', (s) => s.getAttribute('viewBox').split(' ').map(Number));
const set = async (id, v) => { await pg.fill('#' + id, String(v)); await pg.dispatchEvent('#' + id, 'input'); await pg.waitForTimeout(450); };
const minText = () => pg.$$eval('.card text', (t) => Math.min(...t.map((x) => parseFloat(x.getAttribute('font-size')))));

// ---- a new tree starts organic (not the even rings)
const start = await pos();
await tab(pg, 'edit'); await pg.click('#distUniform'); await pg.waitForTimeout(400); const rings = await pos();
ok(start !== rings, 'a freshly loaded tree is an organic scatter, not the even concentric rings');
ok(dialogs.length === 0, 'with nothing moved yet there is no warning to give');

// ---- node size
await tab(pg, 'style');
const w0 = await pg.$eval('.card circle', (c) => +c.getAttribute('r')), t0 = await minText(), cards0 = await pg.$$eval('.card', (g) => g.length);
await set('nodeScale', 160);
const w1 = await pg.$eval('.card circle', (c) => +c.getAttribute('r')), t1 = await minText();
ok(w1 / w0 > 1.4 && t1 / t0 > 1.4, `node size 160% scales the pictures and the text together (picture ${w0.toFixed(0)} -> ${w1.toFixed(0)}, text ${t0.toFixed(1)} -> ${t1.toFixed(1)})`);
ok((await pg.textContent('#nodeScaleVal')) === '160%', 'the slider shows its value');
await set('nodeScale', 60); const w2 = await pg.$eval('.card circle', (c) => +c.getAttribute('r')); ok(w2 < w0, 'and node size can shrink them too');
ok((await pg.$$eval('.card', (g) => g.length)) === cards0, 'the same people are drawn at every size');
await set('nodeScale', 100);

// ---- generation spacing: the default is the closer one, and the slider spreads them back out
ok((await pg.inputValue('#genGap')) === '50', 'generations start at half the original spacing');
const g50 = await box(); await set('genGap', 100); const g100 = await box(); await set('genGap', 30); const g30 = await box();
ok(g100[2] > g50[2] * 1.3 && g50[2] > g30[2], `the spacing slider changes how far apart the generations are (canvas ${g30[2]} / ${g50[2]} / ${g100[2]} wide for 30 / 50 / 100%)`);
await set('genGap', 50);

// ---- tree scale
const b100 = await box(); await set('treeScale', 60); const b60 = await box(); await set('treeScale', 140); const b140 = await box();
ok(b60[2] > b100[2] && b100[2] > b140[2] && Math.abs(b60[2] / b100[2] - 100 / 60) < 0.05, `tree scale changes how big the tree is inside the canvas (canvas ${b60[2]} / ${b100[2]} / ${b140[2]} wide for 60 / 100 / 140%)`);
await set('treeScale', 100);

// ---- distribute: warnings
await tab(pg, 'edit'); await pg.fill('#zoom', '30'); await pg.dispatchEvent('#zoom', 'input');
const before = await pos();
await pg.locator('.card[data-i="3"] circle').first().scrollIntoViewIfNeeded();
const r = await pg.locator('.card[data-i="3"] circle').first().boundingBox();
await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down(); await pg.mouse.move(r.x + r.width / 2 + 60, r.y + r.height / 2 + 40, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(300);
const moved = await pos(); ok(moved !== before, 'moved a person by hand');
dialogs = []; answer = false; await pg.click('#distOrganic'); await pg.waitForTimeout(300);
ok(dialogs.length === 1 && /overwrite/.test(dialogs[0]) && /moved/.test(dialogs[0]), `Distribute organically warns before overwriting (${dialogs[0]?.split('\n')[0]})`);
ok((await pos()) === moved, 'declining the warning changes nothing');
dialogs = []; await pg.click('#distUniform'); await pg.waitForTimeout(300);
ok(dialogs.length === 1 && (await pos()) === moved, 'Distribute uniform warns too, and declining changes nothing');

// ---- accepting: a different shape every press
answer = true; dialogs = []; await pg.click('#distOrganic'); await pg.waitForTimeout(450);
const o1 = await pos(); ok(dialogs.length === 1 && o1 !== moved && !o1.includes(moved.split('|')[3]), 'accepting overwrites the hand-moved position');
await pg.click('#distOrganic'); await pg.waitForTimeout(450); const o2 = await pos();
await pg.click('#distOrganic'); await pg.waitForTimeout(450); const o3 = await pos();
ok(new Set([o1, o2, o3]).size === 3, 'each press of Distribute organically gives a different shape');
ok(dialogs.length === 1, 'and with nothing left to overwrite it stops asking');
// no overlaps in any of them
const overlap = () => pg.evaluate(() => { const c = [...document.querySelectorAll('.card')].map((g) => g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number)); const w = document.querySelector('.card rect').getAttribute('width') * 1, h = document.querySelector('.card rect').getAttribute('height') * 1; let n = 0; for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (Math.abs(c[i][0] - c[j][0]) < w - 0.5 && Math.abs(c[i][1] - c[j][1]) < h - 0.5) n++; return n; });
ok((await overlap()) === 0, 'nobody overlaps in the organic arrangement');

// ---- undo and redo bring the old arrangement back
await pg.click('#undo'); await pg.waitForTimeout(450); ok((await pos()) === o2, 'undo steps back to the previous shape');
await pg.click('#redo'); await pg.waitForTimeout(450); ok((await pos()) === o3, 'redo steps forward again');
await pg.click('#distUniform'); await pg.waitForTimeout(450);
ok((await pos()) === rings, 'Distribute uniform restores exactly the even rings');
await pg.click('#undo'); await pg.waitForTimeout(450); ok((await pos()) === o3, 'and that can be undone too');

// ---- saved with the project; classic designs don't show the buttons
await tab(pg, 'export'); const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#save')]); await dl.saveAs('/tmp/dist.json');
const proj = JSON.parse(readFileSync('/tmp/dist.json', 'utf8'));
ok(proj.opts.organic > 0 && proj.opts.nodeScale === 100 && proj.opts.treeScale === 100, `the project stores the arrangement seed (${proj.opts.organic}) and both sizes`);
await pg.reload(); await pg.setInputFiles('#proj', '/tmp/dist.json'); await pg.waitForSelector('.card'); await pg.waitForTimeout(500);
ok((await pos()) === o3, 'reopening the project restores the same organic shape');
await tab(pg, 'style'); await set('nodeScale', 130); await set('treeScale', 80); await tab(pg, 'export');
const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#save')]); await dl2.saveAs('/tmp/dist2.json');
await pg.reload(); await pg.setInputFiles('#proj', '/tmp/dist2.json'); await pg.waitForSelector('.card'); await tab(pg, 'style');
ok((await pg.inputValue('#nodeScale')) === '130' && (await pg.inputValue('#treeScale')) === '80', 'node size and tree scale come back when a project is reopened');
await pg.selectOption('#design', 'classic'); await pg.waitForTimeout(300); await tab(pg, 'edit');
ok(await pg.locator('#distribute').isHidden(), 'the Distribute buttons are hidden in the classic designs');
await tab(pg, 'style'); const k0 = await pg.$eval('.card rect', (r) => +r.getAttribute('width')); await set('nodeScale', 200); const k1 = await pg.$eval('.card rect', (r) => +r.getAttribute('width'));
ok(k1 > k0, 'node size works in the classic designs');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
