// Paper Doll Studio: draw bodies, hair and class gear over a pose guide, try them on in the
// changing room, and send them straight into the game.
import './studio.css';
import {
  ANIMS,
  DIRS,
  F,
  GAME_CLASS_LOOK,
  LOOK_CLASSES,
  MIRROR_SRC,
  PALETTE,
  PRESETS,
  PX,
  RACES,
  SEXES,
  SLOT_CAT,
  STYLES,
  bodyKey,
  hexRgb,
  rgbHex,
} from '../paperdoll/model';
import type { AnimId, BodyKey, LookClass, Slot } from '../paperdoll/model';
import { blockGear, skeleton } from '../paperdoll/pose';
import { defaultLook, dollFor, pumpDolls } from '../paperdoll/looks';
import type { FrameSource } from '../paperdoll/looks';
import { readWardrobe, removeWardrobe, writeWardrobe, RETURN_KEY } from '../paperdoll/wardrobe';
import type { WardrobeEntry } from '../paperdoll/wardrobe';
import { ChangingRoom } from './room';
import { zip } from './zip';
import { CLASSES } from '@delver/rules';
import type { ClassId, Race, Sex } from '@delver/rules';

interface Layer {
  id: string;
  slot: Slot;
  name: string;
  visible: boolean;
  cls: LookClass | null;
  behind: boolean[];
  seeded: string[];
  style?: string;
  color?: string;
}
type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
type Mode = 'body' | 'gear';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);

// ---------- State ----------
let uid = 1;
const newId = () => 'L' + uid++ + Math.random().toString(36).slice(2, 6);
const state = {
  race: 'orc' as Race,
  sex: 'F' as Sex,
  anim: 'idle' as AnimId,
  dir: 0,
  frame: 0,
  tool: 'pencil' as Tool,
  color: '#8fb354',
  size: 1,
  mirror: false,
  guide: true,
  onion: true,
  grid: true,
  others: true,
  combatDir: 6,
  autoMirror: true,
  layers: [] as Layer[],
  active: null as string | null,
  cls: 'tank' as LookClass,
  mode: 'gear' as Mode,
  overlay: true,
  overlayAlpha: 0.15,
  zoom: 1,
  recent: [] as string[],
  lastActive: {} as Partial<Record<Mode, string>>,
};
const isBodyLayer = (l: Layer) => SLOT_CAT[l.slot] === 'body' || SLOT_CAT[l.slot] === 'hair';
const inMode = (l: Layer) => (state.mode === 'body' ? isBodyLayer(l) : !isBodyLayer(l));
const inClass = (l: Layer) => !l.cls || l.cls === state.cls;
const classLayers = () => state.layers.filter(inClass);
const classAnims = () => LOOK_CLASSES[state.cls].anims;
const frames = new Map<string, Uint8ClampedArray>(); // body|layer|anim|dir|frame
const body = (): BodyKey => bodyKey(state.race, state.sex);
const keyOf = (lid: string, anim: AnimId, dir: number, frame: number, bk: string = body()) =>
  `${bk}|${lid}|${anim}|${dir}|${frame}`;
