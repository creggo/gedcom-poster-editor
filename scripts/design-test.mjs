// Design switching in the UI: each design renders, tree branches follow a dragged card, project keeps design and look.
import { readFileSync } from 'node:fs';
import { chromium, open, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const errs = await open(pg);
await tab(pg, 'tree'); await pg.selectOption('#gens', '5'); await pg.uncheck('#siblings'); await tab(pg, 'style');
for (const d of ['classic-up', 'tree', 'classic']) {
  await pg.selectOption('#design', d); await pg.waitForSelector('.card');
  const n = await pg.$$eval('.card', (g) => g.length); ok(n > 20, `${d}: ${n} cards render`);
  ok((await pg.$eval('#card', (e) => e.disabled)) === (d === 'tree'), `${d}: card style picker ${d === 'tree' ? 'disabled (own medallion cards)' : 'enabled'}`);
  ok((await pg.$eval('#treeOnly', (e) => e.style.display !== 'none')) === (d === 'tree'), `${d}: leaf/curve controls ${d === 'tree' ? 'shown' : 'hidden'}`);
}
await pg.selectOption('#design', 'tree'); await pg.waitForSelector('#branches');
const bd = await pg.$eval('#branches path', (e) => e.getAttribute('d'));
await tab(pg, 'edit'); await pg.fill('#zoom', '40'); await pg.dispatchEvent('#zoom', 'input');
const r = await pg.locator('.card[data-i="1"] circle').first().boundingBox();
await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down();
await pg.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2 - 60, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(250);
const after = await pg.$$eval('#branches path', (p) => p.map((e) => e.getAttribute('d')));
ok(after.length > 10 && after.some((d) => d !== bd), 'tree: branches redrawn after a drag');
// regression: dragging in the tree design used to pin an invalid card style, which crashed the next switch to classic
await tab(pg, 'style'); await pg.selectOption('#design', 'classic'); await pg.waitForTimeout(400);
ok((await pg.$eval('#card', (e) => e.value)) !== '' && (await pg.$$eval('.card', (g) => g.length)) > 20, 'dragging in the tree, then switching to classic, still draws (card style stays valid)');
await pg.selectOption('#design', 'tree'); await pg.waitForTimeout(300);
await tab(pg, 'style'); await pg.fill('#curve', '1.8'); await pg.dispatchEvent('#curve', 'input'); await pg.waitForTimeout(250);
ok((await pg.$$eval('#branches path', (p) => p[0].getAttribute('d'))) !== after[0], 'branch curve slider reshapes the branches');
await pg.click('[data-look="autumn"]'); await pg.fill('#title', 'Autumn Test'); await pg.selectOption('#border', 'ornate'); await pg.waitForTimeout(300);
await tab(pg, 'export');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#save')]); await dl.saveAs('/tmp/t.json');
const proj = JSON.parse(readFileSync('/tmp/t.json', 'utf8'));
ok(proj.opts.design === 'tree' && proj.opts.theme.name === 'Autumn' && proj.opts.title === 'Autumn Test' && proj.opts.border === 'ornate', 'project file keeps design, colours, title and border');
await pg.reload(); await pg.setInputFiles('#proj', '/tmp/t.json'); await pg.waitForSelector('#branches');
await tab(pg, 'style');
ok((await pg.$eval('#design', (e) => e.value)) === 'tree' && (await pg.inputValue('#c-leaf1')) === '#c8572a' && (await pg.inputValue('#title')) === 'Autumn Test', 'reopened project restores design, colours and title');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
