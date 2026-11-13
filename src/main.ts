import { parseGedcom, displayName } from './gedcom.ts';
import { layout, route, type Layout, type Offsets } from './layout.ts';
import { toSvg, zeroOffsets, type Edges } from './svg.ts';
import { treeBranches, edgesOf, edgeGeom, rootGeoms, rootBaseOf, treeRoots, type EdgeTweak, type P } from './treeart.ts';
import { PAPER, fitToPaper, sheetFor, MM_TO_PT } from './paper.ts';
import { matchPhotos, defaultCrop, cropToDataUrl, loadBitmap, readFiles, bitmapOf, IMAGE, type PhotoFile } from './photos.ts';
import { openModal, closeModal, cropDialog } from './photoui.ts';
import { THEMES, NO_AGE, LOOKS } from './themes.ts';
import type { CardStyle, Design, Border, Options, Tree, Theme } from './types.ts';
import type { TreeStyle } from './treeart.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STYLES: CardStyle[] = ['full', 'compact', 'mini'];
const MIN_PT = 6.5; // smallest text we call comfortable on a printed poster
const NS = 'http://www.w3.org/2000/svg';

// ---------- state ----------
let tree: Tree | null = null, gedText = '';
let cur: Layout | null = null, svgText = '', minFont = 11, chosen: CardStyle = 'leaf';
let box = { x: 0, y: 0, w: 1, h: 1 };
let off: Offsets = zeroOffsets(0);
// manual positions and branch tweaks are kept per person (not per card index), so they survive changing options
let moved: Record<string, [number, number]> = {};
let edges: Edges = {};
let past: string[] = [], future: string[] = [];
let photos: Record<string, string> = {};            // person id -> square jpeg data URL (saved in the project)
const originals = new Map<string, ImageBitmap>();    // full-size picture, this session only, for re-cropping
const byLabel = new Map<string, string>();
let selNodes = new Set<string>(), selEdge: string | null = null;
const opts: Options = {
  root: '', gens: 8, siblings: false, relatives: false, title: '', hideLiving: true, card: 'full', design: 'tree', leaves: 100, twigs: 100, leafSize: 100, wood: 100, wind: 100, nodeScale: 100, treeScale: 100, genGap: 50, organic: 0, detail: true,
  theme: { ...THEMES.spring }, border: 'double', age: { ...NO_AGE }, curve: 1,
};

for (const g of [2, 3, 4, 5, 6, 8, 10, 12, 20]) $<HTMLSelectElement>('gens').add(new Option(g === 20 ? 'All' : String(g), String(g), false, g === 8));
for (const p of Object.keys(PAPER)) $<HTMLSelectElement>('paper').add(new Option(p, p, false, p === 'A1'));

// ---------- tabs ----------
// The journey: five steps in order. The rail still lets you jump anywhere; Back and Next walk the path.
const STEPS: { tab: string; name: string; next: string; hint?: string }[] = [
  { tab: 'tree', name: 'Your tree', next: 'Next: choose a style →' },
  { tab: 'style', name: 'Choose a style', next: 'Next: add photos →' },
  { tab: 'photos', name: 'Add photos (optional)', next: 'Next: fine-tune →', hint: 'No photos? Skip ahead: initials are shown instead.' },
  { tab: 'edit', name: 'Fine-tune (optional)', next: 'Next: download →', hint: 'Click anything on the chart to move or restyle it.' },
  { tab: 'export', name: 'Download', next: '' },
];
let curTab = 'tree';
function showTab(name: string) {
  curTab = name;
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.toggle('on', t.id === `tab-${name}`));
  const i = Math.max(0, STEPS.findIndex((x) => x.tab === name)), st = STEPS[i], loaded = !!tree;
  $('stepName').textContent = `Step ${i + 1} · ${st.name}`; $('stepCount').textContent = `${i + 1} of ${STEPS.length}`;
  document.querySelectorAll<HTMLElement>('#stepbar .bar i').forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'cur' : ''; });
  $<HTMLButtonElement>('stepBack').hidden = i === 0;
  const next = $<HTMLButtonElement>('stepNext'); next.hidden = i === STEPS.length - 1; next.textContent = st.next; next.disabled = !loaded;
  const h = $('stepHint'); h.hidden = !st.hint; h.textContent = st.hint ?? '';
  $('panel').scrollTop = 0;
}
$('stepNext').onclick = () => { const i = STEPS.findIndex((x) => x.tab === curTab); if (i < STEPS.length - 1) showTab(STEPS[i + 1].tab); };
$('stepBack').onclick = () => { const i = STEPS.findIndex((x) => x.tab === curTab); if (i > 0) showTab(STEPS[i - 1].tab); };
document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)));

// ---------- colour swatches and looks ----------
const SWATCHES: [keyof Theme, string][] = [['bgTop', 'Sky top'], ['bgBottom', 'Sky bottom'], ['trunk', 'Trunk'], ['twig', 'Twigs'], ['leaf1', 'Leaves'], ['leaf2', 'Leaves 2'], ['ink', 'Text'], ['accent', 'Names, rings'], ['frame', 'Border']];
$('swatches').innerHTML = SWATCHES.map(([k, l]) => `<label class="swatch">${l}<input type="color" id="c-${k}"></label>`).join('');
for (const [k] of SWATCHES) $<HTMLInputElement>(`c-${k}`).addEventListener('input', (e) => { (opts.theme as unknown as Record<string, string>)[k] = (e.target as HTMLInputElement).value; opts.theme.name = 'Custom'; markLooks(); schedule(); });
$('looks').innerHTML = Object.entries(LOOKS).map(([k, l]) => { const t = THEMES[l.theme]; return `<button data-look="${k}" style="background:linear-gradient(${t.bgTop},${t.bgBottom})" title="${t.name}${l.age.amount ? ' with an old-paper finish' : ''}"><span>${k === 'parchment' ? 'Parchment' : t.name}</span></button>`; }).join('');
const markLooks = () => document.querySelectorAll<HTMLButtonElement>('#looks button').forEach((b) => { const l = LOOKS[b.dataset.look!]; b.classList.toggle('on', opts.theme.name === THEMES[l.theme].name && (opts.age.amount > 0) === (l.age.amount > 0)); });
document.querySelectorAll<HTMLButtonElement>('#looks button').forEach((b) => (b.onclick = () => {
  const l = LOOKS[b.dataset.look!];
  opts.theme = { ...THEMES[l.theme] }; opts.age = { ...l.age }; opts.leaves = l.leaves ?? 100;
  optsToControls(); draw();
}));

