// Procedural wood for the Heritage tree. Branches are lit, shaded, smoothed outlines with bark detail; twigs fork recursively and carry
// shaded leaves; the base has soil, grass and fallen leaves. Everything is plain vector shapes (no filters), so it prints sharp, and
// everything is seeded, so a tree never changes between redraws.
import type { Layout, Offsets } from './layout.ts';
import type { Theme } from './types.ts';

export type P = { x: number; y: number };

export const TREE = {
  skyTop: '#eef4e6', skyBottom: '#dfead2', barkDark: '#3f2d1c', bark: '#6a5036', barkLight: '#a58a62', barkSoft: '#a99577',
  trunk: '#4a3524', twig: '#7a6245', leaves: ['#7fae6a', '#97c27d', '#6b9c5a', '#a8cc8c', '#86b873', '#b5c872', '#5f9150'],
  moss: '#76865a', soil: '#6b5238', grass: '#6f9a5a', glow: '#ffffff', ring: '#7a5a34', ringSoft: '#b7a688', ink: '#2f2417', halo: '#eef4e6', paper: '#f6f1e3',
};
/** How the tree is textured. Percentages: 100 is the standard look, 0 removes it, up to 200 for a very lush tree. */
export interface TreeStyle { leaves: number; twigs: number; leafSize: number; wood: number; curve: number; /** wood only: no twigs or leaves (a light preview) */ draft?: boolean }
export const DEFAULT_STYLE: TreeStyle = { leaves: 100, twigs: 100, leafSize: 100, wood: 100, curve: 1 };

export const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const f1 = (n: number) => Math.round(n * 10) / 10;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (c1: string, c2: string, t: number) => { const h = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16); return '#' + [0, 1, 2].map((i) => Math.round(lerp(h(c1, i), h(c2, i), t)).toString(16).padStart(2, '0')).join(''); };
const noise = (R: () => number) => { const v = Array.from({ length: 64 }, () => R() * 2 - 1); return (u: number) => { const i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f); return lerp(v[((i % 64) + 64) % 64], v[(((i + 1) % 64) + 64) % 64], s); }; };

/** Point the shared palette at a theme. Called before every render, so the rest of the module just reads TREE. */
export function applyTheme(t: Theme) {
  TREE.skyTop = t.bgTop; TREE.skyBottom = t.bgBottom; TREE.trunk = t.trunk; TREE.twig = t.twig;
  TREE.bark = mix(t.trunk, t.twig, 0.45); TREE.barkDark = mix(t.trunk, '#000000', 0.4); TREE.barkLight = mix(t.twig, '#ffffff', 0.32); TREE.barkSoft = mix(t.twig, t.bgTop, 0.4);
  TREE.leaves = [t.leaf1, t.leaf2, mix(t.leaf1, t.leaf2, 0.5), mix(t.leaf1, '#ffffff', 0.25), mix(t.leaf2, '#000000', 0.16), mix(t.leaf1, '#000000', 0.2), mix(t.leaf2, '#ffffff', 0.2)];
  TREE.moss = mix(mix(t.leaf1, t.leaf2, 0.5), '#6e6a4c', 0.5); TREE.soil = mix(mix(t.trunk, '#8a6a3c', 0.4), t.bgBottom, 0.3); TREE.grass = mix(t.leaf1, '#000000', 0.12);
  TREE.glow = mix(t.bgTop, '#ffffff', 0.7); TREE.ring = t.accent; TREE.ringSoft = mix(t.accent, t.bgTop, 0.55); TREE.ink = t.ink; TREE.halo = t.bgTop; const lum = (c: string) => (0.299 * parseInt(c.slice(1, 3), 16) + 0.587 * parseInt(c.slice(3, 5), 16) + 0.114 * parseInt(c.slice(5, 7), 16)) / 255;
  TREE.paper = lum(t.bgTop) < 0.45 ? mix(t.bgTop, '#000000', 0.35) : mix(t.bgTop, '#ffffff', 0.5); // dark themes get dark plaques, so the light text stays readable
}