const curKey = () => keyOf(state.active!, state.anim, state.dir, state.frame);
function getBuf(k: string, create: true): Uint8ClampedArray;
function getBuf(k: string, create: false): Uint8ClampedArray | undefined;
function getBuf(k: string, create: boolean) {
  let b = frames.get(k);
  if (!b && create) {
    b = new Uint8ClampedArray(PX);
    frames.set(k, b);
  }
  return b;
}
function isEmpty(b?: Uint8ClampedArray | null) {
  if (!b) return true;
  for (let i = 3; i < b.length; i += 4) if (b[i]) return false;
  return true;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const dirsFor = (anim: AnimId) => (ANIMS[anim].combat ? [state.combatDir] : DIRS.map((_, i) => i));
const isMirrored = (anim: AnimId, dir: number) =>
  state.autoMirror && !ANIMS[anim].combat && MIRROR_SRC[dir] != null;
const activeLayer = () => state.layers.find((l) => l.id === state.active);
function layerFile(layer: Layer, anim: AnimId) {
  const nm = slug(layer.name);
  const part =
    layer.slot === 'base' ? 'base' : nm && nm !== layer.slot ? `${layer.slot}-${nm}` : layer.slot;
  return `${body()}_${part}_${anim}.png`;
}

// ---------- Undo ----------
interface Snap {
  k: string;
  before: Uint8ClampedArray | null;
  after: Uint8ClampedArray | null;
}
const undoStack: { multi: Snap[] }[] = [],
  redoStack: { multi: Snap[] }[] = [];
let strokeBefore: { k: string; data: Uint8ClampedArray | null } | null = null;
function beginEdit(k: string) {
  const b = getBuf(k, false);
  strokeBefore = { k, data: b ? b.slice() : null };
}
function rememberColor() {
  if (state.tool === 'eraser' || state.recent[0] === state.color) return;
  state.recent = [state.color, ...state.recent.filter((c) => c !== state.color)].slice(0, 8);
  buildSwatches();
}
function endEdit() {
  if (!strokeBefore) return;
  rememberColor();
  const b = getBuf(strokeBefore.k, false);
  undoStack.push({
    multi: [{ k: strokeBefore.k, before: strokeBefore.data, after: b ? b.slice() : null }],
  });
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0;
  strokeBefore = null;
  changed();
}
const applySnap = (k: string, data: Uint8ClampedArray | null) =>
  data ? frames.set(k, data.slice()) : frames.delete(k);
function jumpTo(k: string) {
  const [bk, lid, anim, dir, frame] = k.split('|');
  state.race = bk.slice(0, -1) as Race;
  state.sex = bk.slice(-1) as Sex;
  state.active = lid;
  state.anim = anim as AnimId;
  state.dir = +dir;
  state.frame = +frame;
  const l = state.layers.find((x) => x.id === lid);
  if (l) state.mode = isBodyLayer(l) ? 'body' : 'gear';
}
function undo() {
  const e = undoStack.pop();
  if (!e) return;
  e.multi.forEach((m) => applySnap(m.k, m.before));
  if (e.multi.length === 1) jumpTo(e.multi[0].k);
  redoStack.push(e);
  changed();
}
function redo() {
  const e = redoStack.pop();
  if (!e) return;
  e.multi.forEach((m) => applySnap(m.k, m.after));
  if (e.multi.length === 1) jumpTo(e.multi[0].k);
  undoStack.push(e);
  changed();
}

// ---------- Rendering ----------
const board = $<HTMLCanvasElement>('board'),
  bctx = board.getContext('2d')!;
const work = document.createElement('canvas');
work.width = work.height = F;
const wctx = work.getContext('2d')!;
let scale = 8,
  hover: { x: number; y: number } | null = null;
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function orderFor(dir: number) {
  const behind = (l: Layer) => !!(l.behind && l.behind[dir]);
  const ls = classLayers();
  return [...ls.filter(behind), ...ls.filter((l) => !behind(l))];
}
interface CompositeOpts {
  all?: boolean;
  only?: string | null;
  skipOthers?: boolean;
  filter?: ((l: Layer) => boolean) | null;
}
/** Composite of visible layers for one frame. Mirrored directions are built by flipping their source. */
function composite(anim: AnimId, dir: number, frame: number, opts: CompositeOpts = {}) {
  const src = isMirrored(anim, dir) ? MIRROR_SRC[dir] : dir,
    flip = src !== dir;
  const img = wctx.createImageData(F, F),
    d = img.data;
  for (const layer of orderFor(src)) {
    if (!layer.visible && !opts.all) continue;
    if (opts.only && layer.id !== opts.only) continue;
    if (opts.skipOthers && layer.id !== state.active) continue;
    if (opts.filter && !opts.filter(layer)) continue;
    const b = frames.get(keyOf(layer.id, anim, src, frame));
    if (!b) continue;
    for (let y = 0; y < F; y++)
      for (let x = 0; x < F; x++) {
        const si = (y * F + (flip ? F - 1 - x : x)) * 4;
        if (!b[si + 3]) continue;
        const di = (y * F + x) * 4;
        d[di] = b[si];
        d[di + 1] = b[si + 1];
        d[di + 2] = b[si + 2];
        d[di + 3] = 255;
      }
  }
  return img;
}
/** One-color copy of a frame, for onion skins. */
function tint(img: ImageData, color: string) {
  const [r, g, b] = hexRgb(color),
    d = img.data;
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3]) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  return img;
}
// X-ray ghost: a one-color silhouette with strong edges and a faint fill.
function ghostImage(img: ImageData, color: string, strength: number) {
  const [r, g, b] = color.startsWith('#') && color.length === 7 ? hexRgb(color) : [44, 134, 209];
  const src = img.data,
    out = wctx.createImageData(F, F),
    d = out.data;
  // Outline only by default: strong edges, no fill, so the art underneath stays readable.
  const edgeA = Math.min(255, Math.round(255 * Math.min(1, strength * 2.2))),
    fillA = strength > 0.4 ? Math.round(255 * (strength - 0.4) * 0.5) : 0;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < F && y < F && src[(y * F + x) * 4 + 3];
  // An edge is the silhouette, a dark outline pixel, or a strong color change.
  const differs = (i: number, x: number, y: number) => {
    if (!solid(x, y)) return true;
    const j = (y * F + x) * 4;
    return (
      Math.abs(src[i] - src[j]) +
        Math.abs(src[i + 1] - src[j + 1]) +
        Math.abs(src[i + 2] - src[j + 2]) >
      90
    );
  };
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const i = (y * F + x) * 4;
      if (!src[i + 3]) continue;
      const lum = 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
      const silhouette =
        !solid(x + 1, y) || !solid(x - 1, y) || !solid(x, y + 1) || !solid(x, y - 1);
      // Outline only: the silhouette and dark outline pixels. Strong settings add inner color edges too.
      const edge =
        silhouette ||
        lum < 50 ||
        (strength > 0.4 &&
          (differs(i, x + 1, y) ||
            differs(i, x - 1, y) ||
            differs(i, x, y + 1) ||
            differs(i, x, y - 1)));
      if (!edge && !fillA) continue;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = edge ? edgeA : fillA;
    }
  return out;
}
// Each board pass gets its own scratch canvas: Safari can defer canvas-to-canvas draws.
const scratch: Record<string, HTMLCanvasElement> = {};
function drawImageData(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  w: number,
  alpha = 1,
  slot = 'main',
) {
  let c = scratch[slot];
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = F;
    scratch[slot] = c;
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, w, w);
  ctx.restore();
}
function checker(ctx: CanvasRenderingContext2D, w: number, cell: number) {
  ctx.fillStyle = css('--check-b');
  ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = css('--check-a');
  for (let y = 0; y < w; y += cell)
    for (let x = ((y / cell) % 2) * cell; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
}
function sizeBoard() {
  const wrap = board.parentElement!;
  const avail = Math.max(256, Math.min(wrap.clientWidth - 24, window.innerHeight - 290, 640));
  scale = Math.max(2, Math.floor((avail / F) * state.zoom));
  $('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  const px = scale * F,
    dpr = window.devicePixelRatio || 1;
  board.style.width = board.style.height = px + 'px';
  board.width = board.height = Math.round(px * dpr);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function render() {
  const S = scale,
    W = F * S;
  checker(bctx, W, S * 4);
  if (state.onion) {
    const n = ANIMS[state.anim].frames,
      loop = ANIMS[state.anim].loop;
    const onion = (f: number, color: string, slot: string) =>
      drawImageData(
        bctx,
        tint(composite(state.anim, state.dir, f, { only: state.active, all: true }), color),
        W,
        0.32,
        slot,
      );
    if (state.frame > 0 || loop) onion((state.frame - 1 + n) % n, '#ff8a80', 'onionPrev');
    if (state.frame < n - 1 || loop) onion((state.frame + 1) % n, '#8fd6a8', 'onionNext');
  }
  const bodyMode = state.mode === 'body';
  drawImageData(
    bctx,
    composite(state.anim, state.dir, state.frame, {
      skipOthers: !state.others && !bodyMode,
      filter: bodyMode ? (l) => isBodyLayer(l) && (state.others || l.id === state.active) : null,
    }),
    W,
  );
  // Ghost: the other group, translucent and on top, so limbs show through armor.
  if (state.overlay)
    drawImageData(
      bctx,
      ghostImage(
        composite(state.anim, state.dir, state.frame, {
          filter: bodyMode ? (l) => !isBodyLayer(l) : isBodyLayer,
        }),
        css(bodyMode ? '--accent' : '--guide'),
        state.overlayAlpha,
      ),
      W,
      1,
      'ghost',
    );
  if (state.grid && S >= 6) {
    bctx.strokeStyle = css('--ink');
    bctx.globalAlpha = 0.07;
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let i = 1; i < F; i++) {
      bctx.moveTo(i * S + 0.5, 0);
      bctx.lineTo(i * S + 0.5, W);
      bctx.moveTo(0, i * S + 0.5);
      bctx.lineTo(W, i * S + 0.5);
    }
    bctx.stroke();
    bctx.globalAlpha = 1;
  }
  if (state.guide) drawGuide(bctx, S);
  if (hover && state.tool !== 'fill' && !isMirrored(state.anim, state.dir)) {
    bctx.strokeStyle = css('--accent');
    bctx.lineWidth = 2;
    const sz = state.tool === 'picker' ? 1 : state.size,
      o = Math.floor((sz - 1) / 2);
    bctx.strokeRect((hover.x - o) * S + 1, (hover.y - o) * S + 1, sz * S - 2, sz * S - 2);
  }
  const note = $('mirrorNote');
  note.hidden = !isMirrored(state.anim, state.dir);
  if (!note.hidden)
    note.textContent = `Mirrored from ${DIRS[MIRROR_SRC[state.dir]].k}. Turn off auto-mirror in Project to draw this side.`;
  renderFrames();
  updateHint();
}
function drawGuide(ctx: CanvasRenderingContext2D, S: number) {
  const sk = skeleton(state.anim, state.frame, state.dir, body()),
    g = css('--guide');
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = g;
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([S, S]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 63 * S);
  ctx.lineTo(F * S, 63 * S);
  ctx.moveTo(32 * S, 0);
  ctx.lineTo(32 * S, F * S);
  ctx.stroke();
  ctx.setLineDash([]);
  const items = [
    ...sk.segs.map((s) => ({ s, head: false, d: s.d })),
    { s: undefined, head: true, d: sk.head.d },
  ].sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.head) {
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = Math.max(2, S * 0.4);
      ctx.beginPath();
      ctx.arc(sk.head.x * S, sk.head.y * S, sk.head.r * S, 0, Math.PI * 2);
      ctx.stroke();
      // Nose tick shows which way the head faces.
      const n = sk.toScreen({
        x: sk.headLocal.x,
        y: sk.headLocal.y,
        z: sk.headLocal.z + sk.HR * 1.25,
      });
      ctx.beginPath();
      ctx.moveTo(sk.head.x * S, sk.head.y * S);
      ctx.lineTo(n.x * S, n.y * S);
      ctx.stroke();
      continue;
    }
    const s = it.s!,
      far = s.d < -1.2 && s.part !== 'torso';
    ctx.globalAlpha = far ? 0.35 : 0.8;
    ctx.lineWidth = Math.max(2, S * (s.part === 'torso' ? 0.55 : s.part === 'ear' ? 0.25 : 0.4));
    ctx.beginPath();
    ctx.moveTo(s.a.x * S, s.a.y * S);
    ctx.lineTo(s.b.x * S, s.b.y * S);
    ctx.stroke();
    if (s.part !== 'ear' && s.part !== 'hips' && s.part !== 'shoulders') {
      ctx.beginPath();
      ctx.arc(s.b.x * S, s.b.y * S, Math.max(2, S * 0.32), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
function renderFrames() {
  const box = $('frames'),
    A = ANIMS[state.anim];
  if (box.childElementCount !== A.frames || box.dataset.anim !== state.anim) {
    box.innerHTML = '';
    box.dataset.anim = state.anim;
    for (let i = 0; i < A.frames; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'frame-btn';
      btn.title = `Frame ${i + 1}: ${A.notes[i]}`;
      btn.setAttribute('aria-label', btn.title);
      const c = document.createElement('canvas');
      c.width = c.height = F;
      const sp = document.createElement('span');
      sp.textContent = `${i + 1}`;
      btn.append(c, sp);
      btn.addEventListener('click', () => {
        state.frame = i;
        render();
      });
      box.append(btn);
    }
  }
  [...box.children].forEach((btn, i) => {
    btn.classList.toggle('on', i === state.frame);
    const ctx = btn.querySelector('canvas')!.getContext('2d')!;
    ctx.clearRect(0, 0, F, F);
    ctx.putImageData(composite(state.anim, state.dir, i), 0, 0);
  });
}
function updateHint() {
  const A = ANIMS[state.anim],
    layer = activeLayer(),
    hint = $('poseHint');
  hint.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = `${A.label} · ${DIRS[state.dir].k} · frame ${state.frame + 1}/${A.frames}`;
  const s = document.createElement('span');
  s.textContent = `${A.notes[state.frame]}. ${state.mode === 'body' ? 'Editing body' : 'Editing gear'}: ${layer ? layer.name + ' (' + layer.slot + ')' : '–'}`;
  hint.append(b, s);
}

// ---------- Controls ----------
const chip = (label: string, on: boolean, title = '') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip' + (on ? ' on' : '');
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-pressed', String(on));
  return b;
};
const GAME_CLASS_FOR = Object.fromEntries(
  (Object.entries(GAME_CLASS_LOOK) as [ClassId, LookClass][]).map(([g, l]) => [l, g]),
) as Partial<Record<LookClass, ClassId>>;
function buildIdentity() {
  const races = $('raceChips'),
    sexes = $('sexChips'),
    classes = $('classChips');
  races.innerHTML = sexes.innerHTML = classes.innerHTML = '';
  for (const [k, r] of Object.entries(RACES) as [Race, (typeof RACES)[Race]][]) {
    const b = chip(r.label, state.race === k);
    b.addEventListener('click', () => {
      state.race = k;
      switchBody();
    });
    races.append(b);
  }
  for (const [k, x] of Object.entries(SEXES) as [Sex, (typeof SEXES)[Sex]][]) {
    const b = chip(x.label, state.sex === k);
    b.addEventListener('click', () => {
      state.sex = k;
      switchBody();
    });
    sexes.append(b);
  }
  for (const [k, c] of Object.entries(LOOK_CLASSES) as [
    LookClass,
    (typeof LOOK_CLASSES)[LookClass],
  ][]) {
    const game = GAME_CLASS_FOR[k];
    const b = chip(
      game ? `${c.label} · ${CLASSES[game].name}` : c.label,
      state.cls === k,
      game ? `Used by the ${CLASSES[game].name} in the game` : 'Not playable in the game yet',
    );
    if (!game) b.classList.add('soon');
    b.addEventListener('click', () => switchClass(k));
    classes.append(b);
  }
}
function buildAnimSeg() {
  const as = $('animSeg');
  as.innerHTML = '';
  for (const k of classAnims()) {
    const a = ANIMS[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.dataset.anim = k;
    b.title = a.combat ? 'Combat animation: one locked camera direction' : '8 directions';
    if (a.combat) b.classList.add('combat');
    b.addEventListener('click', () => {
      state.anim = k;
      state.frame = Math.min(state.frame, a.frames - 1);
      if (a.combat) state.dir = state.combatDir;
      refresh();
    });
    as.append(b);
  }
  const tries = $('tryAnims');
  tries.innerHTML = '';
  for (const k of classAnims().filter((a) => ANIMS[a].combat)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ANIMS[k].label;
    b.addEventListener('click', () => room?.try(k, state.combatDir));
    tries.append(b);
  }
}
// The compass: directions laid out where they point, with the combat camera in the middle.
const COMPASS = [3, 4, 5, 2, -1, 6, 1, 0, 7];
function buildSegs() {
  buildAnimSeg();
  const ds = $('dirSeg');
  ds.innerHTML = '';
  for (const i of COMPASS) {
    if (i < 0) {
      const mid = document.createElement('span');
      mid.className = 'compass-mid';
      mid.id = 'compassMid';
      ds.append(mid);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = DIRS[i].k;
    b.dataset.dir = String(i);
    b.addEventListener('click', () => {
      state.dir = i;
      refresh();
    });
    ds.append(b);
  }
  const cs = select('combatSel');
  DIRS.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${d.k}, ${d.name}`;
    cs.append(o);
  });
}
function syncSegs() {
  document
    .querySelectorAll<HTMLElement>('#animSeg button')
    .forEach((b) => b.classList.toggle('on', b.dataset.anim === state.anim));
  const combat = ANIMS[state.anim].combat;
  document.querySelectorAll<HTMLButtonElement>('#dirSeg button').forEach((b) => {
    const i = +b.dataset.dir!;
    b.classList.toggle('on', i === state.dir);
    b.disabled = combat && i !== state.combatDir;
    b.title = combat
      ? i === state.combatDir
        ? 'Combat camera'
        : 'Combat uses one locked direction (set in Project)'
      : DIRS[i].name + (isMirrored(state.anim, i) ? ', mirrored' : '');
    b.classList.toggle('mirrored', isMirrored(state.anim, i));
  });
  $('compassMid').textContent = combat ? 'combat' : DIRS[state.dir].k;
  document
    .querySelectorAll<HTMLElement>('[data-tool]')
    .forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool));
  $('mirrorBtn').classList.toggle('on', state.mirror);
  $('sizeNum').textContent = String(state.size);
  $('curSwatch').style.background = state.color;
  $('curHex').textContent = state.color;
  document
    .querySelectorAll<HTMLElement>('#palette button')
    .forEach((b) => b.classList.toggle('on', b.dataset.c === state.color));
  buildSwatches();
  for (const [id, key] of [
    ['guideChk', 'guide'],
    ['onionChk', 'onion'],
    ['gridChk', 'grid'],
    ['othersChk', 'others'],
    ['autoMirrorChk', 'autoMirror'],
  ] as const)
    input(id).checked = state[key];
  select('combatSel').value = String(state.combatDir);
  document.querySelectorAll<HTMLElement>('#modeSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === state.mode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  });
  $('overlayLabel').textContent = state.mode === 'body' ? 'Ghost gear on top' : 'Ghost body on top';
  input('overlayChk').checked = state.overlay;
  input('overlayRange').value = String(Math.round(state.overlayAlpha * 100));
  input('overlayRange').disabled = !state.overlay;
  $('presetHint').textContent =
    `${PRESETS[state.cls].name}: ${PRESETS[state.cls].gear.map((g) => g[1]).join(', ')}`;
  $<HTMLButtonElement>('undoBtn').disabled = !undoStack.length;
  $<HTMLButtonElement>('redoBtn').disabled = !redoStack.length;
  const layer = activeLayer(),
    opts = layer ? STYLES[layer.slot] || [] : [],
    sel = select('styleSel');
  $('styleField').hidden = opts.length < 2;
  $('styleLabel').textContent = layer
    ? `${layer.slot[0].toUpperCase() + layer.slot.slice(1)} shape`
    : 'Style';
  if (sel.dataset.slot !== (layer ? layer.slot : '')) {
    sel.innerHTML = '';
    sel.dataset.slot = layer ? layer.slot : '';
    for (const [v, lab] of opts) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lab;
      sel.append(o);
    }
  }
  if (layer && opts.length) sel.value = layer.style || opts[0][0];
  buildIdentity();
  syncSendState();
}
function renderLayers() {
  const box = $('layers');
  box.innerHTML = '';
  for (const layer of classLayers().filter(inMode).reverse()) {
    const row = document.createElement('div');
    row.className = 'layer' + (layer.id === state.active ? ' on' : '');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'eye' + (layer.visible ? ' on' : '');
    eye.textContent = layer.visible ? '◉' : '○';
    eye.title = layer.visible ? 'Hide layer' : 'Show layer';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      changed();
    });
    const nm = document.createElement('div');
    nm.className = 'nm';
    const cat = document.createElement('span');
    cat.className = 'cat ' + SLOT_CAT[layer.slot];
    cat.textContent = layer.slot;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = layer.name;
    if (layer.color) {
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = layer.color;
      nm.append(dot);
    }
    nm.append(label, cat);
    let n = 0;
    const pre = `${body()}|${layer.id}|`;
    for (const [k, b] of frames) if (k.startsWith(pre) && !isEmpty(b)) n++;
    const right = document.createElement('span');
    right.className = 'layer-right';
    const src = isMirrored(state.anim, state.dir) ? MIRROR_SRC[state.dir] : state.dir;
    const on = !!(layer.behind && layer.behind[src]);
    const bh = document.createElement('button');
    bh.type = 'button';
    bh.className = 'behind' + (on ? ' on' : '');
    bh.textContent = 'Behind';
    bh.setAttribute('aria-pressed', String(on));
    bh.title = `Draw behind the other layers when facing ${DIRS[src].k}`;
    bh.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.behind = layer.behind || new Array(8).fill(false);
      layer.behind[src] = !layer.behind[src];
      changed();
    });
    const ct = document.createElement('span');
    ct.className = 'count';
    ct.textContent = `${n}`;
    ct.title = 'Frames drawn on this layer for this race and sex';
    right.append(bh, ct);
    row.append(eye, nm, right);
    const pick = () => {
      state.active = layer.id;
      refresh();
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    box.append(row);
  }
}
/** The race's skin and hair, then recently used colors. */
function buildSwatches() {
  const race = RACES[state.race];
  const fill = (id: string, colors: string[]) => {
    const box = $(id);
    box.innerHTML = '';
    for (const c of colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.c = c;
      b.style.background = c;
      b.title = c;
      b.setAttribute('aria-label', `Color ${c}`);
      b.classList.toggle('on', c === state.color);
      b.addEventListener('click', () => {
        state.color = c;
        if (state.tool === 'eraser' || state.tool === 'picker') state.tool = 'pencil';
        syncSegs();
      });
      box.append(b);
    }
  };
  fill('skinSwatches', [race.skin[0], race.skin[1], race.hair]);
  fill('recentSwatches', state.recent);
  $('recentRow').hidden = !state.recent.length;
}
function buildPalette() {
  const box = $('palette');
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.c = c;
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', `Color ${c}`);
    b.addEventListener('click', () => {
      state.color = c;
      if (state.tool === 'eraser' || state.tool === 'picker') state.tool = 'pencil';
      syncSegs();
    });
    box.append(b);
  }
}
function refresh() {
  syncSegs();
  renderLayers();
  render();
}

// ---------- Drawing ----------
function plot(buf: Uint8ClampedArray, x: number, y: number, erase: boolean) {
  const o = Math.floor((state.size - 1) / 2),
    [r, g, b] = hexRgb(state.color);
  const put = (px: number, py: number) => {
    for (let yy = py - o; yy < py - o + state.size; yy++)
      for (let xx = px - o; xx < px - o + state.size; xx++) {
        if (xx < 0 || yy < 0 || xx >= F || yy >= F) continue;
        const i = (yy * F + xx) * 4;
        if (erase) buf[i + 3] = 0;
        else {
          buf[i] = r;
          buf[i + 1] = g;
          buf[i + 2] = b;
          buf[i + 3] = 255;
        }
      }
  };
  put(x, y);
  if (state.mirror) put(F - 1 - x, y);
}
function line(
  buf: Uint8ClampedArray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  erase: boolean,
) {
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0),
    sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(buf, x0, y0, erase);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
function flood(buf: Uint8ClampedArray, x: number, y: number) {
  const i0 = (y * F + x) * 4,
    tgt = [buf[i0], buf[i0 + 1], buf[i0 + 2], buf[i0 + 3]],
    [r, g, b] = hexRgb(state.color);
  if (tgt[3] === 255 && tgt[0] === r && tgt[1] === g && tgt[2] === b) return;
  const same = (i: number) =>
    tgt[3] === 0
      ? buf[i + 3] === 0
      : buf[i] === tgt[0] &&
        buf[i + 1] === tgt[1] &&
        buf[i + 2] === tgt[2] &&
        buf[i + 3] === tgt[3];
  const stack: [number, number][] = [[x, y]],
    seen = new Uint8Array(F * F);
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= F || cy >= F) continue;
    const p = cy * F + cx;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!same(i)) continue;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function pickAt(x: number, y: number) {
  const img = composite(state.anim, state.dir, state.frame),
    i = (y * F + x) * 4;
  if (!img.data[i + 3]) {
    toast('Nothing to pick there.');
    return;
  }
  state.color = rgbHex(img.data[i], img.data[i + 1], img.data[i + 2]);
  input('colorInput').value = state.color;
  state.tool = 'pencil';
  syncSegs();
}
function guardEditable() {
  if (isMirrored(state.anim, state.dir)) {
    toast(
      `${DIRS[state.dir].k} is mirrored from ${DIRS[MIRROR_SRC[state.dir]].k}. Draw there, or turn off auto-mirror in Project.`,
    );
    return false;
  }
  return true;
}
let drawing = false,
  last: { x: number; y: number } | null = null;
function cellFrom(e: PointerEvent) {
  const r = board.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - r.left) / (r.width / F)),
    y: Math.floor((e.clientY - r.top) / (r.height / F)),
  };
}
let spaceHeld = false,
  pan: { x: number; y: number; left: number; top: number } | null = null;
const stageEl = () => board.parentElement!;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, select, textarea, #room')) {
    spaceHeld = true;
    board.classList.add('panning');
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceHeld = false;
    board.classList.remove('panning');
  }
});
board.addEventListener('pointerdown', (e) => {
  if (spaceHeld || e.button === 1) {
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, left: stageEl().scrollLeft, top: stageEl().scrollTop };
    board.setPointerCapture(e.pointerId);
    return;
  }
  stopPlaying();
  if (!state.active) return;
  const c = cellFrom(e);
  if (c.x < 0 || c.y < 0 || c.x >= F || c.y >= F) return;
  if (state.tool === 'picker') {
    pickAt(c.x, c.y);
    return;
  }
  if (!guardEditable()) return;
  const layer = activeLayer();
  if (layer && !layer.visible) {
    toast('That layer is hidden. Turn it on to draw.');
    return;
  }
  board.setPointerCapture(e.pointerId);
  const k = curKey();
  beginEdit(k);
  const buf = getBuf(k, true);
  if (state.tool === 'fill') {
    flood(buf, c.x, c.y);
    endEdit();
    return;
  }
  drawing = true;
  last = c;
  plot(buf, c.x, c.y, state.tool === 'eraser');
  render();
});
board.addEventListener('pointermove', (e) => {
  if (pan) {
    stageEl().scrollLeft = pan.left - (e.clientX - pan.x);
    stageEl().scrollTop = pan.top - (e.clientY - pan.y);
    return;
  }
  const c = cellFrom(e),
    inside = c.x >= 0 && c.y >= 0 && c.x < F && c.y < F;
  hover = inside ? c : null;
  $('coords').textContent = inside ? `x ${c.x}, y ${c.y}` : 'x –, y –';
  if (drawing && inside && last) {
    line(getBuf(curKey(), true), last.x, last.y, c.x, c.y, state.tool === 'eraser');
    last = c;
  }
  render();
});
window.addEventListener('pointerup', () => (pan = null));
function setZoom(z: number) {
  const levels = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  state.zoom = levels.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
  sizeBoard();
  render();
}
const zoomStep = (d: number) => {
  const levels = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  const i = levels.indexOf(state.zoom);
  setZoom(levels[Math.max(0, Math.min(levels.length - 1, (i < 0 ? 2 : i) + d))]);
};
$('zoomIn').addEventListener('click', () => zoomStep(1));
$('zoomOut').addEventListener('click', () => zoomStep(-1));
$('zoomFit').addEventListener('click', () => setZoom(1));
board.parentElement!.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);
const stopDraw = () => {
  if (drawing) {
    drawing = false;
    endEdit();
  }
};
board.addEventListener('pointerup', stopDraw);
window.addEventListener('pointerup', stopDraw);
board.addEventListener('pointercancel', stopDraw);
board.addEventListener('pointerleave', () => {
  hover = null;
  $('coords').textContent = 'x –, y –';
  render();
});

// ---------- Frame actions ----------
let clipboard: Uint8ClampedArray | null = null;
function editFrame(fn: (b: Uint8ClampedArray) => void) {
  if (!guardEditable()) return false;
  const k = curKey();
  beginEdit(k);
  fn(getBuf(k, true));
  endEdit();
  return true;
}
const stepFrame = (d: number) => {
  const n = ANIMS[state.anim].frames;
  state.frame = (state.frame + d + n) % n;
  render();
};
let playTimer = 0;
function stopPlaying() {
  if (!playTimer) return;
  clearInterval(playTimer);
  playTimer = 0;
  $('playBtn').textContent = '▶';
  $('playBtn').setAttribute('aria-label', 'Play animation');
}
function togglePlay() {
  if (playTimer) {
    stopPlaying();
    return;
  }
  playTimer = window.setInterval(() => stepFrame(1), 1000 / ANIMS[state.anim].fps);
  $('playBtn').textContent = '❚❚';
  $('playBtn').setAttribute('aria-label', 'Pause animation');
}
$('playBtn').addEventListener('click', togglePlay);
$('prevFrame').addEventListener('click', () => stepFrame(-1));
$('nextFrame').addEventListener('click', () => stepFrame(1));
$('copyPrevBtn').addEventListener('click', () => {
  if (state.frame === 0) {
    toast('This is the first frame.');
    return;
  }
  const prev = getBuf(keyOf(state.active!, state.anim, state.dir, state.frame - 1), false);
  if (!prev || isEmpty(prev)) {
    toast('The previous frame is empty on this layer.');
    return;
  }
  if (editFrame((b) => b.set(prev))) toast('Copied the previous frame onto this one.');
});
$('copyBtn').addEventListener('click', () => {
  const b = getBuf(curKey(), false);
  if (!b || isEmpty(b)) {
    toast('Nothing on this layer to copy.');
    return;
  }
  clipboard = b.slice();
  toast('Frame copied.');
});
$('pasteBtn').addEventListener('click', () => {
  if (!clipboard) {
    toast('Copy a frame first.');
    return;
  }
  const c = clipboard;
  if (editFrame((b) => b.set(c))) toast('Pasted.');
});
$('flipBtn').addEventListener('click', () =>
  editFrame((b) => {
    const c = b.slice();
    for (let y = 0; y < F; y++)
      for (let x = 0; x < F; x++)
        for (let j = 0; j < 4; j++) b[(y * F + x) * 4 + j] = c[(y * F + (F - 1 - x)) * 4 + j];
  }),
);
/** A destructive button that asks once more in place. */
function twoStep(wrapId: string, btnId: string, label: string, onConfirm: () => void) {
  const wrap = $(wrapId);
  $(btnId).addEventListener('click', () => {
    const original = wrap.innerHTML;
    wrap.innerHTML = '';
    const box = document.createElement('span');
    box.className = 'confirm';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'danger';
    yes.textContent = label;
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'Cancel';
    box.append(yes, no);
    wrap.append(box);
    yes.focus();
    const restore = () => {
      wrap.innerHTML = original;
      twoStep(wrapId, btnId, label, onConfirm);
    };
    yes.addEventListener('click', () => {
      onConfirm();
      restore();
    });
    no.addEventListener('click', restore);
  });
}
twoStep('clearWrap', 'clearBtn', 'Clear this frame', () => editFrame((b) => b.fill(0)));
twoStep('delWrap', 'delBtn', 'Delete layer and its art', () => {
  if (activeLayer()?.slot === 'base' && state.layers.filter((l) => l.slot === 'base').length <= 1) {
    toast('Keep the base body layer. Clear its frames instead.');
    return;
  }
  const id = state.active;
  for (const k of [...frames.keys()]) if (k.split('|')[1] === id) frames.delete(k);
  state.layers = state.layers.filter((l) => l.id !== id);
  state.active = null;
  ensureActiveInMode();
  if (!state.active) {
    state.mode = state.mode === 'body' ? 'gear' : 'body';
    ensureActiveInMode();
  }
  undoStack.length = 0;
  redoStack.length = 0;
  changed();
  toast('Layer deleted.');
});

// ---------- Block in ----------
function blockTargets(scope: string): [AnimId, number, number][] {
  const out: [AnimId, number, number][] = [];
  for (const anim of classAnims()) {
    if (scope !== 'all' && anim !== state.anim) continue;
    for (const d of dirsFor(anim)) {
      if (isMirrored(anim, d)) continue;
      for (let f = 0; f < ANIMS[anim].frames; f++) {
        if (scope === 'frame' && (d !== state.dir || f !== state.frame)) continue;
        out.push([anim, d, f]);
      }
    }
  }
  return out;
}
function blockLayer(
  layer: Layer,
  scope: string,
  color: string,
  style?: string,
  bk: string = body(),
  only?: AnimId,
) {
  const multi: Snap[] = [];
  for (const [anim, d, f] of blockTargets(scope)) {
    if (only && anim !== only) continue;
    const k = keyOf(layer.id, anim, d, f, bk),
      before = getBuf(k, false),
      prev = before ? before.slice() : null,
      b = getBuf(k, true);
    blockGear(b, anim, f, d, bk, layer.slot, color, style);
    multi.push({ k, before: prev, after: b.slice() });
  }
  return multi;
}
$('blockBtn').addEventListener('click', () => {
  const scope = select('blockScope').value;
  if (scope === 'frame' && !guardEditable()) return;
  const layer = activeLayer();
  if (!layer) return;
  const style = (STYLES[layer.slot] || []).length > 1 ? select('styleSel').value : layer.style;
  layer.style = style;
  layer.color = state.color;
  const multi = blockLayer(layer, scope, state.color, style);
  undoStack.push({ multi });
  redoStack.length = 0;
  changed();
  toast(
    `Blocked in ${layer.slot} on ${multi.length} frame${multi.length === 1 ? '' : 's'}. Undo reverts all of them.`,
  );
});
// Reset: back to the starting block-in for layers that have one, blank for layers without.
function resetLayersList(which: string) {
  if (which === 'active') return [activeLayer()].filter((l): l is Layer => !!l);
  if (which === 'mode') return classLayers().filter(inMode);
  return classLayers();
}
function doReset() {
  const scope = select('resetScope').value,
    which = select('resetLayers').value;
  if (scope === 'frame' && !guardEditable()) return;
  const layers = resetLayersList(which),
    targets = blockTargets(scope),
    multi: Snap[] = [],
    bk = body();
  for (const layer of layers)
    for (const [anim, d, f] of targets) {
      const k = keyOf(layer.id, anim, d, f, bk),
        before = getBuf(k, false),
        prev = before ? before.slice() : null;
      if (layer.slot === 'base' || layer.color) {
        const b = getBuf(k, true);
        blockGear(b, anim, f, d, bk, layer.slot, layer.color || '#000000', layer.style);
        multi.push({ k, before: prev, after: b.slice() });
      } else if (before) {
        frames.delete(k);
        multi.push({ k, before: prev, after: null });
      }
    }
  if (!multi.length) {
    toast('Nothing to reset there.');
    return;
  }
  undoStack.push({ multi });
  redoStack.length = 0;
  changed();
  const what =
    scope === 'frame'
      ? 'this frame'
      : scope === 'anim'
        ? `every ${ANIMS[state.anim].label.toLowerCase()} frame`
        : 'the whole character';
  toast(
    `Reset ${what} on ${layers.length} layer${layers.length === 1 ? '' : 's'}. Undo to bring it back.`,
  );
}
twoStep('resetWrap', 'resetBtn', 'Yes, reset', doReset);

$('addSetBtn').addEventListener('click', () => {
  const field = input('setName'),
    name = field.value.trim();
  if (!name) {
    field.focus();
    toast('Name the armor set first, e.g. Iron Guard.');
    return;
  }
  const added: Layer[] = (['pants', 'boots', 'chest', 'gloves', 'helmet'] as Slot[]).map(
    (slot) => ({
      id: newId(),
      slot,
      name,
      visible: true,
      cls: state.cls,
      behind: new Array(8).fill(false),
      seeded: [],
    }),
  );
  const firstWeapon = state.layers.findIndex((l) => SLOT_CAT[l.slot] === 'weapon');
  state.layers.splice(firstWeapon < 0 ? state.layers.length : firstWeapon, 0, ...added);
  state.mode = 'gear';
  state.active = added.find((l) => l.slot === 'chest')!.id;
  field.value = '';
  changed();
  toast(
    `Added ${name}: helmet, chest, gloves, pants and boots. Pick one and use Block in to start.`,
  );
});

// ---------- Layer actions ----------
$('addLayerBtn').addEventListener('click', () => {
  const slot = select('newSlot').value as Slot,
    name = input('newName').value.trim() || slot[0].toUpperCase() + slot.slice(1);
  const shared = SLOT_CAT[slot] === 'body' || SLOT_CAT[slot] === 'hair';
  const layer: Layer = {
    id: newId(),
    slot,
    name,
    visible: true,
    cls: shared ? null : state.cls,
    behind: new Array(8).fill(false),
    seeded: [],
  };
  const idx = state.layers.findIndex((l) => l.id === state.active);
  state.layers.splice(idx + 1, 0, layer);
  state.mode = isBodyLayer(layer) ? 'body' : 'gear';
  state.active = layer.id;
  input('newName').value = '';
  changed();
  toast(`Added ${name}.`);
});
function moveLayer(d: number) {
  const i = state.layers.findIndex((l) => l.id === state.active),
    j = i + d;
  if (j < 0 || j >= state.layers.length) return;
  [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]];
  changed();
}
$('upBtn').addEventListener('click', () => moveLayer(1));
$('downBtn').addEventListener('click', () => moveLayer(-1));
$('renameBtn').addEventListener('click', () => {
  const field = input('newName'),
    v = field.value.trim();
  const layer = activeLayer();
  if (!v || !layer) {
    field.focus();
    toast('Type the new name in the name box, then press Rename.');
    return;
  }
  layer.name = v;
  field.value = '';
  changed();
  toast('Renamed.');
});

// ---------- Tools, toggles, project settings ----------
document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    state.tool = b.dataset.tool as Tool;
    syncSegs();
    render();
  }),
);
$('mirrorBtn').addEventListener('click', () => {
  state.mirror = !state.mirror;
  syncSegs();
});
$('sizeBtn').addEventListener('click', () => {
  state.size = state.size === 3 ? 1 : state.size + 1;
  syncSegs();
});
input('colorInput').addEventListener('input', (e) => {
  state.color = (e.target as HTMLInputElement).value;
  state.tool = 'pencil';
  syncSegs();
});
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
for (const [id, key] of [
  ['guideChk', 'guide'],
  ['onionChk', 'onion'],
  ['gridChk', 'grid'],
  ['othersChk', 'others'],
] as const)
  input(id).addEventListener('change', (e) => {
    state[key] = (e.target as HTMLInputElement).checked;
    render();
    saveSoon();
  });
input('autoMirrorChk').addEventListener('change', (e) => {
  state.autoMirror = (e.target as HTMLInputElement).checked;
  changed();
});
// Switches between editing the body (base, hair, beard) and the gear, remembering the last layer used in each.
function ensureActiveInMode() {
  const cur = activeLayer();
  if (cur && inClass(cur) && inMode(cur)) return;
  const ls = classLayers().filter(inMode),
    remembered = ls.find((l) => l.id === state.lastActive[state.mode]);
  const pick =
    remembered ||
    (state.mode === 'body'
      ? ls.find((l) => l.slot === 'base')
      : ls.find((l) => l.slot === 'chest') || ls[0]) ||
    ls[0];
  if (pick) state.active = pick.id;
}
function setMode(mode: Mode) {
  if (state.active) state.lastActive[state.mode] = state.active;
  state.mode = mode;
  ensureActiveInMode();
  changed();
}
document
  .querySelectorAll<HTMLElement>('#modeSeg button')
  .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as Mode)));
input('overlayChk').addEventListener('change', (e) => {
  state.overlay = (e.target as HTMLInputElement).checked;
  syncSegs();
  render();
  saveSoon();
});
input('overlayRange').addEventListener('input', (e) => {
  state.overlayAlpha = +(e.target as HTMLInputElement).value / 100;
  syncSegs();
  render();
  saveSoon();
});
document.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((t) =>
  t.addEventListener('click', () => {
    document
      .querySelectorAll<HTMLButtonElement>('[role=tab]')
      .forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    document
      .querySelectorAll<HTMLElement>('[data-panel]')
      .forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
  }),
);

// Blocks in any layer that has a starter color but no art yet for this body and one of this class's animations.
function ensureSeeded() {
  const bk = body();
  let n = 0;
  for (const layer of classLayers()) {
    if (layer.slot !== 'base' && !layer.color) continue;
    layer.seeded = layer.seeded || [];
    for (const anim of classAnims()) {
      const tag = `${bk}|${anim}`;
      if (layer.seeded.includes(tag)) continue;
      const hasArt = [...frames.keys()].some((k) => k.startsWith(`${bk}|${layer.id}|${anim}|`));
      if (!hasArt) {
        blockLayer(layer, 'all', layer.color || '#000000', layer.style, bk, anim);
        n++;
      }
      layer.seeded.push(tag);
    }
  }
  return n;
}
function addPreset(cls: LookClass) {
  const pr = PRESETS[cls],
    added: Layer[] = [];
  for (const [slot, style, color, behindDirs, hidden] of pr.gear) {
    const name =
      slot === 'weapon' || slot === 'offhand' || slot === 'back'
        ? `${pr.name} ${STYLES[slot].find((s) => s[0] === style)![1].toLowerCase()}`
        : pr.name;
    const layer: Layer = {
      id: newId(),
      slot,
      name,
      style,
      color,
      visible: !hidden,
      cls,
      behind: new Array(8).fill(false),
      seeded: [],
    };
    (behindDirs || []).forEach((d) => (layer.behind[d] = true));
    added.push(layer);
  }
  state.layers.push(...added);
  return added;
}
function switchBody() {
  const fresh = ![...frames.keys()].some((k) => k.startsWith(body() + '|'));
  ensureSeeded();
  if (fresh)
    toast(
      `New body: ${RACES[state.race].label} ${SEXES[state.sex].label.toLowerCase()}. Base body, hair and ${LOOK_CLASSES[state.cls].label.toLowerCase()} gear blocked in.`,
    );
  changed();
}
function switchClass(cls: LookClass) {
  state.cls = cls;
  if (!classAnims().includes(state.anim)) {
    state.anim = 'idle';
    state.frame = 0;
    state.dir = 0;
  }
  if (ANIMS[state.anim].combat) state.dir = state.combatDir;
  let note = '';
  if (!state.layers.some((l) => l.cls === cls)) {
    addPreset(cls);
    note = ` Added the ${PRESETS[cls].name} gear preset.`;
  }
  ensureSeeded();
  ensureActiveInMode();
  buildAnimSeg();
  changed();
  toast(
    `${LOOK_CLASSES[cls].label}: ${classAnims()
      .map((a) => ANIMS[a].label)
      .join(', ')}.${note}`,
  );
}
$('presetBtn').addEventListener('click', () => {
  const added = addPreset(state.cls);
  ensureSeeded();
  state.mode = 'gear';
  state.active = added[added.length - 1].id;
  changed();
  toast(
    `Added ${PRESETS[state.cls].name}: ${added.length} layers, blocked in for every ${LOOK_CLASSES[state.cls].label.toLowerCase()} animation.`,
  );
});
select('combatSel').addEventListener('change', (e) => {
  const from = state.combatDir,
    to = +(e.target as HTMLSelectElement).value;
  if (from === to) return;
  // Move existing combat art to the new camera direction.
  for (const [k, b] of [...frames]) {
    const [bk, lid, anim, dir, fr] = k.split('|');
    if (ANIMS[anim as AnimId].combat && +dir === from) {
      frames.delete(k);
      frames.set(`${bk}|${lid}|${anim}|${to}|${fr}`, b);
    }
  }
  state.combatDir = to;
  if (ANIMS[state.anim].combat) state.dir = to;
  undoStack.length = 0;
  redoStack.length = 0;
  changed();
  toast(
    `Combat camera set to ${DIRS[to].k}. Existing combat frames moved there; redraw them to match the new angle.`,
  );
});
document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('input[type=text], select') || target.closest('#room')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && k === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };
  if (map[k]) {
    state.tool = map[k];
    syncSegs();
    render();
  } else if (k === 'm') {
    state.mirror = !state.mirror;
    syncSegs();
  } else if (k === 't') setMode(state.mode === 'body' ? 'gear' : 'body');
  else if (k === 'h') {
    state.guide = !state.guide;
    syncSegs();
    render();
  } else if (k === 'o') {
    state.onion = !state.onion;
    syncSegs();
    render();
  } else if (k === '?' || (k === '/' && e.shiftKey)) openHelp();
  else if (k === 'p') togglePlay();
  else if (k === '=' || k === '+') zoomStep(1);
  else if (k === '-') zoomStep(-1);
  else if (k === '0') setZoom(1);
  else if (k === '[' || k === ',') stepFrame(-1);
  else if (k === ']' || k === '.') stepFrame(1);
});

// ---------- Changing room ----------
/** The changing room draws straight from the layers being edited. */
const live: FrameSource & { cache: Map<string, Uint8ClampedArray>; version: number } = {
  version: 0,
  cache: new Map(),
  frame(anim, dir, f) {
    if (!classAnims().includes(anim)) return undefined;
    if (ANIMS[anim].combat) dir = state.combatDir;
    const key = `${anim}|${dir}|${f}`;
    let out = this.cache.get(key);
    if (!out) {
      out = new Uint8ClampedArray(composite(anim, dir, f).data);
      this.cache.set(key, out);
    }
    return out;
  },
  frameNow(anim, dir, f) {
    return this.frame(anim, dir, f) ?? this.frame('idle', 0, 0)!;
  },
  warm() {},
};
let room: ChangingRoom | undefined;
function startRoom() {
  try {
    room = new ChangingRoom($('room'), live);
  } catch {
    $('roomHint').textContent =
      'The changing room needs WebGL. Enable hardware acceleration to walk your character around.';
    return;
  }
  const auto = $('autoWalkBtn');
  const setAuto = (on: boolean) => {
    if (room) room.autoWalk = on;
    auto.setAttribute('aria-pressed', String(on));
    auto.classList.toggle('on', on);
  };
  setAuto(true);
  auto.addEventListener('click', () => setAuto(!room?.autoWalk));
  $('room').addEventListener('autowalk', () => setAuto(false));
  $('room').addEventListener('pointerdown', () => $('room').focus());
  $('expandRoomBtn').addEventListener('click', () => {
    const big = $('roomPanel').classList.toggle('expanded');
    $('expandRoomBtn').textContent = big ? 'Close' : 'Expand';
    if (big) $('room').focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('roomPanel').classList.contains('expanded'))
      $('expandRoomBtn').click();
  });
  const loop = (ms: number) => {
    room?.frame(ms);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- Save / load ----------
const STORE = 'paper-doll-studio-v2';
const enc = document.createElement('canvas');
enc.width = enc.height = F;
const ectx = enc.getContext('2d', { willReadFrequently: true })!;
function bufToDataUrl(b: Uint8ClampedArray) {
  ectx.clearRect(0, 0, F, F);
  ectx.putImageData(new ImageData(b.slice(), F, F), 0, 0);
  return enc.toDataURL('image/png');
}
const encCache = new WeakMap<Uint8ClampedArray, string>();
function encSnap(b: Uint8ClampedArray | null) {
  if (!b || isEmpty(b)) return null;
  let s = encCache.get(b);
  if (!s) {
    s = bufToDataUrl(b);
    encCache.set(b, s);
  }
  return s;
}
function encodeUndo() {
  const out: { multi: { k: string; b: string | null; a: string | null }[] }[] = [];
  let budget = 1500;
  for (const e of undoStack.slice(-40).reverse()) {
    if (e.multi.length > budget) break;
    budget -= e.multi.length;
    out.unshift({
      multi: e.multi.map((m) => ({ k: m.k, b: encSnap(m.before), a: encSnap(m.after) })),
    });
  }
  return out;
}
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
async function decodeSnap(url: string | null) {
  if (!url) return null;
  const im = await loadImage(url);
  ectx.clearRect(0, 0, F, F);
  ectx.drawImage(im, 0, 0);
  return new Uint8ClampedArray(ectx.getImageData(0, 0, F, F).data);
}
function serialize(withUndo = false) {
  const out: Record<string, string> = {};
  for (const [k, b] of frames) if (!isEmpty(b)) out[k] = bufToDataUrl(b);
  return {
    app: 'paper-doll-studio',
    version: 2,
    race: state.race,
    sex: state.sex,
    cls: state.cls,
    combatDir: state.combatDir,
    autoMirror: state.autoMirror,
    layers: state.layers,
    active: state.active,
    view: {
      guide: state.guide,
      onion: state.onion,
      grid: state.grid,
      others: state.others,
      mode: state.mode,
      overlay: state.overlay,
      overlayAlpha: state.overlayAlpha,
    },
    frames: out,
    undo: withUndo ? encodeUndo() : undefined,
  };
}
type Project = ReturnType<typeof serialize> & {
  undo?: { multi: { k: string; b: string | null; a: string | null }[] }[];
};
async function deserialize(data: Project) {
  if (
    !data ||
    data.app !== 'paper-doll-studio' ||
    data.version !== 2 ||
    !Array.isArray(data.layers)
  )
    throw new Error("This isn't a Paper Doll Studio project file from this version.");
  frames.clear();
  // Earlier saves: gear without a class belongs to the tank, and the old shield slot is now the off-hand.
  for (const l of data.layers as (Omit<Layer, 'slot'> & { slot: string })[]) {
    if (l.slot === 'shield') {
      l.slot = 'offhand';
      l.style = l.style || 'shield';
    }
    if (l.cls === undefined) l.cls = ['base', 'hair', 'beard'].includes(l.slot) ? null : 'tank';
    if (l.slot === 'weapon' && !l.style) l.style = 'sword';
    l.behind = l.behind || new Array(8).fill(false);
    l.seeded = l.seeded || [];
    // Layers from earlier versions never stored their starter color; recover it so Reset restores them.
    if (!l.color && l.slot === 'hair') {
      l.color = (RACES[data.race as Race] || RACES.orc).hair;
      l.style = l.style || 'ponytail';
    } else if (!l.color && l.cls && PRESETS[l.cls]) {
      const g = PRESETS[l.cls].gear.find((x) => x[0] === l.slot);
      if (g) {
        l.color = g[2];
        l.style = l.style || g[1];
      }
    }
  }
  Object.assign(
    state,
    {
      race: data.race,
      sex: data.sex,
      cls: data.cls && LOOK_CLASSES[data.cls] ? data.cls : 'tank',
      combatDir: data.combatDir,
      autoMirror: data.autoMirror,
      layers: data.layers,
      active: data.active || data.layers[0].id,
    },
    data.view?.overlayAlpha === 0.35 ? { ...data.view, overlayAlpha: 0.15 } : data.view || {},
  );
  for (const [k, url] of Object.entries(data.frames || {})) {
    const im = await loadImage(url);
    ectx.clearRect(0, 0, F, F);
    ectx.drawImage(im, 0, 0);
    frames.set(k, new Uint8ClampedArray(ectx.getImageData(0, 0, F, F).data));
  }
  undoStack.length = 0;
  redoStack.length = 0;
  for (const e of data.undo || []) {
    const multi: Snap[] = [];
    for (const m of e.multi)
      multi.push({ k: m.k, before: await decodeSnap(m.b), after: await decodeSnap(m.a) });
    undoStack.push({ multi });
  }
}
let saveTimer = 0;
/** The studio shares this origin's storage with the game: keep big undo histories out of it. */
const STORE_BUDGET = 2_500_000;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      let raw = JSON.stringify(serialize(true));
      if (raw.length > STORE_BUDGET) raw = JSON.stringify(serialize(false));
      localStorage.setItem(STORE, raw);
      $('saveState').textContent = 'Autosaved in this browser.';
    } catch {
      $('saveState').textContent =
        "Autosave isn't available here, or the project is too big for it. Use Save project file to keep your work.";
    }
  }, 1500);
}
let roomTimer = 0;
function changed() {
  refresh();
  saveSoon();
  // Let the changing room catch up once drawing settles.
  clearTimeout(roomTimer);
  roomTimer = window.setTimeout(() => {
    live.cache.clear();
    live.version++;
  }, 120);
}

// ---------- Export ----------
function download(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Saved ${filename}.`);
}
// One sheet per layer and animation: columns are frames; rows are the 8 directions, or one row for combat.
function sheetCanvas(layers: Layer[], anim: AnimId) {
  const A = ANIMS[anim],
    rows = dirsFor(anim);
  const c = document.createElement('canvas');
  c.width = A.frames * F;
  c.height = rows.length * F;
  const ctx = c.getContext('2d')!;
  let any = false;
  const saved = state.layers;
  state.layers = layers;
  rows.forEach((d, r) => {
    for (let f = 0; f < A.frames; f++) {
      const img = composite(anim, d, f);
      if (!isEmpty(img.data)) {
        any = true;
        ctx.putImageData(img, f * F, r * F);
      }
    }
  });
  state.layers = saved;
  return any ? c : null;
}
const solo = (layer: Layer) => [{ ...layer, visible: true }];
const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
$('exportSheetBtn').addEventListener('click', async () => {
  const layer = activeLayer();
  if (!layer) return;
  const c = sheetCanvas(solo(layer), state.anim);
  if (!c) {
    toast(`${layer.name} has nothing drawn for ${ANIMS[state.anim].label}.`);
    return;
  }
  download(layerFile(layer, state.anim), await toBlob(c));
});
function manifest(files: { layer: string; anim: AnimId; file: string }[]) {
  const anims: Record<string, unknown> = {};
  for (const k of classAnims()) {
    const a = ANIMS[k];
    anims[k] = {
      frames: a.frames,
      fps: a.fps,
      loop: a.loop,
      combat: a.combat,
      rows: dirsFor(k).map((d) => DIRS[d].k),
    };
  }
  const order: Record<string, string[]> = {};
  DIRS.forEach((d, i) => {
    order[d.k] = orderFor(isMirrored('walk', i) ? MIRROR_SRC[i] : i).map(
      (l) => `${l.slot}:${l.name}`,
    );
  });
  return {
    body: body(),
    race: state.race,
    sex: state.sex,
    class: state.cls,
    frameSize: F,
    combatCamera: DIRS[state.combatDir].k,
    mirroredRowsBaked: state.autoMirror ? ['NE', 'E', 'SE'] : [],
    animations: anims,
    drawOrder: order,
    layers: classLayers().map((l, i) => ({
      slot: l.slot,
      category: SLOT_CAT[l.slot],
      style: l.style || null,
      name: l.name,
      listOrder: i,
      files: files
        .filter((f) => f.layer === l.id)
        .map((f) => ({ animation: f.anim, file: f.file })),
    })),
  };
}
$('exportAllBtn').addEventListener('click', async () => {
  const entries: { name: string; data: Uint8Array }[] = [],
    files: { layer: string; anim: AnimId; file: string }[] = [];
  for (const layer of classLayers())
    for (const anim of classAnims()) {
      const c = sheetCanvas(solo(layer), anim);
      if (!c) continue;
      const file = layerFile(layer, anim);
      files.push({ layer: layer.id, anim, file });
      entries.push({ name: file, data: new Uint8Array(await (await toBlob(c)).arrayBuffer()) });
    }
  if (!files.length) {
    toast('Nothing drawn yet for this body.');
    return;
  }
  entries.push({
    name: `${body()}_${state.cls}_manifest.json`,
    data: new TextEncoder().encode(JSON.stringify(manifest(files), null, 2)),
  });
  download(`${body()}_${state.cls}_sprites.zip`, zip(entries));
});
$('saveProjBtn').addEventListener('click', () =>
  download(
    'paper-doll-project.json',
    new Blob([JSON.stringify(serialize())], { type: 'application/json' }),
  ),
);
input('openProj').addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement,
    f = el.files?.[0];
  if (!f) return;
  try {
    await deserialize(JSON.parse(await f.text()) as Project);
    ensureActiveInMode();
    buildAnimSeg();
    changed();
    toast('Project opened.');
  } catch (err) {
    toast(err instanceof Error ? err.message : "That file couldn't be opened.");
  }
  el.value = '';
});
input('importSheet').addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement,
    f = el.files?.[0];
  if (!f || !state.active) return;
  const A = ANIMS[state.anim],
    rows = dirsFor(state.anim),
    url = URL.createObjectURL(f);
  try {
    const im = await loadImage(url);
    if (im.width !== A.frames * F || im.height !== rows.length * F) {
      toast(
        `${A.label} sheets must be ${A.frames * F} × ${rows.length * F} px (${A.frames} frames × ${rows.length} row${rows.length > 1 ? 's' : ''}). This one is ${im.width} × ${im.height}.`,
      );
      return;
    }
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(im, 0, 0);
    rows.forEach((d, r) => {
      for (let fr = 0; fr < A.frames; fr++) {
        const px = ctx.getImageData(fr * F, r * F, F, F).data;
        for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0;
        frames.set(keyOf(state.active!, state.anim, d, fr), new Uint8ClampedArray(px));
      }
    });
    undoStack.length = 0;
    redoStack.length = 0;
    changed();
    toast(`Imported into ${activeLayer()?.name}.`);
  } catch {
    toast("That image couldn't be read.");
  } finally {
    URL.revokeObjectURL(url);
    el.value = '';
  }
});

