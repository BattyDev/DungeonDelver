import './portraits.css';
import { GHOSTS, RACE_IDS, SEX_IDS } from '@delver/rules';
import type { Race, Sex } from '@delver/rules';
import {
  F,
  PX,
  PALETTE,
  RACES,
  SEXES,
  bodyKey,
  hexRgb,
  rgbHex,
  splitBody,
} from '../paperdoll/model';
import type { BodyKey } from '../paperdoll/model';
import { characterLook, defaultLook } from '../paperdoll/looks';
import { lookById } from '../scene/cast';
import { RETURN_KEY } from '../paperdoll/wardrobe';
import {
  MAX_PORTRAIT_FRAMES,
  PORTRAIT_DRAFT_KEY,
  PORTRAIT_TIMING,
  portraitKey,
  portraitPixels,
  portraitPlayback,
  readPortraits,
  resolvePortrait,
  validPortrait,
  validPortraitBody,
  writePortrait,
} from '../paperdoll/portraits';
import type { Portrait } from '../paperdoll/portraits';
import { stroke, fill } from './portrait-paint';
import { defaultPortrait, loadDefaultPortraits } from '../paperdoll/default-portraits';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id),
  select = (id: string) => $<HTMLSelectElement>(id);
const board = $<HTMLCanvasElement>('portraitBoard'),
  ctx = board.getContext('2d')!;
const tmp = document.createElement('canvas');
tmp.width = tmp.height = F;
const tctx = tmp.getContext('2d')!;
let player = defaultLook('human', 'F', 'tank');
try {
  const save = JSON.parse(localStorage.getItem('dungeon-delver.save') ?? 'null');
  if (save?.state?.progress?.player) player = characterLook(save.state.progress.player);
} catch {
  /* A portrait can be painted without an expedition save. */
}
const params = new URLSearchParams(location.search);
const requested = params.get('body');
let body: BodyKey = validPortraitBody(requested) ? requested : bodyKey(player.race, player.sex);
let person = params.get('target') ?? '';
if (person !== 'player' && !GHOSTS.some((g) => g.id === person)) person = '';
let race: Race = splitBody(body).race,
  sex: Sex = splitBody(body).sex;
let frames = [portraitPixels(body)],
  current = 0,
  timing = { ...PORTRAIT_TIMING };
type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
let tool: Tool = 'pencil',
  playing = true,
  started = performance.now(),
  selectedColour = RACES[race].skin[1];
interface Snapshot {
  frames: Uint8ClampedArray[];
  current: number;
  timing: typeof timing;
}
const undo: Snapshot[] = [],
  redo: Snapshot[] = [];
let saveTimer = 0,
  loadToken = 0,
  drawing = false,
  dirty = false,
  loading = false,
  last: [number, number] | undefined;
