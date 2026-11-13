// Standard print sizes in mm (portrait: short side first). Poster sizes cover the common A, US and European formats.
export const PAPER: Record<string, [number, number]> = {
  'A4': [210, 297], 'A3': [297, 420], 'A2': [420, 594], 'A1': [594, 841], 'A0': [841, 1189],
  '11×17 in': [279.4, 431.8], '18×24 in': [457.2, 609.6], '24×36 in': [609.6, 914.4],
  '50×70 cm': [500, 700], '60×90 cm': [600, 900], '70×100 cm': [700, 1000],
};
// Fit a W×H drawing onto a sheet (orientation follows the drawing), leaving a margin (0 for professional printing, which trims at the sheet edge).
// Returns scale in mm per drawing px.
export function fitToPaper(W: number, H: number, name: string, marginMm = 0) {
  const [a, b] = PAPER[name], landscape = W > H;
  const sw = landscape ? b : a, sh = landscape ? a : b;
  const scale = Math.min((sw - 2 * marginMm) / W, (sh - 2 * marginMm) / H);
  return { sw, sh, scale, ox: (sw - W * scale) / 2, oy: (sh - H * scale) / 2 };
}
export const MM_TO_PT = 72 / 25.4;

/** The sheet's shape, oriented to suit a drawing of W×H. */
export function sheetFor(W: number, H: number, name: string): { w: number; h: number } {
  const [a, b] = PAPER[name];
  return W > H ? { w: b, h: a } : { w: a, h: b };
}
