// 刻声 · P1 原型主程序：刻（录音+实时刻纹）→ 搓（手按盘面）→ 测（拍手取声场）→ 借（卷积）→ 寻（指纹）。
// 声片柜在 P1 只存在内存里；IndexedDB、导入导出、校园平面见 docs/tickets/。
import { DiscRenderer, carriageY } from './disc.js';
import { GrooveCutter, cutWhole, padToTurns, TURN, MAX_SEC } from './groove.js';
import { analyzeClap, describeRT60 } from '../dsp/rt60.js';
import { stft } from '../dsp/stft.js';
import { fingerprintFrames, FingerprintIndex } from '../dsp/fingerprint.js';
import { Listener, words, resumeAt, MAX_LISTEN } from './find.js';
import { synthChimes, synthIR, encodeWav } from '../dsp/synth.js';
import { all as allDiscs, put as putDisc, del as delDisc, clearAll as clearDiscs,
  fromRecord, estimate as storageEstimate, persist as storagePersist, SCHEMA, KINDS } from './store.js';
import { labelOf } from './tier.js';
import { makeZip, readZip } from './zip.js';
import { weekTag } from './calendar.js';
import { renderPlan, blockById } from './plan.js';
import { slotOf } from './slot.js';
import { uniqueStems } from './naming.js';
import { pickMedian } from './median.js';
import { sidecar, wavBytes, sha256Hex, buildSubmission } from './submit.js';
import { snapshot, signature } from './identity.js';
import * as lib from './library.js';

const $ = (id) => document.getElementById(id);
const els = {
  disc: $('disc'), platter: $('platter'), carriage: $('carriage'), ticks: $('rail-ticks'),
  rec: $('btn-rec'), recText: $('rec-text'), spin: $('btn-spin'), room: $('btn-room'), find: $('btn-find'),
  tagNo: $('tag-no'), place: $('place'), meta: $('meta'), hint: $('hint'),
  labelPlace: $('label-place'), labelNo: $('label-no'),
  status: $('status'), decay: $('decay'), decayRead: $('decay-read'), decayPlot: $('decay-plot'),
  shelf: $('shelf-list'), count: $('shelf-count'), save: $('save'), saveForm: $('save-form'),
  hereRadio: document.querySelector('input[name="room"][value="here"]'),
  storeStat: $('store-stat'), clear: $('btn-clear'), cabExp: $('btn-cab-export'),
  cabImp: $('btn-cab-import'), cabFile: $('cab-file'),
  planRoot: $('plan-root'), planNote: $('plan-note'), planAll: $('btn-plan-clear'),
  campusXY: $('btn-campus-xy'), campusSH: $('btn-campus-sh'), pinBlock: $('pin-block'),
  srcMine: $('btn-src-mine'), srcArch: $('btn-src-arch'), shelfTools: document.querySelector('.shelf-tools'),
};

const renderer = new DiscRenderer(els.disc);
const index = new FingerprintIndex();
const shelf = [];
let current = null;
let seq = 1;
let storeMode = 'unknown';   // 'idb' | 'memory'
let storeError = '';
let persistState = 'unknown'; // 'granted' | 'denied' | 'unsupported' | 'unknown'
let askedPersist = false;
let calendar = null;          // data/calendar.json；取不到就一直是 null → 档案号走 W-- 降级
let places = null;            // data/places.json；区块划分目前是草稿（用户定稿后改这份文件）
let campusCode = 'XY';
let blockFilter = null;       // 平面点选的区块 id；null = 看全部
let source = 'mine';          // 'mine' 我的柜子 | 'archive' 馆藏（只读）
let archiveCatalog = null;    // archive/catalog.json；取不到就是 null，馆藏页签置灰
let archiveShelf = [];        // 已解码的馆藏声片缓存（按 id）
let places3d = null;          // data/places-xy.json：分区图上的地点（存盘时可以钉上去）

// —— 音频图 ——
let ctx = null, player = null, master = null, dryGain = null, wetGain = null, convolver = null;
const irs = {};
let report = { pos: 0, rate: 0, t: 0 };
let motorOn = false;
let busy = null; // 'rec' | 'room' | 'find'

async function ensureAudio() {
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return ctx; }
  ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule(new URL('../worklets/scratch.js', import.meta.url));
  await ctx.audioWorklet.addModule(new URL('../worklets/capture.js', import.meta.url));
  player = new AudioWorkletNode(ctx, 'kesheng-scratch', { numberOfInputs: 0, outputChannelCount: [2] });
  player.port.onmessage = (e) => { report = e.data; };
  master = ctx.createGain();
  dryGain = ctx.createGain();
  wetGain = ctx.createGain();
  convolver = ctx.createConvolver();
  player.connect(dryGain).connect(master);
  player.connect(convolver).connect(wetGain).connect(master);
  master.connect(ctx.destination);
  irs.small = toBuffer(synthIR({ fs: ctx.sampleRate, rt60: 0.55, seed: 3 }), ctx.sampleRate);
  irs.hall = toBuffer(synthIR({ fs: ctx.sampleRate, rt60: 2.4, seed: 9 }), ctx.sampleRate);
  applyRoom();
  if (current) sendDisc(current);
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}

function toBuffer(pcm, fs) {
  const b = new AudioBuffer({ length: pcm.length, numberOfChannels: 1, sampleRate: fs });
  b.copyToChannel(pcm, 0);
  return b;
}

function sendDisc(d) {
  if (!player) return;
  player.port.postMessage({ buffer: d.pcm, sampleRate: d.fs });
  report = { pos: 0, rate: 0, t: ctx.currentTime };
  player.port.postMessage({ motor: motorOn ? 1 : 0 });
}

function selectedRoom() { return document.querySelector('input[name="room"]:checked').value; }