// ---------- controls <-> options ----------
const SLIDERS = ['leaves', 'twigs', 'leafSize', 'wood', 'wind', 'curve', 'nodeScale', 'treeScale', 'genGap'] as const;
const treeStyle = (): TreeStyle => ({ leaves: opts.leaves, twigs: opts.twigs, leafSize: opts.leafSize, wood: opts.wood, curve: opts.curve });
function optsToControls() {
  $<HTMLSelectElement>('gens').value = String(opts.gens); $<HTMLInputElement>('siblings').checked = opts.siblings;
  $<HTMLInputElement>('relatives').checked = opts.relatives; $<HTMLInputElement>('hideLiving').checked = opts.hideLiving;
  $<HTMLInputElement>('title').value = opts.title; $<HTMLSelectElement>('design').value = opts.design;
  $<HTMLSelectElement>('border').value = opts.border; $<HTMLInputElement>('detail').checked = opts.detail !== false;
  for (const k of SLIDERS) { $<HTMLInputElement>(k).value = String(opts[k]); $(`${k}Val`).textContent = k === 'curve' ? `${Math.round(opts.curve * 100)}%` : `${opts[k]}%`; }
  for (const [k] of SWATCHES) $<HTMLInputElement>(`c-${k}`).value = opts.theme[k] as string;
  $<HTMLInputElement>('age').value = String(opts.age.amount); $('ageVal').textContent = opts.age.amount ? `${opts.age.amount}%` : 'off';
  for (const k of ['paper', 'grain', 'sepia', 'vignette', 'stains', 'creases', 'photos'] as const) $<HTMLInputElement>(`ag-${k}`).checked = opts.age[k];
  syncVisibility(); markLooks();
}
function controlsToOpts() {
  opts.gens = +$<HTMLSelectElement>('gens').value; opts.siblings = $<HTMLInputElement>('siblings').checked;
  opts.relatives = $<HTMLInputElement>('relatives').checked; opts.hideLiving = $<HTMLInputElement>('hideLiving').checked;
  opts.title = $<HTMLInputElement>('title').value.trim(); opts.design = $<HTMLSelectElement>('design').value as Design;
  opts.border = $<HTMLSelectElement>('border').value as Border; opts.detail = $<HTMLInputElement>('detail').checked;
  for (const k of SLIDERS) { opts[k] = +$<HTMLInputElement>(k).value; $(`${k}Val`).textContent = k === 'curve' ? `${Math.round(opts.curve * 100)}%` : `${opts[k]}%`; }
  syncVisibility();
}
function syncVisibility() {
  syncTiles();
  $('distribute').style.display = $<HTMLSelectElement>('design').value === 'tree' ? '' : 'none';
  const tr = $<HTMLSelectElement>('design').value === 'tree';
  $('treeOnly').style.display = tr ? '' : 'none'; $<HTMLSelectElement>('card').disabled = tr;
}
let lastCard = 'auto', lastDesign = 'tree';
for (const id of ['gens', 'siblings', 'relatives', 'hideLiving', 'title', 'paper', 'card', 'design', 'border', 'detail', ...SLIDERS] as const) {
  const el = $<HTMLInputElement>(id);
  el.addEventListener(el.type === 'text' || el.type === 'range' ? 'input' : 'change', () => {
    if ((id === 'card' || id === 'design') && (Object.keys(moved).length || Object.keys(edges).length)) {
      if (!confirm(`Changing the ${id === 'card' ? 'card style' : 'design'} resets your manual positions. Continue?`)) { el.value = id === 'card' ? lastCard : lastDesign; return; }
      moved = {}; edges = {}; past = []; future = []; clearSel();
    }
    if (id === 'card') lastCard = el.value;
    if (id === 'design') lastDesign = el.value;
    if (id === 'detail') detailTouched = true;
    controlsToOpts(); schedule();
  });
}
let detailTouched = false;
// aged look: the slider is the master switch; the checkboxes pick which effects
$<HTMLInputElement>('age').addEventListener('input', () => {
  opts.age.amount = +$<HTMLInputElement>('age').value;
  const keys = ['paper', 'grain', 'sepia', 'vignette', 'stains', 'creases', 'photos'] as const;
  if (opts.age.amount > 0 && !keys.some((k) => opts.age[k])) for (const k of ['paper', 'grain', 'sepia', 'vignette']) opts.age[k as 'paper'] = true;
  optsToControls(); schedule();
});
for (const k of ['paper', 'grain', 'sepia', 'vignette', 'stains', 'creases', 'photos'] as const) $<HTMLInputElement>(`ag-${k}`).addEventListener('change', () => {
  opts.age[k] = $<HTMLInputElement>(`ag-${k}`).checked;
  if (opts.age[k] && opts.age.amount === 0) opts.age.amount = 60;
  optsToControls(); schedule();
});

let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

// ---------- loading ----------
const ancestorCount = (t: Tree, id: string) => { const seen = new Set<string>(); (function w(x: string | null) { if (!x || seen.has(x) || !t.people[x]) return; seen.add(x); (t.parents[x] ?? []).forEach(w); })(id); return seen.size; };
function loadTree(text: string, root?: string) {
  const t = parseGedcom(text), ids = Object.keys(t.people);
  if (!ids.length) { toast('No people found in that file. Is it a GEDCOM (.ged)?'); return false; }
  tree = t; gedText = text;
  const dl = $('people'); dl.innerHTML = ''; byLabel.clear();
  for (const id of ids) {
    const p = t.people[id], label = `${displayName(p)}${p.sort ? ` (b. ${p.sort})` : ''} [${id}]`;
    byLabel.set(label, id); dl.append(new Option(label));
  }
  opts.root = root && t.people[root] ? root : ids.reduce((best, id) => (ancestorCount(t, id) > ancestorCount(t, best) ? id : best), ids[0]);
  $<HTMLInputElement>('root').value = [...byLabel].find(([, v]) => v === opts.root)![0];
  $('controls').hidden = false; $('toolbar').hidden = false;
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => (b.disabled = false)); $<HTMLButtonElement>('topDownload').disabled = false; showTab(curTab);
  return true;
}
const newSeed = () => 1 + Math.floor(Math.random() * 2 ** 30);
function resetWork() { moved = {}; edges = {}; past = []; future = []; photos = {}; originals.clear(); clearSel(); opts.organic = newSeed(); } // a new tree starts as a fresh organic scatter
async function loadGedFile(f: File) {
  try { if (!loadTree(await f.text())) return; } catch { toast('That file could not be read.'); return; }
  resetWork(); optsToControls(); draw(); showTab('style');
}
$<HTMLInputElement>('file').onchange = async (e) => { const input = e.target as HTMLInputElement, f = input.files?.[0]; input.value = ''; if (f) await loadGedFile(f); };
const isGed = (f: File) => /\.(ged|gedcom)$/i.test(f.name);
const dropZone = $('drop');
dropZone.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); dropZone.classList.add('over'); } });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', async (e) => { e.preventDefault(); dropZone.classList.remove('over'); const f = Array.from(e.dataTransfer?.files ?? []).find(isGed); if (f) await loadGedFile(f); else toast('That does not look like a GEDCOM (.ged) file.'); });
$<HTMLInputElement>('root').onchange = (e) => {
  const v = byLabel.get((e.target as HTMLInputElement).value);
  if (v) { opts.root = v; moved = {}; edges = {}; past = []; future = []; clearSel(); draw(); }
};

