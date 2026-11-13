// Layout -> SVG string. Text is real SVG text (stays sharp when printed) and is shrunk to fit its card.
import type { Options, Tree } from './types.ts';
import { route, type Layout, type Offsets } from './layout.ts';
import { cardDims, V } from './layout.ts';
import { TREE, treeBranches, treeRoots, treeGround, rootBaseOf, f1, applyTheme, mix, type EdgeTweak, type TreeStyle } from './treeart.ts';
import { frame, aged } from './decor.ts';
export { treeBranches };

export const THEME = { bg: '#fbf8f1', ink: '#2b2118', accent: '#8a5a2b', line: '#b9a98f', card: '#fffdf8', sib: '#f4efe4', ph: '#e8dfcd', root: '#fff6e6' };
/** Classic design colours, derived from the same theme the tree uses. */
function applyClassic(t: Options['theme']) {
  THEME.bg = mix(t.bgTop, t.bgBottom, 0.35); THEME.ink = t.ink; THEME.accent = t.accent; THEME.line = mix(t.accent, t.bgTop, 0.55);
  THEME.card = mix(t.bgTop, '#ffffff', 0.55); THEME.sib = mix(t.bgTop, t.accent, 0.1); THEME.ph = mix(t.bgTop, t.accent, 0.22); THEME.root = mix(t.bgTop, '#ffe9b8', 0.6);
}
const measure = (text: string, size: number, spacing: number) => width(text, size, '') + text.length * spacing;
const FONT = "Georgia, 'Times New Roman', serif";
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let ctx: CanvasRenderingContext2D | null = null;
function width(text: string, size: number, style = ''): number {
  if (typeof document === 'undefined') return text.length * size * 0.5; // node tests: rough estimate
  ctx ??= document.createElement('canvas').getContext('2d');
  ctx!.font = `${style} ${size}px Georgia`;
  return ctx!.measureText(text).width;
}
// shrink until the text fits, then (if still too wide) cut with an ellipsis
function fit(text: string, size: number, max: number, style = '', spacing = 0, min = 7) {
  const w = (s: number, t: string) => width(t, s, style) + t.length * spacing * s;
  while (size > min && w(size, text) > max) size -= 0.5;
  let t = text;
  while (t.length > 1 && w(size, t) > max) t = t.slice(0, -1);
  return { text: t === text ? text : t.trimEnd() + '…', size };
}
function wrapTwo(text: string, size: number, max: number) {
  if (width(text, size, 'italic') <= max) return [text];
  const words = text.split(' ');
  for (let i = Math.ceil(words.length / 2); i >= 1; i--) { // balanced split, first line as long as fits
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    if (width(a, size, 'italic') <= max && width(b, size, 'italic') <= max) return [a, b];
  }
  return [text];
}
const shortPlace = (s: string | null) => { const p = String(s ?? '').split(',').map((x) => x.trim()); return p.length > 2 ? `${p[0]}, ${p.at(-1)}` : p.join(', '); };

