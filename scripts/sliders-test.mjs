// Texture sliders in the browser: leaf and twig density change the picture, zero is bare, and the print stays one page.
import { chromium, open, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = await open(pg);
await tab(pg, 'tree'); await pg.selectOption('#gens', '5'); await tab(pg, 'style'); await pg.selectOption('#design', 'tree'); await pg.check('#detail');
const set = async (id, v) => { await pg.fill('#' + id, String(v)); await pg.dispatchEvent('#' + id, 'input'); await pg.waitForTimeout(350); };
const leaves = () => pg.$$eval('#stage svg path[stroke-opacity=".42"]', (e) => e.length);
const size = () => pg.$eval('#stage svg', (s) => s.outerHTML.length);
await set('leaves', 100); const l100 = await leaves(), s100 = await size();
await set('leaves', 0); const l0 = await leaves();
await set('leaves', 200); const l200 = await leaves();
ok(l0 === 0 && l100 > 500 && l200 > l100, `leaf density: 0% -> ${l0}, 100% -> ${l100}, 200% -> ${l200} leaves`);
ok((await pg.textContent('#leavesVal')) === '200%', 'the slider shows its value');
await set('leaves', 100); await set('twigs', 0); const s0 = await size(); await set('twigs', 200); const s200 = await size();
ok(s0 < s100 && s100 < s200, `twig density changes how much is drawn (${(s0 / 1e6).toFixed(1)} / ${(s100 / 1e6).toFixed(1)} / ${(s200 / 1e6).toFixed(1)} MB)`);
await set('twigs', 100);
const d0 = await pg.$eval('#branches path', (p) => p.getAttribute('d')); await set('wood', 180); ok((await pg.$eval('#branches path', (p) => p.getAttribute('d'))) !== d0, 'branch thickness reshapes the wood');
await set('wood', 100); await set('leafSize', 60); const small = await pg.$eval('#branches', (e) => e.innerHTML.length); await set('leafSize', 160); ok((await pg.$eval('#branches', (e) => e.innerHTML.length)) !== small, 'leaf size changes the leaves');
// winter look zeroes the leaves; the slider follows
await pg.click('[data-look="winter"]'); await pg.waitForTimeout(300); ok((await pg.inputValue('#leaves')) === '0' && (await leaves()) === 0, 'the Winter look sets leaf density to 0');
await pg.click('[data-look="spring"]'); await pg.waitForTimeout(300); ok((await pg.inputValue('#leaves')) === '100', 'a leafy look restores it');
// the on-screen detail switch: light preview on screen, everything in the exports
await set('leaves', 100); await set('twigs', 100);
await pg.check('#detail'); await pg.waitForTimeout(500);
const nodes = () => pg.$eval('#stage svg', (s) => s.querySelectorAll('*').length);
const heap = async () => pg.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
const full = await nodes(), fullLeaves = await leaves();
await pg.uncheck('#detail'); await pg.waitForTimeout(500);
const lite = await nodes(), liteLeaves = await leaves();
ok(fullLeaves > 500 && liteLeaves === 0 && lite < full / 4, `detail off: the screen drops from ${full} to ${lite} elements and shows no leaves (${fullLeaves} -> ${liteLeaves})`);
ok(await pg.$eval('#branches path', () => true) && (await pg.$$eval('.card', (g) => g.length)) > 20, 'the branches and people are still there and editable');
// exports still carry every leaf
await tab(pg, 'export');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#dl')]); await dl.saveAs('/tmp/full.svg');
const svgText = (await import('node:fs')).readFileSync('/tmp/full.svg', 'utf8'), exported = (svgText.match(/stroke-opacity="\.42"/g) || []).length;
ok(exported >= fullLeaves * 0.9, `Download SVG is rendered in full even with the screen preview off (${exported} leaves, screen showed ${liteLeaves})`);
await pg.evaluate(() => { window.print = () => {}; document.getElementById('print').click(); });
const sheetLeaves = await pg.$eval('#sheet', (s) => s.querySelectorAll('path[stroke-opacity=".42"]').length);
ok(sheetLeaves >= fullLeaves * 0.9, `the print sheet is rendered in full too (${sheetLeaves} leaves)`);
ok(!(await pg.$eval('#stage svg', (s) => s.outerHTML.includes('stroke-opacity=".42"'))), 'and the screen drawing is still the light one afterwards');
// a big tree switches the preview off by itself, once, and says so
await pg.reload(); await pg.setInputFiles('#file', 'sample/whitfield-family.ged'); await pg.waitForSelector('#controls:not([hidden])', { state: 'attached' });
await tab(pg, 'tree'); await pg.selectOption('#gens', '8'); await tab(pg, 'style'); await pg.selectOption('#design', 'tree'); await pg.waitForTimeout(700);
ok(!(await pg.isChecked('#detail')) && (await leaves()) === 0, 'a large tree (100+ people) opens with the light preview on screen');
await pg.check('#detail'); await pg.waitForTimeout(700);
ok((await leaves()) > 500, 'and the switch brings the leaves back when asked');
// a heavy tree still prints on one page
await pg.uncheck('#detail'); await set('leaves', 200); await set('twigs', 200); // lush, but the screen stays light: the print renders it in full
await tab(pg, 'export'); await pg.evaluate(() => { window.print = () => {}; document.getElementById('print').click(); });
await pg.emulateMedia({ media: 'print' });
const t0 = Date.now(); await pg.pdf({ path: '/tmp/lush.pdf', preferCSSPageSize: true, printBackground: true });
const pdf = (await import('node:fs')).readFileSync('/tmp/lush.pdf', 'latin1');
ok((pdf.match(/\/Type\s*\/Page[^s]/g) || []).length === 1, `a 200%/200% tree prints as one page (${Math.round(pdf.length / 1024)} kB, ${Date.now() - t0} ms)`);
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