// ---------- zoom ----------
const svgEl = () => $('stage').querySelector('svg') as SVGSVGElement | null;
const zoomVal = () => +$<HTMLInputElement>('zoom').value / 100;
function applyZoom() {
  const s = svgEl();
  if (!s) return;
  s.style.width = `${box.w * zoomVal()}px`; s.style.height = `${box.h * zoomVal()}px`;
  $('zoomval').textContent = `${Math.round(zoomVal() * 100)}%`;
  renderOverlay();
}
const setZoom = (pct: number) => { $<HTMLInputElement>('zoom').value = String(Math.max(3, Math.min(200, Math.round(pct)))); applyZoom(); };
$('zoom').oninput = applyZoom;
$('zin').onclick = () => setZoom(zoomVal() * 125); $('zout').onclick = () => setZoom(zoomVal() * 80);
$('fit').onclick = () => setZoom(Math.floor((($('stage').clientWidth - 52) / box.w) * 100));
$('stage').addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(zoomVal() * 100 * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });

// ---------- build and draw ----------
function toOffsets(l: Layout): Offsets {
  const o = zeroOffsets(l.cards.length);
  l.cards.forEach((c, i) => { const m = moved[c.id]; if (m) { o.dx[i] = m[0]; o.dy[i] = m[1]; } });
  return o;
}
let lastO: Options | null = null; // the options the on-screen drawing was built with (including the sheet fit)
function build(card: CardStyle) {
  for (const id in tree!.people) tree!.people[id].photo = photos[id];
  if (opts.design === 'tree') card = 'leaf';
  const o = { ...opts, card }, L = layout(tree!, o), of = toOffsets(L);
  const raw = toSvg(L, tree!, { ...o, fit: undefined }, of, edges).box, sheet_ = sheetFor(raw.w, raw.h, $<HTMLSelectElement>('paper').value);
  lastO = { ...o, fit: sheet_ };
  const r = toSvg(L, tree!, lastO, of, edges); // second pass on a canvas stretched to the paper's shape
  return { L, of, svg: r.svg, minFont: r.minFont, box: r.box, pt: r.minFont * fitToPaper(r.box.w, r.box.h, $<HTMLSelectElement>('paper').value).scale * MM_TO_PT };
}
function draw() {
  if (!tree || !opts.root) return;
  let want = $<HTMLSelectElement>('card').value;
  if (want !== 'auto' && !STYLES.includes(want as CardStyle)) { want = 'auto'; $<HTMLSelectElement>('card').value = 'auto'; lastCard = 'auto'; } // a blank or unknown value falls back to Auto
  let b = build(want === 'auto' ? 'full' : (want as CardStyle));
  chosen = want === 'auto' ? 'full' : (want as CardStyle);
  if (opts.design === 'tree') chosen = 'leaf';
  else if (want === 'auto') for (const st of STYLES) { b = build(st); chosen = st; if (b.pt >= MIN_PT) break; }
  cur = b.L; off = b.of; svgText = b.svg; minFont = b.minFont; box = b.box;
  // drop selections that no longer exist
  const ids = new Set(cur.cards.map((c) => c.id));
  selNodes = new Set([...selNodes].filter((i) => ids.has(i)));
  if (selEdge && (opts.design !== 'tree' || !geomOf(selEdge))) selEdge = null; // branches and roots only exist in the tree design
  $('stage').innerHTML = svgText;
  $('stage').classList.toggle('edit', $<HTMLInputElement>('edit').checked);
  applyZoom(); info(); history_(); renderInspector(); autosave();
  if (!detailTouched && cur.cards.length > 80 && opts.detail !== false && opts.design === 'tree') { opts.detail = false; $<HTMLInputElement>('detail').checked = false; detailTouched = true; toast('Large tree: showing branches only on screen to save memory. Leaves and twigs are still in every export.'); schedule(); }
  if (cur.cards.length > 1500 && !bigWarned) { bigWarned = true; toast('Large tree: editing may feel slow. Try fewer generations or relatives.'); }
}
let bigWarned = false;
/** The drawing for export, print and orders. When the screen is showing a light preview (no leaves or twigs) this rebuilds it in full. */
function exportSvg(): string {
  if (!cur || !tree || !lastO || opts.design !== 'tree' || opts.detail !== false) return svgText;
  toast('Rendering the full detail…');
  return toSvg(cur, tree, { ...lastO, detail: true }, off, edges).svg;
}
function info(routed?: { clashes: number; cardClashes: number }) {
  if (!cur) return;
  const r = routed ?? cur, paper = $<HTMLSelectElement>('paper').value, f = fitToPaper(box.w, box.h, paper);
  const pt = (name: string) => minFont * fitToPaper(box.w, box.h, name).scale * MM_TO_PT;
  const small = pt(paper) < MIN_PT, ok = Object.keys(PAPER).find((n) => pt(n) >= MIN_PT), edited = Object.keys(moved).length || Object.keys(edges).length;
  $('info').innerHTML = `<b>${cur.cards.length}</b> people · ${Math.round(box.w)}×${Math.round(box.h)} drawing<br>
    On ${paper} (${Math.round(f.sw)}×${Math.round(f.sh)} mm) the smallest text is <b>${pt(paper).toFixed(1)} pt</b>.
    ${small ? `<br><span class="warn">Too small to read comfortably.</span> ${ok ? `Try ${ok} or larger,` : 'Even the largest sheet is small;'} or show fewer generations or relatives.` : ''}
    ${Object.keys(photos).length && chosen === 'mini' ? '<br>Mini cards have no room for photos — pick Compact or Full to show them.' : ''}
    ${opts.design === 'tree' ? '' : `<br>Line check: ${r.clashes} overlapping lines, ${r.cardClashes} overlapping cards${edited ? ' (after your edits)' : ''}.`}`;
}
$('paper').addEventListener('change', () => schedule());

// ---------- history ----------
const snapshot = () => JSON.stringify({ moved, edges, organic: opts.organic });
function commit(before: string) {
  if (before === snapshot()) return;
  past.push(before); future = [];
  if (past.length > 300) past.shift();
  history_();
}
function history_() {
  $<HTMLButtonElement>('undo').disabled = !past.length; $<HTMLButtonElement>('redo').disabled = !future.length;
  $<HTMLButtonElement>('reset').disabled = !Object.keys(moved).length && !Object.keys(edges).length;
}
function restore(json: string) { const s = JSON.parse(json); moved = s.moved; edges = s.edges ?? {}; opts.organic = s.organic ?? opts.organic; draw(); }
$('undo').onclick = () => { if (!past.length) return; future.push(snapshot()); restore(past.pop()!); };
$('redo').onclick = () => { if (!future.length) return; past.push(snapshot()); restore(future.pop()!); };
$('reset').onclick = () => { const b = snapshot(); moved = {}; edges = {}; commit(b); draw(); };

