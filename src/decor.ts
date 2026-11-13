// Frame, title and "old paper" effects drawn around the chart. Colours come from the theme; ageing is layered on top.
// Everything is vector except two small noise textures (SVG filters), so the family tree itself stays crisp in a PDF.
import type { Options } from './types.ts';
import { mix, rng, f1 } from './treeart.ts';

export interface Box { x: number; y: number; w: number; h: number }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Overall scale so the frame and title look right on a 2,000px and a 12,000px drawing alike. */
export const decorScale = (box: Box) => Math.max(1, Math.min(2.4, box.w / 3000));

/** The border, with the title set into its top edge on a plate that breaks the line. */
export function frame(box: Box, o: Options, measure: (text: string, size: number, spacing: number) => number): string {
  const s = decorScale(box), inset = 24 * s, ink = o.theme.frame, bg = o.theme.bgTop;
  const x0 = box.x + inset, y0 = box.y + inset, x1 = box.x + box.w - inset, y1 = box.y + box.h - inset, w = x1 - x0, h = y1 - y0;
  let out = '';
  const rect = (d: number, sw: number, op = 1) => `<rect x="${f1(x0 + d)}" y="${f1(y0 + d)}" width="${f1(w - 2 * d)}" height="${f1(h - 2 * d)}" fill="none" stroke="${ink}" stroke-width="${f1(sw)}" stroke-opacity="${op}"/>`;
  if (o.border === 'thin') out += rect(0, 3 * s);
  if (o.border === 'double' || o.border === 'ornate') out += rect(0, 4.5 * s) + rect(10 * s, 1.5 * s);
  if (o.border === 'ornate') { // curled corner pieces
    const c = (cx: number, cy: number, sx: number, sy: number) => {
      const r = 34 * s;
      return `<g transform="translate(${f1(cx)},${f1(cy)}) scale(${sx},${sy})" fill="none" stroke="${ink}" stroke-width="${f1(2 * s)}"><path d="M${f1(14 * s)},${f1(14 * s)}h${f1(r)}a${f1(r)},${f1(r)} 0 0 1 ${f1(-r)},${f1(r)}z" fill="${ink}" fill-opacity=".14"/><path d="M${f1(14 * s)},${f1(14 * s)}c${f1(r * 0.9)},${f1(-4 * s)} ${f1(r * 1.5)},${f1(r * 0.4)} ${f1(r * 1.1)},${f1(r * 1.1)}"/><circle cx="${f1(14 * s)}" cy="${f1(14 * s)}" r="${f1(4.5 * s)}" fill="${ink}" stroke="none"/></g>`;
    };
    out += c(x0, y0, 1, 1) + c(x1, y0, -1, 1) + c(x0, y1, 1, -1) + c(x1, y1, -1, -1);
  }
  if (o.title) {
    const size = 40 * s, spacing = 0.3 * size, text = o.title.toUpperCase(), tw = measure(text, size, spacing), pw = tw + 110 * s, ph = size * 1.5, cx = box.x + box.w / 2;
    out += `<g><rect x="${f1(cx - pw / 2)}" y="${f1(y0 - ph / 2)}" width="${f1(pw)}" height="${f1(ph)}" fill="${bg}"/>`;
    for (const sx of [-1, 1]) out += `<path d="M${f1(cx + sx * (pw / 2 - 26 * s))},${f1(y0)}l${f1(sx * -9 * s)},${f1(-7 * s)}l${f1(sx * -9 * s)},${f1(7 * s)}l${f1(sx * 9 * s)},${f1(7 * s)}z" fill="${ink}"/>`;
    out += `<text x="${f1(cx)}" y="${f1(y0 + size * 0.35)}" text-anchor="middle" font-size="${f1(size)}" letter-spacing="${f1(spacing)}" fill="${o.theme.ink}" font-weight="500">${esc(text)}</text></g>`;
  }
  return out;
}

// Seamless noise tiles, made once with a canvas and reused as image patterns. A filter or blend mode over a whole poster makes the
// PDF rasterise the entire page at print resolution (hundreds of MB); a small repeating tile costs a few hundred kB.
const tiles: Record<string, string> = {};
function tile(kind: 'mottle' | 'grain'): string {
  if (typeof document === 'undefined') return ''; // no canvas outside a browser
  if (tiles[kind]) return tiles[kind];
  const size = kind === 'mottle' ? 512 : 256, cells = kind === 'mottle' ? 4 : 96, oct = kind === 'mottle' ? 5 : 1, R = rng(kind === 'mottle' ? 17 : 29);
  const field = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const n = cells * 2 ** o, lat = Array.from({ length: n * n }, () => R());
    const at = (x: number, y: number) => lat[(((y % n) + n) % n) * n + (((x % n) + n) % n)]; // wraps, so the tile repeats without seams
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * n, fy = (y / size) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      field[y * size + x] += (a + (b - a) * sy) * amp;
    }
    total += amp;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = field[i] / total;
    const alpha = kind === 'mottle' ? Math.max(0, Math.min(1, (v - 0.42) * 2.4)) * 0.9 : Math.min(1, v * v * 1.5) * 0.7;
    const [r, g, b] = kind === 'mottle' ? [150, 104, 48] : [70, 44, 18];
    img.data.set([r, g, b, Math.round(alpha * 255)], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return (tiles[kind] = cv.toDataURL('image/png'));
}

