// 北航学院路校区 · 卡纸模型 —— 页面这一层：把展签（天光 / 季节 / 区块名单）接到三维模型上。
// 模型本体在 ./campus-scene.js。
import { init } from './campus-scene.js';

const SLOTS = ['夜', '晨', '上午', '午', '下午', '晚'];
const SEASONS = ['春', '夏', '秋', '冬'];

const $ = (id) => document.getElementById(id);
const slotsEl = $('slots');
const seasonsEl = $('seasons');
const zonesEl = $('zones');
const detailEl = $('detail');
const hourEl = $('hour');
const posterEl = $('poster');
const noglEl = $('nogl');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 三维第一帧画出来之前，画布是透明的，底下那张预渲染总览就是「看到的模型」；第一帧一到就把它撤掉。 */
function hidePoster() {
  document.body.classList.add('is-ready');   // 区块名标签在此之前不显示（还没摆到位置上）
  if (!posterEl || posterEl.classList.contains('is-done')) return;
  posterEl.classList.add('is-done');
  setTimeout(() => posterEl.remove(), 400);
}

const mkBtn = (label, pressed, onClick) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
};

// —— 天光 / 季节 ——（按钮先建好：init 会在加载完成后回调 onLight / onSeason）
let app = null;
const syncSlots = (name) => { for (const b of slotsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.slot === name)); };
const syncSeasons = (name) => { for (const b of seasonsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.season === name)); };
for (const name of SLOTS) {
  const b = mkBtn(name, name === '上午', () => { app?.setSlot(name); syncSlots(name); });
  b.dataset.slot = name;
  b.setAttribute('aria-label', `天光：${name}`);
  slotsEl.appendChild(b);
}
for (const name of SEASONS) {
  const b = mkBtn(name, false, () => app?.setSeason(name));
  b.dataset.season = name;
  b.setAttribute('aria-label', `季节：${name}`);
  seasonsEl.appendChild(b);
}

// —— 展签上的区块详情 ——
function renderDetail(id, meta) {
  if (!id || !meta) {
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    return;
  }
  detailEl.hidden = false;
  detailEl.innerHTML = `<h4>${esc(meta.name)}</h4>
    <p class="meta">${meta.buildings} 栋楼 · ${meta.places.length} 处地点</p>
    <p class="places">${meta.places.length ? meta.places.map(esc).join('、') : '没有标出来的地点，都是楼和林子。'}</p>
    <button type="button">看全貌</button>`;
  detailEl.querySelector('button').addEventListener('click', () => app.selectZone(null));
}

// —— 区块名单 ——
function buildZones(zones) {
  zonesEl.innerHTML = '';
  for (const z of zones) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.zone = z.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span>${esc(z.name)}</span><span class="n">${z.buildings}</span>`;
    b.addEventListener('click', () => app.selectZone(app.zone === z.id ? null : z.id));
    b.addEventListener('pointerenter', () => app.hoverZone(z.id));
    b.addEventListener('pointerleave', () => app.hoverZone(null));
    b.addEventListener('focus', () => app.hoverZone(z.id));
    b.addEventListener('blur', () => app.hoverZone(null));
    li.appendChild(b);
    zonesEl.appendChild(li);
  }
}

// —— 启动 ——
function fail(reason) {
  document.body.classList.add('is-nogl');
  noglEl.hidden = false;
  noglEl.textContent = reason;
  if (hourEl) hourEl.textContent = '';
  // 三维起不来也把预渲染的总览留在那儿：至少还看得见这所学校
}

try {
  app = await init({
    onLight({ name, hour }) {
      // 按钮按「选定的时段」亮，不跟开场灯光的过渡走；这一行字才跟着此刻的天光
      hourEl.textContent = `天光　${name}　${hour}`;
    },
    onSeason(name) { syncSeasons(name); },
    onZone: renderDetail,
    onFirstFrame: hidePoster,
  });
} catch (err) {
  console.error(err);
  fail(`模型没搭起来：${err.message || err}`);
}

if (!app) {
  fail('模型没搭起来。用本地服务器打开这个目录再试（node serve.mjs），控制台里有具体报错。');
} else if (!app.ok) {
  console.warn('[campus]', app.reason);
  fail('这个浏览器画不出三维模型（需要 WebGL）。换一个浏览器，或打开硬件加速再试。');
} else {
  noglEl.hidden = true;                    // 万一 file:// 的提示先出来了，模块跑通后就撤掉
  buildZones(app.zones);
  $('stat-z').textContent = String(app.stats.zones);
  $('stat-b').textContent = String(app.stats.buildings);
  syncSlots(app.slot);
  syncSeasons(app.season);
  // ?zone=XY-04 这类参数方便直接打开某个区块
  const want = new URLSearchParams(location.search).get('zone');
  if (want && app.zones.some((z) => z.id === want)) app.selectZone(want);
  window.__campus = app;
}
