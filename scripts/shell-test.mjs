// The shell and the journey: structure, step bar and Back/Next, tiles, PNG, dropping a family file.
import { readFileSync } from 'node:fs';
import { chromium, URL, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1480, height: 900 }, acceptDownloads: true });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
await pg.goto(URL);

// structure
ok(await pg.locator('#top').isVisible() && await pg.locator('#tabs button').count() === 5, 'a top bar and a five-tool rail');
ok((await pg.$$eval('#tabs button', (b) => b.map((x) => x.textContent.trim()))).join() === 'Tree,Style,Photos,Edit,Download', 'the tools read Tree, Style, Photos, Edit, Download');
ok(await pg.$eval('#topDownload', (e) => e.disabled), 'the top-bar Download button waits for a tree');
ok(await pg.$eval('body', (e) => getComputedStyle(e).backgroundColor) === 'rgb(246, 249, 248)', 'the page is the light, airy background');

// drop a family file straight onto the empty canvas
await pg.evaluate(async () => { const t = await (await fetch('sample-family.ged')).text(); const d = new DataTransfer(); d.items.add(new File([t], 'family.ged', { type: 'text/plain' })); document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: d })); });
await pg.waitForSelector('.card'); await pg.waitForTimeout(500);
ok((await pg.$$eval('.card', (g) => g.length)) > 20, 'dropping a .ged file anywhere on the canvas opens it');
ok(!(await pg.$eval('#topDownload', (e) => e.disabled)) && await pg.locator('#tab-style.on').count() === 1, 'the tree opens on Style and the Download button wakes up');
await pg.click('#topDownload'); ok(await pg.locator('#tab-export.on').count() === 1, 'the top-bar Download button opens the Download tool');

// sections and tiles
await tab(pg, 'style');
ok(await pg.locator('#tab-style details.sec').count() >= 6, 'Style is grouped into collapsible sections');
ok(await pg.locator('.tile.on').getAttribute('data-v') === 'tree', 'the Heritage tree tile is selected');
await pg.click('.tile[data-v="classic"]'); await pg.waitForTimeout(500);
ok((await pg.inputValue('#design')) === 'classic' && await pg.locator('.tile.on').getAttribute('data-v') === 'classic', 'clicking a design tile switches the design and moves the highlight');
ok(await pg.locator('#treeOnly').isHidden(), 'tree-only controls (leaves, roots) disappear for the charts');
await pg.click('.tile[data-v="tree"]'); await pg.waitForTimeout(400);
await pg.click('.seg button[data-v="ornate"]'); await pg.waitForTimeout(300);
ok((await pg.inputValue('#border')) === 'ornate' && await pg.locator('.seg button.on').getAttribute('data-v') === 'ornate', 'the border control is a segmented choice that drives the border');
await pg.locator('#tab-style details.sec').nth(0).locator('summary').click(); await pg.waitForTimeout(100);
ok(!(await pg.locator('#tab-style details.sec').nth(0).evaluate((d) => d.open)), 'a section collapses when its header is clicked');

// PNG download
await tab(pg, 'export'); await pg.uncheck('#detail').catch(() => {}); await pg.selectOption('#pngSize', '3000');
const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('#png')]); await dl.saveAs('/tmp/poster.png');
const png = readFileSync('/tmp/poster.png'), w = png.readUInt32BE(16), h = png.readUInt32BE(20);
ok(png.subarray(1, 4).toString() === 'PNG' && w === 3000 && h > 1500, `PNG download is a real picture, 3000 px wide (${w} x ${h}, ${Math.round(png.length / 1024)} kB)`);
const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#dl')]); ok((await dl2.suggestedFilename()).endsWith('.svg'), 'SVG download still works');

// ---- the journey: step bar, Back and Next
await pg.goto(URL); await pg.waitForTimeout(300);
ok((await pg.textContent('#stepName')).includes('Step 1') && (await pg.textContent('#stepCount')) === '1 of 5', 'the journey starts at step 1 of 5');
ok(await pg.$eval('#stepNext', (e) => e.disabled), 'Next waits until a family file is loaded');
ok(await pg.locator('#empty ol.how li').count() === 3 && /GEDCOM/.test(await pg.textContent('#empty h1') + await pg.textContent('#empty')), 'the start screen explains the three steps');
await pg.click('#trySample'); await pg.waitForSelector('.card'); await pg.waitForTimeout(400);
const step = async () => (await pg.textContent('#stepCount')).trim();
ok((await step()) === '2 of 5', 'loading a family moves on to step 2');
const seen = [];
for (let i = 0; i < 3; i++) { await pg.click('#stepNext'); seen.push(await step()); }
ok(seen.join() === '3 of 5,4 of 5,5 of 5' && await pg.locator('#tab-export.on').count() === 1, `Next walks through photos, fine-tune and download (${seen.join(' > ')})`);
ok(await pg.locator('#stepNext').isHidden() && await pg.locator('#stepBack').isVisible(), 'on the last step Next is replaced by the download options');
await pg.click('#stepBack'); ok((await step()) === '4 of 5', 'Back goes back a step');
ok((await pg.$$eval('#stepbar .bar i.done', (i) => i.length)) === 3 && (await pg.$$eval('#stepbar .bar i.cur', (i) => i.length)) === 1, 'the progress bar marks finished and current steps');

ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
