// Photo helpers: match uploaded files to people, crop to a square, unzip.
import { unzipSync } from 'fflate';
import type { Tree } from './types.ts';

export const IMAGE = /\.(jpe?g|png|webp|gif|bmp)$/i;
const base = (name: string) => name.split(/[\\/]/).pop()!;
const stem = (name: string) => base(name).replace(/\.[^.]+$/, '');
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Match file names to people. Order: names the GEDCOM points at, then the person's id (I123, 123), then "given-surname[-birthyear]".
 *  A key that fits more than one person is ignored rather than guessed. */
export function matchPhotos(tree: Tree, names: string[]) {
  const keys = new Map<string, Set<string>>();
  const put = (k: string, id: string) => { if (k) (keys.get(k) ?? keys.set(k, new Set()).get(k)!).add(id); };
  for (const p of Object.values(tree.people)) {
    for (const f of p.files ?? []) put('f:' + slug(stem(f)), p.id);
    put('i:' + slug(p.id), p.id);
    const num = p.id.replace(/\D/g, ''); if (num) put('n:' + num, p.id);
    const nm = slug(`${p.given} ${p.surname}`);
    put('s:' + nm, p.id); if (p.sort) put(`s:${nm}-${p.sort}`, p.id);
  }
  const one = (k: string) => { const s = keys.get(k); return s && s.size === 1 ? [...s][0] : null; };
  const matched: Record<string, string> = {}, taken = new Set<string>(), unmatched: string[] = [];
  for (const name of names) {
    const st = slug(stem(name)), id = one('f:' + slug(stem(name))) ?? one('i:' + st) ?? (/^\d+$/.test(st) ? one('n:' + st) : null) ?? one('s:' + st);
    if (id && !taken.has(id)) { matched[name] = id; taken.add(id); } else unmatched.push(name);
  }
  return { matched, unmatched };
}

export interface Crop { x: number; y: number; s: number; }
/** First guess for a portrait: the largest square, centred, nudged toward the top where faces usually are. */
export const defaultCrop = (w: number, h: number): Crop => { const s = Math.min(w, h); return { x: (w - s) / 2, y: h > w ? (h - s) * 0.15 : 0, s }; };
export async function loadBitmap(data: Blob | Uint8Array, type = 'image/jpeg'): Promise<ImageBitmap> {
  return createImageBitmap(data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type }));
}
export function cropToDataUrl(bmp: ImageBitmap, c: Crop, out = 480): string {
  const cv = document.createElement('canvas'); cv.width = cv.height = out;
  cv.getContext('2d')!.drawImage(bmp, c.x, c.y, c.s, c.s, 0, 0, out, out);
  return cv.toDataURL('image/jpeg', 0.85);
}
const mime = (n: string) => (/\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : /\.bmp$/i.test(n) ? 'image/bmp' : 'image/jpeg');

export interface PhotoFile { name: string; data: Uint8Array; }
/** Pull the images out of whatever was dropped or chosen: a zip, loose images, or a mix. Skips junk like __MACOSX. */
export async function readFiles(files: File[]): Promise<PhotoFile[]> {
  const out: PhotoFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const z = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => IMAGE.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && !base(e.name).startsWith('.') });
      for (const [n, d] of Object.entries(z)) out.push({ name: base(n), data: d });
    } else if (IMAGE.test(f.name)) out.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}
export const bitmapOf = (f: PhotoFile) => loadBitmap(f.data, mime(f.name));
