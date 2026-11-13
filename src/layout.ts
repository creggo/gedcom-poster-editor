// Pedigree layout: father's line to the left, mother's to the right, siblings stacked beside each person.
// Pure function: Tree + Options -> positioned cards and lane-routed lines. No DOM.
import type { CardStyle, Options, Tree } from './types.ts';
export const HGAP = 22; // gap between cards side by side in a band (vertical designs)

export const V = { pad: 60, laneW: 11, margin: 18, minGap: 44, headH: 70 };
// Card styles: smaller cards with bigger relative text stay readable when a big tree is squeezed onto a sheet.
export const CARDS: Record<CardStyle, { w: number; h: number; gapY: number; photo: number; given: number; sur: number; fact: number; full: boolean }> = {
  full:    { w: 290, h: 110, gapY: 14, photo: 88, given: 16, sur: 19, fact: 11, full: true },
  compact: { w: 230, h: 72,  gapY: 10, photo: 52, given: 14, sur: 16, fact: 13, full: false },
  mini:    { w: 170, h: 58,  gapY: 8,  photo: 0,  given: 13, sur: 15, fact: 12, full: false },
  leaf:    { w: 120, h: 128, gapY: 8,  photo: 64, given: 12, sur: 12, fact: 10, full: false }, // medallion + name beneath (tree design)
};

/** A card style at the user's node size: picture, text and spacing all scale together. */
export function cardDims(style: CardStyle, nodeScale = 100) {
  const K = CARDS[style], s = nodeScale / 100;
  return { w: K.w * s, h: K.h * s, gapY: K.gapY * s, photo: K.photo * s, given: K.given * s, sur: K.sur * s, fact: K.fact * s, full: K.full };
}

export interface Card { id: string; col: number; row: number; side: number; lineage: boolean; root: boolean; x: number; y: number; }
// A bus joins cards either side of one column gap: L = cards on the left (right edge), R = cards on the right (left edge).
// All card references are indices into Layout.cards. bL/bR are the subset on the direct line (drawn heavier).
export interface Bus { gap: number; L: number[]; R: number[]; bL: number[]; bR: number[]; lane?: number; lo?: number; hi?: number; x0?: number; }
export type Offsets = { dx: number[]; dy: number[] };
export interface Routed { lines: string[]; bold: string[]; dots: { x: number; y: number }[]; clashes: number; cardClashes: number; }
export interface Layout extends Routed {
  cards: Card[]; buses: Bus[]; spouseLinks: [number, number][]; kids: number[][]; cw: number; ch: number; photo: number; W: number; H: number; vertical: boolean;
}
interface Node { id: string; depth: number; mem: string[]; hs: number[]; F: Node | null; M: Node | null; H: number; ys?: number[]; y?: number; ci?: number[]; }
const lineageIdx = (n: Node) => n.ci![Math.max(0, n.mem.indexOf(n.id))];