// ---------- selection ----------
function clearSel() { selNodes = new Set(); selEdge = null; }
const idxOf = (id: string) => cur!.cards.findIndex((c) => c.id === id);
function branch(i: number, single: boolean): number[] {
  if (single) return [i];
  const seen = new Set<number>(), stack = [i];
  while (stack.length) { const k = stack.pop()!; if (seen.has(k)) continue; seen.add(k); stack.push(...cur!.kids[k]); }
  return [...seen];
}
const moveSet = (single: boolean) => { const s = new Set<number>(); for (const id of selNodes) for (const k of branch(idxOf(id), single || !$<HTMLInputElement>('branchMove').checked)) s.add(k); return [...s]; };
/** Shift cards by (dx, dy) in drawing units (per card if arrays are given). */
function shift(idx: number[], dx: number | number[], dy: number | number[]) {
  idx.forEach((i, n) => {
    const r2 = (v: number) => Math.round(v * 100) / 100, id = cur!.cards[i].id, nx = r2(off.dx[i] + (Array.isArray(dx) ? dx[n] : dx)), ny = r2(off.dy[i] + (Array.isArray(dy) ? dy[n] : dy)); // hundredths, so snapping can land exactly on the grid
    if (nx || ny) moved[id] = [nx, ny]; else delete moved[id];
  });
}
// A selectable curve in the tree: a branch (between two people) or one of the main roots. Both are cubic beziers whose two control points can be
// dragged; a root also has a handle on its tip (h = 3). d1..d3 are the automatic positions a saved tweak is measured from.
const isRoot = (k: string) => k.startsWith('root:');
interface CurveGeom { P0: P; P1: P; P2: P; P3: P; d1: P; d2: P; d3?: P }
const rootsNow = () => rootGeoms(rootBaseOf(cur!, off), opts.wood / 100, edges);
function geomOf(key: string): CurveGeom | null {
  if (isRoot(key)) return rootsNow().find((r) => r.key === key) ?? null;
  const e = edgesOf(cur!).find((x) => x.key === key);
  return e ? edgeGeom(cur!, off, e, opts.curve, edges[key]) : null;
}
const newTweak = (): EdgeTweak => ({ c1: [0, 0], c2: [0, 0], w: 1 });
const absPos = (i: number) => ({ x: cur!.cards[i].x + off.dx[i], y: cur!.cards[i].y + off.dy[i] });