const snapshot = (): Snapshot => ({
  frames: frames.map((f) => f.slice()),
  current,
  timing: { ...timing },
});
function checkpoint() {
  undo.push(snapshot());
  if (undo.length > 40) undo.shift();
  redo.length = 0;
}
function message(text: string) {
  $('portraitMessage').textContent = text;
}
function encode(frame: Uint8ClampedArray) {
  tctx.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
  return tmp.toDataURL('image/png');
}
function entry(): Portrait {
  return { body, frames: frames.map(encode), ...timing, updated: Date.now() };
}
function flushDraft() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!dirty) return true;
  try {
    writePortrait(person, entry(), undefined, PORTRAIT_DRAFT_KEY);
    dirty = false;
    $('saveStatus').textContent = 'Draft autosaved · Use portrait in game to publish.';
    return true;
  } catch {
    $('saveStatus').textContent =
      'Draft could not be saved. Save a portrait project to keep your painting.';
    return false;
  }
}
function changed() {
  dirty = true;
  started = performance.now();
  draw();
  renderFrames();
  sync();
  $('saveStatus').textContent = 'Saving draft…';
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushDraft, 600);
}
function restore(s: Snapshot) {
  frames = s.frames.map((f) => f.slice());
  current = s.current;
  timing = { ...s.timing };
  syncTiming();
  changed();
}
function history(back: boolean) {
  const from = back ? undo : redo,
    to = back ? redo : undo,
    s = from.pop();
  if (s) {
    to.push(snapshot());
    restore(s);
  }
}
async function decode(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (img.naturalWidth !== F || img.naturalHeight !== F)
    throw Error('Each portrait frame must be 64 × 64 pixels.');
  tctx.clearRect(0, 0, F, F);
  tctx.drawImage(img, 0, 0);
  return tctx.getImageData(0, 0, F, F).data;
}
async function openPortrait(flush = true) {
  if (flush && !flushDraft()) {
    sync();
    message('Save a portrait project before switching: browser storage could not keep this draft.');
    return;
  }
  loading = true;
  document.querySelector<HTMLElement>('.portrait-workspace')!.inert = true;
  $<HTMLButtonElement>('publish').disabled = true;
  const token = ++loadToken;
  person = select('person').value;
  if (person) {
    const g = GHOSTS.find((g) => g.id === person),
      look = person === 'player' ? player : lookById(g!.id, g!.character.classId);
    race = look.race;
    sex = look.sex;
  } else {
    race = select('race').value as Race;
    sex = select('sex').value as Sex;
  }
  body = bodyKey(race, sex);
  const selectedBody = body;
  const drafts = readPortraits(undefined, PORTRAIT_DRAFT_KEY);
  const saved = drafts[portraitKey(body, person)] ?? resolvePortrait(readPortraits(), body, person);
  let loaded: Uint8ClampedArray[];
  try {
    if (!saved) await loadDefaultPortraits();
    loaded = saved ? await Promise.all(saved.frames.map(decode)) : [defaultPortrait(selectedBody)];
  } catch {
    loaded = [defaultPortrait(selectedBody)];
    if (token === loadToken)
      message(
        'The saved image could not be decoded. Its stored draft is preserved until you paint or import a replacement.',
      );
  }
  if (token !== loadToken) return;
  frames = loaded;
  dirty = false;
  loading = false;
  document.querySelector<HTMLElement>('.portrait-workspace')!.inert = false;
  $<HTMLButtonElement>('publish').disabled = false;
  timing = saved
    ? { fps: saved.fps, loops: saved.loops, restMs: saved.restMs }
    : { ...PORTRAIT_TIMING };
  current = 0;
  undo.length = redo.length = 0;
  started = performance.now();
  syncTiming();
  buildPalette();
  draw();
  renderFrames();
  sync();
  $('saveStatus').textContent = saved
    ? 'Saved portrait loaded. Changes autosave as a draft.'
    : 'Default face · start painting or choose Blank head shape.';
}
function syncTiming() {
  input('fps').value = String(timing.fps);
  input('loops').value = String(timing.loops);
  input('rest').value = String(timing.restMs / 1000);
}
function sync() {
  select('person').value = person;
  select('race').value = race;
  select('sex').value = sex;
  select('race').disabled = select('sex').disabled = !!person;
  const name =
    person === 'player' ? 'your character' : GHOSTS.find((g) => g.id === person)?.character.name;
  $('identityHint').textContent = person
    ? `This portrait belongs to ${name}. It follows their ${RACES[race].label.toLowerCase()} ${SEXES[sex].label.toLowerCase()} appearance.`
    : `Used by ${RACES[race].label.toLowerCase()} ${SEXES[sex].label.toLowerCase()} characters without their own portrait.`;
  $('frameLabel').textContent = `Frame ${current + 1} / ${frames.length}`;
  $<HTMLButtonElement>('addFrame').disabled = $<HTMLButtonElement>('duplicateFrame').disabled =
    frames.length >= MAX_PORTRAIT_FRAMES;
  $<HTMLButtonElement>('deleteFrame').disabled = frames.length === 1;
  $<HTMLButtonElement>('moveLeft').disabled = current === 0;
  $<HTMLButtonElement>('moveRight').disabled = current === frames.length - 1;
  $<HTMLButtonElement>('undo').disabled = !undo.length;
  $<HTMLButtonElement>('redo').disabled = !redo.length;
  document.querySelector<HTMLAnchorElement>('.wardrobe-pages a')!.href = `studio.html?body=${body}`;
}
function buildPalette() {
  const palette = $('portraitPalette');
  palette.replaceChildren();
  // Put the actual painting's most-used colours first, so the supplied faces can
  // be edited without trying to match their skin and hair with the sprite palette.
  const counts = new Map<string, number>();
  const frame = frames[current];
  for (let i = 0; i < frame.length; i += 4) {
    if (!frame[i + 3]) continue;
    const colour = rgbHex(frame[i], frame[i + 1], frame[i + 2]);
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  const sampled = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([c]) => c);
  for (const colour of [
    ...new Set([...sampled, ...RACES[race].skin, RACES[race].hair, ...PALETTE]),
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = colour;
    b.title = colour;
    b.setAttribute('aria-label', `Paint ${colour}`);
    b.addEventListener('click', () => setColour(colour));
    palette.append(b);
  }
  setColour(RACES[race].skin[1]);
}
function setColour(colour: string) {
  selectedColour = colour;
  input('colour').value = colour;
  $('hexColour').textContent = colour;
}
function draw() {
  ctx.clearRect(0, 0, 512, 512);
  ctx.imageSmoothingEnabled = false;
  if (input('onion').checked && current > 0) {
    tctx.putImageData(new ImageData(frames[current - 1].slice(), F, F), 0, 0);
    ctx.globalAlpha = 0.25;
    ctx.drawImage(tmp, 0, 0, 512, 512);
    ctx.globalAlpha = 1;
  }
  tctx.putImageData(new ImageData(frames[current].slice(), F, F), 0, 0);
  ctx.drawImage(tmp, 0, 0, 512, 512);
  if (input('grid').checked) {
    ctx.strokeStyle = '#ffffff13';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < F; i++) {
      ctx.moveTo(i * 8 + 0.5, 0);
      ctx.lineTo(i * 8 + 0.5, 512);
      ctx.moveTo(0, i * 8 + 0.5);
      ctx.lineTo(512, i * 8 + 0.5);
    }
    ctx.stroke();
  }
  if (input('guide').checked) {
    ctx.strokeStyle = '#5db2ff99';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(256, 56);
    ctx.lineTo(256, 400);
    ctx.moveTo(128, 232);
    ctx.lineTo(384, 232);
    ctx.moveTo(176, 336);
    ctx.lineTo(336, 336);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
function renderFrames() {
  const box = $('portraitFrames');
  box.replaceChildren();
  frames.forEach((frame, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === current ? 'on' : '';
    b.setAttribute('aria-label', `Portrait frame ${i + 1}`);
    b.setAttribute('aria-pressed', String(i === current));
    const c = document.createElement('canvas');
    c.width = c.height = F;
    c.getContext('2d')!.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
    const n = document.createElement('span');
    n.textContent = String(i + 1);
    b.append(c, n);
    b.addEventListener('click', () => {
      current = i;
      draw();
      renderFrames();
      sync();
    });
    box.append(b);
  });
}
function pickTool(next: Tool) {
  tool = next;
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => {
    b.classList.toggle('on', b.dataset.tool === tool);
    b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  });
}
function cell(e: PointerEvent): [number, number] {
  const r = board.getBoundingClientRect();
  return [
    Math.floor(((e.clientX - r.left) * F) / r.width),
    Math.floor(((e.clientY - r.top) * F) / r.height),
  ];
}
function paint(point: [number, number]) {
  const colour: [number, number, number, number] =
    tool === 'eraser' ? [0, 0, 0, 0] : [...hexRgb(selectedColour), 255];
  if (tool === 'fill') {
    fill(frames[current], ...point, colour);
    if (input('symmetry').checked) fill(frames[current], F - 1 - point[0], point[1], colour);
  } else
    stroke(
      frames[current],
      last ?? point,
      point,
      colour,
      +select('brush').value,
      input('symmetry').checked,
    );
  last = point;
  draw();
}
board.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || loading) return;
  e.preventDefault();
  const p = cell(e);
  if (p[0] < 0 || p[1] < 0 || p[0] >= F || p[1] >= F) return;
  if (tool === 'picker') {
    const i = (p[1] * F + p[0]) * 4;
    if (frames[current][i + 3])
      setColour(rgbHex(...([...frames[current].slice(i, i + 3)] as [number, number, number])));
    pickTool('pencil');
    return;
  }
  checkpoint();
  drawing = true;
  last = undefined;
  board.setPointerCapture(e.pointerId);
  paint(p);
});
board.addEventListener('pointermove', (e) => {
  if (drawing && tool !== 'fill') paint(cell(e));
});
const endStroke = () => {
  if (drawing) {
    drawing = false;
    last = undefined;
    changed();
  }
};
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);
board.addEventListener('lostpointercapture', endStroke);
document
  .querySelectorAll<HTMLElement>('[data-tool]')
  .forEach((b) => b.addEventListener('click', () => pickTool(b.dataset.tool as Tool)));