export function layout(tree: Tree, o: Options): Layout {
  const { people, parents } = tree;
  const root = o.root, K = cardDims(o.card, o.nodeScale ?? 100), cw = K.w, ch = K.h;
  const par = (id: string): (string | null)[] => (parents[id] ?? []).map((x) => (x && people[x] ? x : null));
  const key = (id: string) => (parents[id] ?? []).map((x) => x ?? '').join('|');
  const groups: Record<string, string[]> = {};
  for (const id in parents) (groups[key(id)] ??= []).push(id);
  const bySort = (a: string, b: string) => (people[a]?.sort || '9').localeCompare(people[b]?.sort || '9');
  const members = (id: string) => (o.siblings && parents[id] ? [...groups[key(id)]].sort(bySort) : [id]);

  const lin = new Set<string>();
  (function w(id: string | null, d: number) { if (!id || lin.has(id)) return; lin.add(id); if (d < o.gens) par(id).forEach((x) => w(x, d + 1)); })(root, 0);
  const spousesOf = (id: string) => (o.relatives ? (people[id]?.spouses ?? []).filter((s) => people[s] && !lin.has(s)).slice(0, 2) : []);

  function build(id: string, depth: number): Node {
    const [f, m] = depth < o.gens ? par(id) : [null, null];
    const F = f ? build(f, depth + 1) : null, M = m ? build(m, depth + 1) : null, mem = members(id);
    const hs = mem.map((x) => (x === id ? 1 : 1 + spousesOf(x).length)); // a sibling's spouse takes the row below
    return { id, depth, mem, hs, F, M, H: Math.max(hs.reduce((a, b) => a + b), (F?.H ?? 0) + (M?.H ?? 0)) };
  }
  // y in card rows: parents centred in their span, the sibling block centred on its parents
  function place(n: Node, y0: number, H: number) {
    const pH = (n.F?.H ?? 0) + (n.M?.H ?? 0), off = y0 + (H - pH) / 2;
    if (n.F) place(n.F, off, n.F.H);
    if (n.M) place(n.M, off + (n.F?.H ?? 0), n.M.H);
    const py = [n.F, n.M].filter(Boolean).map((k) => k!.y!);
    const c = py.length ? py.reduce((a, b) => a + b) / py.length : y0 + H / 2 - 0.5;
    const tot = n.hs.reduce((a, b) => a + b);
    let acc = Math.min(Math.max(c - (tot - 1) / 2, y0), y0 + H - tot);
    n.ys = n.hs.map((h) => { const y = acc; acc += h; return y; });
    n.y = n.ys[Math.max(0, n.mem.indexOf(n.id))];
  }

  const R = build(root, 0);
  const rootW = R.hs.reduce((a, b) => a + b);
  // across: both sides centred on the root's rows. up: father's span, then mother's span, side by side.
  let rows = Math.max(R.F?.H ?? 0, R.M?.H ?? 0, rootW, 1);
  if (o.design !== 'classic') rows = Math.max((R.F?.H ?? 0) + (R.F && R.M ? 0.5 : 0) + (R.M?.H ?? 0), rootW, 1);
  if (R.F) place(R.F, o.design !== 'classic' ? 0 : (rows - R.F.H) / 2, R.F.H);
  if (R.M) place(R.M, o.design !== 'classic' ? (R.F?.H ?? 0) + (R.F ? 0.5 : 0) : (rows - R.M.H) / 2, R.M.H);
  { let acc = o.design !== 'classic' ? Math.max(0, (R.F?.H ?? 0) + (R.F && R.M ? 0.25 : 0) - rootW / 2) : (rows - rootW) / 2;
    R.ys = R.hs.map((h) => { const y = acc; acc += h; return y; }); R.y = R.ys[Math.max(0, R.mem.indexOf(root))]; rows = Math.max(rows, acc); }

  const depthOf = (n: Node | null): number => (n ? Math.max(n.depth, depthOf(n.F), depthOf(n.M)) : 0);
  const up = o.design !== 'classic'; // generations as rows, both parents' lines share each band
  const DL = up ? Math.max(depthOf(R.F), depthOf(R.M)) : depthOf(R.F), DR = depthOf(R.M);
  const es = (side: number) => (up && side !== 0 ? -1 : side); // vertical designs fold the mother's side onto the same bands
  const rowH = ch + K.gapY, headH = o.title ? V.headH : 0, mid = ch / 2;
  const cy = (row: number) => V.pad + headH + row * rowH;

  const cards: Card[] = [], buses: Bus[] = [], spouseLinks: [number, number][] = [], kids: number[][] = [];
  const push = (c: Card) => { cards.push(c); kids.push([]); return cards.length - 1; };
  const lineageBus = (n: Node, side: number, ps: Node[]) => {
    side = es(side);
    const m = DL + side * n.depth, pr = ps.map(lineageIdx), me = lineageIdx(n);
    buses.push(side < 0 ? { gap: m - 1, L: pr, R: n.ci!, bL: pr, bR: [me] } : { gap: m, L: n.ci!, R: pr, bL: [me], bR: pr });
  };
  const emit = (n: Node, side: number) => {
    n.ci = n.mem.map((id, i) => push({ id, col: DL + es(side) * n.depth, row: n.ys![i], lineage: id === n.id, root: false, side: es(side), x: 0, y: 0 }));
    for (const k of [n.F, n.M]) if (k) emit(k, side);
    // moving a person drags the branch beyond them: both parents, their siblings and everything those carry
    for (const k of [n.F, n.M]) if (k) kids[lineageIdx(n)].push(...k.ci!);
    if (n.F || n.M) lineageBus(n, side, [n.F, n.M].filter(Boolean) as Node[]);
  };
  R.ci = R.mem.map((id, i) => push({ id, col: DL, row: R.ys![i], lineage: id === root, root: id === root, side: 0, x: 0, y: 0 }));
  if (R.F) { emit(R.F, -1); kids[lineageIdx(R)].push(...R.F.ci!); }
  if (R.M) { emit(R.M, 1); kids[lineageIdx(R)].push(...R.M.ci!); }
  if (up) lineageBus(R, -1, [R.F, R.M].filter(Boolean) as Node[]); // both parents sit in one band: one bus, not two on top of each other
  else { if (R.F) lineageBus(R, -1, [R.F]); if (R.M) lineageBus(R, 1, [R.M]); }

  // relatives: siblings' spouses and descendants grow toward the centre, down to the root's generation
  const occ: Record<number, [number, number][]> = {}, placedIds = new Set<string>(), pos: Record<string, number> = {};
  const free = (col: number, r: number, h: number) => !(occ[col] ??= []).some(([a, b]) => r < b - 1e-6 && r + h > a + 1e-6);
  const take = (col: number, r: number, h: number) => (occ[col] ??= []).push([r, r + h]);
  const add = (id: string, col: number, row: number, side: number, parentIdx: number) => {
    const i = push({ id, col, row, side, lineage: false, root: false, x: 0, y: 0 });
    take(col, row, 1); placedIds.add(id); pos[id] = i; kids[parentIdx].push(i); return i;
  };
  cards.forEach((c, i) => { take(c.col, c.row, 1); placedIds.add(c.id); pos[c.id] = i; });
  const spouseCards = (id: string, col: number, row: number, side: number) => {
    let at = pos[id], prev = at;
    spousesOf(id).filter((s) => !placedIds.has(s)).forEach((s, k) => { prev = add(s, col, row + 1 + k, side, at); spouseLinks.push([k === 0 ? at : prev - 1, prev]); });
  };
  if (o.relatives) {
    const kidsOf = (id: string) => {
      const ids = new Set(people[id].children);
      for (const s of people[id].spouses) (people[s]?.children ?? []).forEach((k) => ids.add(k));
      return [...ids].filter((k) => people[k] && !placedIds.has(k)).sort(bySort);
    };
    const sibs = cards.map((c, i) => i).filter((i) => !cards[i].lineage && cards[i].side !== 0).sort((a, b) => cards[a].row - cards[b].row);
    cards.map((c, i) => i).filter((i) => !cards[i].lineage).forEach((i) => spouseCards(cards[i].id, cards[i].col, cards[i].row, cards[i].side));
    const descend = (pid: string): number => { // bottom row used by this person's descendants
      const pi = pos[pid], { col, row, side } = cards[pi], dir = side < 0 ? 1 : -1, cc = col + dir;
      if (side < 0 ? cc > DL : cc < DL) return row + 1;
      const ks = kidsOf(pid), got: number[] = [];
      let cursor = Math.max(0, row - (ks.length - 1) / 2), bottom = row + 1;
      for (const k of ks) {
        if (placedIds.has(k)) continue;
        const h = 1 + spousesOf(k).filter((s) => !placedIds.has(s)).length;
        let r = cursor; while (!free(cc, r, h)) r += 1;
        got.push(add(k, cc, r, side, pi)); spouseCards(k, cc, r, side);
        const b = descend(k); bottom = Math.max(bottom, b, r + h); cursor = Math.max(r + h, b);
      }
      if (got.length) buses.push(side < 0 ? { gap: col, L: [pi], R: got, bL: [], bR: [] } : { gap: col - 1, L: got, R: [pi], bL: [], bR: [] });
      return bottom;
    };
    for (const i of sibs) descend(cards[i].id);
  }

  // lanes: every bus gets its own vertical lane in its gap, so no two lines run on top of each other
  const rowOf = (i: number) => cards[i].row;
  const byGap: Record<number, Bus[]> = {};
  for (const b of buses) (byGap[b.gap] ??= []).push(b);
  const gapW: Record<number, number> = {};
  for (const [g, bs] of Object.entries(byGap)) {
    bs.forEach((b) => { const r = [...b.L, ...b.R].map(rowOf); b.lo = Math.min(...r); b.hi = Math.max(...r); b.lane = 0; });
    // a stub leaving a card left of the gap must not run into a stub arriving at the card on its right (same row)
    const before = (a: Bus, b: Bus) => a.L.some((i) => b.R.some((q) => Math.abs(rowOf(i) - rowOf(q)) < 1e-6));
    for (let it = 0; it < 400; it++) {
      let moved = false;
      for (const a of bs) for (const b of bs) {
        if (a === b) continue;
        if (before(a, b) && a.lane! >= b.lane!) { b.lane = a.lane! + 1; moved = true; }
        else if (a.lo! <= b.hi! + 1e-6 && b.lo! <= a.hi! + 1e-6 && a.lane === b.lane && (a.lo! < b.lo! || (a.lo === b.lo && bs.indexOf(a) < bs.indexOf(b)))) { b.lane!++; moved = true; }
      }
      if (!moved) break;
    }
    gapW[+g] = Math.max(V.minGap, (Math.max(...bs.map((b) => b.lane!)) + 1) * V.laneW + 2 * V.margin);
  }
  const nCols = up ? DL + 1 : DL + DR + 1;
  // along: the axis generations step along (x for across, y for up). start[c] = where band/column c begins.
  const size = up ? ch : cw, start = [up ? V.pad + headH : V.pad];
  for (let c = 0; c < nCols; c++) start.push(start[c] + size + (gapW[c] ?? V.minGap));
  const along = Math.ceil(start[nCols] - (gapW[nCols - 1] ?? V.minGap) + V.pad);
  const rowsAll = Math.max(rows, ...cards.map((c) => c.row + 1));
  let W: number, H: number;
  if (up) {
    W = Math.ceil(V.pad * 2 + rowsAll * (cw + HGAP) - HGAP); H = along;
    for (const c of cards) { c.x = V.pad + c.row * (cw + HGAP); c.y = start[c.col]; }
  } else {
    W = along; H = Math.ceil(V.pad * 2 + rowsAll * rowH - K.gapY + headH);
    for (const c of cards) { c.x = start[c.col]; c.y = cy(c.row); }
  }
  if (o.design === 'tree') ({ W, H } = fan(cards, cw, ch, rowsAll, DL, headH, o.organic ?? 0, (o.genGap ?? 100) / 100));
  for (const b of buses) b.x0 = start[b.gap] + size + V.margin + b.lane! * V.laneW;

  const L0 = { cards, buses, spouseLinks, kids, cw, ch, photo: K.photo, W, H, vertical: up };
  return { ...L0, ...route(L0, { dx: cards.map(() => 0), dy: cards.map(() => 0) }) };
}