export const zeroOffsets = (n: number): Offsets => ({ dx: new Array(n).fill(0), dy: new Array(n).fill(0) });
/** Bounding box of the drawing once cards have been moved (never smaller than the auto layout). */
export function extent(L: Layout, off: Offsets) {
  let x0 = 0, y0 = 0, x1 = L.W, y1 = L.H;
  L.cards.forEach((c, i) => { x0 = Math.min(x0, c.x + off.dx[i] - V.pad); y0 = Math.min(y0, c.y + off.dy[i] - V.pad); x1 = Math.max(x1, c.x + off.dx[i] + L.cw + V.pad); y1 = Math.max(y1, c.y + off.dy[i] + L.ch + V.pad); });
  return { x: x0, y: y0, w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
}

export type Edges = Record<string, EdgeTweak>;
/** Stretch a drawing's canvas to the sheet's shape. The content stays where it is; the extra is more sky (and a little ground) for the tree,
 *  an even margin for the classic designs. All backgrounds, the frame and the ageing are drawn on the stretched canvas, so they fill the sheet. */
export function fitBox(box: { x: number; y: number; w: number; h: number }, fit: Options['fit'], topShare: number) {
  if (!fit) return box;
  const ratio = box.w >= box.h ? Math.max(fit.w, fit.h) / Math.min(fit.w, fit.h) : Math.min(fit.w, fit.h) / Math.max(fit.w, fit.h);
  if (box.w / box.h < ratio) { const add = box.h * ratio - box.w; return { x: box.x - add / 2, y: box.y, w: Math.ceil(box.w + add), h: box.h }; }
  const add = box.w / ratio - box.h;
  return { x: box.x, y: box.y - add * topShare, w: box.w, h: Math.ceil(box.h + add) };
}

/** Scale the picture inside the canvas: the canvas shrinks or grows around the content's centre, so the frame, title and background follow. */
export function scaleBox(box: { x: number; y: number; w: number; h: number }, pct = 100) {
  const s = Math.max(0.2, pct / 100), w = Math.ceil(box.w / s), h = Math.ceil(box.h / s);
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

export function toSvg(L: Layout, tree: Tree, o: Options, off: Offsets = zeroOffsets(L.cards.length), edges: Edges = {}): { svg: string; minFont: number; box: ReturnType<typeof extent> } {
  applyTheme(o.theme); applyClassic(o.theme);
  if (o.design === 'tree') return toTreeSvg(L, tree, o, off, edges);
  let minFont = 99;
  const R = route(L, off), box = fitBox(scaleBox(extent(L, off), o.treeScale), o.fit, 0.5), ag = aged(box, o);
  const K = cardDims(o.card, o.nodeScale ?? 100), tx = K.photo ? K.photo + 20 : 10, avail = K.w - tx - 10;
  const cards = L.cards.map((c, ci) => {
    const p = tree.people[c.id];
    const hide = o.hideLiving && p.living;
    const stroke = c.root || c.lineage ? THEME.accent : THEME.line, sw = c.root ? 3 : c.lineage ? 3 : 1.5;
    const fill = c.root ? THEME.root : c.lineage ? THEME.card : THEME.sib;
    let out = `<g class="card" data-i="${ci}" transform="translate(${c.x + off.dx[ci]},${c.y + off.dy[ci]})"><rect width="${K.w}" height="${K.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${c.lineage || c.root ? '' : ' stroke-dasharray="6 4"'}/>`;
    const ps = K.photo, py = (K.h - ps) / 2;
    if (ps && p.photo && !hide) out += `<image href="${p.photo}" x="10" y="${py}" width="${ps}" height="${ps}" preserveAspectRatio="xMidYMid slice"${ag.photo}/>`;
    else if (ps) out += `<rect x="10" y="${py}" width="${ps}" height="${ps}" rx="4" fill="${THEME.ph}"/><text x="${10 + ps / 2}" y="${py + ps / 2 + ps * 0.1}" text-anchor="middle" font-size="${ps * 0.32}" fill="${THEME.accent}">${esc(((p.given[0] ?? '') + (p.surname[0] ?? '')).toUpperCase())}</text>`;
    const years = (e: { date: string | null } | null) => e?.date?.match(/\b(\d{3,4})\b/)?.[1] ?? '';
    const by = years(p.birth), dy = years(p.death);
    const yr = by && dy ? `${by}–${dy}` : by ? `b. ${by}` : dy ? `d. ${dy}` : '';
    const lead = K.full ? 12 : 6; // compact cards centre their text block instead
    let y = K.full ? lead : (K.h - (K.given * 1.05 + K.sur * 1.2 + (yr || hide ? 14.5 : 0))) / 2;
    const given = [p.given, p.suffix].filter(Boolean).join(' ');
    let gs = K.given, lines = wrapTwo(given, gs, avail);
    while (gs > 8 && lines.some((l) => width(l, gs, 'italic') > avail)) { gs -= 0.5; lines = wrapTwo(given, gs, avail); }
    for (const l of lines) { y += gs * 1.05; out += `<text x="${tx}" y="${y}" font-size="${gs}" font-style="italic">${esc(l)}</text>`; }
    const s = fit(p.surname.toUpperCase(), K.sur, avail, 'bold', 0.06);
    y += s.size * 1.2;
    out += `<text x="${tx}" y="${y}" font-size="${s.size}" font-weight="bold" letter-spacing="${(0.06 * s.size).toFixed(2)}" fill="${THEME.accent}">${esc(s.text)}</text>`;
    minFont = Math.min(minFont, gs, s.size);
    const fact = (sym: string, e: { date: string | null; place: string | null } | null) => {
      if (!e) return;
      const t = fit(`${e.date ?? ''}${e.date && e.place ? ' · ' : ''}${shortPlace(e.place)}`, K.fact, avail - 12, '', 0, K.fact);
      y += K.fact * 1.32;
      out += `<text x="${tx}" y="${y}" font-size="${K.fact}"><tspan fill="${THEME.accent}" font-weight="bold">${sym}</tspan> ${esc(t.text)}</text>`;
      minFont = Math.min(minFont, K.fact);
    };
    if (hide) { y += K.fact * 1.3; out += `<text x="${tx}" y="${y}" font-size="${K.fact}" font-style="italic">Living</text>`; minFont = Math.min(minFont, K.fact); }
    else if (K.full) { fact('✱', p.birth); fact('✝', p.death); }
    else if (yr) { y += K.fact * 1.3; out += `<text x="${tx}" y="${y}" font-size="${K.fact}">${esc(yr)}</text>`; minFont = Math.min(minFont, K.fact); }
    return out + '</g>';
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w}" height="${box.h}" font-family="${FONT}" fill="${THEME.ink}">
<defs>${ag.defs}</defs>
<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${THEME.bg}"/>
<path id="lines" d="${R.lines.join('')}" fill="none" stroke="${THEME.line}" stroke-width="2"/>
<path id="bold" d="${R.bold.join('')}" fill="none" stroke="${THEME.accent}" stroke-width="5"/>
<g id="dots" fill="${THEME.line}">${R.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="3.2"/>`).join('')}</g>
${cards.join('\n')}
${frame(box, { ...o, theme: { ...o.theme, bgTop: THEME.bg } }, measure)}${ag.over}</svg>`;
  return { svg, minFont, box };
}

// ---------------------------------------------------------------------------------------------
// "Heritage tree" design: ancestors rise from the root at the bottom on curved branches with leaves.
// ---------------------------------------------------------------------------------------------
const styleOf = (o: Options): TreeStyle => ({ leaves: o.leaves, twigs: o.twigs, leafSize: o.leafSize, wood: o.wood, curve: o.curve, draft: o.detail === false });

function leafCard(L: Layout, tree: Tree, o: Options, off: Offsets, ci: number, photoFilter: string): { svg: string; min: number } {
  const c = L.cards[ci], p = tree.people[c.id], K = cardDims('leaf', o.nodeScale ?? 100), hide = o.hideLiving && p.living;
  const w = K.w, r = K.photo / 2, cxm = w / 2, direct = c.lineage || c.root, ring = direct ? TREE.ring : TREE.ringSoft, rr = c.root ? r + 5 : r;
  let out = `<g class="card" data-i="${ci}" transform="translate(${c.x + off.dx[ci]},${c.y + off.dy[ci]})"><rect width="${w}" height="${L.ch}" fill="#fff" fill-opacity="0"/>`;
  // a soft shadow under the medallion, then a wooden double ring around the photo
  out += `<circle cx="${cxm + 2.5}" cy="${r + 7.5}" r="${r + 3}" fill="#000" fill-opacity=".2"/>`;
  out += `<clipPath id="cp${ci}"><circle cx="${cxm}" cy="${r + 4}" r="${r}"/></clipPath>`;
  out += `<circle cx="${cxm}" cy="${r + 4}" r="${rr + 3}" fill="${mix(ring, '#000000', 0.25)}"/><circle cx="${cxm}" cy="${r + 4}" r="${rr + 0.5}" fill="${TREE.paper}" stroke="${mix(ring, '#ffffff', 0.35)}" stroke-width="${c.root ? 2 : direct ? 1.6 : 1}"/>`;
  if (p.photo && !hide) out += `<image href="${p.photo}" x="${cxm - r}" y="4" width="${K.photo}" height="${K.photo}" clip-path="url(#cp${ci})" preserveAspectRatio="xMidYMid slice"${photoFilter}/>`;
  else out += `<circle cx="${cxm}" cy="${r + 4}" r="${r}" fill="${THEME.ph}"/><text x="${cxm}" y="${r + 4 + K.photo * 0.11}" text-anchor="middle" font-size="${K.photo * 0.32}" fill="${THEME.accent}">${esc(((p.given[0] ?? '') + (p.surname[0] ?? '')).toUpperCase())}</text>`;
  out += `<circle cx="${cxm}" cy="${r + 4}" r="${r - 1.5}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="3"/>`; // inner shade, so the photo sits in its ring
  const years = (e: { date: string | null } | null) => e?.date?.match(/\b(\d{3,4})\b/)?.[1] ?? '';
  const by = years(p.birth), dy = years(p.death), yr = hide ? 'Living' : by && dy ? `${by}–${dy}` : by ? `b. ${by}` : dy ? `d. ${dy}` : '';
  const max = w - 10, g = fit([p.given, p.suffix].filter(Boolean).join(' '), K.given, max, 'italic'), s = fit(p.surname.toUpperCase(), K.sur, max, 'bold', 0.05);
  // the name sits on a small plaque so it stays readable over twigs and leaves
  const gw = width(g.text, g.size, 'italic'), sw = width(s.text, s.size, 'bold') + s.text.length * 0.05 * s.size, yw = yr ? width(yr, K.fact, '') : 0;
  const pw = Math.min(w - 2, Math.max(gw, sw, yw) + 16), top = K.photo + 11, ph = g.size * 1.1 + s.size * 1.2 + (yr ? K.fact * 1.3 : 0) + 8;
  out += `<rect x="${f1(cxm - pw / 2)}" y="${top}" width="${f1(pw)}" height="${f1(ph)}" rx="6" fill="${TREE.paper}" fill-opacity=".86" stroke="${mix(ring, TREE.paper, 0.3)}" stroke-opacity=".7" stroke-width="1"/>`;
  let y = top + g.size * 1.02 + 2;
  out += `<text x="${cxm}" y="${f1(y)}" text-anchor="middle" font-size="${g.size}" font-style="italic" fill="${TREE.ink}">${esc(g.text)}</text>`; y += s.size * 1.17;
  out += `<text x="${cxm}" y="${f1(y)}" text-anchor="middle" font-size="${s.size}" font-weight="bold" letter-spacing="${f1(0.05 * s.size)}" fill="${TREE.ring}">${esc(s.text)}</text>`;
  if (yr) { y += K.fact * 1.25; out += `<text x="${cxm}" y="${f1(y)}" text-anchor="middle" font-size="${K.fact}" fill="${TREE.ink}">${esc(yr)}</text>`; }
  return { svg: out + '</g>', min: Math.min(g.size, s.size, yr ? K.fact : 99) };
}

export function toTreeSvg(L: Layout, tree: Tree, o: Options, off: Offsets, edges: Edges = {}): { svg: string; minFont: number; box: ReturnType<typeof extent> } {
  const base = extent(L, off), ROOTS = 480, box = fitBox(scaleBox({ ...base, h: base.h + ROOTS }, o.treeScale), o.fit, 0.78), ag = aged(box, o);
  let minFont = 99;
  const cards = L.cards.map((_, i) => { const r = leafCard(L, tree, o, off, i, ag.photo); minFont = Math.min(minFont, r.min); return r.svg; });
  const rb = rootBaseOf(L, off);
  const cx = base.x + base.w / 2, glowY = base.y + base.h * 0.38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w}" height="${box.h}" font-family="${FONT}" fill="${TREE.ink}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TREE.skyTop}"/><stop offset="1" stop-color="${TREE.skyBottom}"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${TREE.glow}" stop-opacity=".62"/><stop offset=".6" stop-color="${TREE.glow}" stop-opacity=".2"/><stop offset="1" stop-color="${TREE.glow}" stop-opacity="0"/></radialGradient>${ag.defs}</defs>
<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#sky)"/>
<ellipse cx="${f1(cx)}" cy="${f1(glowY)}" rx="${f1(box.w * 0.46)}" ry="${f1(base.h * 0.55)}" fill="url(#glow)"/>
${treeGround(rb.cx, rb.ground, box.w, box.y + box.h - 24, o.detail === false ? 0 : o.leaves)}
<g id="roots">${treeRoots(rb, o.wood / 100, false, edges, o.wind)}</g>
<g id="branches">${treeBranches(L, off, false, styleOf(o), edges)}</g>
${cards.join('\n')}
${frame(box, o, measure)}${ag.over}</svg>`;
  return { svg, minFont, box };
}
