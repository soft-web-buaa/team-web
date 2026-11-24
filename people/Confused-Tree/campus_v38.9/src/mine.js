// 「更多」：我上传的照片 / 声音（本机 IndexedDB 保存）
// 原则：这里只是画廊——全景小框恒定显示该地点的那张全景；点选地点播放的程序化声景也不变。
// 照片、声音都可以从本机上传，只保存在你自己的浏览器里，不上传任何服务器。

const DB_NAME = 'shengjing-mine';
const STORE = 'items';

const DEMO = {
  photos: [
    { name: '主楼前的下午', url: 'src/assets/mine-photos/p-01.svg' },
    { name: '图书馆的窗', url: 'src/assets/mine-photos/p-02.svg' },
    { name: '操场边的树', url: 'src/assets/mine-photos/p-03.svg' },
    { name: '夜里的路灯', url: 'src/assets/mine-photos/p-04.svg' },
  ],
  sounds: [
    { name: '鸟鸣示意', url: 'src/assets/mine-sounds/s-01.wav' },
    { name: '钟声示意', url: 'src/assets/mine-sounds/s-02.wav' },
    { name: '雨声示意', url: 'src/assets/mine-sounds/s-03.wav' },
  ],
};

function openDB() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) { rej(new Error('没有 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('kind', 'kind');
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbAll(kind) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('kind');
    const req = idx.getAll(kind);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
async function dbAdd(item) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(item);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbDel(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (s) => {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m + ':' + String(r).padStart(2, '0');
};

export function initMine() {
  const state = { kind: null, photos: [], sounds: [], playing: null, audio: null, pausedDefault: false };
  const urls = [];    // 上传文件的 objectURL，关闭时统一回收

  // 全景小框右下角的「更多」
  const panoBox = document.getElementById('pano-box');
  if (panoBox && !panoBox.querySelector('[data-mine="photos"]')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mine-more';
    b.dataset.mine = 'photos';
    b.textContent = '更多';
    b.title = '我拍的照片';
    panoBox.appendChild(b);
  }

  // 由其他地方（如声景详情）动态放入的按钮，用事件委托
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mine]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    openPanel(b.dataset.mine);
  });

  function ensureHost() {
    let host = document.getElementById('mine');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mine';
      host.className = 'mine';
      host.hidden = true;
      document.body.appendChild(host);
    }
    return host;
  }

  function pauseDefaultSound() {
    const snd = window.__sound;
    if (!snd || !snd.enabled || snd.paused || !snd.profile) return;
    if (snd.pause()) state.pausedDefault = true;
  }
  function resumeDefaultSound() {
    if (!state.pausedDefault) return;
    state.pausedDefault = false;
    const snd = window.__sound;
    if (snd) snd.resume();
  }
  function stopAudio(resume = true) {
    if (state.audio) {
      try { state.audio.pause(); } catch { /* ignore */ }
      state.audio = null;
    }
    state.playing = null;
    if (resume) resumeDefaultSound();
  }

  async function refresh() {
    const host = document.getElementById('mine');
    if (!host || !state.kind) return;
    const isPhoto = state.kind === 'photos';
    let mine = [];
    try { mine = await dbAll(state.kind); } catch { mine = []; }
    const items = [
      ...DEMO[state.kind].map((d) => ({ demo: true, name: d.name, url: d.url })),
      ...mine.map((m) => ({ demo: false, id: m.id, name: m.name, url: URL.createObjectURL(m.blob), upload: true })),
    ];
    state[state.kind] = items;
    const title = isPhoto ? '我拍的照片' : '我的声音';
    host.innerHTML = `<div class="mine-box">
      <header class="mine-head">
        <h4>${title}</h4>
        <span class="mine-count">${state[state.kind].length} 张</span>
        <label class="mine-upload"><input type="file" accept="${isPhoto ? 'image/*' : 'audio/*'}" multiple class="mine-file">${isPhoto ? '上传照片' : '上传声音'}</label>
        <button type="button" class="mine-close">关闭</button>
      </header>
      <p class="mine-tip">${isPhoto
        ? '这里只是相册：上方全景小框仍然恒定显示该地点的那张全景，不会被这里的照片替换。照片只存在你自己的浏览器里。'
        : '这里只是声音收藏：点选地点时播放的程序化声景不会变。上传的声音只存在你自己的浏览器里。'}</p>
      ${isPhoto
        ? `<div class="mine-grid">${items.map((it, i) => `<button type="button" class="mine-photo" data-i="${i}"><img src="${esc(it.url)}" alt="${esc(it.name)}" loading="lazy"><em>${esc(it.name)}${it.demo ? '<b>示例</b>' : ''}</em><span class="mine-photo-acts" aria-hidden="false"><span class="mine-act" role="img" aria-label="点赞" title="点赞"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/><path d="M7 10l4.2-6.2a1.6 1.6 0 0 1 2.9 1.1V9h4.3a2 2 0 0 1 2 2.4l-1.4 6.6a2 2 0 0 1-2 1.6H7"/></svg></span><span class="mine-act" role="img" aria-label="评论" title="评论"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H8l-4 3V12a8 8 0 0 1 8-8h1a8 8 0 0 1 8 8z"/></svg></span></span></button>`).join('')}</div>`
        : `<ul class="mine-sounds">${items.map((it, i) => `<li class="mine-snd" data-i="${i}"><button type="button" class="mine-play" aria-label="播放">▶</button><span class="mine-snd-name">${esc(it.name)}</span><em class="mine-dur">…</em>${it.demo ? '' : '<button type="button" class="mine-del" aria-label="删除">×</button>'}</li>`).join('')}</ul>`}
    </div>`;
    host.querySelector('.mine-close').addEventListener('click', () => { stopAudio(); host.hidden = true; });
    const file = host.querySelector('.mine-file');
    if (file) file.addEventListener('change', () => upload(Array.from(file.files || [])), { once: false });
    if (isPhoto) {
      host.querySelectorAll('.mine-photo').forEach((b) => b.addEventListener('click', () => {
        const it = state.photos[Number(b.dataset.i)];
        if (it) openLight(it);
      }));
    } else {
      host.querySelectorAll('.mine-snd').forEach((li) => {
        const it = state.sounds[Number(li.dataset.i)];
        if (it) loadDuration(it, li.querySelector('.mine-dur'));
        li.querySelector('.mine-play').addEventListener('click', () => playSound(it, li));
        const del = li.querySelector('.mine-del');
        if (del) del.addEventListener('click', async () => {
          try { await dbDel(it.id); } catch { /* ignore */ }
          stopAudio();
          refresh();
        });
      });
    }
  }

  function loadDuration(it, el) {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = it.url;
    a.onloadedmetadata = () => { el.textContent = fmtTime(a.duration); };
    a.onerror = () => { el.textContent = '—'; };
  }

  function playSound(it, li) {
    const btn = li.querySelector('.mine-play');
    if (state.playing === it.url && state.audio) {
      stopAudio();
      btn.textContent = '▶';
      return;
    }
    stopAudio(false);
    pauseDefaultSound();
    const a = new Audio(it.url);
    state.audio = a;
    state.playing = it.url;
    a.onended = () => { stopAudio(true); btn.textContent = '▶'; };
    a.play().then(() => { btn.textContent = '❚❚'; }).catch(() => { btn.textContent = '▶'; resumeDefaultSound(); });
  }

  function openLight(it) {
    const host = ensureHost();
    let light = document.getElementById('mine-light');
    if (!light) {
      light = document.createElement('div');
      light.id = 'mine-light';
      light.className = 'mine-light';
      light.hidden = true;
      document.body.appendChild(light);
    }
    light.hidden = false;
    light.innerHTML = `<button type="button" class="mine-light-close" aria-label="关闭大图">×</button><img src="${esc(it.url)}" alt="${esc(it.name)}"><p>${esc(it.name)}</p>`;
    light.querySelector('.mine-light-close').addEventListener('click', () => { light.hidden = true; });
    light.addEventListener('click', (e) => { if (e.target === light) light.hidden = true; }, { once: true });
  }

  async function upload(files) {
    const kind = state.kind;
    const isPhoto = kind === 'photos';
    let n = 0;
    for (const f of files) {
      if (isPhoto && !/^image\//.test(f.type)) continue;
      if (!isPhoto && !/^audio\//.test(f.type)) continue;
      if (f.size > 25 * 1024 * 1024) continue;
      try {
        await dbAdd({ kind, name: f.name.replace(/\.[^.]+$/, ''), type: f.type, size: f.size, blob: f, time: Date.now() });
        n += 1;
      } catch (err) { console.warn('[mine] 保存失败', err); }
    }
    if (n === 0) { flash('没有可保存的文件（照片/声音才可以）'); return; }
    await refresh();
    flash('已保存 ' + n + ' 个' + (isPhoto ? '照片' : '声音'));
  }

  function flash(text) {
    const host = document.getElementById('mine');
    if (!host) return;
    const tip = host.querySelector('.mine-tip');
    if (tip) { const old = tip.textContent; tip.textContent = text; setTimeout(() => { if (tip.isConnected) tip.textContent = old; }, 1800); }
  }

  function openPanel(kind) {
    if (kind !== 'photos' && kind !== 'sounds') return;
    state.kind = kind;
    const host = ensureHost();
    host.hidden = false;
    host.dataset.kind = kind;
    refresh();
  }

  function closeAll() {
    stopAudio();
    const host = document.getElementById('mine');
    if (host) host.hidden = true;
    const light = document.getElementById('mine-light');
    if (light) light.hidden = true;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  window.__mine = { open: openPanel, close: closeAll, dbAll, dbAdd };
  return { open: openPanel, close: closeAll };
}
