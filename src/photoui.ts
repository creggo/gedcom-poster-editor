// Small modal dialogs: crop a photo to a square, and show the box generally.
import type { Crop } from './photos.ts';

const host = () => document.getElementById('modal') as HTMLElement;
export function openModal(html: string): HTMLElement {
  const m = host(); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return m.firstElementChild as HTMLElement;
}
export const closeModal = () => { host().hidden = true; host().innerHTML = ''; };

/** Drag to move, slider to zoom. Resolves with the square to keep, 'remove', or null if cancelled. */
export function cropDialog(bmp: ImageBitmap, title: string, canRemove: boolean): Promise<Crop | 'remove' | null> {
  return new Promise((resolve) => {
    const box = openModal(`<h2>${title}</h2><canvas id="cc" width="320" height="320"></canvas>
      <div class="row"><span>Zoom</span><input id="cz" type="range" min="100" max="500" value="100" style="flex:1"></div>
      <div class="btns">${canRemove ? '<button id="crm" class="alt">Remove photo</button>' : ''}<button id="cno" class="alt">Cancel</button><button id="cok">Use this crop</button></div>`);
    const cv = box.querySelector('#cc') as HTMLCanvasElement, ctx = cv.getContext('2d')!, zoom = box.querySelector('#cz') as HTMLInputElement;
    const min = Math.min(bmp.width, bmp.height);
    let cx = bmp.width / 2, cy = bmp.height > bmp.width ? min / 2 + (bmp.height - min) * 0.15 : bmp.height / 2;
    const size = () => min / (+zoom.value / 100);
    const clamp = () => { const s = size(); cx = Math.min(Math.max(cx, s / 2), bmp.width - s / 2); cy = Math.min(Math.max(cy, s / 2), bmp.height - s / 2); };
    const rect = (): Crop => { clamp(); const s = size(); return { x: cx - s / 2, y: cy - s / 2, s }; };
    const draw = () => { const r = rect(); ctx.clearRect(0, 0, 320, 320); ctx.drawImage(bmp, r.x, r.y, r.s, r.s, 0, 0, 320, 320); };
    let drag: { x: number; y: number } | null = null;
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!drag) return; const k = size() / 320; cx -= (e.clientX - drag.x) * k; cy -= (e.clientY - drag.y) * k; drag = { x: e.clientX, y: e.clientY }; draw(); };
    cv.onpointerup = () => { drag = null; };
    zoom.oninput = draw; draw();
    const done = (v: Crop | 'remove' | null) => { closeModal(); resolve(v); };
    (box.querySelector('#cok') as HTMLElement).onclick = () => done(rect());
    (box.querySelector('#cno') as HTMLElement).onclick = () => done(null);
    const rm = box.querySelector('#crm') as HTMLElement | null; if (rm) rm.onclick = () => done('remove');
  });
}
