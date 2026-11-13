// Shared helpers for the browser tests.
export { chromium } from 'playwright';
export const URL = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
export const SITE = (process.env.APP_URL ?? 'http://127.0.0.1:5199/');
/** Python with pymupdf, for the optional PDF pixel checks. Set PYMUPDF_PYTHON to enable them; they are skipped otherwise. */
export const PY = process.env.PYMUPDF_PYTHON ?? '';
export const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
/** Go to a tab and open all its collapsible sections, so every control in it can be reached. */
export const tab = async (pg, name) => { await pg.click(`#tabs button[data-tab="${name}"]`); await pg.evaluate((n) => document.querySelectorAll(`#tab-${n} details.sec`).forEach((d) => (d.open = true)), name); };
/** Open the app, load a GEDCOM and pick the centre person by id. Leaves you on the Style tab. */
export async function open(pg, ged = 'whitfield-family.ged', rootId = 'I1', { errs = [] } = {}) {
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
  await pg.goto(URL);
  await pg.setInputFiles('#file', 'sample/' + ged); await pg.waitForSelector('#controls:not([hidden])', { state: 'attached' });
  await tab(pg, 'tree');
  await pg.fill('#root', await pg.$$eval('#people option', (o, id) => o.find((x) => x.value.endsWith(`[${id}]`)).value, rootId)); await pg.dispatchEvent('#root', 'change');
  await pg.waitForSelector('.card');
  return errs;
}
export const imgs = (pg) => pg.$$eval('.card image', (e) => e.length);

