/** Serializable Mulberry32 stream; zero is a valid seed. Never mutates its input. */
export function random(seed: number): { value: number; seed: number } {
 const next = (seed + 0x6D2B79F5) >>> 0;
 let t = next; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
 return { value: ((t ^ t >>> 14) >>> 0) / 4294967296, seed: next };
}
export function weighted<T>(seed: number, entries: readonly [T, number][]): { value: T; seed: number } {
 const valid = entries.filter(([, w]) => w > 0 && Number.isFinite(w));
 if (!valid.length) throw new Error('Weighted choice needs a positive weight');
 const roll = random(seed); let remaining = roll.value * valid.reduce((s, [, w]) => s + w, 0);
 for (const [value, weight] of valid) { remaining -= weight; if (remaining < 0) return { value, seed: roll.seed }; }
 return { value: valid[valid.length - 1][0], seed: roll.seed };
}