input('colour').addEventListener('input', () => setColour(input('colour').value));
for (const id of ['grid', 'guide', 'onion']) input(id).addEventListener('change', draw);
for (const id of ['person', 'race', 'sex'])
  select(id).addEventListener('change', () => {
    void openPortrait();
  });
$('undo').addEventListener('click', () => history(true));
$('redo').addEventListener('click', () => history(false));
for (const [id, make] of [
  ['headShape', () => portraitPixels(body, false)],
  ['defaultFace', () => defaultPortrait(body)],
  ['clearFrame', () => new Uint8ClampedArray(PX)],
] as const)
  $(id).addEventListener('click', () => {
    checkpoint();
    frames[current] = make();
    buildPalette();
    changed();
  });
for (const id of ['addFrame', 'duplicateFrame'])
  $(id).addEventListener('click', () => {
    if (frames.length >= 16) return;
    checkpoint();
    frames.splice(
      current + 1,
      0,
      id === 'addFrame' ? new Uint8ClampedArray(PX) : frames[current].slice(),
    );
    current++;
    changed();
  });
$('deleteFrame').addEventListener('click', () => {
  if (frames.length <= 1) return;
  checkpoint();
  frames.splice(current, 1);
  current = Math.min(current, frames.length - 1);
  changed();
});
for (const [id, offset] of [
  ['moveLeft', -1],
  ['moveRight', 1],
] as const)
  $(id).addEventListener('click', () => {
    const next = current + offset;
    if (next < 0 || next >= frames.length) return;
    checkpoint();
    [frames[current], frames[next]] = [frames[next], frames[current]];
    current = next;
    changed();
  });