/** Nudge apart anything that overlaps, until nothing does (the root's own row stays put). People are pushed along whichever axis needs the
 *  smaller move, so crowded neighbours spread out along their ring rather than all jumping outward. */
function relax(cards: Card[], ctr: { x: number; y: number }[], root: number, cw: number, ch: number) {
  const movable = cards.map((_, i) => i).filter((i) => cards[i].col !== root), n = movable.length;
  for (let it = 0, moved = true; moved && it < (n > 600 ? 40 : 300); it++) {
    moved = false;
    movable.sort((a, b) => ctr[a].x - ctr[b].x);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const i = movable[a], k = movable[b], dx = ctr[k].x - ctr[i].x;
      if (dx >= cw + 6) break;
      const dy = ctr[k].y - ctr[i].y, oy = ch + 6 - Math.abs(dy), ox = cw + 6 - Math.abs(dx);
      if (oy <= 0 || ox <= 0) continue;
      moved = true;
      if (ox < oy) { const m = (ox / 2 + 0.5) * Math.sign(dx || 1); ctr[i].x -= m; ctr[k].x += m; }
      else { const m = (oy / 2 + 0.5) * Math.sign(dy || 1); ctr[i].y -= m; ctr[k].y += m; }
    }
    for (const i of movable) ctr[i].y = Math.min(-ch * 0.7, ctr[i].y);
  }
}