const bez = (a: P, b: P, c: P, d: P, t: number): P => { const u = 1 - t; return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y }; };
const tang = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t, x = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x), y = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y);
  const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m };
};
const poly = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p.x)},${f1(p.y)}`).join('');
/** Catmull-Rom through the points, as cubic segments (continues from the first point). Smooth outlines instead of visible facets. */
const crSegs = (pts: P[]) => {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += `C${f1(p1.x + (p2.x - p0.x) / 6)},${f1(p1.y + (p2.y - p0.y) / 6)} ${f1(p2.x - (p3.x - p1.x) / 6)},${f1(p2.y - (p3.y - p1.y) / 6)} ${f1(p2.x)},${f1(p2.y)}`;
  }
  return d;
};
const smoothOpen = (pts: P[]) => `M${f1(pts[0].x)},${f1(pts[0].y)}${crSegs(pts)}`;
const smoothBand = (left: P[], right: P[]) => `M${f1(left[0].x)},${f1(left[0].y)}${crSegs(left)}L${f1(right[0].x)},${f1(right[0].y)}${crSegs(right)}Z`;

interface Opt { light: boolean; colour: string; knots: boolean; moss?: boolean }
interface Pt { p: P; n: P; w: number; l: number; r: number }
/** A branch's paint, in three passes. Painting every piece's `dark` first, then every `body`, then every `detail` makes a cluster of pieces
 *  (a trunk and its roots) read as ONE shape: the outline shows only round the outside, with no seams where the pieces overlap. */
interface Parts { dark: string; body: string; detail: string }
const setNormals = (pts: Pt[]) => pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)].p, c = pts[Math.min(pts.length - 1, i + 1)].p, dx = c.x - a.x, dy = c.y - a.y, m = Math.hypot(dx, dy) || 1; q.n = { x: -dy / m, y: dx / m }; });

/** A centreline along a bezier, with a little roughness on each edge. */
function lineFromBez(a: P, b: P, c: P, d: P, w0: number, w1: number, R: () => number, rough: number): Pt[] {
  const len = Math.hypot(d.x - a.x, d.y - a.y), N = Math.max(10, Math.min(40, Math.round(len / 13))), nl = noise(R), nr = noise(R), pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, tg = tang(a, b, c, d, t);
    pts.push({ p: bez(a, b, c, d, t), n: { x: -tg.y, y: tg.x }, w: lerp(w0, w1, t), l: 1 + rough * nl(t * (3 + len / 90)), r: 1 + rough * nr(t * (3 + len / 90)) });
  }
  return pts;
}
/** A centreline that winds: the bezier is the intended route, and the limb meanders sideways along it (low and high frequency together,
 *  fading in from the start) while its width swells and shrinks. wind = 0 gives the plain bezier. */
function windLine(a: P, b: P, c: P, d: P, w0: number, w1: number, R: () => number, wind: number, rough: number): Pt[] {
  const len = Math.hypot(d.x - a.x, d.y - a.y), N = Math.max(14, Math.min(60, Math.round(len / 10))), nA = noise(R), nB = noise(R), nl = noise(R), nr = noise(R), nw = noise(R), f = 1.6 + len / 140, ph = R() * 40, pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, tg = tang(a, b, c, d, t), n = { x: -tg.y, y: tg.x }, base = bez(a, b, c, d, t), env = Math.min(1, t * 2.4);
    const off = wind * len * 0.1 * env * (0.66 * nA(t * f + ph) + 0.34 * nB(t * f * 2.4 + ph));
    pts.push({ p: { x: base.x + n.x * off, y: base.y + n.y * off }, n, w: lerp(w0, w1, t) * (1 + 0.13 * wind * nw(t * 6 + ph)), l: 1 + rough * nl(t * (3 + len / 90)), r: 1 + rough * nr(t * (3 + len / 90)) });
  }
  setNormals(pts);
  return pts;
}

/** Lit from the upper left: a dark outline, the body, a bright core on the lit side, a shadow edge, then bark grain, lenticels, knots and moss. */
function partsFrom(pts: Pt[], R: () => number, o: Opt): Parts {
  const N = pts.length - 1, a = pts[0].p, d = pts[N].p, w0 = pts[0].w, w1 = pts[N].w;
  const len = pts.reduce((s, q, i) => (i ? s + Math.hypot(q.p.x - pts[i - 1].p.x, q.p.y - pts[i - 1].p.y) : 0), 0);
  const tp = (i: number) => Math.max(0, Math.min(1, Math.min(i, N - i) / (N * 0.2))); // 0 at both ends, so highlights fade in instead of starting with a hard edge
  const band = (wf: number, shift: number, smooth: boolean, taper = false) => {
    const left = pts.map((q, i) => { const f = taper ? tp(i) : 1; return { x: q.p.x + q.n.x * (q.w * q.l * wf * 0.5 + shift * q.w) * f, y: q.p.y + q.n.y * (q.w * q.l * wf * 0.5 + shift * q.w) * f }; });
    const right = pts.map((q, i) => { const f = taper ? tp(i) : 1; return { x: q.p.x - q.n.x * (q.w * q.r * wf * 0.5 - shift * q.w) * f, y: q.p.y - q.n.y * (q.w * q.r * wf * 0.5 - shift * q.w) * f }; }).reverse();
    return smooth ? smoothBand(left, right) : `${poly([...left, ...right])}Z`;
  };
  const dark = mix(o.colour, '#000000', 0.38), cap = (p: P, w: number, fill: string) => `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(w)}" fill="${fill}"/>`;
  if (o.light || w0 < 3.4) return { dark: '', body: `<path d="${band(1, 0, false)}" fill="${o.colour}"/>${cap(a, w0 / 2, o.colour)}${cap(d, w1 / 2, o.colour)}`, detail: '' };
  const lightSign = Math.sign(pts.reduce((sum, q) => sum + (q.n.x * -0.6 + q.n.y * -0.8), 0)) || 1; // which side faces the light (up and to the left)
  const parts: Parts = {
    dark: `<path d="${band(1, 0, true)}" fill="${dark}"/>${cap(a, w0 * 0.5, dark)}${cap(d, w1 * 0.5, dark)}`,
    body: `<path d="${band(0.84, 0, true)}" fill="${o.colour}"/>${cap(a, w0 * 0.42, o.colour)}${cap(d, w1 * 0.42, o.colour)}`,
    detail: `<path d="${band(0.34, 0.2 * lightSign, true, true)}" fill="${mix(o.colour, '#ffffff', 0.3)}" fill-opacity=".5"/><path d="${band(0.2, -0.3 * lightSign, true, true)}" fill="${dark}" fill-opacity=".34"/>`,
  };
  let out = '';
  const lane = (k: number) => pts.map((q) => ({ x: q.p.x + q.n.x * q.w * k, y: q.p.y + q.n.y * q.w * k }));
  const G = w0 > 14 ? 6 : w0 > 7 ? 4 : 2;
  for (let k = 0; k < G; k++) { // bark: broken grain lines along the limb
    const off = (k / (G - 1 || 1) - 0.5) * 0.6 + (R() - 0.5) * 0.08;
    const dash = `${f1(8 + R() * 40)} ${f1(3 + R() * 14)} ${f1(16 + R() * 50)} ${f1(4 + R() * 16)}`;
    out += `<path d="${smoothOpen(lane(off))}" fill="none" stroke="${TREE.barkDark}" stroke-width="${f1(0.7 + w0 * 0.025)}" stroke-opacity="${f1(0.26 + R() * 0.28)}" stroke-dasharray="${dash}" stroke-dashoffset="${f1(R() * 60)}" stroke-linecap="round"/>`;
  }
  if (w0 > 9) { // lenticels: the little pale slits on real bark
    let sl = '';
    for (let k = 0; k < Math.min(24, Math.round(len / 28)); k++) { const q = pts[Math.floor(R() * N)], sd = (R() - 0.5) * 0.7; sl += `<ellipse cx="${f1(q.p.x + q.n.x * q.w * sd)}" cy="${f1(q.p.y + q.n.y * q.w * sd)}" rx="${f1(1 + w0 * 0.05)}" ry="${f1(0.45 + w0 * 0.015)}" transform="rotate(${f1((Math.atan2(q.n.y, q.n.x) * 180) / Math.PI + 90)} ${f1(q.p.x + q.n.x * q.w * sd)} ${f1(q.p.y + q.n.y * q.w * sd)})"/>`; }
    out += `<g fill="${mix(o.colour, '#ffffff', 0.45)}" fill-opacity=".45">${sl}</g>`;
  }
  if (o.knots && w0 > 9 && R() < 0.5) { // a knot: dark ring with a lighter centre, turned along the branch
    const t = 0.25 + R() * 0.5, q = pts[Math.round(t * N)], ang = (Math.atan2(q.n.y, q.n.x) * 180) / Math.PI + 90, side = R() < 0.5 ? -1 : 1, w = q.w;
    const kx = q.p.x + q.n.x * side * w * 0.12, ky = q.p.y + q.n.y * side * w * 0.12;
    out += `<g transform="translate(${f1(kx)},${f1(ky)}) rotate(${f1(ang)})"><ellipse rx="${f1(w * 0.2)}" ry="${f1(w * 0.3)}" fill="${TREE.barkDark}" fill-opacity=".75"/><ellipse rx="${f1(w * 0.11)}" ry="${f1(w * 0.18)}" fill="${TREE.bark}"/><ellipse rx="${f1(w * 0.04)}" ry="${f1(w * 0.08)}" fill="${TREE.barkDark}" fill-opacity=".8"/></g>`;
  }
  if (o.moss && w0 > 11 && R() < 0.55) { // moss clings to the shaded side of thick limbs
    let m = '';
    for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
      const q = pts[Math.floor(R() * N)], cx = q.p.x - q.n.x * lightSign * q.w * 0.28, cy = q.p.y - q.n.y * lightSign * q.w * 0.28;
      for (let j = 0; j < 5; j++) m += `<ellipse cx="${f1(cx + (R() - 0.5) * w0 * 1.2)}" cy="${f1(cy + (R() - 0.5) * w0 * 1.2)}" rx="${f1(w0 * (0.06 + R() * 0.1))}" ry="${f1(w0 * (0.04 + R() * 0.07))}"/>`;
    }
    out += `<g fill="${TREE.moss}" fill-opacity=".62">${m}</g>`;
  }
  parts.detail += out;
  return parts;
}
/** One tapered branch from a to d (control points b, c): width w0 at a, w1 at d. */
function branchShape(a: P, b: P, c: P, d: P, w0: number, w1: number, R: () => number, o: Opt): string {
  const parts = partsFrom(lineFromBez(a, b, c, d, w0, w1, R, o.light ? 0 : 0.2), R, o);
  return parts.dark + parts.body + parts.detail;
}