// ---------- Send to game ----------
const lookName = (body: BodyKey, cls: LookClass) =>
  `${RACES[body.slice(0, -1) as Race].label} ${SEXES[body.slice(-1) as Sex].label.toLowerCase()} ${LOOK_CLASSES[cls].label.toLowerCase()}`;
function sendToGame() {
  const anims: WardrobeEntry['anims'] = {};
  for (const anim of classAnims()) {
    const c = sheetCanvas(classLayers(), anim);
    if (c) anims[anim] = { dirs: dirsFor(anim), sheet: c.toDataURL('image/png') };
  }
  if (!anims.idle || !anims.walk) {
    toast('Draw at least the idle and walk animations before sending this look to the game.');
    return;
  }
  try {
    writeWardrobe({ body: body(), cls: state.cls, updated: Date.now(), anims });
  } catch {
    toast(
      "The browser's storage is full. Remove an older look from Project › In the game, then try again.",
    );
    return;
  }
  const game = GAME_CLASS_FOR[state.cls];
  toast(
    game
      ? `Sent. Playing as a ${RACES[state.race].label.toLowerCase()} ${SEXES[state.sex].label.toLowerCase()} ${CLASSES[game].name} now uses this look.`
      : `Saved for later: ${LOOK_CLASSES[state.cls].label} isn't a playable class in the game yet.`,
  );
  syncSendState();
}
const dialog = $<HTMLDialogElement>('dialog');
function openDialog(html: string) {
  dialog.innerHTML = html;
  dialog.showModal();
  dialog
    .querySelectorAll('[data-close]')
    .forEach((b) => b.addEventListener('click', () => dialog.close()));
}
let previewLoop = 0;
dialog.addEventListener('close', () => cancelAnimationFrame(previewLoop));
/** Before sending: what the game shows now beside what you've drawn, walking round every direction. */
function previewSend() {
  const game = GAME_CLASS_FOR[state.cls];
  openDialog(
    `<h2>Send to game?</h2><p class="small">${game ? `Playing as a ${RACES[state.race].label.toLowerCase()} ${SEXES[state.sex].label.toLowerCase()} ${CLASSES[game].name} will use your drawing.` : `${LOOK_CLASSES[state.cls].label} isn't playable yet; the look is saved for later.`} Only visible layers are sent.</p><div class="compare"><figure><canvas id="pvNow" width="64" height="64"></canvas><figcaption>In the game now</figcaption></figure><figure><canvas id="pvNew" width="64" height="64"></canvas><figcaption>Your drawing</figcaption></figure></div><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="button" class="primary" id="confirmSend">Send to game</button></div>`,
  );
  $('confirmSend').addEventListener('click', () => {
    dialog.close();
    sendToGame();
  });
  const now = dollFor({ ...defaultLook(state.race, state.sex, state.cls), custom: true });
  const pairs: [HTMLCanvasElement, FrameSource][] = [
    [$<HTMLCanvasElement>('pvNow'), now],
    [$<HTMLCanvasElement>('pvNew'), live],
  ];
  const tick = (ms: number) => {
    pumpDolls();
    const dir = Math.floor(ms / 900) % 8,
      f = Math.floor(ms / 100) % ANIMS.walk.frames;
    for (const [canvas, source] of pairs) {
      const frame = source.frame('walk', dir, f) ?? source.frameNow('idle', 0, 0);
      canvas.getContext('2d')!.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
    }
    previewLoop = requestAnimationFrame(tick);
  };
  previewLoop = requestAnimationFrame(tick);
}
function openHelp() {
  const rows: [string, string][] = [
    ['B / E / G / I', 'Pencil, eraser, fill, eyedropper'],
    ['M', 'Mirror strokes left and right'],
    ['T', 'Switch between body & hair and gear'],
    ['H / O', 'Pose guide, onion skin'],
    ['[ ] or , .', 'Previous / next frame'],
    ['P', 'Play or pause the animation'],
    ['+ / − / 0', 'Zoom in, out, fit (or Ctrl + wheel)'],
    ['Space + drag', 'Pan a zoomed board (or middle-drag)'],
    ['Ctrl Z / Ctrl ⇧ Z', 'Undo / redo'],
    ['WASD', 'Walk in the changing room, after clicking it'],
    ['?', 'This list'],
  ];
  openDialog(
    `<h2>Shortcuts</h2><dl class="keys">${rows.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl><div class="dialog-actions"><button type="button" class="primary" data-close>Close</button></div>`,
  );
}
$('helpBtn').addEventListener('click', openHelp);
$('sendBtn').addEventListener('click', previewSend);
function syncSendState() {
  const all = readWardrobe(),
    entry = all[`${body()}|${state.cls}`];
  const game = GAME_CLASS_FOR[state.cls];
  $('sendState').textContent = entry
    ? `In game since ${new Date(entry.updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : game
      ? `Game uses the default ${CLASSES[game].name}`
      : 'Not a playable class yet';
  const list = $('wardrobeList');
  list.innerHTML = '';
  const entries = Object.values(all);
  if (!entries.length)
    list.innerHTML =
      '<p class="small">No custom looks yet. The game draws everyone with the default block-ins.</p>';
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'wardrobe-row';
    const name = document.createElement('span');
    name.textContent = lookName(e.body, e.cls);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Use default';
    remove.addEventListener('click', () => {
      removeWardrobe(e.body, e.cls);
      syncSendState();
      toast(`The game draws the ${lookName(e.body, e.cls)} with the default block-in again.`);
    });
    row.append(name, remove);
    list.append(row);
  }
}

// ---------- Toast ----------
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3600);
}

// ---------- Boot ----------
function seedStarter() {
  // Example project: an orc woman with a ponytail in the tank's Iron Guard gear, all rough block-ins to paint over.
  state.layers = [
    {
      id: newId(),
      slot: 'base',
      name: 'Base body',
      visible: true,
      cls: null,
      behind: new Array(8).fill(false),
      seeded: [],
    },
    {
      id: newId(),
      slot: 'hair',
      name: 'Hair',
      style: 'ponytail',
      color: RACES.orc.hair,
      visible: true,
      cls: null,
      behind: new Array(8).fill(false),
      seeded: [],
    },
  ];
  addPreset('tank');
  ensureSeeded();
  state.active = state.layers.find((l) => l.slot === 'chest')!.id;
}
/** Walking in from the game opens the studio on your own character. */
function openOnPlayer() {
  try {
    if (sessionStorage.getItem(RETURN_KEY) !== 'changing') return false;
    const save = JSON.parse(localStorage.getItem('dungeon-delver.save') ?? 'null') as {
      state?: {
        progress?: { player?: { classId: ClassId; appearance?: { race: Race; sex: Sex } } };
      };
    } | null;
    const player = save?.state?.progress?.player;
    if (!player) return false;
    const a = player.appearance ?? { race: 'human', sex: 'M' };
    state.race = a.race;
    state.sex = a.sex;
    const cls = GAME_CLASS_LOOK[player.classId];
    if (cls !== state.cls) switchClass(cls);
    return true;
  } catch {
    return false;
  }
}
async function boot() {
  buildSegs();
  buildPalette();
  let loaded = false;
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      await deserialize(JSON.parse(raw) as Project);
      loaded = true;
    }
  } catch {
    loaded = false;
  }
  if (!loaded) seedStarter();
  const fromGame = openOnPlayer();
  ensureSeeded();
  ensureActiveInMode();
  buildAnimSeg();
  sizeBoard();
  refresh();
  startRoom();
  window.addEventListener('resize', () => {
    sizeBoard();
    render();
  });
  if (fromGame)
    toast(
      `Welcome to the changing room. Editing your ${lookName(body(), state.cls)}; Send to game when it looks right.`,
    );
  else if (!loaded)
    toast(
      'Starter orc tank in Iron Guard gear, blocked in from the pose guide. Pick another class to get its gear and animations.',
    );
}
void boot();
