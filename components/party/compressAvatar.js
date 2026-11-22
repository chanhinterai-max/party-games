// v14: shrink a profile picture ON THE PHONE before upload: centre-crop to a square, 128 px (96 px if needed),
// WebP (JPEG where WebP encoding is missing, e.g. older Safari), quality 0.7 → 0.4 until <= 15 KB.
const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
async function loadImage(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file); } catch { /* fall back */ } }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export async function compressAvatar(file, { target = 15 * 1024 } = {}) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Pick a picture file');
  const img = await loadImage(file);
  const w = img.width, h = img.height, s = Math.min(w, h);
  if (!s) throw new Error('Could not read that picture');
  let best = null;
  for (const size of [128, 96]) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const q of [0.7, 0.6, 0.5, 0.4]) {
        const b = await toBlob(c, type, q);
        if (!b || b.type !== type) break; // this encoder isn't supported here → next type
        if (!best || b.size < best.size) best = b;
        if (b.size <= target) return b;
      }
    }
  }
  if (best && best.size <= 30 * 1024) return best;
  throw new Error('Could not make that picture small enough');
}