// ---------- inspector ----------
const yearsOf = (id: string) => { const p = tree!.people[id], y = (e: { date: string | null } | null) => e?.date?.match(/\b(\d{3,4})\b/)?.[1] ?? ''; return p.living && opts.hideLiving ? 'Living' : [y(p.birth), y(p.death)].filter(Boolean).join(' – '); };
function renderInspector() {
  const el = $('inspector');
  if (!cur || !tree) { el.innerHTML = ''; return; }
  if (selEdge) {
    const root = isRoot(selEdge), tw = edges[selEdge], key = selEdge;
    const e = root ? null : edgesOf(cur).find((x) => x.key === key)!, num = root ? +key.slice(5) + 1 : 0;
    el.innerHTML = `<div class="card-i"><h4>${root ? `Root ${num} of ${rootsNow().length}` : 'Branch'}</h4><div class="sub">${root ? 'A main root of the tree' : `${displayName(tree.people[cur.cards[e!.r].id])} → ${displayName(tree.people[cur.cards[e!.l].id])}`}</div>
      <div class="hint">${root ? 'Drag the round handles to bend it; the one at the end lengthens it and moves the tip.' : 'Drag the round handles on the branch to bend it.'}</div>
      <label class="f">Thickness <span id="twv">${Math.round((tw?.w ?? 1) * 100)}%</span></label><input id="tw" type="range" min="0.4" max="2.6" step="0.05" value="${tw?.w ?? 1}">
      ${root ? `<label class="f">Winding <span id="twwv">${Math.round((tw?.wind ?? 1) * 100)}%</span></label><input id="tww" type="range" min="0" max="2.5" step="0.05" value="${tw?.wind ?? 1}">` : ''}
      <div class="row"><button class="alt sm" id="tstr">Straighten</button><button class="alt sm" id="trst" ${tw ? '' : 'disabled'}>Reset ${root ? 'root' : 'branch'}</button></div></div>`;
    const slide = (id: string, out: string, set: (t: EdgeTweak, v: number) => void) => {
      const inp = $<HTMLInputElement>(id);
      inp.oninput = () => { const b = snapshot(); set((edges[key] ??= newTweak()), +inp.value); $(out).textContent = `${Math.round(+inp.value * 100)}%`; pending = pending ?? b; schedule(); };
      inp.onchange = () => { if (pending !== null) { commit(pending); pending = null; } };
    };
    slide('tw', 'twv', (t, v) => (t.w = v));
    if (root) slide('tww', 'twwv', (t, v) => (t.wind = v));
    $('tstr').onclick = () => {
      const b = snapshot(), g = geomOf(key)!, t = (edges[key] ??= newTweak());
      t.c1 = [g.P0.x + (g.P3.x - g.P0.x) / 3 - g.d1.x, g.P0.y + (g.P3.y - g.P0.y) / 3 - g.d1.y]; t.c2 = [g.P0.x + ((g.P3.x - g.P0.x) * 2) / 3 - g.d2.x, g.P0.y + ((g.P3.y - g.P0.y) * 2) / 3 - g.d2.y];
      if (root) t.wind = 0;
      commit(b); draw();
    };
    $('trst').onclick = () => { const b = snapshot(); delete edges[key]; commit(b); draw(); };
    return;
  }
  const ids = [...selNodes];
  if (!ids.length) {
    el.innerHTML = `<div class="empty-i">Click a person to move them, change their photo or line things up.<br>${opts.design === 'tree' ? 'Click a branch to bend it.' : ''}</div>`;
    return;
  }
  if (ids.length > 1) {
    el.innerHTML = `<div class="card-i"><h4>${ids.length} people selected</h4><div class="sub">Line them up or space them out evenly.</div>
      <div class="align"><button class="alt sm" data-a="l">⇤ Left</button><button class="alt sm" data-a="c">↔ Centre</button><button class="alt sm" data-a="r">⇥ Right</button><button class="alt sm" data-a="dh">⋯ Space across</button>
      <button class="alt sm" data-a="t">⤒ Top</button><button class="alt sm" data-a="m">↕ Middle</button><button class="alt sm" data-a="b">⤓ Bottom</button><button class="alt sm" data-a="dv">⋮ Space down</button></div>
      <div class="row"><button class="alt sm" id="rsel">Reset their positions</button></div></div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => (b.onclick = () => align(b.dataset.a!)));
    $('rsel').onclick = () => { const b = snapshot(); for (const id of ids) delete moved[id]; commit(b); draw(); };
    return;
  }
  const id = ids[0], i = idxOf(id), p = tree.people[id], a = absPos(i), has = !!photos[id];
  el.innerHTML = `<div class="card-i"><div class="pv-row">${has ? `<img class="pv" src="${photos[id]}">` : `<div class="pv"></div>`}<div><h4>${displayName(p)}</h4><div class="sub">${yearsOf(id) || '&nbsp;'}</div></div></div>
    <div class="row"><button class="alt sm" id="pch">${has ? 'Change photo' : 'Add photo'}</button>${has ? '<button class="alt sm" id="prc">Re-crop</button><button class="alt sm" id="prm">Remove</button>' : ''}</div>
    <label class="f">Position</label><div class="xy"><label>X<input type="number" id="px" step="1" value="${Math.round(a.x)}"></label><label>Y<input type="number" id="py" step="1" value="${Math.round(a.y)}"></label></div>
    <div class="row"><button class="alt sm" id="rst" ${moved[id] ? '' : 'disabled'}>Reset position</button><button class="alt sm" id="sbr">Select whole branch</button></div></div>`;
  $('pch').onclick = () => openPersonPhoto(id);
  const rc = el.querySelector('#prc') as HTMLElement | null; if (rc) rc.onclick = async () => cropAndSet(id, originals.get(id) ?? await bitmapFromUrl(photos[id]), false);
  const rm = el.querySelector('#prm') as HTMLElement | null; if (rm) rm.onclick = () => { delete photos[id]; originals.delete(id); draw(); };
  // replacing the inspector blurs the old input, which fires 'change' again: ignore that echo and always measure from the live position
  let busy = false;
  const setXY = () => {
    if (busy) return; busy = true;
    try { const b = snapshot(), now = absPos(i), nx = +$<HTMLInputElement>('px').value, ny = +$<HTMLInputElement>('py').value; shift(moveSet(false), nx - now.x, ny - now.y); commit(b); draw(); } finally { busy = false; }
  };
  $('px').onchange = setXY; $('py').onchange = setXY;
  $('rst').onclick = () => { const b = snapshot(); delete moved[id]; commit(b); draw(); };
  $('sbr').onclick = () => { selNodes = new Set(branch(i, false).map((k) => cur!.cards[k].id)); renderOverlay(); renderInspector(); };
}
let pending: string | null = null;
function align(kind: string) {
  const idx = [...selNodes].map(idxOf), P = idx.map(absPos), b = snapshot();
  const min = (f: (p: { x: number; y: number }) => number) => Math.min(...P.map(f)), max = (f: (p: { x: number; y: number }) => number) => Math.max(...P.map(f));
  const X = (p: { x: number }) => p.x, Y = (p: { y: number }) => p.y, w = cur!.cw, h = cur!.ch;
  let dx: number[] = P.map(() => 0), dy: number[] = P.map(() => 0);
  if (kind === 'l') dx = P.map((p) => min(X) - p.x);
  if (kind === 'r') dx = P.map((p) => max(X) - p.x);
  if (kind === 'c') dx = P.map((p) => (min(X) + max(X)) / 2 - p.x);
  if (kind === 't') dy = P.map((p) => min(Y) - p.y);
  if (kind === 'b') dy = P.map((p) => max(Y) - p.y);
  if (kind === 'm') dy = P.map((p) => (min(Y) + max(Y)) / 2 - p.y);
  if (kind === 'dh' || kind === 'dv') {
    const k = kind === 'dh' ? 'x' : 'y', order = P.map((p, n) => n).sort((a, c) => P[a][k] - P[c][k]), lo = P[order[0]][k], hi = P[order.at(-1)!][k];
    order.forEach((n, r) => { const t = lo + ((hi - lo) * r) / Math.max(1, order.length - 1); (kind === 'dh' ? dx : dy)[n] = t - P[n][k]; });
  }
  void w; void h;
  shift(idx, dx, dy); commit(b); draw();
}

// ---------- distribute: organic scatter or even rings (tree design) ----------
function redistribute(seed: number, what: string) {
  if (!cur || !tree) return;
  const nm = Object.keys(moved).length, ne = Object.keys(edges).length, lost = [nm ? `${nm} moved ${nm === 1 ? 'person' : 'people'}` : '', ne ? `${ne} bent ${ne === 1 ? 'branch or root' : 'branches and roots'}` : ''].filter(Boolean).join(' and ');
  if (lost && !confirm(`${what} will overwrite your changes: ${lost}.\n\nYou can undo it afterwards. Continue?`)) return;
  const before = snapshot();
  moved = {}; edges = {}; opts.organic = seed; clearSel();
  commit(before); draw();
  toast(seed ? 'Distributed organically. Press again for a different shape.' : 'Distributed on even rings');
}
$('distOrganic').onclick = () => redistribute(newSeed(), 'Distributing organically');
$('distUniform').onclick = () => redistribute(0, 'Distributing uniformly');

// ---------- on-chart overlay (selection, branch handles) — never part of the export ----------
function renderOverlay() {
  const svg = svgEl();
  if (!svg || !cur) return;
  svg.querySelector('#edgehits')?.remove(); svg.querySelector('#ui')?.remove();
  const scale = svg.getBoundingClientRect().width / box.w || 1, editing = $<HTMLInputElement>('edit').checked;
  if (!editing) return;
  const accent = opts.theme.accent;
  if (opts.design === 'tree') { // fat invisible paths so thin branches are easy to click
    let h = '';
    const hit = (key: string, g: CurveGeom) => `<path class="hit" data-k="${key}" d="M${g.P0.x},${g.P0.y}C${g.P1.x},${g.P1.y} ${g.P2.x},${g.P2.y} ${g.P3.x},${g.P3.y}" fill="none" stroke="transparent" stroke-width="${Math.max(14, 22 / scale)}" pointer-events="stroke" style="cursor:pointer"/>`;
    for (const e of edgesOf(cur)) h += hit(e.key, edgeGeom(cur, off, e, opts.curve, edges[e.key]));
    for (const r of rootsNow()) h += hit(r.key, r);
    const g = document.createElementNS(NS, 'g'); g.id = 'edgehits'; g.innerHTML = h;
    svg.insertBefore(g, svg.querySelector('.card'));
  }
  let ui = '';
  for (const id of selNodes) {
    const i = idxOf(id), a = absPos(i), pad = 6 / scale;
    ui += `<rect x="${a.x - pad}" y="${a.y - pad}" width="${cur.cw + 2 * pad}" height="${cur.ch + 2 * pad}" rx="${10 / scale}" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-width="${2.5 / scale}" stroke-dasharray="${8 / scale} ${5 / scale}" pointer-events="none"/>`;
  }
  if (selEdge && opts.design === 'tree') {
    const g = geomOf(selEdge);
    if (g) {
      const r = 9 / scale, sw = 2 / scale;
      ui += `<path d="M${g.P0.x},${g.P0.y}C${g.P1.x},${g.P1.y} ${g.P2.x},${g.P2.y} ${g.P3.x},${g.P3.y}" fill="none" stroke="${accent}" stroke-width="${3 / scale}" stroke-opacity=".8" stroke-dasharray="${10 / scale} ${6 / scale}" pointer-events="none"/>`;
      ui += `<path d="M${g.P0.x},${g.P0.y}L${g.P1.x},${g.P1.y}M${g.P3.x},${g.P3.y}L${g.P2.x},${g.P2.y}" stroke="${accent}" stroke-width="${sw}" stroke-opacity=".6" pointer-events="none"/>`;
      const handles: [number, P][] = [[1, g.P1], [2, g.P2]]; if (g.d3) handles.push([3, g.P3]); // a root's tip can be moved too
      for (const [n, Pt] of handles) ui += `<circle class="handle" data-h="${n}" data-k="${selEdge}" cx="${Pt.x}" cy="${Pt.y}" r="${n === 3 ? r * 1.15 : r}" fill="${n === 3 ? accent : '#fff'}" stroke="${n === 3 ? '#fff' : accent}" stroke-width="${2.5 / scale}" style="cursor:grab"/>`;
    }
  }
  if (ui) { const g = document.createElementNS(NS, 'g'); g.id = 'ui'; g.innerHTML = ui; svg.appendChild(g); }
}
$('edit').onchange = () => { $('stage').classList.toggle('edit', $<HTMLInputElement>('edit').checked); renderOverlay(); };

// ---------- pointer: select, drag, bend, box-select, pan ----------
const grid = () => +$<HTMLSelectElement>('snap').value;
const snapTo = (v: number) => (grid() ? Math.round(v / grid()) * grid() : v);
function lightRedraw(svg: SVGSVGElement, routed?: ReturnType<typeof route>) {
  if (opts.design === 'tree') { // plain wood while dragging; full detail on drop
    svg.querySelector('#branches')!.innerHTML = treeBranches(cur!, off, true, treeStyle(), edges);
    svg.querySelector('#roots')!.innerHTML = treeRoots(rootBaseOf(cur!, off), opts.wood / 100, true, edges, opts.wind);
  }
  else if (routed) {
    svg.querySelector('#lines')!.setAttribute('d', routed.lines.join(''));
    svg.querySelector('#bold')!.setAttribute('d', routed.bold.join(''));
    svg.querySelector('#dots')!.innerHTML = routed.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="3.2"/>`).join('');
  }
}
$('stage').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !cur) return;
  const stage = $('stage'), t = e.target as Element, editing = $<HTMLInputElement>('edit').checked, svg = svgEl()!, scale = svg.getBoundingClientRect().width / box.w;
  const handle = t.closest('.handle') as SVGElement | null, hit = t.closest('.hit') as SVGElement | null, g = t.closest('.card') as SVGGElement | null;

  if (editing && handle) { // bend a branch by its control handle
    e.preventDefault();
    const key = handle.dataset.k!, which = +handle.dataset.h!;
    const g0 = geomOf(key)!, def = (which === 1 ? g0.d1 : which === 2 ? g0.d2 : g0.d3)!, startPos = which === 1 ? g0.P1 : which === 2 ? g0.P2 : g0.P3, before = snapshot(), sx = e.clientX, sy = e.clientY;
    const mv = (m: PointerEvent) => {
      const px = startPos.x + (m.clientX - sx) / scale, py = startPos.y + (m.clientY - sy) / scale, tw = (edges[key] ??= newTweak());
      tw[which === 1 ? 'c1' : which === 2 ? 'c2' : 'e'] = [px - def.x, py - def.y];
      lightRedraw(svg); renderOverlay();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commit(before); draw(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  if (editing && hit) { // select a branch
    e.preventDefault(); selEdge = hit.dataset.k!; selNodes = new Set(); renderOverlay(); renderInspector(); showTab('edit');
    return;
  }
  if (editing && g) { // select and drag people
    e.preventDefault();
    const i0 = +g.dataset.i!, id0 = cur.cards[i0].id;
    if (e.shiftKey) { selNodes.has(id0) ? selNodes.delete(id0) : selNodes.add(id0); selEdge = null; renderOverlay(); renderInspector(); showTab('edit'); return; }
    if (!selNodes.has(id0)) selNodes = new Set([id0]);
    selEdge = null;
    const idx = moveSet(e.altKey), cards = cur.cards, base = idx.map((i) => [off.dx[i], off.dy[i]]);
    const els = idx.map((i) => svg.querySelector(`.card[data-i="${i}"]`) as SVGGElement);
    const before = snapshot(), sx = e.clientX, sy = e.clientY, a0 = absPos(i0);
    let frame = 0, travelled = 0, last = { dx: 0, dy: 0 };
    // an auto card style would re-pick after an edit; pin the one in use
    if ($<HTMLSelectElement>('card').value === 'auto' && chosen !== 'leaf') { $<HTMLSelectElement>('card').value = chosen; lastCard = chosen; } // 'leaf' is the tree's own cards, not an option in the list
    svg.querySelector('#ui')?.remove(); stage.classList.add('drag');
    els.forEach((el) => el.setAttribute('opacity', '0.85'));
    const mv = (m: PointerEvent) => {
      travelled = Math.max(travelled, Math.hypot(m.clientX - sx, m.clientY - sy));
      let dx = (m.clientX - sx) / scale, dy = (m.clientY - sy) / scale;
      if (grid()) { dx = snapTo(a0.x + dx) - a0.x; dy = snapTo(a0.y + dy) - a0.y; } // the card under the pointer lands on the grid
      last = { dx, dy };
      idx.forEach((i, n) => { off.dx[i] = base[n][0] + dx; off.dy[i] = base[n][1] + dy; els[n].setAttribute('transform', `translate(${cards[i].x + off.dx[i]},${cards[i].y + off.dy[i]})`); });
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; const r = route(cur!, off); lightRedraw(svg, r); info(r); });
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      stage.classList.remove('drag'); if (frame) cancelAnimationFrame(frame);
      if (travelled < 4) { draw(); showTab('edit'); return; } // a click: just select
      idx.forEach((i) => { off.dx[i] = base[idx.indexOf(i)][0]; off.dy[i] = base[idx.indexOf(i)][1]; });
      shift(idx, last.dx, last.dy); commit(before); draw();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  // background: shift = box-select, otherwise pan
  if (editing && e.shiftKey) {
    const sx = e.clientX, sy = e.clientY, m = document.createElement('div'); m.id = 'marquee'; document.body.append(m);
    const rect = () => ({ x: Math.min(sx, lastX), y: Math.min(sy, lastY), w: Math.abs(lastX - sx), h: Math.abs(lastY - sy) });
    let lastX = sx, lastY = sy;
    const mv = (ev: PointerEvent) => { lastX = ev.clientX; lastY = ev.clientY; const r = rect(); Object.assign(m.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); m.remove();
      const r = rect(), sr = svg.getBoundingClientRect(), x0 = box.x + (r.x - sr.left) / scale, y0 = box.y + (r.y - sr.top) / scale, x1 = x0 + r.w / scale, y1 = y0 + r.h / scale;
      selNodes = new Set(cur!.cards.map((c, i) => [c, absPos(i)] as const).filter(([, p]) => p.x < x1 && p.x + cur!.cw > x0 && p.y < y1 && p.y + cur!.ch > y0).map(([c]) => c.id)); selEdge = null;
      renderOverlay(); renderInspector(); if (selNodes.size) showTab('edit');
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  const sx = e.clientX, sy = e.clientY, l = stage.scrollLeft, tp = stage.scrollTop;
  let travelled = 0;
  stage.classList.add('pan');
  const mv = (m: PointerEvent) => { travelled = Math.max(travelled, Math.hypot(m.clientX - sx, m.clientY - sy)); stage.scrollLeft = l - (m.clientX - sx); stage.scrollTop = tp - (m.clientY - sy); };
  const up = () => {
    stage.classList.remove('pan'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (travelled < 4 && (selNodes.size || selEdge)) { clearSel(); renderOverlay(); renderInspector(); }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// ---------- keyboard ----------
let lastNudge = 0;
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName, typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(typing && (e.target as HTMLInputElement).type === 'text')) { e.preventDefault(); ($(e.shiftKey ? 'redo' : 'undo') as HTMLButtonElement).click(); return; }
  if (typing || !cur) return;
  if (e.key === 'Escape') { clearSel(); renderOverlay(); renderInspector(); return; }
  const step = e.shiftKey ? 10 : 1, d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
  if (d && selNodes.size && $<HTMLInputElement>('edit').checked) {
    e.preventDefault();
    const before = snapshot(), burst = Date.now() - lastNudge < 700; lastNudge = Date.now();
    shift(moveSet(e.altKey), d[0], d[1]);
    if (!burst) { past.push(before); future = []; }
    draw();
  }
});

// ---------- photos ----------
const nameOf = (id: string) => displayName(tree!.people[id]);
async function bitmapFromUrl(url: string) { return loadBitmap(await (await fetch(url)).blob()); }
async function cropAndSet(id: string, bmp: ImageBitmap, original: boolean) {
  const r = await cropDialog(bmp, `Photo for ${nameOf(id)}`, !!photos[id]);
  if (r === null) return;
  if (r === 'remove') { delete photos[id]; originals.delete(id); }
  else { photos[id] = cropToDataUrl(bmp, r); if (original) originals.set(id, bmp); }
  draw();
}
function openPersonPhoto(id: string) {
  const has = !!photos[id];
  const m = openModal(`<h2>${nameOf(id)}</h2>${has ? `<img class="pv2" src="${photos[id]}">` : '<div class="hint">No photo yet.</div>'}
    <div class="btns"><button id="pcl" class="alt">Close</button>${has ? '<button id="prm2" class="alt">Remove</button>' : ''}<button id="pch2">Choose image…</button></div>
    <input id="pfile" type="file" accept="image/*" hidden>`);
  const f = m.querySelector('#pfile') as HTMLInputElement;
  (m.querySelector('#pcl') as HTMLElement).onclick = closeModal;
  (m.querySelector('#pch2') as HTMLElement).onclick = () => f.click();
  f.onchange = async () => { if (f.files?.[0]) { closeModal(); await cropAndSet(id, await loadBitmap(f.files[0]), true); } };
  const rm = m.querySelector('#prm2') as HTMLElement | null; if (rm) rm.onclick = () => { delete photos[id]; originals.delete(id); closeModal(); draw(); };
}
async function setFromFile(id: string, f: PhotoFile, manual: boolean) {
  const bmp = await bitmapOf(f);
  if (manual) { await cropAndSet(id, bmp, true); return; }
  photos[id] = cropToDataUrl(bmp, defaultCrop(bmp.width, bmp.height)); bmp.close();
}
async function importFiles(raw: File[]) {
  if (!tree) return;
  let files: PhotoFile[];
  try { files = await readFiles(raw); } catch { alert('Could not read that file as a zip or image.'); return; }
  if (!files.length) { alert('No images found (looking for jpg, png, webp, gif).'); return; }
  const { matched, unmatched } = matchPhotos(tree, files.map((f) => f.name));
  const byName = new Map(files.map((f) => [f.name, f]));
  let n = 0;
  for (const [name, id] of Object.entries(matched)) { $('info').textContent = `Adding photos… ${++n}/${Object.keys(matched).length}`; await setFromFile(id, byName.get(name)!, false); }
  draw();
  if (!unmatched.length) { openModal(`<h2>Photos added</h2><p>${n} photos matched to people.</p><div class="btns"><button id="ok">Done</button></div>`).querySelector('#ok')!.addEventListener('click', closeModal); return; }
  const m = openModal(`<h2>${n} matched, ${unmatched.length} left over</h2><div class="hint">Type a person’s name to attach each leftover file, or leave it out.</div>
    ${unmatched.map((u, i) => `<div class="urow" data-n="${i}"><span title="${u}">${u}</span><input type="text" list="people" placeholder="Person…"><button class="alt sm">Attach</button></div>`).join('')}
    <div class="btns"><button id="ok">Done</button></div>`);
  (m.querySelector('#ok') as HTMLElement).onclick = closeModal;
  m.querySelectorAll('.urow').forEach((row) => {
    const name = unmatched[+(row as HTMLElement).dataset.n!], input = row.querySelector('input')!, btn = row.querySelector('button')!;
    btn.onclick = async () => {
      const id = byLabel.get(input.value); if (!id) { input.focus(); return; }
      btn.disabled = true; await setFromFile(id, byName.get(name)!, false); draw(); row.remove();
    };
  });
}
$('addphotos').onclick = () => $<HTMLInputElement>('photos').click();
$<HTMLInputElement>('photos').onchange = async (e) => { const el = e.target as HTMLInputElement; await importFiles(Array.from(el.files ?? [])); el.value = ''; };
const stageEl = $('stage');
stageEl.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); stageEl.classList.add('over'); } });
stageEl.addEventListener('dragleave', () => stageEl.classList.remove('over'));
stageEl.addEventListener('drop', async (e) => {
  e.preventDefault(); stageEl.classList.remove('over');
  const files = Array.from(e.dataTransfer?.files ?? []), g = (e.target as Element).closest('.card') as SVGGElement | null;
  if (files.length === 1 && isGed(files[0])) { await loadGedFile(files[0]); return; } // a family file dropped anywhere on the canvas opens it
  if (g && cur && files.length === 1 && IMAGE.test(files[0].name)) {
    const pf = (await readFiles(files))[0];
    if (pf) await setFromFile(cur.cards[+g.dataset.i!].id, pf, true);
  } else importFiles(files);
});