type LeafKind = 'ovate' | 'narrow' | 'round';
const LEAF_PATH: Record<LeafKind, (s: number) => string> = {
  ovate: (s) => `M0,0C${f1(s * 0.18)},${f1(-s * 0.4)} ${f1(s * 0.72)},${f1(-s * 0.42)} ${f1(s)},0C${f1(s * 0.72)},${f1(s * 0.42)} ${f1(s * 0.18)},${f1(s * 0.4)} 0,0Z`,
  narrow: (s) => `M0,0C${f1(s * 0.2)},${f1(-s * 0.26)} ${f1(s * 0.7)},${f1(-s * 0.28)} ${f1(s)},0C${f1(s * 0.7)},${f1(s * 0.28)} ${f1(s * 0.2)},${f1(s * 0.26)} 0,0Z`,
  round: (s) => `M0,0C${f1(s * 0.05)},${f1(-s * 0.5)} ${f1(s * 0.85)},${f1(-s * 0.55)} ${f1(s * 0.96)},0C${f1(s * 0.85)},${f1(s * 0.55)} ${f1(s * 0.05)},${f1(s * 0.5)} 0,0Z`,
};
/** A leaf with a lit half, a midrib and side veins. tone: 0 = old growth near the trunk, 1 = fresh growth at the tips (lighter). */
export function leaf(x: number, y: number, ang: number, s: number, R: () => number, tone = 0.5, detail = true) {
  const kind: LeafKind = R() < 0.55 ? 'ovate' : R() < 0.6 ? 'narrow' : 'round';
  const base = TREE.leaves[Math.floor(R() * TREE.leaves.length)], col = mix(mix(base, R() < 0.5 ? '#ffffff' : '#2f4a26', R() * 0.14), '#ffffff', tone * 0.16), dark = mix(col, '#000000', 0.34);
  const path = LEAF_PATH[kind](s);
  let g = `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1(ang)})"><path d="${path}" fill="${col}" stroke="${dark}" stroke-opacity=".42" stroke-width=".6"/>`;
  if (detail && s > 9) {
    g += `<path d="M0,0C${f1(s * 0.2)},${f1(-s * 0.36)} ${f1(s * 0.7)},${f1(-s * 0.36)} ${f1(s)},0C${f1(s * 0.6)},${f1(-s * 0.1)} ${f1(s * 0.3)},${f1(-s * 0.04)} 0,0Z" fill="${mix(col, '#ffffff', 0.3)}" fill-opacity=".5"/>`;
    g += `<path d="M0,0L${f1(s * 0.9)},0" stroke="${dark}" stroke-opacity=".34" stroke-width=".7" fill="none"/>`;
    if (s > 14) { let v = ''; for (const t of [0.3, 0.52, 0.72]) v += `M${f1(s * t)},0l${f1(s * 0.16)},${f1(-s * 0.15)}M${f1(s * t)},0l${f1(s * 0.16)},${f1(s * 0.15)}`; g += `<path d="${v}" stroke="${dark}" stroke-opacity=".2" stroke-width=".5" fill="none"/>`; }
  }
  return g + '</g>';
}