/** Turn the even rings into an organic scatter. Each generation keeps its place in the order, but every person is nudged along and across
 *  their ring by a smooth wobble (so a whole stretch of the canopy swells or recedes together) plus some personal randomness, then a
 *  relaxation pass (run afterwards) pushes overlapping neighbours apart. The same seed always gives the same shape; a different seed gives a new one. */
function organic(cards: Card[], ctr: { x: number; y: number }[], ring: Map<number, number[]>, root: number, cw: number, ch: number, seed: number) {
  let s = seed >>> 0;
  const J = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ph = [J() * 6.28, J() * 6.28, J() * 6.28, J() * 6.28], sp = ch * 1.25;
  for (const [g, ids] of ring) {
    if (g === root) continue;
    const gp = g * 1.7;
    for (const i of ids) {
      const x = ctr[i].x, y = ctr[i].y, r = Math.hypot(x, y), t = Math.atan2(-y, x);
      const wave = (Math.sin(t * 3 + ph[0] + gp) + 0.5 * Math.sin(t * 7 + ph[1] + gp * 1.3)) / 1.5;      // shared by neighbours: the canopy swells and recedes
      const twist = (Math.sin(t * 5 + ph[2] + gp) + 0.5 * Math.sin(t * 11 + ph[3])) / 1.5;               // slides whole stretches along the ring
      const f = Math.max(0.1, Math.min(1, (r - 320) / 1000)); // calm near the trunk, looser toward the tips
      const r2 = r + sp * f * (1.0 * wave + 0.6 * (J() * 2 - 1)), t2 = t + ((cw + 10) / Math.max(r, 200)) * f * (0.85 * twist + 0.55 * (J() * 2 - 1));
      ctr[i] = { x: r2 * Math.cos(t2), y: Math.min(-ch * 0.7, -r2 * Math.sin(t2)) };
    }
  }
}

