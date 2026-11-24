// 北航学院路校区 · 卡纸模型 —— 页面这一层：把展签（天光 / 季节 / 区块名单）接到三维模型上。
// 模型本体在 ./campus-scene.js。
import { init } from './campus-scene.js';
import { initAtlas } from './atlas.js';
import { initMine } from './mine.js';
import { createSoundscape } from './audio.js';
import { layersAt, CATEGORY } from './soundscape.js';

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
let atlas = null;
// 程序化声景：默认关闭；打开后才创建 AudioContext（浏览器要求用户手势）
const sound = createSoundscape({
  getCam: () => app?.cam(),
  onEnable(v) { syncSoundUI(v); syncTonearm(); },
  onPlay() { syncSoundUI(); syncTonearm(); },
  onStop() { syncSoundUI(); syncTonearm(); },
  onPause() { syncSoundUI(); syncTonearm(); },
  onResume() { syncSoundUI(); syncTonearm(); },
});
function syncTonearm() {
  app?.setTonearm?.(!!(sound.enabled && sound.profile && !sound.paused));
}

// 默认「声音：开」：先创建 AudioContext（浏览器会挂起），首次点击/按键时解锁并播放
sound.enable().catch(() => {});
let soundUnlocked = false;
const unlockSound = () => {
  if (soundUnlocked) return;
  soundUnlocked = true;
  sound.enable().then(() => {
    syncSoundUI();
    const sel = atlas?.selected;
    if (sel && sound.enabled) sound.play(sel, layersAt(sel, app?.light || '上午'), atlas?.selectedPoint?.());
  }).catch(() => {});
};
window.addEventListener('pointerdown', unlockSound, { once: true });
window.addEventListener('keydown', unlockSound, { once: true });
function syncSoundUI() {
  const b = $('sound-toggle'), v = $('sound-vol');
  if (!b) return;
  const on = sound.enabled;
  b.textContent = on ? '开' : '关';
  b.setAttribute('aria-pressed', String(on));
  if (v) { v.disabled = !on; v.value = String(Math.round(sound.volume * 100)); }
  document.body.classList.toggle('is-sounding', on);
}
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
      atlas?.setSlot(name);
      if (sound.enabled && sound.profile) sound.setSlot(name, layersAt(sound.profile, name));
    },
    onSeason(name) { syncSeasons(name); },
    onZone: renderDetail,
    onPlace(pid) { atlas?.selectByPlace(pid); },
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
  atlas = initAtlas(app, {
    onAudio(profile, point) {
      sound.enable().then(() => {
        sound.setVolume(Number($('sound-vol')?.value ?? 60) / 100);
        sound.play(profile, layersAt(profile, app.light), point);
        syncSoundUI();
      });
    },
    onSelect(profile) {
      if (sound.enabled && profile) sound.play(profile, layersAt(profile, app.light), atlas?.selectedPoint?.());
    },
    // 「播放声景路线」：路线播放本身是用户手势，这里顺势打开声音
    onRequestSound() {
      if (sound.enabled) return;
      sound.enable().then(() => {
        sound.setVolume(Number($('sound-vol')?.value ?? 60) / 100);
        syncSoundUI();
      });
    },
  });
  // 声音开关 / 音量 / 电平
  const sBtn = $('sound-toggle'), sVol = $('sound-vol'), sMeter = $('sound-meter');
  if (sBtn) {
    sBtn.addEventListener('click', async () => {
      const on = await sound.toggle();
      if (on) {
        const sel = atlas?.selected;
        if (sel) sound.play(sel, layersAt(sel, app.light), atlas?.selectedPoint?.());
      }
      syncSoundUI();
    });
  }
  if (sVol) sVol.addEventListener('input', () => sound.setVolume(Number(sVol.value) / 100));
  if (sMeter) {
    const bar = sMeter.querySelector('b');
    setInterval(() => {
      if (!sound.enabled) { bar.style.transform = 'scaleX(0)'; return; }
      bar.style.transform = 'scaleX(' + sound.level().toFixed(2) + ')';
    }, 120);
  }
  syncSoundUI();
  // 唱片开关：右侧「声音」行下面插一行；键盘 t 也可以
  const recBtn = document.createElement('button');
  recBtn.type = 'button'; recBtn.className = 'sound-toggle'; recBtn.id = 'record-toggle';
  const syncRec = () => {
    const on = app.record.on;
    recBtn.textContent = on ? '转' : '停';
    recBtn.setAttribute('aria-pressed', String(on));
  };
  recBtn.addEventListener('click', () => { app.setRecordSpin(!app.record.on); syncRec(); });
  syncRec();
  const picksEl = document.querySelector('.picks');
  if (picksEl) {
    const row = document.createElement('div');
    row.className = 'pick-row record-row';
    const label = document.createElement('span');
    label.className = 'pick-label'; label.textContent = '唱片';
    const note = document.createElement('span');
    note.className = 'record-note'; note.textContent = '60 秒 / 圈';
    row.append(label, recBtn, note);
    picksEl.appendChild(row);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    app.setRecordSpin(!app.record.on);
    syncRec();
  });
  window.__sound = sound;
  initMine();
  window.__atlas = atlas;
  // ?sound=snd-004 这类参数方便直接打开某条声景
  const wantSound = new URLSearchParams(location.search).get('sound');
  if (wantSound) atlas?.select(wantSound);
  window.__campus = app;
}