interface Cfg { lf: number; lc: number; ls: number; light: boolean }
/** A twig that forks recursively: each tip splits into two shorter, thinner twigs; the last level ends in leaves. Leaves get lighter outward. */
function twig(R: () => number, p0: P, ang: number, len: number, w: number, level: number, wood: string[], leaves: string[], depthColour: number, c: Cfg) {
  const bend = (R() - 0.5) * 0.9, a2 = ang + bend;
  const p3 = { x: p0.x + Math.cos(ang + bend * 0.4) * len, y: p0.y + Math.sin(ang + bend * 0.4) * len };
  const p1 = { x: p0.x + Math.cos(ang) * len * 0.36, y: p0.y + Math.sin(ang) * len * 0.36 }, p2 = { x: p3.x - Math.cos(a2) * len * 0.34, y: p3.y - Math.sin(a2) * len * 0.34 };
  const w1 = Math.max(1.1, w * 0.55), col = mix(TREE.bark, TREE.twig, depthColour);
  wood.push(branchShape(p0, p1, p2, p3, w, w1, R, { light: false, colour: col, knots: false }));
  const mid = bez(p0, p1, p2, p3, 0.5), tone = 1 - level / 3;
  if (R() < 0.8 * c.lf) leaves.push(leaf(mid.x, mid.y, ang * 57.3 + (R() < 0.5 ? -1 : 1) * (40 + R() * 40), (11 + R() * 9) * c.ls, R, tone));
  if (level > 0) {
    wood.push(`<circle cx="${f1(p3.x)}" cy="${f1(p3.y)}" r="${f1(w1 * 0.62)}" fill="${col}"/>`); // the little swelling at a fork
    twig(R, p3, ang + 0.3 + R() * 0.5 + bend * 0.2, len * (0.62 + R() * 0.2), w1, level - 1, wood, leaves, depthColour, c);
    twig(R, p3, ang - 0.3 - R() * 0.5 + bend * 0.2, len * (0.62 + R() * 0.2), w1, level - 1, wood, leaves, depthColour, c);
    if (R() < 0.45) twig(R, mid, ang + (R() < 0.5 ? -1 : 1) * (0.7 + R() * 0.5), len * 0.5, w1 * 0.85, level - 1, wood, leaves, depthColour, c);
  } else {
    if (c.lf > 0) for (let k = 0, n = Math.round((3 + R() * 3) * c.lc); k < n; k++) if (R() < c.lf) leaves.push(leaf(p3.x, p3.y, ang * 57.3 + (k - n / 2) * 38 + (R() - 0.5) * 30, (14 + R() * 12) * c.ls, R, 1));
    if (c.lf < 0.5) wood.push(`<ellipse cx="${f1(p3.x)}" cy="${f1(p3.y)}" rx="${f1(w1 * 0.9)}" ry="${f1(w1 * 0.55)}" transform="rotate(${f1(ang * 57.3)} ${f1(p3.x)} ${f1(p3.y)})" fill="${TREE.barkDark}" fill-opacity=".7"/>`); // a bud on a bare tip
  }
}