function applyRoom() {
  if (!ctx) return;
  const room = selectedRoom();
  const ir = room === 'dry' ? null : irs[room];
  const t = ctx.currentTime;
  if (ir) {
    convolver.buffer = ir;
    dryGain.gain.setTargetAtTime(0.45, t, 0.03);
    wetGain.gain.setTargetAtTime(room === 'here' ? 1.4 : 0.9, t, 0.03);
  } else {
    dryGain.gain.setTargetAtTime(1, t, 0.03);
    wetGain.gain.setTargetAtTime(0, t, 0.03);
  }
}
document.querySelectorAll('input[name="room"]').forEach((r) => r.addEventListener('change', () => { ensureAudio().then(applyRoom); }));

function mute(on) {
  if (master) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.02);
}

/** 当前播放位置（秒，0…dur），从 worklet 的回报外推。 */
function playSeconds() {
  if (!current || !ctx) return 0;
  const n = current.pcm.length;
  let p = report.pos + report.rate * current.fs * Math.max(0, ctx.currentTime - report.t);
  p = ((p % n) + n) % n;
  return p / current.fs;
}

// —— 声片 ——
function makeDisc(pcm, fs, fields) {
  const padded = padToTurns(pcm, fs);
  const cut = fields.tex ? { tex: fields.tex, prints: fields.prints } : cutWhole(padded, fs);
  return {
    ...fields,
    id: fields.id || crypto.randomUUID(),
    pcm: padded,
    fs,
    tex: new Uint8Array(cut.tex),
    prints: cut.prints,
    dur: padded.length / fs,
    seconds: Math.min(pcm.length / fs, MAX_SEC),
  };
}

function addToShelf(d) {
  shelf.unshift(d);
  index.add(d.id, d.prints);
  renderShelf();
  if (d.id !== 'demo-chimes') rememberDisc(d);
}

/** 归档即落库；写不进去就明说「只在内存里」，不假装成功。 */
async function rememberDisc(d) {
  try {
    await putDisc(d);
    if (!askedPersist) { askedPersist = true; persistState = await storagePersist(); }
  } catch (err) {
    storeMode = 'memory';
    storeError = (err && err.message) || String(err);
    say(`这张只在内存里：本地库写不进去（${storeError}）。`);
  }
  updateStoreStat();
}

async function updateStoreStat() {
  if (!els.storeStat) return;
  const n = shelf.filter((d) => d.id !== 'demo-chimes').length;
  const est = await storageEstimate();
  const mb = est && typeof est.usage === 'number' ? `${(est.usage / 1048576).toFixed(1)} MB` : '大小未知';
  const where = storeMode === 'memory' ? '只在内存里，刷新就没了' : '存在这台设备上';
  const extra = persistState === 'granted' ? '，已申请持久化' : persistState === 'denied' ? '，持久化被拒（数据仍会留，但可能被清理）' : '';
  els.storeStat.textContent = `这台设备上存了 ${n} 张，占 ${mb}。${where}${extra}`;
  window.__ks.store = { n, usage: est && est.usage, mode: storeMode, persist: persistState };
}

function load(d, { keepMotor = true } = {}) {
  current = d;
  renderer.setGroove(d.tex);
  els.tagNo.textContent = d.no;
  els.place.textContent = d.place;
  els.meta.textContent = d.meta;
  els.labelPlace.textContent = d.place;
  els.labelNo.textContent = d.no;
  if (!keepMotor) setMotor(false);
  sendDisc(d);
  renderShelf();
  window.__ks.current = { id: d.id, place: d.place, no: d.no, seconds: d.seconds };
}

function renderShelf() {
  if (source === 'archive') { renderArchive(); return; }
  els.shelf.replaceChildren();
  const shown = blockFilter ? shelf.filter((d) => d.pin && d.pin.blockId === blockFilter) : shelf;
  els.count.textContent = blockFilter ? `这片 ${shown.length} 张 / 共 ${shelf.length} 张` : `柜里 ${shelf.length} 张`;
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'shelf-empty';
    li.textContent = blockFilter ? '这里还没有声片，去刻一张。' : '柜子是空的。按住“按住刻十秒”刻第一张。';
    els.shelf.append(li);
    return;
  }
  for (const d of shown) {
    const li = document.createElement('li');
    if (current && d.id === current.id) li.setAttribute('aria-current', 'true');
    const loadBtn = document.createElement('button');
    loadBtn.className = 'load';
    loadBtn.type = 'button';
    loadBtn.innerHTML = `<span class="p"></span><span class="n"></span>`;
    loadBtn.querySelector('.p').textContent = d.place;
    loadBtn.querySelector('.n').textContent = `${d.no}，${d.seconds.toFixed(1)} 秒`;
    loadBtn.addEventListener('click', () => { ensureAudio().then(() => load(d)); });
    const exp = document.createElement('button');
    exp.className = 'mini'; exp.type = 'button'; exp.textContent = '导出';
    exp.setAttribute('aria-label', `导出 ${d.place} 的 WAV`);
    exp.addEventListener('click', () => exportWav(d));
    const del = document.createElement('button');
    del.className = 'mini'; del.type = 'button'; del.textContent = '删除';
    del.setAttribute('aria-label', `删除 ${d.place}`);
    del.addEventListener('click', () => removeDisc(d));
    if (d.id === 'demo-chimes') {
      li.append(loadBtn, exp, del);
    } else {
      const sub = document.createElement('button');
      sub.className = 'mini'; sub.type = 'button'; sub.textContent = '投稿';
      sub.setAttribute('aria-label', `导出 ${d.place} 的投稿包`);
      sub.addEventListener('click', () => exportSubmission(d));
      li.append(loadBtn, sub, exp, del);
    }
    els.shelf.append(li);
  }
}

// —— 平面（T-02 / D5）——
function currentCampus() {
  return places ? places.campuses.find((c) => c.code === campusCode) || null : null;
}

function pinCounts() {
  const m = new Map();
  for (const d of shelf) {
    const id = d.pin && d.pin.blockId;
    if (id) m.set(id, (m.get(id) || 0) + 1);
  }
  return m;
}