/** Fan canopy for the tree design: each generation sits on a ring around the root (father's side left, mother's right).
 *  Rings are spread just enough that no two cards overlap, so the picture is a compact half-disc, not a strip. */
function fan(cards: Card[], cw: number, ch: number, rows: number, root: number, headH: number, seed = 0, gap = 1): { W: number; H: number } {
  const ring = new Map<number, number[]>();
  cards.forEach((c, i) => (ring.get(c.col) ?? ring.set(c.col, []).get(c.col)!).push(i));
  const ctr: { x: number; y: number }[] = new Array(cards.length), done: number[] = [];
  const hit = (i: number, p: { x: number; y: number }) => done.some((j) => Math.abs(ctr[j].x - p.x) < cw + 8 && Math.abs(ctr[j].y - p.y) < ch + 8);
  // the root and any siblings sit side by side at the trunk
  const rr = ring.get(root)!.sort((a, b) => cards[a].row - cards[b].row);
  rr.forEach((i, k) => { ctr[i] = { x: (k - (rr.length - 1) / 2) * (cw + 16), y: 0 }; done.push(i); });
  const lo = 0.1 * Math.PI, hi = 0.9 * Math.PI;
  let r = 0;
  for (let g = root - 1; g >= 0; g--) { // inner generations first
    const ids = (ring.get(g) ?? []).sort((a, b) => cards[a].row - cards[b].row);
    if (!ids.length) continue;
    const want = ids.map((i) => Math.PI * (0.9 - 0.8 * (cards[i].row + 0.5) / rows));
    for (r = Math.max(r + ch + 30, 250); ; r += 8) {
      // neighbours along the ring need a chord long enough to clear each other: sideways at the top, up/down at the sides
      const gapAt = (t: number) => 2 * Math.asin(Math.min(1, Math.min((cw + 10) / Math.max(Math.abs(Math.sin(t)), 1e-3), (ch + 10) / Math.max(Math.abs(Math.cos(t)), 1e-3)) / (2 * r)));
      const a = want.map((t) => Math.min(hi, Math.max(lo, t)));
      for (let k = 1; k < a.length; k++) a[k] = Math.min(a[k], a[k - 1] - gapAt(a[k - 1]));
      if (a[a.length - 1] < lo) { a[a.length - 1] = lo; for (let k = a.length - 2; k >= 0; k--) a[k] = Math.max(a[k], a[k + 1] + gapAt(a[k + 1])); }
      if (a[0] > hi + 1e-9) continue;
      const pts = a.map((t) => ({ x: r * Math.cos(t), y: -r * Math.sin(t) }));
      if (pts.some((p, k) => hit(ids[k], p) || pts.some((q, m) => m < k && Math.abs(q.x - p.x) < cw + 8 && Math.abs(q.y - p.y) < ch + 8))) continue;
      ids.forEach((i, k) => { ctr[i] = pts[k]; done.push(i); });
      break;
    }
  }
  // closer generations: pull each ring toward the one inside it by the chosen fraction of the distance that packing left between them
  if (gap < 1) {
    const base = ch * 1.3, gens = [...ring.keys()].filter((g) => g !== root).sort((a, b) => b - a);
    let prevOld = base, prevNew = base;
    for (const g of gens) {
      const ids = ring.get(g)!, old = ids.reduce((t, i) => t + Math.hypot(ctr[i].x, ctr[i].y), 0) / ids.length, nu = old <= base ? old : prevNew + Math.max(0, old - prevOld) * gap;
      for (const i of ids) { const k = nu / (Math.hypot(ctr[i].x, ctr[i].y) || 1); ctr[i] = { x: ctr[i].x * k, y: ctr[i].y * k }; }
      prevOld = Math.max(prevOld, old); prevNew = Math.max(prevNew, nu);
    }
  }
  if (seed) organic(cards, ctr, ring, root, cw, ch, seed);
  if (seed || gap < 1) relax(cards, ctr, root, cw, ch);
  const xs = ctr.map((p) => p.x), ys = ctr.map((p) => p.y);
  const x0 = Math.min(...xs) - cw / 2 - V.pad, y0 = Math.min(...ys) - ch / 2 - V.pad - headH;
  cards.forEach((c, i) => { c.x = ctr[i].x - cw / 2 - x0; c.y = ctr[i].y - ch / 2 - y0; });
  return { W: Math.ceil(Math.max(...xs) + cw / 2 + V.pad - x0), H: Math.ceil(Math.max(...ys) + ch / 2 + V.pad - y0) };
}