// ---------- export and projects ----------
function sheet() {
  const paper = $<HTMLSelectElement>('paper').value, f = fitToPaper(box.w, box.h, paper, 10); // a home printer cannot print to the edge: keep a 10 mm margin
  const sh = $('sheet');
  sh.style.width = `${f.sw}mm`; sh.style.height = `${f.sh}mm`;
  // The print copy sits beside the on-screen chart, which is hidden while printing. Fills like url(#sky) would resolve to the hidden copy's
  // gradients and paint nothing, so the print copy gets its own ids.
  sh.innerHTML = exportSvg().replace(/ id="([^"]+)"/g, ' id="$1-p"').replace(/url\(#([^)]+)\)/g, 'url(#$1-p)'); // the clean export: no selection handles or hit areas
  const s = sh.querySelector('svg')!;
  Object.assign(s.style, { left: `${f.ox}mm`, top: `${f.oy}mm`, width: `${box.w * f.scale}mm`, height: `${box.h * f.scale}mm` });
  let st = document.getElementById('pagesize') as HTMLStyleElement | null;
  if (!st) { st = document.createElement('style'); st.id = 'pagesize'; document.head.append(st); }
  st.textContent = `@page { size: ${f.sw}mm ${f.sh}mm; margin: 0 }`;
}
const download = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
const fname = () => (opts.title || 'family-tree').replace(/\W+/g, '-');