function updatePlanNote() {
  if (!els.planNote) return;
  const b = blockFilter ? blockById(currentCampus(), blockFilter) : null;
  els.planNote.textContent = b ? `正在看「${b.name}」这一片。再点一次回到全部。` : '点一个区块，只看那一片的声片。';
}

function renderPlanView() {
  if (!els.planRoot) return;
  renderPlan(els.planRoot, currentCampus(), {
    pins: pinCounts(),
    selected: blockFilter,
    onBlock: (id) => { blockFilter = id; renderPlanView(); renderShelf(); },
  });
  updatePlanNote();
}

function fillPinOptions() {
  if (!els.pinBlock) return;
  els.pinBlock.replaceChildren();
  const none = document.createElement('option');
  none.value = ''; none.textContent = '不钉';
  els.pinBlock.append(none);
  for (const camp of (places && places.campuses) || []) {
    const g = document.createElement('optgroup');
    g.label = camp.name;
    for (const b of camp.blocks) {
      const o = document.createElement('option');
      o.value = `${camp.code}:${b.id}`;
      o.textContent = `${b.id} ${b.name}`;
      g.append(o);
    }
    els.pinBlock.append(g);
  }
}

function applyPin(d, value) {
  if (!value || !places) { d.pin = null; return; }
  const [code, blockId] = String(value).split(':');
  const camp = places.campuses.find((c) => c.code === code);
  const b = blockById(camp, blockId);
  d.pin = b ? { campus: camp.name, blockId, x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
}

// —— 平面（结束）——

// —— 馆藏（只读，ARCHIVE-T1 §3）——
function accessioned() {
  if (!archiveCatalog || !Array.isArray(archiveCatalog.entries)) return [];
  return archiveCatalog.entries.filter((e) => e.status === 'accessioned');
}

function renderArchive() {
  els.shelf.replaceChildren();
  const list = accessioned();
  els.count.textContent = `馆藏 ${list.length} 张`;
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'shelf-empty';
    li.textContent = archiveCatalog ? '馆藏里还没有入藏的声片。' : '还没有接上馆藏目录（archive/catalog.json）。';
    els.shelf.append(li);
    return;
  }
  for (const e of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'load';
    btn.type = 'button';
    btn.innerHTML = '<span class="p"></span><span class="n"></span>';
    btn.querySelector('.p').textContent = e.place;
    // 空着的时段/类型不许留成「， ，」；类型的唯一中文来源是 store.js 的 KINDS（与投稿同一套）
    const bits = [e.no];
    if (e.slot) bits.push(e.slot);
    if (e.kind && KINDS[e.kind]) bits.push(KINDS[e.kind]);
    bits.push(`${Number(e.seconds || 0).toFixed(1)} 秒`);
    const mark = labelOf(e);                       // 「史料」角标的唯一来源（tier.js）
    btn.querySelector('.n').textContent = bits.join('，') + (mark ? ` · ${mark}` : '');
    btn.addEventListener('click', () => loadArchive(e));
    li.append(btn);
    els.shelf.append(li);
  }
}