/** A user's changes to one branch: handle positions (as offsets from the automatic curve) and a thickness multiplier. */
export interface EdgeTweak { c1: [number, number]; c2: [number, number]; w: number; /** roots only: the tip's offset, and a winding multiplier */ e?: [number, number]; wind?: number }
export interface EdgeInfo { key: string; bi: number; ri: number; li: number; r: number; l: number; main: boolean }
export const edgeKey = (L: Layout, r: number, l: number) => `${L.cards[r].id}>${L.cards[l].id}`;
/** Every parent–child link in the picture, child (r, nearer the trunk) to parent (l, further out). */
export function edgesOf(L: Layout): EdgeInfo[] {
  const out: EdgeInfo[] = [];
  L.buses.forEach((b, bi) => b.R.forEach((r, ri) => b.L.forEach((l, li) => out.push({ key: edgeKey(L, r, l), bi, ri, li, r, l, main: b.bR.includes(r) && b.bL.includes(l) }))));
  return out;
}
export const edgeSeed = (e: EdgeInfo) => e.bi * 7919 + e.ri * 131 + e.li * 17 + 7;
/** The branch's curve. The automatic control points leave each person radially and wander a little (seeded, using the first two
 *  draws of R). A user's tweak moves each control point by an offset, so the shape follows when people are dragged. */
export function edgeGeom(L: Layout, off: Offsets, e: EdgeInfo, curve: number, tw?: EdgeTweak, R: () => number = rng(edgeSeed(e))) {
  const mr = L.photo / 2 + 4;
  const cen = (i: number): P => ({ x: L.cards[i].x + off.dx[i] + L.cw / 2, y: L.cards[i].y + off.dy[i] + mr });
  const root = Math.max(0, L.cards.findIndex((c) => c.root)), O = cen(root);
  const dir = (p: P) => { const dx = p.x - O.x, dy = p.y - O.y, m = Math.hypot(dx, dy); return m < 30 ? { x: 0, y: -1 } : { x: dx / m, y: dy / m }; };
  const P0 = cen(e.r), P3 = cen(e.l), len = Math.hypot(P3.x - P0.x, P3.y - P0.y), e1 = dir(P0), e2 = dir(P3);
  const nx = -(P3.y - P0.y) / (len || 1), ny = (P3.x - P0.x) / (len || 1), bow = Math.min(len * 0.14, 280) * curve, s1 = (R() * 2 - 1) * bow, s2 = (R() * 2 - 1) * bow;
  const d1 = { x: P0.x + e1.x * len * 0.42 + nx * s1, y: P0.y + e1.y * len * 0.42 + ny * s1 }, d2 = { x: P3.x - e2.x * len * 0.42 + nx * s2, y: P3.y - e2.y * len * 0.42 + ny * s2 };
  const P1 = tw ? { x: d1.x + tw.c1[0], y: d1.y + tw.c1[1] } : d1, P2 = tw ? { x: d2.x + tw.c2[0], y: d2.y + tw.c2[1] } : d2;
  return { P0, P1, P2, P3, d1, d2, len };
}

/** Branches, twigs and leaves for every parent–child link, from the cards' current positions (dragging redraws them).
 *  light = plain tapered branches only, used while something is being dragged. */