// ---------- downloads ----------
function gate(_kind: string, run: () => void | Promise<void>) {
  if (!cur) return;
  void run();
}
$('print').onclick = () => gate('PDF', () => { sheet(); window.print(); });
$('dl').onclick = () => gate('SVG', () => download(new Blob([exportSvg()], { type: 'image/svg+xml' }), `${fname()}.svg`));
/** A picture of the poster at the chosen width. The SVG is drawn straight at that size, so it is sharp rather than an enlarged small image. */
async function makePng() {
  const btn = $<HTMLButtonElement>('png'); btn.disabled = true; btn.textContent = 'Rendering…';
  try {
    let w = +$<HTMLSelectElement>('pngSize').value, h = Math.round((w * box.h) / box.w);
    const k = Math.min(1, 16000 / Math.max(w, h), Math.sqrt(190e6 / (w * h))); // browsers cap canvas size
    w = Math.round(w * k); h = Math.round(h * k);
    const svg = exportSvg().replace(/^<svg([^>]*?)width="[\d.]+" height="[\d.]+"/, `<svg$1width="${w}" height="${h}"`), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('could not draw')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
    const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
    download(blob, `${fname()}.png`);
  } catch { toast('Could not make a picture that big. Try a smaller size.'); } finally { btn.disabled = false; btn.textContent = 'PNG'; }
}
$('png').onclick = () => gate('PNG', makePng);
// a project file holds the GEDCOM itself, so opening it restores everything without the original file
const projectJson = () => JSON.stringify({ v: 2, gedcom: gedText, opts: { ...opts, card: chosen === 'leaf' ? 'full' : chosen }, paper: $<HTMLSelectElement>('paper').value, moved, edges, photos });
$('save').onclick = () => { download(new Blob([projectJson()], { type: 'application/json' }), `${fname()}.project.json`); toast('Project saved'); };
$('open').onclick = () => $<HTMLInputElement>('proj').click();
$<HTMLInputElement>('proj').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try { openProjectJson(await f.text()); toast('Project opened'); } catch { alert('That file is not a project saved from this tool.'); }
  (e.target as HTMLInputElement).value = '';
};