// ====================================================================================
// v38：主屏 / 详情视图
//   - 主屏：右侧副屏收掉；左下角四组控件（天光 / 季节 / 声音 / 唱片）；点地点出对话气泡
//   - 详情：index.html?view=detail&snd=… 复用同一套 DOM，把"副屏"展开成整页
// ====================================================================================
const qs = new URLSearchParams(location.search);
const isDetail = qs.get('view') === 'detail';
document.body.classList.add(isDetail ? 'is-detail' : 'is-main');

if (isDetail) {
  // 详情视图：藏三维、藏主屏控件；展开副屏；顶部加返回
  const stage = document.querySelector('.stage');
  if (stage) stage.style.display = 'none';
  const head = document.createElement('header');
  head.className = 'detail-head';
  head.innerHTML = '<a class="detail-back" href="index.html">← 返回校园</a><h1>看见校园 · 声景档案</h1><p class="detail-sub">选中地点的声纹、声音构成、故事、全景与收藏 —— 点上方「返回校园」回去继续转模型。</p>';
  document.body.insertBefore(head, document.body.firstChild);
  document.title = '声景档案 · 声景校园 · 北航';
  setTimeout(() => { const sid = qs.get('snd'); if (sid) atlas?.select(sid); }, 300);
  // 详情页从顶部开始看（先看全景），不要被自动滚动到列表
  window.scrollTo(0, 0);
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 650);

  // 下滑看档案时，全景缩到右上角当预览；滚回顶部附近恢复
  const panoEl = document.querySelector('.pano');
  if (panoEl) {
    const mini = document.createElement('div');
    mini.className = 'pano-mini';
    mini.innerHTML = '<img class="pano-mini-img" alt="">' +
      '<div class="pano-mini-foot"><span class="pano-mini-name"></span><em>点击回到顶部</em></div>';
    document.body.appendChild(mini);
    const mImg = mini.querySelector('.pano-mini-img');
    const mName = mini.querySelector('.pano-mini-name');
    mini.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    const syncMini = () => {
      const src = document.getElementById('pano-img')?.getAttribute('src') || '';
      const name = document.getElementById('pano-name')?.textContent || '';
      if (src && mImg.getAttribute('src') !== src) mImg.setAttribute('src', src);
      mImg.alt = name + ' 全景预览';
      mName.textContent = name;
    };
    syncMini();
    setInterval(syncMini, 700);
    const setMini = (on) => mini.classList.toggle('is-on', on);
    // 随滚动连续过渡：大图逐渐缩小、右移、淡出；右上角预览同步淡入/放大
    mini.style.transition = 'none';
    panoEl.style.transformOrigin = '50% 30%';
    const updateMini = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const L = Math.max(480, (panoEl.offsetHeight || 420) * 1.15);
      const p = Math.max(0, Math.min(1, y / L));           // 0..1 滚动进度
      const vis = p > 0.10;
      setMini(vis);
      const q = Math.min(1, Math.max(0, (p - 0.10) / 0.62)); // 预览出现的进度
      mini.style.opacity = String(q);
      mini.style.transform = 'translateY(' + (-10 + 10 * q) + 'px) scale(' + (0.6 + 0.4 * q) + ')';
      // 大图：平滑缩小 + 向右上收 + 淡出（transform 不改变布局，不会跳）
      const f = Math.min(1, Math.max(0, (p - 0.14) / 0.62));
      panoEl.style.opacity = String(1 - f);
      panoEl.style.transform = 'scale(' + (1 - 0.22 * f) + ') translateX(' + (f * 64) + 'px) translateY(' + (-f * 26) + 'px)';
      panoEl.style.visibility = f > 0.985 ? 'hidden' : 'visible';
      panoEl.style.pointerEvents = f > 0.25 ? 'none' : 'auto';
    };
    window.addEventListener('scroll', updateMini, { passive: true });
    window.addEventListener('resize', updateMini);
    updateMini();
    setTimeout(updateMini, 500);
    setTimeout(updateMini, 1600);
  }
  app?.setRecordSpin?.(false);
} else if (app?.ok) {
  // 主屏：左下角四组控件
  const ctrl = document.createElement('div');
  ctrl.id = 'ctrl';
  ctrl.className = 'ctrl';
  const mkRow = (label, items, onPick, activeValue) => {
    const row = document.createElement('div');
    row.className = 'ctrl-row';
    const lb = document.createElement('span');
    lb.className = 'ctrl-label';
    lb.textContent = label;
    row.appendChild(lb);
    const btns = [];
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctrl-btn';
      b.textContent = it.label;
      b.dataset.value = it.value;
      b.toggleAttribute('data-on', it.value === activeValue);
      b.addEventListener('click', () => {
        onPick(it.value);
        btns.forEach((x) => x.toggleAttribute('data-on', x.dataset.value === (typeof it.active === 'function' ? it.active() : it.value)));
      });
      row.appendChild(b);
      btns.push(b);
    }
    ctrl.appendChild(row);
    return { row, btns };
  };
  const slots = ['夜', '晨', '上午', '午', '下午', '晚'];
  mkRow('天光', slots.map((s) => ({ label: s, value: s, active: () => app.light })), (v) => app.setSlot(v), app.light);
  const seasons = ['春', '夏', '秋', '冬'];
  mkRow('季节', seasons.map((s) => ({ label: s, value: s, active: () => app.season })), (v) => app.setSeason(v), app.season);
  // 声音 / 唱片
  const rowS = document.createElement('div');
  rowS.className = 'ctrl-row';
  rowS.innerHTML = '<span class="ctrl-label">声音</span>';
  const sBtn = document.createElement('button');
  sBtn.type = 'button'; sBtn.className = 'ctrl-btn'; sBtn.id = 'ctrl-sound';
  const recBtn = document.createElement('button');
  recBtn.type = 'button'; recBtn.className = 'ctrl-btn'; recBtn.id = 'ctrl-record';
  const syncSound = () => { sBtn.textContent = sound.enabled ? '开' : '关'; sBtn.toggleAttribute('data-on', sound.enabled); };
  const syncRec = () => { recBtn.textContent = app.record.on ? '转' : '停'; recBtn.toggleAttribute('data-on', app.record.on); };
  sBtn.addEventListener('click', async () => {
    const on = await sound.toggle();
    if (on) { const sel = atlas?.selected; if (sel) sound.play(sel, layersAt(sel, app.light), atlas?.selectedPoint?.()); }
    syncSound();
  });
  recBtn.addEventListener('click', () => { app.setRecordSpin(!app.record.on); syncRec(); });
  syncSound(); syncRec();
  rowS.append(sBtn, recBtn);
  const note = document.createElement('span'); note.className = 'ctrl-note'; note.textContent = '30 秒/圈';
  note.textContent = '60 秒/圈';
  rowS.appendChild(note);
  ctrl.appendChild(rowS);
  (document.querySelector('.stage') || document.body).appendChild(ctrl);
  setInterval(() => { syncSound(); syncRec(); }, 400);

  // 点击地点 → 在选中地点旁边出「对话气泡」
  const bubble = document.createElement('div');
  bubble.id = 'place-bubble';
  bubble.className = 'place-bubble';
  bubble.hidden = true;
  (document.querySelector('.stage') || document.body).appendChild(bubble);
  let bubbleFor = null;
  let lastSelId = null;
  const hideBubble = () => { bubble.hidden = true; bubbleFor = null; };
  bubble.addEventListener('click', () => {
    if (!bubbleFor) return;
    const sel = atlas?.selected;
    const url = 'index.html?view=detail' + (sel ? '&snd=' + encodeURIComponent(sel.id) : '') + '&slot=' + encodeURIComponent(app.light);
    location.href = url;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideBubble(); });
  setInterval(() => {
    if (isDetail) return;
    const sel = atlas?.selected;
    const selId = sel ? sel.id : null;
    if (selId !== lastSelId) { lastSelId = selId; hideBubble(); }   // 换地点：旧气泡立刻消失
    const pid = sel?.place;
    if (!sel || !pid) { hideBubble(); return; }
    // 切到别的大区块时，原气泡立刻消失（等新区块里再选地点才重新出现）
    const zoneNow = app.zone;
    const placeMeta = (app.places || []).find((pp) => pp.id === pid);
    if (!zoneNow || (placeMeta && zoneNow !== placeMeta.zone)) { hideBubble(); return; }
    const pos = app.placeScreen ? app.placeScreen(pid) : null;
    if (!pos) { hideBubble(); return; }                              // 新地点的圆点还没露出来，就先别显示气泡
    const cat = CATEGORY.get(sel.category) || { name: sel.category, color: '#8B949E' };
    const where = (app.places || []).find((p) => p.id === pid)?.name || '';
    if (bubbleFor !== pid) {
      bubbleFor = pid;
      const story = String(sel.story || '').replace(/\s+/g, ' ');
      const brief = story.length > 52 ? story.slice(0, 52) + '…' : story;
      const pano = 'src/assets/panorama/' + sel.id + '.svg';
      bubble.innerHTML =
        '<div class="pb-top"><i style="background:' + cat.color + '"></i>' +
        '<span class="pb-main"><b>' + (sel.title || '') + '</b><em>' + where + ' · ' + cat.name + ' · ' + (sel.duration || '') + 's</em></span>' +
        '<span class="pb-go">进入档案 →</span></div>' +
        '<p class="pb-brief">' + brief + '</p>' +
        '<img class="pb-pano" src="' + pano + '" alt="' + where + '的全景（示意）">';
      bubble.hidden = false;
    }
    const bw = Math.min(340, innerWidth * 0.82) / 2;
    bubble.style.left = Math.max(bw + 8, Math.min(innerWidth - bw - 8, pos.x)) + 'px';
    bubble.style.top = Math.max(190, pos.y - 12) + 'px';
  }, 120);
}