export function treeBranches(L: Layout, off: Offsets, light = false, st: TreeStyle = DEFAULT_STYLE, edges: Record<string, EdgeTweak> = {}): string {
  const ring = Math.max(...L.cards.map((c) => c.col)), thick = st.wood / 100;
  const T0 = 30, start = (d: number) => Math.max(5, T0 * 0.74 ** d) * thick; // thickness of the branch leaving a person of generation d
  const all = edgesOf(L), twigBudget = Math.max(0.35, Math.min(1, 220 / all.length)) * (st.twigs / 100);
  const cfg: Cfg = { lf: Math.min(1, st.leaves / 100), lc: Math.max(1, st.leaves / 100), ls: st.leafSize / 100, light };
  const side: string[] = [], main: string[] = [], leaves: string[] = [];
  for (const e of all) {
    const tw = edges[e.key], d = ring - L.cards[e.r].col, R = rng(edgeSeed(e));
    const { P0, P1, P2, P3, len } = edgeGeom(L, off, e, st.curve, tw, R), wm = tw?.w ?? 1;
    const w0 = (e.main ? start(d) : Math.max(2.6, start(d) * 0.4)) * wm, w1 = (e.main ? start(d + 1) : Math.max(2, start(d) * 0.28)) * wm;
    const colour = mix(TREE.trunk, TREE.twig, Math.min(1, d / (ring + 1)) * (e.main ? 0.85 : 1));
    (e.main ? main : side).push(branchShape(P0, P1, P2, P3, w0, w1, R, { light, colour, knots: e.main, moss: e.main }));
    if (light || st.draft) continue; // a draft preview keeps the wood and skips the twigs and leaves
    // twigs sprout along the branch, away from it, each forking a couple of times
    const n = Math.round(Math.max(1, Math.min(e.main ? 12 : 5, len / 110)) * twigBudget * (e.main ? 1 : 0.7));
    for (let k = 0; k < n; k++) {
      const t = 0.12 + (0.76 * (k + R() * 0.8)) / n, p = bez(P0, P1, P2, P3, t), tg = tang(P0, P1, P2, P3, t);
      const ang = Math.atan2(tg.y, tg.x) + (k % 2 ? 1 : -1) * (0.55 + R() * 0.7), wid = lerp(w0, w1, t) * 0.5;
      twig(R, p, ang, Math.min(230, 46 + len * 0.14) * (e.main ? 1 : 0.7) * (0.8 + R() * 0.5), Math.max(1.6, Math.min(wid, 9)), e.main ? 2 : 1, main, leaves, Math.min(1, d / (ring + 1)), cfg);
    }
    const tgEnd = tang(P0, P1, P2, P3, 1);
    if (R() < cfg.lf) leaves.push(leaf(P3.x, P3.y, Math.atan2(tgEnd.y, tgEnd.x) * 57.3, (14 + R() * 8) * cfg.ls, R, 1));
  }
  return `<g>${side.join('')}</g><g>${main.join('')}</g><g>${leaves.join('')}</g>`;
}

/** Where the base of the tree sits: the root person's medallion centre, and the soil surface a little below their name plaque. */
export interface RootBase { cx: number; topY: number; ground: number }
export function rootBaseOf(L: Layout, off: Offsets): RootBase {
  const rc = Math.max(0, L.cards.findIndex((c) => c.root)), c = L.cards[rc], rby = c.y + off.dy[rc] + L.ch - 4;
  return { cx: c.x + off.dx[rc] + L.cw / 2, topY: c.y + off.dy[rc] + L.photo / 2 + 4, ground: rby + 78 };
}
const ROOT_DIRS = [-1, -0.62, -0.28, 0.28, 0.62, 1];
/** One of the main roots: its route as a bezier (P0..P3), the automatic control points d1..d3 a user's tweak is measured from, and the
 *  winding multiplier. Keys are `root:0`..`root:5`, stored in the same per-branch tweak table as the tree's branches. */
export interface RootGeom { key: string; i: number; dir: number; P0: P; P1: P; P2: P; P3: P; d1: P; d2: P; d3: P; k: number; w: number; wind: number }
export function rootGeoms(b: RootBase, thick: number, edges: Record<string, EdgeTweak>): RootGeom[] {
  const h = 15 * thick;
  return ROOT_DIRS.map((dir, i) => {
    const J = rng(2000 + i), flat = 0.07 + (1 - Math.abs(dir)) * 0.2 + (J() - 0.5) * 0.08, len = 120 + Math.abs(dir) * 140 + J() * 50, k = 0.025 + J() * 0.03;
    const a = dir > 0 ? flat : Math.PI - flat, pull = (Math.PI / 2 - a) * k, a2 = a + pull, P0 = { x: b.cx + dir * h * 2.3, y: b.ground - 10 + (1 - Math.abs(dir)) * 6 };
    const d3 = { x: P0.x + Math.cos(a2) * len, y: P0.y + Math.sin(a2) * len }, d1 = { x: P0.x + Math.cos(a) * len * 0.38, y: P0.y + Math.sin(a) * len * 0.38 }, d2 = { x: d3.x - Math.cos(a2 + pull * 0.2) * len * 0.35, y: d3.y - Math.sin(a2 + pull * 0.2) * len * 0.35 };
    const tw = edges[`root:${i}`], add = (p: P, o?: [number, number]) => (o ? { x: p.x + o[0], y: p.y + o[1] } : p);
    return { key: `root:${i}`, i, dir, P0, P1: add(d1, tw?.c1), P2: add(d2, tw?.c2), P3: add(d3, tw?.e), d1, d2, d3, k, w: (tw?.w ?? 1) * h * 2.1 * (1 - Math.abs(dir) * 0.3), wind: tw?.wind ?? 1 };
  });
}