/** Draw all connectors from the cards' actual positions (auto layout plus any manual offsets).
 *  A bus keeps its auto lane, shifted sideways with the cards it joins, so an unmoved layout is unchanged. */
export function route(L: Pick<Layout, 'cards' | 'buses' | 'spouseLinks' | 'cw' | 'ch' | 'vertical'>, off: Offsets): Routed {
  const { cards, buses, cw, ch, vertical: T } = L;
  // a = along the generation axis (x when columns, y when rows); c = across it. Everything is built in (a, c) then mapped to x/y.
  const size = T ? ch : cw;
  const A = (i: number) => (T ? cards[i].y + off.dy[i] : cards[i].x + off.dx[i]);
  const C = (i: number) => (T ? cards[i].x + off.dx[i] + cw / 2 : cards[i].y + off.dy[i] + ch / 2);
  const dA = (i: number) => (T ? off.dy[i] : off.dx[i]);
  const run = (a1: number, c: number, a2: number) => (T ? `M${c},${a1}V${a2}` : `M${a1},${c}H${a2}`);          // along a constant c
  const bar = (a: number, c1: number, c2: number) => (T ? `M${c1},${a}H${c2}` : `M${a},${c1}V${c2}`);            // across at a constant a
  const pt = (a: number, c: number) => (T ? { x: c, y: a } : { x: a, y: c });
  const segs: { b: number; h: number; k: number; a: number; z: number }[] = [];
  const lines: string[] = [], bold: string[] = [], dots: { x: number; y: number }[] = [];
  buses.forEach((b, n) => {
    const all = [...b.L, ...b.R], x = b.x0! + all.reduce((s, i) => s + dA(i), 0) / all.length;
    const cs = all.map(C), lo = Math.min(...cs), hi = Math.max(...cs);
    const stubL = (i: number, into: string[]) => into.push(run(A(i) + size, C(i), x));
    const stubR = (i: number, into: string[]) => into.push(run(x, C(i), A(i)));
    b.L.forEach((i) => { stubL(i, lines); segs.push({ b: n, h: 1, k: C(i), a: Math.min(A(i) + size, x), z: Math.max(A(i) + size, x) }); });
    b.R.forEach((i) => { stubR(i, lines); segs.push({ b: n, h: 1, k: C(i), a: Math.min(A(i), x), z: Math.max(A(i), x) }); });
    lines.push(bar(x, lo, hi)); segs.push({ b: n, h: 0, k: x, a: lo, z: hi });
    all.forEach((i) => dots.push(pt(x, C(i))));
    if (b.bL.length || b.bR.length) { // the direct line, drawn heavier on top
      const bc = [...b.bL, ...b.bR].map(C);
      b.bL.forEach((i) => stubL(i, bold)); b.bR.forEach((i) => stubR(i, bold));
      bold.push(bar(x, Math.min(...bc), Math.max(...bc)));
    }
  });
  for (const [p, q] of L.spouseLinks) { // partners sit next to each other: a short link joins them
    const px = cards[p].x + off.dx[p], py = cards[p].y + off.dy[p], qx = cards[q].x + off.dx[q], qy = cards[q].y + off.dy[q];
    lines.push(T ? `M${px + cw},${py + ch / 2}H${qx}` : `M${px + cw / 2},${py + ch}V${qy}`);
  }

  // self-check: lines from different buses never share a stretch of one track; cards never overlap
  let clashes = 0, cardClashes = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.b !== b.b && a.h === b.h && Math.abs(a.k - b.k) < 0.5 && a.a < b.z - 0.5 && b.a < a.z - 0.5) clashes++;
  }
  const X = (i: number) => cards[i].x + off.dx[i], Y = (i: number) => cards[i].y + off.dy[i];
  const order = cards.map((_, i) => i).sort((p, q) => X(p) - X(q));
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    const p = order[i], q = order[j];
    if (X(q) >= X(p) + cw - 0.5) break;
    if (Math.abs(Y(p) - Y(q)) < ch - 0.5) cardClashes++;
  }
  return { lines, bold, dots, clashes, cardClashes };
}
