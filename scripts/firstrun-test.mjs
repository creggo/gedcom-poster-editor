// First-run experience: sample family, bad file, autosave + restore, help, toasts.
import { writeFileSync } from 'node:fs';
import { chromium, URL, ok, tab } from './lib.mjs';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
await pg.goto(URL);
ok(await pg.locator('#empty').isVisible() && await pg.locator('#trySample').isVisible(), 'a first visit offers a sample family');
ok(await pg.locator('#restore').isHidden(), 'nothing to restore on a first visit');
ok(await pg.$$eval('#tabs button:not(.on)', (b) => b.slice(0, 4).every((x) => x.disabled)), 'tabs that need a tree are disabled until one is loaded');

// a file that is not a GEDCOM
writeFileSync('/tmp/not-a-tree.ged', 'hello this is not a family tree');
await pg.setInputFiles('#file', '/tmp/not-a-tree.ged'); await pg.waitForSelector('#toast:not([hidden])');
ok((await pg.textContent('#toast')).includes('No people found'), 'a file that is not a GEDCOM gets a clear message, not a crash');
ok(await pg.locator('#empty').isVisible(), 'and the app stays on the start screen');

// sample family
await pg.click('#trySample'); await pg.waitForSelector('.card');
ok((await pg.$$eval('.card', (g) => g.length)) > 20, 'the sample family loads and draws');
await tab(pg, 'style'); await pg.fill('#title', 'Restore Me'); await pg.click('[data-look="autumn"]'); await pg.waitForTimeout(2600); // > autosave delay
await tab(pg, 'export'); await pg.click('#save').catch(() => {});
await pg.waitForSelector('#toast:not([hidden])').catch(() => {});

// help
await pg.keyboard.press('?'); await pg.waitForSelector('#modal:not([hidden])');
ok((await pg.textContent('#modal h2')).includes('Shortcuts') && (await pg.textContent('#modal')).includes('Nudge'), 'pressing ? opens the shortcuts dialog');
await pg.click('#hk'); ok(await pg.locator('#modal').isHidden(), 'the dialog closes');

// autosave: reload and restore
await pg.reload(); await pg.waitForSelector('#restore:not([hidden])');
ok((await pg.textContent('#restoreNote')).includes('Restore Me'), `after a refresh the last session is offered (${(await pg.textContent('#restoreNote')).trim()})`);
await pg.click('#restore'); await pg.waitForSelector('.card');
await tab(pg, 'style');
ok((await pg.inputValue('#title')) === 'Restore Me' && (await pg.inputValue('#c-leaf1')) === '#c8572a', 'restoring brings back the title and the Autumn colours');
ok(errs.length === 0, 'no page errors ' + errs.join(';'));
await b.close();