async function loadArchive(e) {
  await ensureAudio();
  let d = archiveShelf.find((x) => x.id === e.id);
  if (!d) {
    try {
      // 音频路径以条目上的 file 为准（史料是 mp3，投稿盘是 <no>.wav）；老条目没有 file 就还按 <no>.wav 取。
      const res = await fetch(`./archive/${e.file || `audio/${encodeURIComponent(e.no)}.wav`}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      d = makeDisc(buf.getChannelData(0).slice(), buf.sampleRate, {
        id: e.id, place: e.place, campus: e.campus, note: e.note || '', at: e.at,
      });
      d.no = e.no;
      d.slot = e.slot || null;
      d.kind = e.kind || null;
      d.status = e.status;
      d.archive = e.archive || null;
      const bits = [e.campus];
      if (e.slot) bits.push(e.slot);
      if (e.kind && KINDS[e.kind]) bits.push(KINDS[e.kind]);
      d.meta = `馆藏，${bits.join('，')}。`;
      archiveShelf.push(d);
    } catch (err) {
      say(`馆藏音频取不到：${e.no}（${(err && err.message) || err}）`);
      return;
    }
  }
  load(d);
  const mark = d.tier === 'archival' || e.tier === 'archival' ? '（史料）' : '';
  say(`馆藏：${d.no}。${d.place}${mark}${d.slot ? '，' + d.slot : ''}。`);
}

function setSource(next) {
  source = next;
  if (els.srcMine) els.srcMine.setAttribute('aria-pressed', String(next === 'mine'));
  if (els.srcArch) els.srcArch.setAttribute('aria-pressed', String(next === 'archive'));
  if (els.shelfTools) els.shelfTools.hidden = next === 'archive';
  renderShelf();
}

// —— 馆藏（结束）——

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 投稿包：WAV + 侧车 JSON + 同意书 + 回执（submit.js，与分区图共用）。页面不上传，由投稿人自己发出去（ARCHIVE-T1 §2）。 */
async function exportSubmission(d) {
  if (!d.author) d.author = snapshot(lib.ensureMe());
  const pack = await buildSubmission(d);
  d.submittedAt = new Date().toISOString();
  rememberDisc(d);
  downloadBlob(pack.name, pack.blob);
  say(`已导出投稿包：${d.no}（落款「${signature(d.author)}」，回执在包里）。发给馆员即可，页面不会上传。`);
}

function exportWav(d) {
  downloadBlob(`${d.no}.wav`, new Blob([wavBytes(d)], { type: 'audio/wav' }));
  downloadBlob(`${d.no}.json`, new Blob([JSON.stringify(sidecar(d), null, 2)], { type: 'application/json' }));
  say(`已导出 ${d.no}.wav 与同名 JSON。`);
}

async function exportCabinet() {
  const discs = shelf.filter((d) => d.id !== 'demo-chimes');   // 试音盘是合成的，不进包
  if (!discs.length) { say('柜里没有可导出的声片（试音盘不算）。'); return; }
  const stems = uniqueStems(discs);                            // 撞名的从第二份起加 -2；否则 zip 里互相覆盖
  const files = [];
  discs.forEach((d, i) => {
    files.push({ name: `${stems[i]}.wav`, data: wavBytes(d) });
    files.push({ name: `${stems[i]}.json`, data: new TextEncoder().encode(JSON.stringify(sidecar(d), null, 2)) });
  });
  const zip = await makeZip(files);
  downloadBlob(`刻声声片柜-${new Date().toISOString().slice(0, 10)}.zip`, new Blob([zip], { type: 'application/zip' }));
  say(`已导出整柜：${discs.length} 张。`);
}

async function importCabinet(file) {
  let added = 0, skipped = 0;
  try {
    const files = await readZip(new Uint8Array(await file.arrayBuffer()));
    const jsons = [...files.keys()].filter((n) => n.endsWith('.json'));
    if (!jsons.length) { say('这个 zip 里没有声片清单（.json）。'); return; }
    await ensureAudio();
    for (const jn of jsons) {
      let meta;
      try { meta = JSON.parse(new TextDecoder().decode(files.get(jn))); } catch { skipped++; continue; }
      const wav = files.get(meta.wav || jn.replace(/\.json$/, '.wav'));
      if (!wav) { skipped++; continue; }
      const rate = Number(meta.fs) || 48000;
      const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(wav.slice().buffer);
      const pcm = buf.getChannelData(0).slice();
      const d = makeDisc(pcm, rate, { place: meta.place || '未写地点', campus: meta.campus || '学院路', note: meta.note || '', at: meta.at || new Date().toISOString() });
      if (Array.isArray(meta.prints) && meta.prints.length) d.prints = meta.prints;
      if (meta.no) d.no = meta.no;
      d.week = meta.week ?? null;
      d.semester = meta.semester || null;
      d.meta = meta.note ? `${d.campus}。${meta.note}` : `导入，${d.seconds.toFixed(1)} 秒`;
      addToShelf(d);
      added++;
    }
    if (!current) load(shelf[0]);
    say(skipped ? `导入 ${added} 张，跳过 ${skipped} 条读不懂的。` : `导入 ${added} 张。`);
  } catch (err) {
    say(`导入失败：${(err && err.message) || err}`);
  }
}

async function clearDevice() {
  const n = shelf.filter((d) => d.id !== 'demo-chimes').length;
  if (!n) { say('柜里已经是空的。'); return; }
  const word = prompt(`这会删掉这台设备上的 ${n} 张声片，不能撤销。\n输入「清空」两个字确认。`);
  if (word !== '清空') { say('没删：要输入「清空」两个字才删。'); return; }
  try { await clearDiscs(); } catch { /* 内存模式本来就没写库 */ }
  for (const d of shelf.slice()) {
    if (d.id === 'demo-chimes') continue;
    const i = shelf.indexOf(d);
    if (i >= 0) shelf.splice(i, 1);
    index.remove(d.id);
  }
  if (current && current.id !== 'demo-chimes' && shelf[0]) load(shelf[0]);
  renderShelf();
  updateStoreStat();
  say('这台设备上的声片已清空。');
}

let pendingDelete = null;
function removeDisc(d) {
  const i = shelf.indexOf(d);
  if (i < 0) return;
  if (pendingDelete) clearTimeout(pendingDelete.timer);
  shelf.splice(i, 1);
  index.remove(d.id);
  renderShelf();
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = '撤销';
  undo.addEventListener('click', () => {
    clearTimeout(pendingDelete.timer);
    shelf.splice(Math.min(i, shelf.length), 0, d);
    index.add(d.id, d.prints);
    pendingDelete = null;
    renderShelf();
    say(`已放回 ${d.place}`);
  });
  els.status.replaceChildren(document.createTextNode(`已删除 ${d.place}。`), undo);
  pendingDelete = { d, timer: setTimeout(async () => {
    pendingDelete = null;
    if (els.status.contains(undo)) say('');
    // 5 秒后再真删：撤销窗口内什么都没写，撤销就是纯内存操作
    if (d.id !== 'demo-chimes') { try { await delDisc(d.id); } catch { /* 库不可用时本来就没写进去 */ } }
    updateStoreStat();
  }, 5000) };
}

function say(text) { els.status.textContent = text; }

// —— 电机 ——
function setMotor(on) {
  motorOn = on;
  els.spin.setAttribute('aria-pressed', String(on));
  els.spin.textContent = on ? '停下' : '转起来';
  if (player) player.port.postMessage({ motor: on ? 1 : 0 });
}
els.spin.addEventListener('click', async () => { await ensureAudio(); setMotor(!motorOn); });

// —— 搓盘：手按盘面 ——
let grab = null;
function pointerAngle(e) {
  const r = els.disc.getBoundingClientRect();
  const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
  return { psi: Math.atan2(x, -y), dist: Math.hypot(x, y) / (r.width / 2), lx: x / (r.width / 2), ly: -y / (r.width / 2) };
}
let light = [-0.62, 0.78];

els.disc.addEventListener('pointerdown', async (e) => {
  if (busy || !current) return;
  const a = pointerAngle(e);
  if (a.dist > 1) return;
  els.disc.setPointerCapture(e.pointerId);
  e.preventDefault();
  const firstAudio = !ctx;
  await ensureAudio();
  const pos0 = firstAudio ? 0 : playSeconds() * current.fs;
  grab = { id: e.pointerId, start: performance.now(), x: e.clientX, y: e.clientY, moved: 0,
    last: a.psi, turn: 0, pos0, target: pos0, vel: 0, lastT: performance.now() };
  player.port.postMessage({ hold: { target: pos0, vel: 0, t: ctx.currentTime } });
});

els.disc.addEventListener('pointermove', (e) => {
  const a = pointerAngle(e);
  if (a.dist <= 1.15) light = norm([a.lx, a.ly]);
  if (!grab || e.pointerId !== grab.id) return;
  let d = a.psi - grab.last;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  grab.last = a.psi;
  grab.turn += d;
  grab.moved = Math.max(grab.moved, Math.hypot(e.clientX - grab.x, e.clientY - grab.y));
  const now = performance.now();
  const target = grab.pos0 + (grab.turn / (2 * Math.PI)) * TURN * current.fs;
  const dt = Math.max(1, now - grab.lastT) / 1000;
  const v = (target - grab.target) / dt;
  grab.vel = grab.vel * 0.4 + v * 0.6;
  grab.target = target;
  grab.lastT = now;
  player.port.postMessage({ hold: { target, vel: grab.vel, t: ctx.currentTime } });
});

function release(e) {
  if (!grab || (e && e.pointerId !== grab.id)) return;
  const click = grab.moved < 5 && performance.now() - grab.start < 300;
  grab = null;
  if (player) player.port.postMessage({ hold: null });
  if (click) setMotor(!motorOn);
}
els.disc.addEventListener('pointerup', release);
els.disc.addEventListener('pointercancel', release);
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

// 键盘：空格转/停；←/→ 跳 0.5 秒；Shift+← 按住倒放
let keyHold = false;
els.disc.addEventListener('keydown', async (e) => {
  if (busy || !current) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); await ensureAudio(); setMotor(!motorOn); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    await ensureAudio();
    if (e.shiftKey && e.key === 'ArrowLeft') {
      if (!keyHold) { keyHold = true; player.port.postMessage({ hold: { target: playSeconds() * current.fs, vel: -current.fs, t: ctx.currentTime } }); }
      return;
    }
    const s = playSeconds() + (e.key === 'ArrowRight' ? 0.5 : -0.5);
    player.port.postMessage({ seek: (((s % current.dur) + current.dur) % current.dur) / current.dur });
  }
});
els.disc.addEventListener('keyup', (e) => {
  if (keyHold && (e.key === 'ArrowLeft' || e.key === 'Shift')) { keyHold = false; player.port.postMessage({ hold: null }); }
});

// —— 麦克风 ——
const MIC = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };

async function openMic() {
  await ensureAudio();
  const stream = await navigator.mediaDevices.getUserMedia(MIC);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'kesheng-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  src.connect(node).connect(sink).connect(ctx.destination);
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings ? track.getSettings() : {};
  return {
    node, settings,
    close() {
      node.port.postMessage('stop');
      node.port.onmessage = null;
      src.disconnect(); node.disconnect(); sink.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

function micError(err) {
  if (err && err.name === 'NotAllowedError') return '浏览器没有允许使用麦克风。点地址栏左侧的图标，把麦克风改成允许，再试一次。也可以把一个音频文件拖到盘上。';
  if (err && err.name === 'NotFoundError') return '这台电脑没有找到麦克风。可以把一个音频文件拖到盘上刻成声片。';
  if (!window.isSecureContext) return '麦克风只能在 https 或 localhost 页面上使用。';
  return `麦克风打不开：${err && err.message ? err.message : '未知原因'}。`;
}

// —— ① 刻盘 ——
let rec = null; // {mic, cutter, chunks, n, mode, held}
els.rec.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); startRec('hold'); } });
els.rec.addEventListener('pointerup', () => { if (rec && rec.mode === 'hold') stopRec(); else if (rec) rec.released = true; });
els.rec.addEventListener('pointerleave', () => { if (rec && rec.mode === 'hold' && rec.mic) stopRec(); });
els.rec.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  if (e.repeat) return;
  if (rec) stopRec(); else startRec('toggle');
});
els.rec.addEventListener('click', (e) => e.preventDefault());

async function startRec(mode) {
  if (busy) { if (busy === 'rec' && rec && rec.mode === 'toggle') stopRec(); return; }
  busy = 'rec';
  rec = { mode, chunks: [], n: 0, mic: null, released: false };
  els.recText.textContent = '正在打开麦克风…';
  try {
    const mic = await openMic();
    if (!rec) { mic.close(); return; }
    // 权限弹窗会吞掉“按住”；如果打开麦克风前已经松手，改成“再按一次停止”
    if (rec.mode === 'hold' && rec.released) rec.mode = 'toggle';
    rec.mic = mic;
    rec.cutter = new GrooveCutter(ctx.sampleRate);
    rec.fs = ctx.sampleRate;
    setMotor(false);
    mute(true);
    renderer.setGroove(null);
    current = null;
    els.rec.classList.add('is-rec');
    els.carriage.classList.add('is-cutting');
    els.recText.textContent = rec.mode === 'toggle' ? '再按一次停止' : '松手停止';
    say('正在刻。');
    window.__ks.mic = mic.settings;
    mic.node.port.onmessage = ({ data }) => {
      if (!rec || !rec.mic) return;
      const max = Math.round(MAX_SEC * rec.fs);
      const s = data.samples.subarray(0, Math.max(0, Math.min(data.samples.length, max - rec.n)));
      if (s.length) {
        rec.chunks.push(s);
        rec.n += s.length;
        rec.cutter.push(s, (i, col) => renderer.cutColumn(i, col));
      }
      if (rec.n >= max) stopRec();
    };
  } catch (err) {
    say(micError(err));
    resetRecButton();
    rec = null;
    busy = null;
  }
}

function resetRecButton() {
  els.rec.classList.remove('is-rec');
  els.carriage.classList.remove('is-cutting');
  els.recText.textContent = '按住刻十秒';
}

function stopRec() {
  if (!rec) return;
  const r = rec;
  rec = null;
  if (!r.mic) { r.released = true; rec = r; return; } // 麦克风还没开：等它开了再按“再按一次停止”
  r.mic.close();
  resetRecButton();
  mute(false);
  busy = null;
  const seconds = r.n / r.fs;
  if (seconds < 1) {
    say('录得太短了。按住按钮至少一秒。');
    if (shelf[0]) load(shelf[0]);
    return;
  }
  const pcm = new Float32Array(r.n);
  let o = 0;
  for (const c of r.chunks) { pcm.set(c, o); o += c.length; }
  const { tex, prints } = r.cutter.finish();
  const now = new Date();
  const d = makeDisc(pcm, r.fs, { tex, prints, place: '未写地点', campus: '学院路', note: '', at: now.toISOString() });
  d.meta = `${now.getMonth() + 1} 月 ${now.getDate()} 日${slotOf(now)}，${seconds.toFixed(1)} 秒`;
  d.no = `未编-${slotOf(now)}-${String(seq).padStart(2, '0')}`;
  load(d);
  setMotor(true);
  say(`刻好了，${seconds.toFixed(1)} 秒。写上地点就能归档。`);
  window.__ks.lastRec = { seconds, frames: r.cutter.count, prints: prints.length, fs: r.fs };
  openSave(d);
}

function openSave(d) {
  els.saveForm.reset();
  fillPinOptions();
  els.save.returnValue = '';
  els.save.showModal();
  els.save.addEventListener('close', async function onClose() {
    els.save.removeEventListener('close', onClose);
    const fd = new FormData(els.saveForm);
    const ok = els.save.returnValue === 'ok';
    const place = ok && fd.get('place') ? String(fd.get('place')).trim() : '未写地点';
    const campus = String(fd.get('campus') || '学院路');
    const note = ok ? String(fd.get('note') || '').trim() : '';
    const at = new Date(d.at);
    const spot = ok && places3d ? places3d.find((x) => x.id === String(fd.get('spot') || '')) : null;
    d.place = spot && !fd.get('place') ? spot.name : place;
    d.campus = spot ? '学院路' : campus;
    d.note = note;
    d.placeId = spot ? spot.id : null;          // 钉到分区图上的地点：分区图上那根针会多一张
    d.zoneId = spot ? spot.z : null;
    d.author = snapshot(lib.ensureMe());        // 落款快照：以后改落款，这张不跟着变
    applyPin(d, ok ? String(fd.get('block') || '') : '');
    // schema 2：四轴 + 身份 + 指纹哈希，入藏时不再迁移（ARCHIVE-T1 §1）
    d.slot = slotOf(at);
    d.date = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    d.kind = ok && fd.get('kind') ? String(fd.get('kind')) : null;
    d.status = 'local';
    d.sha256 = await sha256Hex(wavBytes(d));
    const wt = weekTag(at, calendar);              // 校历查不到时是 W--，不猜周次
    d.week = wt.week;
    d.semester = wt.key;
    d.no = `${campus}-${slotOf(at)}-${wt.tag}-${String(seq++).padStart(2, '0')}`;
    const when = `${at.getMonth() + 1} 月 ${at.getDate()} 日${slotOf(at)}`;
    d.meta = note ? `${campus}，${slotOf(at)}。${note}` : `${campus}，${when}${wt.week ? `，第 ${wt.week} 周` : '（校历里没有这一周）'}，${d.seconds.toFixed(1)} 秒`;
    addToShelf(d);
    load(d);
    say(d.placeId ? `已归档：${d.place}。在「学院路馆藏分区图」里，它落在${d.place}那根针上。` : `已归档：${d.place}。`);
  });
}

// 把音频文件拖到盘上（麦克风不可用时的入口）
els.platter.addEventListener('dragover', (e) => { e.preventDefault(); });
els.platter.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  await ensureAudio();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const pcm = buf.getChannelData(0).slice(0, Math.round(MAX_SEC * buf.sampleRate));
    const now = new Date();
    const d = makeDisc(pcm, buf.sampleRate, { place: file.name.replace(/\.[^.]+$/, '').slice(0, 20), campus: '学院路', note: '', at: now.toISOString() });
    d.meta = `从文件刻入，${d.seconds.toFixed(1)} 秒`;
    d.no = `文件-${String(seq).padStart(2, '0')}`;
    load(d);
    openSave(d);
  } catch {
    say('这个文件读不出声音。换一个 WAV、MP3 或 M4A 文件。');
  }
});

// —— ③ 测这个房间 ——
// T-05：连拍三次取 1 kHz 的中位数；IR 用中位数那一拍。单拍在短混响下误差可达 21%，三拍能压到 10% 内。
// RT60_DISPLAY 等 EXP-01 出结果再定：'seconds' 显示秒数，'tiers' 只显示三档描述。
const RT60_DISPLAY = 'seconds';

/** 拍一次手。返回 { r, fs, settings } 或 null（没听到）。麦克风每次现开现关。 */
async function captureClap() {
  const fs = ctx.sampleRate;
  const leadN = Math.round(0.4 * fs), afterN = Math.round(3 * fs), maxN = Math.round(7 * fs);
  const mic = await openMic();
  const ring = [];
  let n = 0, noise = 0, noiseN = 0, clapAt = -1;
  const done = new Promise((resolve) => {
    mic.node.port.onmessage = ({ data }) => {
      const s = data.samples;
      ring.push(s);
      n += s.length;
      if (clapAt < 0) {
        let ms = 0;
        for (let i = 0; i < s.length; i++) ms += s[i] * s[i];
        const rms = Math.sqrt(ms / s.length);
        if (n > fs * 0.3 && data.peak > Math.max(0.05, 12 * (noise / Math.max(1, noiseN)))) {
          clapAt = n - s.length;
          say('听到了，在听回声…');
        } else { noise += rms; noiseN++; }
        if (n > maxN) resolve(null);
      } else if (n - clapAt >= afterN) resolve(true);
    };
  });
  const heard = await done;
  mic.close();
  if (!heard) return null;
  const all = new Float32Array(n);
  let o = 0;
  for (const c of ring) { all.set(c, o); o += c.length; }
  const seg = all.subarray(Math.max(0, clapAt - leadN), Math.min(n, clapAt + afterN));
  return { r: analyzeClap(seg, fs), fs, settings: mic.settings };
}

els.room.addEventListener('click', async () => {
  if (busy) return;
  busy = 'room';
  const wasOn = motorOn;
  setMotor(false);
  mute(true);
  els.room.disabled = true;
  const readings = [];
  try {
    for (let i = 0; i < 3; i++) {
      say(i === 0 ? '拍一下手。' : `再拍一次（${i + 1}/3）。`);
      let got;
      try { got = await captureClap(); } catch (err) { say(micError(err)); return; }
      if (!got) {
        say(i === 0 ? '没听到拍手。靠近电脑，用力拍一下，再按“测这个房间”。' : `第 ${i + 1} 次没听到。这次先不算，稍后再按一次“测这个房间”重来。`);
        return;
      }
      if (!got.r.ok) { say('拍手声不够清楚，可能是房间太吵。靠近电脑再拍一次。'); return; }
      readings.push(got);
    }
  } finally {
    mute(false);
    els.room.disabled = false;
    busy = null;
    if (wasOn) setMotor(true);
  }

  const val = (x) => (x.r.bands && x.r.bands[1000] ? x.r.bands[1000].rt60 : null);
  const med = pickMedian(readings, val);
  const r = med.r;
  const claps = readings.map(val);
  window.__ks.lastRoom = { ...summarizeRoom(r, med.fs, med.settings), claps, median: val(med), display: RT60_DISPLAY };
  showDecay(r, claps);
  irs.here = toBuffer(r.ir, med.fs);
  els.hereRadio.disabled = false;
  els.hereRadio.checked = true;
  els.hereRadio.closest('label').removeAttribute('title');
  applyRoom();
  say(RT60_DISPLAY === 'seconds' && val(med) != null
    ? `三拍取中：这个房间的回声约 ${val(med).toFixed(1)} 秒。现在放声音会带上它。`
    : '已取下这个房间的回声。现在的声音放在这个房间里播放。');
});

function summarizeRoom(r, fs, settings) {
  const bands = {};
  for (const [f, b] of Object.entries(r.bands || {})) bands[f] = { rt60: b.rt60, quality: b.quality, dynRangeDb: +b.dynRangeDb.toFixed(1) };
  return { ok: r.ok, reason: r.reason, fs, onsetSnrDb: r.onset ? +r.onset.snrDb.toFixed(1) : null, bands, irSeconds: r.irDuration || 0, mic: settings };
}

function showDecay(r, claps = []) {
  const b = r.bands[1000];
  const w = 360, h = 132, padL = 34, padB = 22;
  const tMax = Math.max(0.5, Math.min(3, (b.crossTime || 1) * 1.05));
  const x = (t) => padL + (t / tMax) * (w - padL - 6);
  const y = (db) => 6 + (Math.min(0, Math.max(-60, db)) / -60) * (h - padB - 6);
  const pts = b.curve.filter((_, i) => i % 3 === 0).map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  let fit = '';
  if (b.t20) {
    const f = b.t20;
    const t1 = Math.min(tMax, (-60 - f.intercept) / f.slope);
    fit = `<line class="fit" x1="${x(0)}" y1="${y(f.intercept)}" x2="${x(t1)}" y2="${y(f.intercept + f.slope * t1)}"/>`;
  }
  const ticks = [0, -20, -40, -60].map((db) => `<text x="${padL - 6}" y="${y(db) + 4}" text-anchor="end">${db}</text>`).join('');
  els.decayPlot.innerHTML = `<path class="axis" d="M${padL} 6 V${h - padB} H${w - 6}"/>${ticks}
    <text x="${w - 6}" y="${h - 6}" text-anchor="end">${tMax.toFixed(1)} 秒</text><text x="${padL}" y="${h - 6}">0</text>
    ${fit}<polyline class="edc" points="${pts}"/>`;
  const fmt = (v) => (v == null ? '测不出' : `${v.toFixed(2)} 秒`);
  const tier = b.rt60 == null ? null : describeRT60(b.rt60);
  const main = b.rt60 == null ? '1 kHz 的回声没测出来。'
    : RT60_DISPLAY === 'tiers'
      ? `这个房间的回声${tier}（三拍取中）。`
      : `这个房间的回声约 ${b.rt60.toFixed(1)} 秒，${tier}（三拍取中）${b.quality === 'low' ? '，底噪偏高' : ''}。`;
  const all = claps.filter((v) => v != null).map((v) => v.toFixed(2)).join(' / ');
  els.decayRead.textContent = `${main}${all ? ` 三拍：${all} 秒。` : ''} 低频 ${fmt(r.bands[500].rt60)}，高频 ${fmt(r.bands[2000].rt60)}。`;
  els.decay.hidden = false;
}

// —— ⑥ 听声寻片 ——
// v2（docs/FIND-v2.md）：边听边判，在 3 / 4.5 / 6 / 8 秒各判一次，认出就停；8 秒还没认出就说明原因。
// 三档：认出（直接放）/ 只给候选（像某张，但不够确定，不自动放）/ 没认出（附上录音质量的原因）。
// 这一层只认「柜里那段录音本身」。同一地点换个时间录的声音不是同一段声音，认不出是设计使然；「像哪里」那一层见 T-07。
els.find.addEventListener('click', async () => {
  if (busy) return;
  busy = 'find';
  const wasOn = motorOn;
  setMotor(false);
  mute(true);
  let mic;
  try { mic = await openMic(); } catch (err) { say(micError(err)); mute(false); busy = null; return; }
  // 判定逻辑在 find.js（分区图的「听一段示例」用同一段）：喂样本、3 / 4.5 / 6 / 8 秒各判一次、定档
  const L = new Listener(index, ctx.sampleRate, { settings: mic.settings, onLook: (sec) => say(words.look(sec)) });
  els.find.disabled = true;
  say(words.listening(MAX_LISTEN));
  await new Promise((resolve) => {
    setTimeout(resolve, (MAX_LISTEN + 4) * 1000); // 麦克风中途断流时不至于一直等
    mic.node.port.onmessage = ({ data }) => { if (L.push(data.samples)) resolve(); };
  });
  mic.close();
  mute(false);
  els.find.disabled = false;
  busy = null;
  const { tier, res, candidates, quality, seconds: at } = L.result();
  window.__ks.lastFind = { tier, match: res?.match ?? null, ranked: res?.ranked ?? [], queryHashes: res?.queryHashes ?? 0, threshold: res?.threshold ?? null, seconds: at, N: res?.N ?? 0, quality };
  if (tier === 'match') {
    const d = shelf.find((s) => s.id === res.match.id);
    load(d);
    const pos = resumeAt(res.match, at, d.dur);
    player.port.postMessage({ seek: pos / d.dur });
    setMotor(true);
    say(words.match(d.place, at, pos));
    return;
  }
  if (wasOn) setMotor(true);
  if (tier === 'candidate') { say(words.candidate(candidates.map((id) => shelf.find((s) => s.id === id).place))); return; }
  say(res ? words.reject(quality) : words.starved);
});

// —— 导轨刻度 ——
(function drawTicks() {
  const parts = [];
  for (let s = 0; s <= MAX_SEC; s += 1) {
    const y = carriageY(s);
    const big = s % 5 === 0;
    parts.push(`<line class="tick" x1="${big ? -0.05 : -0.025}" y1="${y}" x2="0" y2="${y}"/>`);
    if (big) parts.push(`<text class="tick-label" x="-0.065" y="${y + 0.014}" text-anchor="end">${s === 10 ? '10 秒' : s}</text>`);
  }
  els.ticks.innerHTML = parts.join('');
})();

// —— 渲染循环 ——
let lastAria = 0;
function frame(now) {
  renderer.resize();
  let play = 0, cut = MAX_SEC, trail = 0, dur = MAX_SEC;
  if (rec && rec.mic) {
    cut = rec.n / rec.fs;
    play = cut;
    dur = MAX_SEC;
  } else if (current) {
    play = playSeconds();
    cut = current.seconds;
    dur = current.dur;
    trail = ctx && (Math.abs(report.rate) > 0.02 || grab) ? 1 : 0.0;
  }
  renderer.draw({ play, cut, dur, trail, light });
  els.carriage.setAttribute('transform', `translate(0 ${carriageY(Math.min(play, MAX_SEC)) + 0.026})`);
  if (now - lastAria > 250) {
    lastAria = now;
    els.disc.setAttribute('aria-valuenow', play.toFixed(1));
    els.disc.setAttribute('aria-valuetext', `第 ${play.toFixed(1)} 秒，${motorOn ? '转着' : '停着'}`);
  }
  requestAnimationFrame(frame);
}

// —— 启动：试音盘（合成，不是北航录音）——
window.__ks = {
  ready: false,
  debug: () => ({ rate: +report.rate.toFixed(3), pos: +playSeconds().toFixed(3), motor: motorOn, grabbing: !!grab }),
  latency: () => (ctx ? { base: ctx.baseLatency, output: ctx.outputLatency ?? null, sampleRate: ctx.sampleRate } : null),
  audioState: () => (ctx ? ctx.state : 'none'),
};
els.cabExp.addEventListener('click', exportCabinet);
els.cabImp.addEventListener('click', () => els.cabFile.click());
els.cabFile.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) await importCabinet(f);
  e.target.value = '';
});
els.clear.addEventListener('click', clearDevice);
if (els.srcMine) els.srcMine.addEventListener('click', () => setSource('mine'));
if (els.srcArch) els.srcArch.addEventListener('click', () => setSource('archive'));

(async function boot() {
  const fs = 48000;
  try { calendar = await (await fetch('./data/calendar.json')).json(); } catch { calendar = null; }
  try {
    places3d = (await (await fetch('./data/places-xy.json')).json()).places;
    const sel = els.saveForm.querySelector('select[name=spot]');
    for (const p of places3d) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
  } catch { places3d = null; }
  // 馆藏目录：随站点部署的静态文件；没有就把「馆藏」页签置灰，不报错
  try {
    const res = await fetch('./archive/catalog.json', { cache: 'no-cache' });
    archiveCatalog = res.ok ? await res.json() : null;
  } catch { archiveCatalog = null; }
  if (els.srcArch && !archiveCatalog) { els.srcArch.disabled = true; els.srcArch.title = '还没有接上馆藏目录'; }
  // 先从本地库恢复。打不开就退回内存模式——页面照常能用，但会明说「刷新会丢」。
  try {
    const recs = await allDiscs();
    recs.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    for (const rec of recs) {
      const d = await fromRecord(rec);
      shelf.push(d);
      index.add(d.id, d.prints);
      // 序号从柜里已有的最大序号接着数，否则刷新后从 1 重来、档案号互撞
      const m = /-(\d+)$/.exec(String(d.no || ''));
      if (m) seq = Math.max(seq, Number(m[1]) + 1);
    }
    storeMode = 'idb';
  } catch (err) {
    storeMode = 'memory';
    storeError = (err && err.message) || String(err);
  }

  const pcm = synthChimes({ fs, seconds: 10 });
  const d = makeDisc(pcm, fs, { id: 'demo-chimes', place: '试音盘', campus: '', note: '', at: new Date().toISOString() });
  d.no = '试-合成-01';
  d.meta = '合成的五声钟声，不是北航录音。';
  addToShelf(d);            // 试音盘永远在柜顶，但不落库（每次启动重新合成）
  load(d);
  renderShelf();
  updateStoreStat();
  if (!renderer.ok) say('这个浏览器不支持 WebGL2，盘面画不出来；录音和播放仍然可用。');
  else if (storeMode === 'memory') say(`本地库不可用（${storeError}），这次只存在内存里，刷新会丢。`);
  requestAnimationFrame(frame);
  window.__ks.ready = true;
  // 离线（T-04）：注册失败不影响在线使用，只影响断网能力
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('./sw.js', import.meta.url)).catch(() => {});
  }
})();