/** The base of the tree. The trunk, its flare and every root are painted as ONE merged shape (outline round the outside only), so the roots
 *  grow out of the trunk instead of sitting behind it. Main roots fan out nearly flat, wind along their way like the branches do, and can be
 *  reshaped in the editor; short thinner roots drop from them. wind: percent (100 = standard). */
export function treeRoots(b: RootBase, thick = 1, light = false, edges: Record<string, EdgeTweak> = {}, windPct = 100): string {
  const R = rng(99), nz = noise(R), h = 15 * thick, colour = TREE.trunk, dark = mix(colour, '#000000', 0.42), wf = windPct / 100;
  const { cx, topY, ground } = b, P: Parts = { dark: '', body: '', detail: '' };
  const add = (x: Parts) => { P.dark += x.dark; P.body += x.body; P.detail += x.detail; };
  const clampA = (x: number) => Math.max(0.1, Math.min(Math.PI - 0.1, x));
  const tint = (w: number) => mix(colour, TREE.twig, Math.min(0.7, Math.max(0, 1 - w / (h * 1.7))));
  // a root, drawn along its (winding) centreline; children grow from points on that line
  const run = (p0: P, p1: P, p2: P, p3: P, w: number, level: number, k: number, down: boolean, wind: number, knots = false) => {
    const w1 = Math.max(1.3, w * 0.58), pts = windLine(p0, p1, p2, p3, w, w1, R, wind, light ? 0 : 0.18);
    add(partsFrom(pts, R, { light, colour: tint(w), knots }));
    if (level <= 0) return;
    const N = pts.length - 1, end = pts[N].p, back = pts[Math.max(0, N - 3)].p, a2 = Math.atan2(end.y - back.y, end.x - back.x);
    if (down) { // a downward root splits into two finer ones, still heading down
      spawn(end, clampA(a2 + 0.3 + R() * 0.25), Math.hypot(p3.x - p0.x, p3.y - p0.y) * (0.6 + R() * 0.15), w1, level - 1, 0.3, true, wind);
      spawn(end, clampA(a2 - 0.3 - R() * 0.25), Math.hypot(p3.x - p0.x, p3.y - p0.y) * (0.55 + R() * 0.15), w1, level - 1, 0.3, true, wind);
      return;
    }
    const len = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    spawn(end, clampA(a2 + (R() - 0.5) * 0.3), len * (0.68 + R() * 0.1), w1, level - 1, k, false, wind); // the main run carries on outward
    if (level >= 2) spawn(end, clampA(a2 + (a2 < Math.PI / 2 ? 1 : -1) * (0.4 + R() * 0.2)), len * (0.5 + R() * 0.1), w1 * 0.9, level - 1, k + 0.05, false, wind); // and a second fork slightly lower
    for (const t of level >= 2 ? [0.4, 0.74] : [0.55]) { // short roots dropping from the side of this one
      if (R() < 0.3) continue;
      spawn(pts[Math.round(t * N)].p, clampA(Math.PI / 2 + (R() - 0.5) * 0.7), (24 + R() * 26) * (len / 140 + 0.4), Math.max(1.8, w * 0.4), light ? 0 : 1, 0.3, true, wind);
    }
  };
  const spawn = (p0: P, a: number, len: number, w: number, level: number, k: number, down: boolean, wind: number) => {
    const pull = (Math.PI / 2 - a) * k * (0.8 + R() * 0.4), a2 = a + pull, p3 = { x: p0.x + Math.cos(a2) * len, y: p0.y + Math.sin(a2) * len };
    run(p0, { x: p0.x + Math.cos(a) * len * 0.38, y: p0.y + Math.sin(a) * len * 0.38 }, { x: p3.x - Math.cos(a2 + pull * 0.2) * len * 0.35, y: p3.y - Math.sin(a2 + pull * 0.2) * len * 0.35 }, p3, w, level, k, down, wind);
  };
  for (const g of rootGeoms(b, thick, edges)) run(g.P0, g.P1, g.P2, g.P3, g.w, light ? 1 : 2, g.k, false, wf * g.wind, true);
  for (const sd of [-1, 1]) spawn({ x: cx + sd * h * 0.7, y: ground + 4 }, Math.PI / 2 + sd * 0.25, 60 + R() * 30, h * 1.1, light ? 0 : 1, 0.2, true, wf); // two short ones straight down under the trunk
  // the trunk: straight where it leaves the medallion, then widening smoothly to meet the roots at the soil surface
  const N = 24, pts: { y: number; hw: number }[] = [];
  for (let i = 0; i <= N; i++) { const t = i / N, f = t < 0.3 ? 0 : ((t - 0.3) / 0.7) ** 1.7; pts.push({ y: lerp(topY, ground, t), hw: h * (1 + 2 * f) * (1 + 0.05 * nz(t * 5)) }); }
  const band = (k: number, sh: number, fade = false) => smoothBand(pts.map((q, i) => { const g = fade ? 1 - Math.max(0, (i / N - 0.72) / 0.28) ** 1.4 : 1; return { x: cx - q.hw * k * g + sh * q.hw * g, y: q.y }; }), pts.map((q, i) => { const g = fade ? 1 - Math.max(0, (i / N - 0.72) / 0.28) ** 1.4 : 1; return { x: cx + q.hw * k * g + sh * q.hw * g, y: q.y }; }).reverse());
  P.dark += `<path d="${band(1.09, 0)}" fill="${dark}"/>`;
  P.body += `<path d="${band(1, 0)}" fill="${colour}"/>`;
  P.detail += `<path d="${band(0.3, -0.42, true)}" fill="${mix(colour, '#ffffff', 0.3)}" fill-opacity=".4"/><path d="${band(0.26, 0.5, true)}" fill="#000" fill-opacity=".26"/>`;
  if (!light) for (const u of [-0.78, -0.45, -0.12, 0.22, 0.55, 0.8]) { // bark grain follows the flare outward and fades into the roots
    const lane = pts.slice(0, N - 4).map((q, i) => ({ x: cx + u * q.hw * (1 + 0.1 * nz(i * 0.7 + u * 9)), y: q.y }));
    P.detail += `<path d="${smoothOpen(lane)}" fill="none" stroke="${TREE.barkDark}" stroke-width="${f1(1.2 + h * 0.03)}" stroke-opacity="${f1(0.22 + R() * 0.2)}" stroke-dasharray="${f1(14 + R() * 40)} ${f1(4 + R() * 12)} ${f1(24 + R() * 40)} ${f1(5 + R() * 12)}" stroke-dashoffset="${f1(R() * 60)}" stroke-linecap="round"/>`;
  }
  return `<g>${P.dark}</g><g>${P.body}</g><g>${P.detail}</g>`;
}