/** Old-paper effects. Returns defs (filters/gradients), a layer that goes over the whole picture, and an <image> filter for photos. */
export function aged(box: Box, o: Options): { defs: string; over: string; photo: string } {
  const a = Math.max(0, Math.min(1, o.age.amount / 100));
  if (!a) return { defs: '', over: '', photo: '' };
  const g = o.age, R = rng(4242), s = decorScale(box);
  let defs = '', over = '';
  const full = (fill: string, extra = '') => `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${fill}" ${extra}/>`;
  if (g.paper && tile('mottle')) { // mottled, uneven paper: a big seamless blotch tile, repeated about twice across
    const T = Math.round(Math.max(1800, Math.min(4800, box.w * 0.55)));
    defs += `<pattern id="agePaper" patternUnits="userSpaceOnUse" x="${box.x}" y="${box.y}" width="${T}" height="${T}"><image href="${tile('mottle')}" width="${T}" height="${T}" preserveAspectRatio="none"/></pattern>`;
    over += full('url(#agePaper)', `opacity="${f1(a * 0.62)}"`);
  }
  if (g.sepia) over += full('#a8782f', `opacity="${f1(a * 0.13)}"`);
  if (g.vignette) { // darkened, slightly burnt edges
    defs += `<radialGradient id="ageVig" cx=".5" cy=".5" r=".72"><stop offset=".5" stop-color="#4a2b0c" stop-opacity="0"/><stop offset=".86" stop-color="#4a2b0c" stop-opacity="${f1(a * 0.16)}"/><stop offset="1" stop-color="#2e1804" stop-opacity="${f1(a * 0.46)}"/></radialGradient>`;
    over += full('url(#ageVig)', 'style="mix-blend-mode:multiply"');
  }
  if (g.stains) { // ring stains and foxing spots
    defs += `<radialGradient id="ageRing"><stop offset=".72" stop-color="#6b3f12" stop-opacity="0"/><stop offset=".9" stop-color="#6b3f12" stop-opacity="${f1(a * 0.12)}"/><stop offset=".96" stop-color="#4f2c08" stop-opacity="${f1(a * 0.2)}"/><stop offset="1" stop-color="#4f2c08" stop-opacity="0"/></radialGradient>`;
    defs += `<radialGradient id="ageSpot"><stop offset="0" stop-color="#7a4a14" stop-opacity="${f1(a * 0.28)}"/><stop offset="1" stop-color="#7a4a14" stop-opacity="0"/></radialGradient>`;
    defs += `<radialGradient id="ageWash"><stop offset="0" stop-color="#8a5a1a" stop-opacity="${f1(a * 0.07)}"/><stop offset="1" stop-color="#8a5a1a" stop-opacity="0"/></radialGradient>`;
    for (let i = 0; i < 2; i++) { const r = box.w * (0.035 + R() * 0.04); over += `<circle cx="${f1(box.x + box.w * (0.1 + R() * 0.8))}" cy="${f1(box.y + box.h * (0.1 + R() * 0.8))}" r="${f1(r)}" fill="url(#ageRing)"/>`; }
    for (let i = 0; i < 5; i++) { const r = box.w * (0.08 + R() * 0.1); over += `<circle cx="${f1(box.x + box.w * R())}" cy="${f1(box.y + box.h * R())}" r="${f1(r)}" fill="url(#ageWash)"/>`; }
    for (let i = 0; i < Math.round(30 + box.w / 90); i++) { const r = (4 + R() * 16) * s; over += `<circle cx="${f1(box.x + box.w * R())}" cy="${f1(box.y + box.h * R())}" r="${f1(r)}" fill="url(#ageSpot)"/>`; }
  }
  if (g.creases) { // folded in thirds across and in half down
    defs += `<linearGradient id="ageFoldV" x1="0" x2="1"><stop offset="0" stop-color="#3a2208" stop-opacity="0"/><stop offset=".47" stop-color="#3a2208" stop-opacity="${f1(a * 0.1)}"/><stop offset=".5" stop-color="#2a1604" stop-opacity="${f1(a * 0.34)}"/><stop offset=".53" stop-color="#fff" stop-opacity="${f1(a * 0.18)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    defs += `<linearGradient id="ageFoldH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2208" stop-opacity="0"/><stop offset=".47" stop-color="#3a2208" stop-opacity="${f1(a * 0.1)}"/><stop offset=".5" stop-color="#2a1604" stop-opacity="${f1(a * 0.34)}"/><stop offset=".53" stop-color="#fff" stop-opacity="${f1(a * 0.18)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    const bw = 90 * s;
    for (const f of [1 / 3, 2 / 3]) over += `<rect x="${f1(box.x + box.w * f - bw / 2)}" y="${box.y}" width="${f1(bw)}" height="${box.h}" fill="url(#ageFoldV)"/>`;
    over += `<rect x="${box.x}" y="${f1(box.y + box.h / 2 - bw / 2)}" width="${box.w}" height="${f1(bw)}" fill="url(#ageFoldH)"/>`;
  }
  if (g.grain && tile('grain')) { // fine paper fibre: a small tile repeated across the sheet
    defs += `<pattern id="ageGrain" patternUnits="userSpaceOnUse" x="${box.x}" y="${box.y}" width="640" height="640"><image href="${tile('grain')}" width="640" height="640" preserveAspectRatio="none"/></pattern>`;
    over += full('url(#ageGrain)', `opacity="${f1(a * 0.42)}"`);
  }
  let photo = '';
  if (g.photos) { // photos fade toward sepia
    const t = a, k = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131], id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const m = k.map((v, i) => f1((id[i] * (1 - t) + v * t) * 1000) / 1000);
    defs += `<filter id="agePhoto" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${m[0]} ${m[1]} ${m[2]} 0 0  ${m[3]} ${m[4]} ${m[5]} 0 0  ${m[6]} ${m[7]} ${m[8]} 0 0  0 0 0 1 0"/></filter>`;
    photo = ' filter="url(#agePhoto)"';
  }
  return { defs, over: `<g pointer-events="none">${over}</g>`, photo };
}