for (const id of ['fps', 'loops', 'rest'])
  input(id).addEventListener('change', () => {
    checkpoint();
    const clamp = (n: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
    timing = {
      fps: clamp(+input('fps').value, 1, 12),
      loops: clamp(+input('loops').value, 1, 6),
      restMs: clamp(+input('rest').value, 1, 10) * 1000,
    };
    syncTiming();
    changed();
  });
$('publish').addEventListener('click', () => {
  flushDraft();
  try {
    writePortrait(person, entry());
    message('Portrait is now used in the game.');
    $('saveStatus').textContent = 'Published · saved in this browser.';
  } catch (e) {
    message(
      `Portrait could not be published. ${e instanceof Error ? e.message : 'Save a project file to keep your painting.'}`,
    );
  }
});
$('hallLink').addEventListener('click', () => {
  flushDraft();
  try {
    sessionStorage.setItem(RETURN_KEY, 'changing');
  } catch {
    /* return location is optional */
  }
});
$('playPreview').addEventListener('click', () => {
  playing = !playing;
  started = performance.now();
  $('playPreview').textContent = playing ? 'Pause preview' : 'Play preview';
});
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportProject').addEventListener('click', () =>
  download(
    `${body}-portrait.json`,
    new Blob([JSON.stringify({ app: 'portrait-studio', version: 1, portrait: entry() }, null, 2)], {
      type: 'application/json',
    }),
  ),
);
$('exportPng').addEventListener('click', () => {
  const sheet = document.createElement('canvas');
  sheet.width = F * frames.length;
  sheet.height = F;
  const c = sheet.getContext('2d')!;
  frames.forEach((f, i) => c.putImageData(new ImageData(f.slice(), F, F), i * F, 0));
  sheet.toBlob((blob) => {
    if (blob) download(`${body}-portrait.png`, blob);
  });
});
async function importFrames(p: Portrait) {
  const identity = portraitKey(body, person),
    buffers = await Promise.all(p.frames.map(decode));
  if (identity !== portraitKey(body, person)) return;
  checkpoint();
  frames = buffers;
  current = 0;
  buildPalette();
  timing = { fps: p.fps, loops: p.loops, restMs: p.restMs };
  syncTiming();
  changed();
  message('Portrait imported into the current character. Undo restores your previous frames.');
}
input('importProject').addEventListener('change', async () => {
  const file = input('importProject').files?.[0];
  if (!file) return;
  try {
    if (file.size > 4_000_000) throw Error('Portrait project is too large.');
    const p = JSON.parse(await file.text());
    if (p.app !== 'portrait-studio' || p.version !== 1 || !validPortrait(p.portrait))
      throw Error('Choose a Portrait Studio project with 1–16 frames.');
    await importFrames(p.portrait);
  } catch (e) {
    message(e instanceof Error ? e.message : 'Could not open portrait project.');
  } finally {
    input('importProject').value = '';
  }
});
input('importPng').addEventListener('change', async () => {
  const file = input('importPng').files?.[0];
  if (!file) return;
  const identity = portraitKey(body, person),
    url = URL.createObjectURL(file);
  try {
    if (file.size > 4_000_000) throw Error('PNG strip is too large.');
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      image.naturalHeight !== F ||
      image.naturalWidth % F ||
      image.naturalWidth < F ||
      image.naturalWidth > F * 16
    )
      throw Error('Use a PNG 64 pixels high, with 1–16 square frames across.');
    if (identity !== portraitKey(body, person)) return;
    const sheet = document.createElement('canvas');
    sheet.width = image.naturalWidth;
    sheet.height = F;
    const c = sheet.getContext('2d')!;
    c.drawImage(image, 0, 0);
    checkpoint();
    frames = Array.from(
      { length: image.naturalWidth / F },
      (_, i) => c.getImageData(i * F, 0, F, F).data,
    );
    current = 0;
    buildPalette();
    changed();
    message('PNG frames imported. Undo restores your previous painting.');
  } catch (e) {
    message(e instanceof Error ? e.message : 'Could not import PNG.');
  } finally {
    URL.revokeObjectURL(url);
    input('importPng').value = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (loading) return;
  if ((e.target as HTMLElement).matches('input,select,textarea,[contenteditable="true"]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    history(!e.shiftKey);
    return;
  }
  if (!e.ctrlKey && !e.metaKey) {
    const keys: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };
    if (keys[e.key.toLowerCase()]) {
      e.preventDefault();
      pickTool(keys[e.key.toLowerCase()]);
    }
  }
});
window.addEventListener('beforeunload', () => {
  if (saveTimer) flushDraft();
});
function animate(ms: number) {
  const p = playing
    ? portraitPlayback(ms - started, frames.length, timing)
    : { frame: 0, resting: true, loop: 0 };
  $<HTMLCanvasElement>('portraitPreview')
    .getContext('2d')!
    .putImageData(new ImageData(frames[p.frame].slice(), F, F), 0, 0);
  $('portraitPreview').dataset.frame = String(p.frame);
  $('portraitPreview').dataset.resting = String(p.resting);
  $('previewStatus').textContent =
    frames.length === 1
      ? 'Still portrait · frame 1'
      : !playing
        ? 'Preview paused · frame 1'
        : p.resting
          ? `Resting on frame 1 · ${timing.restMs / 1000} seconds`
          : `Loop ${p.loop} / ${timing.loops} · frame ${p.frame + 1}`;
  requestAnimationFrame(animate);
}
for (const r of RACE_IDS) {
  const o = new Option(RACES[r].label, r);
  select('race').add(o);
}
for (const s of SEX_IDS) select('sex').add(new Option(SEXES[s].label, s));
select('person').add(new Option('Your character', 'player'));
for (const g of GHOSTS) select('person').add(new Option(g.character.name, g.id));
select('person').value = person;
select('race').value = race;
select('sex').value = sex;
void openPortrait(false).then(() => requestAnimationFrame(animate));
