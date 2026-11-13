// Heritage-tree editor: select, inspector, numeric position, nudge, align, snap, branch handles, thickness, clean export.
import { chromium, open, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = await open(pg);
await tab(pg, 'style'); await pg.selectOption('#design', 'tree'); await pg.fill('#leaves', '0'); await pg.dispatchEvent('#leaves', 'input');
await pg.fill('#zoom', '30'); await pg.dispatchEvent('#zoom', 'input'); await tab(pg, 'edit');
const tfm = (i) => pg.$eval(`.card[data-i="${i}"]`, (g) => g.getAttribute('transform'));
const xy = async (i) => (await tfm(i)).match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
const centre = async (sel) => { const r = await pg.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
const click = async (sel, { shift = false } = {}) => { await pg.locator(sel).first().scrollIntoViewIfNeeded(); const [x, y] = await centre(sel); if (shift) await pg.keyboard.down('Shift'); await pg.mouse.click(x, y); if (shift) await pg.keyboard.up('Shift'); };

// selecting a person fills the inspector and highlights the card
await click('.card[data-i="3"] circle');
ok(await pg.locator('#inspector .card-i h4').count() === 1, 'click selects a person and shows the inspector');
ok(await pg.locator('#ui rect').count() === 1, 'selected person is outlined on the chart');

// numeric position moves the person (and their branch)
const before = await xy(3), beforeOther = await xy(4);
await pg.fill('#px', String(Math.round(before[0]) + 80)); await pg.dispatchEvent('#px', 'change'); await pg.waitForTimeout(100);
const moved = await xy(3); ok(Math.abs(moved[0] - before[0] - 80) <= 1, `typing X moves the card by 80 (${moved[0] - before[0]})`);
// arrow keys nudge (shift = 10)
await pg.keyboard.press('Shift+ArrowDown'); await pg.waitForTimeout(80);
const nudged = await xy(3); ok(Math.abs(nudged[1] - moved[1] - 10) <= 1, 'Shift+arrow nudges 10px');
console.log('  after nudge', await xy(3), 'start', before);
await pg.click('#undo'); console.log('  undo 1', await xy(3)); await pg.click('#undo'); console.log('  undo 2', await xy(3));
ok((await xy(3)).join() === before.join(), 'undo returns it to the start');

// snap to grid: drop lands on a multiple of 25
await pg.selectOption('#snap', '25');
const [cx, cy] = await centre('.card[data-i="3"] circle');
await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 37, cy + 29, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(150);
const sn = await xy(3), a0 = before; // absolute position = auto + offset; compare modulo grid
const m25 = (v) => Math.min(Math.abs(v % 25), Math.abs((v % 25) - 25)); ok(m25(sn[0]) < 0.05 && m25(sn[1]) < 0.05, `snapped position (${sn.map((v) => v.toFixed(2))}) sits on the 25px grid`);
await pg.selectOption('#snap', '0'); await pg.click('#reset');

// shift-click selects several; align and space them
await click('.card[data-i="3"] circle'); await click('.card[data-i="5"] circle', { shift: true }); await click('.card[data-i="7"] circle', { shift: true });
ok((await pg.textContent('#inspector h4')).includes('3 people'), 'shift-click builds a multi-selection');
await pg.click('[data-a="t"]'); await pg.waitForTimeout(100);
const ys = await Promise.all([3, 5, 7].map(async (i) => (await xy(i))[1] + 0)); // offsets differ, check absolute tops equal via bounding boxes
const tops = await Promise.all([3, 5, 7].map(async (i) => (await pg.locator(`.card[data-i="${i}"] circle`).first().boundingBox()).y));
ok(Math.max(...tops) - Math.min(...tops) < 1.5, `Align top puts them on one line (spread ${Math.max(...tops) - Math.min(...tops)}px)`);
await pg.click('#reset');

// branch handles: select a branch, drag a handle, the curve changes, undo restores
await pg.keyboard.press('Escape');
const hit = pg.locator('#edgehits .hit').nth(2); const d0 = await hit.getAttribute('d');
await pg.evaluate(() => { const h = document.querySelectorAll('#edgehits .hit')[2]; h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })); });
await pg.waitForSelector('#ui .handle');
ok((await pg.textContent('#inspector h4')) === 'Branch', 'clicking a branch selects it');
const h1 = pg.locator('#ui .handle[data-h="1"]'); const [hx, hy] = await centre('#ui .handle[data-h="1"]');
await pg.mouse.move(hx, hy); await pg.mouse.down(); await pg.mouse.move(hx + 50, hy - 40, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(200);
const d1 = await pg.locator('#edgehits .hit').nth(2).getAttribute('d'); ok(d1 !== d0, 'dragging a handle reshapes the branch');
await pg.fill('#tw', '2'); await pg.dispatchEvent('#tw', 'change'); await pg.waitForTimeout(150);
ok((await pg.textContent('#twv')) === '200%', 'thickness slider works');
await pg.click('#tstr'); await pg.waitForTimeout(150);
await pg.click('#undo'); await pg.click('#undo'); await pg.click('#undo');
ok((await pg.locator('#edgehits .hit').nth(2).getAttribute('d')) === d0, 'undo steps back to the original curve');

// the export must be clean: no overlay, no hit areas
await tab(pg, 'export');
await pg.evaluate(() => { window.print = () => {}; document.getElementById('print').click(); });
const clean = await pg.$eval('#sheet', (s) => !s.querySelector('#ui') && !s.querySelector('#edgehits') && !!s.querySelector('#branches-p'));
ok(clean, 'printed sheet has no editing overlay');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
