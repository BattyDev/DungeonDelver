import { F } from '../paperdoll/model';
type RGBA = [number, number, number, number];
export function stroke(
  buf: Uint8ClampedArray,
  from: [number, number],
  to: [number, number],
  color: RGBA,
  size = 1,
  mirror = false,
) {
  const [sx, sy] = from,
    [ex, ey] = to,
    steps = Math.max(Math.abs(ex - sx), Math.abs(ey - sy), 1);
  const put = (x: number, y: number) => {
    for (let yy = y - Math.floor(size / 2); yy < y - Math.floor(size / 2) + size; yy++)
      for (let xx = x - Math.floor(size / 2); xx < x - Math.floor(size / 2) + size; xx++)
        if (xx >= 0 && yy >= 0 && xx < F && yy < F) {
          buf.set(color, (yy * F + xx) * 4);
          if (mirror) buf.set(color, (yy * F + F - 1 - xx) * 4);
        }
  };
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(sx + ((ex - sx) * i) / steps),
      y = Math.round(sy + ((ey - sy) * i) / steps);
    put(x, y);
  }
}
export function fill(buf: Uint8ClampedArray, x: number, y: number, color: RGBA) {
  if (x < 0 || y < 0 || x >= F || y >= F) return;
  const start = y * F + x,
    before = buf.slice(start * 4, start * 4 + 4);
  if (before.every((v, i) => v === color[i])) return;
  const queue = [start],
    seen = new Uint8Array(F * F);
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    if (!before.every((v, c) => buf[i * 4 + c] === v)) continue;
    buf.set(color, i * 4);
    for (const j of [i - F, i + F, ...(i % F ? [i - 1] : []), ...(i % F < F - 1 ? [i + 1] : [])])
      if (j >= 0 && j < F * F && !seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
  }
}