// ---------- first run: sample family, autosave, help ----------
let toastTimer = 0;
function toast(msg: string, link?: { text: string; href: string }) {
  const t = $('toast'); t.textContent = msg;
  if (link) { const a = document.createElement('a'); a.href = link.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.text; t.append(' ', a); }
  t.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), link ? 7000 : 2600);
}
$('trySample').onclick = async () => {
  try {
    const text = await (await fetch(new URL('sample-family.ged', document.baseURI))).text();
    if (!loadTree(text)) return;
    resetWork(); optsToControls(); draw(); showTab('style'); toast('Loaded an invented sample family');
  } catch { toast('Could not load the sample'); }
};
// Autosave: the whole project goes into IndexedDB shortly after each change, so a refresh or a crash never loses work.
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => { const r = indexedDB.open('family-tree-poster', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const db = await idb(); return new Promise<T>((res, rej) => { const r = f(db.transaction('kv', mode).objectStore('kv')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
let saveTimer = 0;
function autosave() {
  if (!tree) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { kv('readwrite', (s) => s.put({ at: Date.now(), title: opts.title, json: projectJson() }, 'last')).catch(() => {}); }, 1500);
}
function openProjectJson(text: string) {
  const p = JSON.parse(text);
  if (![1, 2].includes(p.v) || typeof p.gedcom !== 'string') throw new Error('not a project file');
  if (!loadTree(p.gedcom, p.opts.root)) return;
  Object.assign(opts, p.opts);
  opts.theme = { ...THEMES.spring, ...(p.opts.theme ?? {}) }; opts.age = { ...NO_AGE, ...(p.opts.age ?? {}) }; opts.border = p.opts.border ?? 'double'; opts.curve = p.opts.curve ?? 1;
  opts.design = p.opts.design ?? 'classic';
  for (const k of ['leaves', 'twigs', 'leafSize', 'wood', 'wind', 'nodeScale', 'treeScale', 'genGap'] as const) opts[k] = p.opts[k] ?? 100; // older projects keep the original, wider spacing
  opts.organic = p.opts.organic ?? 0; // projects saved before the scatter keep their even rings
  opts.detail = p.opts.detail !== false; detailTouched = true;
  if (p.opts.foliage === 'none') opts.leaves = 0; else if (p.opts.foliage === 'light') opts.leaves = 40; // projects saved before the density sliders
  moved = p.moved ?? {}; edges = p.edges ?? {}; photos = p.photos ?? {}; originals.clear(); past = []; future = []; clearSel();
  $<HTMLSelectElement>('card').value = opts.card; lastCard = opts.card; lastDesign = opts.design;
  if (p.paper) $<HTMLSelectElement>('paper').value = p.paper;
  optsToControls(); draw(); showTab('style');
}
kv<{ at: number; title: string; json: string } | undefined>('readonly', (s) => s.get('last')).then((last) => {
  if (!last) return;
  const mins = Math.round((Date.now() - last.at) / 60000), when = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  $('restore').hidden = false; $('restoreNote').hidden = false; $('restoreNote').textContent = `${last.title || 'Untitled'} · saved ${when}, in this browser only`;
  $('restore').onclick = () => { try { openProjectJson(last.json); toast('Restored your last session'); } catch { toast('That session could not be restored'); } };
}).catch(() => {});
function help() {
  const m = openModal(`<h2>Shortcuts and tips</h2><table class="keys">
    <tr><td><kbd>Click</kbd></td><td>Select a person or a branch (tree design)</td></tr>
    <tr><td><kbd>Drag</kbd></td><td>Move a person with everything beyond them. Hold <kbd>Alt</kbd> to move just one card.</td></tr>
    <tr><td><kbd>Shift</kbd>+click</td><td>Add to or remove from the selection</td></tr>
    <tr><td><kbd>Shift</kbd>+drag background</td><td>Box-select several people</td></tr>
    <tr><td>Drag background</td><td>Pan the chart</td></tr>
    <tr><td><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd></td><td>Nudge the selection 1px (hold <kbd>Shift</kbd> for 10px)</td></tr>
    <tr><td><kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd></td><td>Undo (add <kbd>Shift</kbd> to redo)</td></tr>
    <tr><td><kbd>Ctrl/⌘</kbd>+scroll</td><td>Zoom</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>Clear the selection</td></tr></table>
    <p class="hint">Branches in the tree design have two round handles: drag them to bend the branch. Your work is saved automatically in this browser; use <b>Export → Save project</b> to keep a copy you can open anywhere.</p>
    <div class="btns"><button id="hk">Got it</button></div>`);
  (m.querySelector('#hk') as HTMLElement).onclick = closeModal;
}
$('help').onclick = help;
window.addEventListener('keydown', (e) => { if (e.key === '?' && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) help(); });

// ?sample in the address opens the sample family straight away
if (new URLSearchParams(location.search).has('sample')) queueMicrotask(() => $<HTMLButtonElement>('trySample').click());

// ---------- tiles and segments mirror hidden selects; top-bar download ----------
function syncTiles() {
  document.querySelectorAll<HTMLElement>('[data-sel]').forEach((t) => t.classList.toggle('on', $<HTMLSelectElement>(t.dataset.sel!).value === t.dataset.v));
}
document.querySelectorAll<HTMLElement>('[data-sel]').forEach((t) => (t.onclick = () => {
  const sel = $<HTMLSelectElement>(t.dataset.sel!);
  if (sel.value !== t.dataset.v) { sel.value = t.dataset.v!; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  syncTiles();
}));
$('topDownload').onclick = () => showTab('export');
showTab('tree'); // sets the step bar and Back/Next for the starting step
optsToControls();