/** Soil, grass tufts and a scatter of fallen leaves around the base. Sits behind the roots. */
export function treeGround(cx: number, gy: number, boxW: number, boxBottom: number, leavesPct: number): string {
  const R = rng(311), rx = Math.min(boxW * 0.42, 2600), ry = Math.max(150, boxBottom - gy);
  let out = `<defs><radialGradient id="soil" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${TREE.soil}" stop-opacity=".5"/><stop offset=".5" stop-color="${TREE.soil}" stop-opacity=".26"/><stop offset="1" stop-color="${TREE.soil}" stop-opacity="0"/></radialGradient>
<radialGradient id="shade" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
  // the soil is a soft pool centred under the trunk that fades to nothing at its rim (no hard edge)
  out += `<ellipse cx="${f1(cx)}" cy="${f1(gy + ry * 0.35)}" rx="${f1(rx)}" ry="${f1(ry * 0.9)}" fill="url(#soil)"/><ellipse cx="${f1(cx)}" cy="${f1(gy + 6)}" rx="150" ry="26" fill="url(#shade)"/>`;
  let blades = '';
  for (let i = 0; i < 150; i++) { // grass tufts, thinning out toward the sides
    const u = (R() * 2 - 1), x = cx + u * rx * 0.92, y = gy + 14 + R() * 18 - Math.abs(u) * 10, h = (16 + R() * 26) * (1 - Math.abs(u) * 0.5), lean = (R() - 0.5) * 18;
    if (R() < Math.abs(u) * 0.55) continue;
    for (let k = 0; k < 3; k++) blades += `M${f1(x + k * 3)},${f1(y)}q${f1(lean * (0.4 + k * 0.2))},${f1(-h * 0.5)} ${f1(lean + k * 2 - 2)},${f1(-h * (0.75 + 0.12 * k))}`;
  }
  out += `<path d="${blades}" fill="none" stroke="${TREE.grass}" stroke-width="1.7" stroke-linecap="round" stroke-opacity=".8"/>`;
  let fall = '';
  if (leavesPct > 0) for (let i = 0; i < Math.round(26 * Math.min(1.6, leavesPct / 100)); i++) { // leaves that have already come down
    const u = (R() * 2 - 1), x = cx + u * rx * 0.85, y = gy + 40 + R() * Math.max(30, ry * 0.75);
    fall += leaf(x, y, R() * 360, 13 + R() * 10, R, 0.2, false);
  }
  return `<g>${out}<g opacity=".82">${fall}</g></g>`;
}
