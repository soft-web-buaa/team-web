// 声景档案（Soundscape Atlas）：把校园变成一个「可以看声音」的地方。
// 不加载任何音频文件：每条声景是一份数据（层 + 权重 + 故事），页面用这份数据生成
// 声纹动画、声景小地图、类别筛选，以及 3D 模型上按类别着色的粒子波纹。
//
// 依赖：src/soundscape.js（数据）、campus-scene.js 暴露的 app（三维场景）。
import {
  CATEGORIES, CATEGORY, POINTS, BY_ID, BY_PLACE, BY_PARK, LAYERS, SLOTS,
  layersAt, timeNote, fingerprint, categoryCounts, hash01,
} from './soundscape.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 热闹度：这条声景此刻有多满（0 静 → 100 吵）。 */
export function loudness(profile, slot) {
  const ls = layersAt(profile, slot);
  const sum = ls.reduce((s, l) => s + l.w, 0);
  return Math.max(4, Math.min(100, Math.round(sum * 42)));
}

export function initAtlas(app, hooks = {}) {
  const els = {
    cats: $('atlas-cats'),
    list: $('atlas-list'),
    detail: $('atlas-detail'),
    count: $('atlas-count'),
    map: $('atlas-map'),
    mapCanvas: $('map-canvas'),
    mapTip: $('map-tip'),
    mapToggle: $('map-toggle'),
    mapBody: $('map-body'),
  };
  if (!els.list) return null;

  // —— 点位：16 个地点 + 4 个园子。坐标从三维场景里取（米），保证地图与模型一致。——
  const placeXY = new Map((app.places || []).map((p) => [p.id, p]));
  const parkXY = new Map((app.parks || []).map((p) => [p.name, p]));
  const points = POINTS.map((profile) => {
    if (profile.place) {
      const p = placeXY.get(profile.place);
      return p ? { profile, kind: 'place', x: p.x, y: p.y, where: p.name } : null;
    }
    const pk = parkXY.get(profile.park);
    return pk ? { profile, kind: 'park', x: pk.x, y: pk.y, where: profile.park } : null;
  }).filter(Boolean);
  const pointById = new Map(points.map((p) => [p.profile.id, p]));
  const pointByPlace = new Map(points.filter((p) => p.kind === 'place').map((p) => [p.profile.place, p]));

  // 3D 地点圆点：写类别颜色 + data-cat（筛选时 CSS 直接压暗别的类别）
  const meta = {};
  const tints = {};
  for (const p of points) {
    if (p.kind !== 'place') continue;
    const cat = CATEGORY.get(p.profile.category);
    meta[p.profile.place] = { category: p.profile.category, color: cat.color };
    tints[p.profile.place] = cat.color;
  }
  app.setPlaceMeta?.(meta);
  app.setPlaceTints?.(tints);

  const state = { filter: 'all', selected: null, slot: app.slot || '上午', suppress: false, q: '', sort: 'default' };
  // 声景路线：排一串地点，播放时逐个飞过去 + 换声音
  const route = { list: [], playing: false, idx: 0, timer: 0 };
  // 声景图鉴：听过/点开过的自动记进 localStorage，像一本收集册
  const visited = new Set((() => { try { return JSON.parse(localStorage.getItem('ss-visited') || '[]'); } catch { return []; } })());
  function saveVisited() { try { localStorage.setItem('ss-visited', JSON.stringify([...visited])); } catch { /* 隐私模式 */ } }
  const countAll = categoryCounts(points.map((p) => p.profile));
  els.count.textContent = String(points.length);

  // —— 分类筛选条 ——
  function renderCats() {
    els.cats.innerHTML = '';
    const mk = (id, name, color, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-chip';
      b.dataset.cat = id;
      b.setAttribute('aria-pressed', String(state.filter === id));
      b.innerHTML = `<i style="background:${color}"></i><span>${name}</span><b>${n}</b>`;
      b.addEventListener('click', () => setFilter(id));
      els.cats.appendChild(b);
    };
    mk('all', '全部', '#8B949E', points.length);
    for (const c of CATEGORIES) mk(c.id, c.name, c.color, countAll.get(c.id) || 0);
  }
  function setFilter(id) {
    state.filter = id;
    document.body.classList.toggle('has-atlas-filter', id !== 'all');
    document.body.dataset.atlasCat = id;
    renderCats();
    renderList();
    paintMap();
    const sel = state.selected;
    if (sel && id !== 'all' && sel.profile.category !== id) selectPoint(null);
  }

  // —— 声景列表 ——
  function filteredPoints() {
    let list = state.filter === 'all' ? points : points.filter((p) => p.profile.category === state.filter);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((p) => {
        const cat = CATEGORY.get(p.profile.category);
        const hay = (p.profile.title + p.where + p.profile.zone + cat.name + p.profile.tags.join('')).toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }
  function renderList() {
    els.list.innerHTML = '';
    let list = filteredPoints();
    if (state.sort === 'loud') list = list.slice().sort((x, y) => loudness(y.profile, state.slot) - loudness(x.profile, state.slot));
    else if (state.sort === 'name') list = list.slice().sort((x, y) => x.profile.title.localeCompare(y.profile.title, 'zh'));
    else if (state.sort === 'cat') list = list.slice().sort((x, y) => CATEGORY.get(x.profile.category).name.localeCompare(CATEGORY.get(y.profile.category).name, 'zh'));
    for (const p of list) {
      const cat = CATEGORY.get(p.profile.category);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'atlas-row';
      b.dataset.id = p.profile.id;
      if (state.selected && state.selected.profile.id === p.profile.id) b.classList.add('is-on');
      b.innerHTML = `<i style="background:${cat.color}"></i>
        <span class="ar-main"><b>${esc(p.profile.title)}</b><em>${esc(p.where)}</em></span>
        <span class="ar-dur">${p.profile.duration}s</span>`;
      b.addEventListener('click', () => selectPoint(p, { fly: true }));
      li.appendChild(b);
      els.list.appendChild(li);
    }
    if (!els.list.children.length) els.list.innerHTML = '<li class="atlas-empty">这一类暂时没有声景。</li>';
  }

  // —— 声纹画布（动画只在面板可见时跑）——
  const fp = { ctx: null, el: null, raf: 0, timer: 0, w: 0, h: 0 };
  function fpResize() {
    const c = $('atlas-fp');
    if (!c) return null;
    // renderDetail 会把 innerHTML 整段换掉，canvas 也是新的：元素一变就重建 ctx 和尺寸
    if (fp.el !== c) { fp.el = c; fp.w = 0; fp.h = 0; fp.ctx = null; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(80, c.clientWidth || 280);
    const h = 92;
    if (fp.w === w && fp.h === h && fp.ctx) return fp.ctx;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fp.ctx = ctx; fp.w = w; fp.h = h;
    return ctx;
  }
  function drawFingerprint(t) {
    const ctx = fpResize();
    if (!ctx || !state.selected) return;
    const { wave, bars, layers } = fingerprint(state.selected.profile, state.slot);
    const cat = CATEGORY.get(state.selected.profile.category);
    const w = fp.w, h = fp.h;
    ctx.clearRect(0, 0, w, h);
    // 底部频谱条
    const bw = w / bars.length;
    for (let i = 0; i < bars.length; i++) {
      const pulse = 0.72 + 0.28 * Math.sin(t * 0.0016 + i * 0.7);
      const bh = Math.max(2, bars[i] * pulse * (h - 34));
      ctx.fillStyle = cat.color + '55';
      ctx.fillRect(i * bw + bw * 0.18, h - bh, bw * 0.64, bh);
    }
    // 中间波形
    ctx.beginPath();
    const mid = h * 0.46;
    for (let i = 0; i < wave.length; i++) {
      const x = (i / (wave.length - 1)) * w;
      const env = 0.55 + 0.45 * Math.sin((i / wave.length) * Math.PI);   // 两端收一点，像真实包络
      const y = mid + wave[i] * env * (h * 0.34) * (0.85 + 0.15 * Math.sin(t * 0.002 + i * 0.2));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = cat.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 扫描线
    const sx = ((t * 0.06) % (w + 80)) - 40;
    const grad = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
    grad.addColorStop(0, cat.color + '00');
    grad.addColorStop(0.5, cat.color + '38');
    grad.addColorStop(1, cat.color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 30, 0, 60, h);
    // 层数角标
    ctx.fillStyle = 'rgba(36,48,74,.42)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(layers.length + ' 层', 2, 12);
    if (!document.body.classList.contains('is-calm')) scheduleFingerprint();
  }
  // 声纹只是个小 canvas，没必要跑满 60fps：约 20fps 就够「活着」，也不和三维抢帧
  function scheduleFingerprint() {
    if (fp.timer) return;
    fp.timer = setTimeout(() => { fp.timer = 0; if (!document.hidden) drawFingerprint(performance.now()); }, 48);
  }
  function stopFingerprint() { clearTimeout(fp.timer); fp.timer = 0; cancelAnimationFrame(fp.raf); fp.raf = 0; }


  /** 声景明信片：把这一条档案画成一张 1200×675 的卡片，可下载。 */
  function postcard(profile, point) {
    const cat = CATEGORY.get(profile.category);
    const { wave, bars } = fingerprint(profile, state.slot);
    const W = 1200, H = 675;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    // 纸底 + 细网格
    g.fillStyle = '#F2F4F3'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(36,48,74,0.06)'; g.lineWidth = 1;
    for (let x = 60; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 60; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // 左侧类别色块
    g.fillStyle = cat.color; g.fillRect(0, 0, 18, H);
    // 顶部：项目名 + 编号
    g.fillStyle = 'rgba(36,48,74,0.55)';
    g.font = '500 22px "Songti SC","SimSun",serif';
    g.fillText('声景校园 · 北航    Soundscape Atlas', 64, 74);
    g.textAlign = 'right';
    g.fillText(profile.id.toUpperCase() + ' · ' + (state.slot || ''), W - 64, 74);
    g.textAlign = 'left';
    // 类别标签
    g.fillStyle = cat.color;
    g.fillRect(64, 108, 108, 34);
    g.fillStyle = '#10151c';
    g.font = '600 20px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(cat.name, 64 + 26, 108 + 24);
    // 标题
    g.fillStyle = '#24304A';
    g.font = '400 76px "Songti SC","SimSun",serif';
    g.fillText(profile.title, 64, 236);
    // 地点
    g.fillStyle = 'rgba(36,48,74,0.66)';
    g.font = '400 26px "Songti SC","SimSun",serif';
    g.fillText((point && point.where ? point.where : '') + ' · ' + profile.zone + ' · ' + profile.duration + 's · 热闹度 ' + loudness(profile, state.slot), 64, 278);
    // 声纹：频谱条 + 波形
    const fx = 64, fy = 312, fw = 1072, fh = 148;
    g.fillStyle = 'rgba(36,48,74,0.05)'; g.fillRect(fx, fy, fw, fh);
    const bw = fw / bars.length;
    for (let i = 0; i < bars.length; i++) {
      const bh = Math.max(3, bars[i] * fh * 0.8);
      g.fillStyle = cat.color + 'dd';
      g.fillRect(fx + i * bw + bw * 0.18, fy + fh - bh, bw * 0.64, bh);
    }
    g.beginPath();
    const mid = fy + fh * 0.42;
    for (let i = 0; i < wave.length; i++) {
      const x = fx + (i / (wave.length - 1)) * fw;
      const env = 0.55 + 0.45 * Math.sin((i / wave.length) * Math.PI);
      const y = mid + wave[i] * env * fh * 0.34;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = '#24304A'; g.lineWidth = 2.2; g.stroke();
    // 故事
    g.fillStyle = 'rgba(36,48,74,0.9)';
    g.font = '400 25px "Songti SC","SimSun",serif';
    const story = profile.story;
    let line = '', yy = 520;
    const maxW = W - 128;
    for (const ch of story) {
      if (g.measureText(line + ch).width > maxW || (line + ch).length > 46) {
        g.fillText(line, 64, yy); yy += 38; line = ch;
      } else line += ch;
      if (yy > 600) break;
    }
    if (line) g.fillText(line, 64, yy);
    // 底部：标签 + 注
    g.fillStyle = cat.color;
    g.font = '500 20px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(profile.tags.map((t) => '#' + t).join('  '), 64, 636);
    g.fillStyle = 'rgba(36,48,74,0.5)';
    g.font = '400 18px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'right';
    g.fillText('不加载音频文件 · 声纹与声音由代码实时生成', W - 64, 636);
    g.textAlign = 'left';
    return cv;
  }
  function downloadPostcard(profile, point) {
    const cv = postcard(profile, point);
    const name = '声景-' + profile.title + '.png';
    cv.toBlob((blob) => {
      if (!blob) { flashTipAlert('浏览器没生成出图片'); return; }
      const u = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = u; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      flashRouteTip('明信片已保存：' + name);
    }, 'image/png');
  }
  function flashTipAlert(text) { flashRouteTip(text); }


  // —— 声景路线预设：四条主题线 + 随机漫游 ——
  const PRESETS = [
    { id: 'morning', name: '清晨线', ids: ['snd-017', 'snd-018', 'snd-002', 'snd-008'], note: '鸟鸣、晨读、上课铃与第一杯早饭' },
    { id: 'noon', name: '午间线', ids: ['snd-009', 'snd-008', 'snd-011', 'snd-006'], note: '打菜、刷卡、老楼与球馆' },
    { id: 'night', name: '夜行线', ids: ['snd-010', 'snd-001', 'snd-019', 'snd-013'], note: '猫、闭馆铃、静园与夜风' },
    { id: 'quiet', name: '安静线', ids: ['snd-019', 'snd-020', 'snd-015', 'snd-005'], note: '四个最安静的地方' },
  ];
  function applyPreset(id) {
    if (route.playing) stopRoute();
    if (id === 'random') {
      const pool = points.filter((p) => p.kind === 'place');
      const cats = [...new Set(pool.map((p) => p.profile.category))].sort(() => Math.random() - 0.5);
      const picks = [];
      for (const c of cats) {
        const arr = pool.filter((p) => p.profile.category === c);
        const pick = arr[Math.floor(Math.random() * arr.length)];
        if (pick && !picks.includes(pick)) picks.push(pick);
        if (picks.length >= 4) break;
      }
      route.list = picks;
      renderRoute();
      flashRouteTip('随机漫游排好了 ' + picks.length + ' 站 —— 点「播放」出发');
      return;
    }
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    route.list = preset.ids.map((pid) => pointById.get(pid)).filter(Boolean);
    renderRoute();
    flashRouteTip('已排好「' + preset.name + '」：' + preset.note + ' —— 点「播放」开始');
  }
  function buildPresetButtons() {
    const head = document.querySelector('.route-head');
    if (!head || head.querySelector('.route-presets')) return;
    const box = document.createElement('div');
    box.className = 'route-presets';
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'route-preset'; b.textContent = p.name;
      b.title = p.note;
      b.addEventListener('click', () => applyPreset(p.id));
      box.appendChild(b);
    }
    const rnd = document.createElement('button');
    rnd.type = 'button'; rnd.className = 'route-preset is-dice'; rnd.textContent = '随机漫游';
    rnd.addEventListener('click', () => applyPreset('random'));
    box.appendChild(rnd);
    head.after(box);
  }


  // —— 声景图鉴 ——
  function refreshGalleryBtn() {
    const b = document.getElementById('atlas-gallery');
    if (b) b.textContent = '图鉴 ' + visited.size + '/' + points.length;
  }
  function openGallery() {
    let host = document.getElementById('gallery');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gallery'; host.className = 'gallery'; host.hidden = true;
      document.body.appendChild(host);
    }
    host.hidden = false;
    const cards = points.map((p) => {
      const cat = CATEGORY.get(p.profile.category);
      const got = visited.has(p.profile.id);
      return '<button type="button" class="gal-card' + (got ? ' is-got' : '') + '" data-id="' + p.profile.id + '">' +
        '<i style="background:' + cat.color + '"></i>' +
        '<em>' + cat.name + '</em>' +
        '<b>' + esc(p.profile.title) + '</b>' +
        '<span>' + esc(p.where) + '</span>' +
        '<u>' + (got ? '已收录' : '未收录') + ' · 热闹度 ' + loudness(p.profile, state.slot) + '</u>' +
        '</button>';
    }).join('');
    host.innerHTML = '<div class="gal-box"><header class="gal-head"><h4>声景图鉴</h4>' +
      '<span class="gal-progress">已收集 ' + visited.size + ' / ' + points.length + '</span>' +
      '<button type="button" class="gal-close" aria-label="关闭">关闭</button></header>' +
      '<div class="gal-grid">' + cards + '</div>' +
      '<p class="gal-tip">点开一条声景就会收进图鉴（记在本机浏览器里）。</p></div>';
    host.querySelector('.gal-close').addEventListener('click', () => { host.hidden = true; });
    host.querySelectorAll('.gal-card').forEach((b) => {
      b.addEventListener('click', () => {
        const p = pointById.get(b.dataset.id);
        if (!p) return;
        host.hidden = true;
        selectPoint(p, { fly: true });
      });
    });
  }


  // —— 声景对比：任选两条，并排看声纹、热闹度与共有的声音层 ——
  function openCompare() {
    let host = document.getElementById('compare');
    if (!host) {
      host = document.createElement('div');
      host.id = 'compare'; host.className = 'compare'; host.hidden = true;
      document.body.appendChild(host);
    }
    host.hidden = false;
    const opts = (sel) => points.map((p) => '<option value="' + p.profile.id + '"' + (p.profile.id === sel ? ' selected' : '') + '>' + esc(p.profile.title) + ' · ' + esc(p.where) + '</option>').join('');
    const first = state.selected ? state.selected.profile.id : points[0].profile.id;
    const second = (points.find((p) => p.profile.id !== first) || points[0]).profile.id;
    const draw = () => {
      const id1 = host.querySelector('.cmp-a').value, id2 = host.querySelector('.cmp-b').value;
      const p1 = pointById.get(id1), p2 = pointById.get(id2);
      const canvas = host.querySelector('.cmp-fp');
      const W = 640, H = 190, dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = '100%'; canvas.style.height = '190px';
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const fpA = fingerprint(p1.profile, state.slot), fpB = fingerprint(p2.profile, state.slot);
      const catA = CATEGORY.get(p1.profile.category), catB = CATEGORY.get(p2.profile.category);
      const drawWave = (fp, cat, y0, h) => {
        g.beginPath();
        for (let i = 0; i < fp.wave.length; i++) {
          const x = 40 + (i / (fp.wave.length - 1)) * (W - 80);
          const y = y0 + h / 2 + fp.wave[i] * h * 0.32;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = cat.color; g.lineWidth = 2; g.stroke();
        g.fillStyle = cat.color; g.font = '600 12px system-ui,sans-serif';
        g.fillText(cat.name, 8, y0 + h / 2 + 4);
      };
      drawWave(fpA, catA, 6, 84);
      drawWave(fpB, catB, 100, 84);
      host.querySelector('.cmp-meta').innerHTML =
        '<p><b style="color:' + catA.color + '">' + esc(p1.profile.title) + '</b> 热闹度 ' + loudness(p1.profile, state.slot) + ' · 地点 ' + esc(p1.where) + '</p>' +
        '<p><b style="color:' + catB.color + '">' + esc(p2.profile.title) + '</b> 热闹度 ' + loudness(p2.profile, state.slot) + ' · 地点 ' + esc(p2.where) + '</p>';
      const la = layersAt(p1.profile, state.slot), lb = layersAt(p2.profile, state.slot);
      const ids = [...new Set([...la.map((l) => l.id), ...lb.map((l) => l.id)])];
      host.querySelector('.cmp-layers').innerHTML = ids.map((id) => {
        const x = la.find((l) => l.id === id), y = lb.find((l) => l.id === id);
        const both = x && y;
        return '<li class="' + (both ? 'is-both' : '') + '"><span>' + esc((x || y).name) + '</span><i><b style="width:' + Math.round(Math.min(1, (x ? x.w : 0) / 1.5) * 100) + '%;background:' + catA.color + '"></b></i><i><b style="width:' + Math.round(Math.min(1, (y ? y.w : 0) / 1.5) * 100) + '%;background:' + catB.color + '"></b></i></li>';
      }).join('');
    };
    host.innerHTML = '<div class="cmp-box"><header class="cmp-head"><h4>声景对比</h4>' +
      '<div class="cmp-picks"><select class="cmp-a" aria-label="声景 A">' + opts(first) + '</select><span>vs</span>' +
      '<select class="cmp-b" aria-label="声景 B">' + opts(second) + '</select></div>' +
      '<button type="button" class="cmp-close" aria-label="关闭">关闭</button></header>' +
      '<canvas class="cmp-fp" aria-label="两条声景的声纹"></canvas>' +
      '<div class="cmp-meta"></div><ul class="cmp-layers"></ul>' +
      '<p class="cmp-tip">两条线分别是两处声音的声纹；下面每一行是声音层，带高亮的是两处共有的层。</p></div>';
    host.querySelector('.cmp-close').addEventListener('click', () => { host.hidden = true; });
    host.querySelectorAll('select').forEach((s) => s.addEventListener('change', draw));
    draw();
  }


  // —— 键盘快捷键 + 帮助 ——
  function openHelp() {
    let host = document.getElementById('help');
    if (!host) {
      host = document.createElement('div');
      host.id = 'help'; host.className = 'help'; host.hidden = true;
      document.body.appendChild(host);
    }
    host.hidden = false;
    const rows = [
      ['1 – 6', '切换天光：夜 / 晨 / 上午 / 午 / 下午 / 晚'],
      ['/ 或 s', '聚焦搜索框 / 开关程序化声音'],
      ['z / Esc', '进入或退出沉浸模式'],
      ['g / b / c', '声景图鉴 / 盲猜声纹 / 声景对比'],
      ['p', '播放声景路线（空的话先排几站）'],
      ['Shift + ?', '打开或关闭这张快捷键表'],
      ['拖拽 / 滚轮', '转动视角 / 缩放；点区块抬起；点圆点看声景'],
    ];
    host.innerHTML = '<div class="help-box"><header class="help-head"><h4>快捷键</h4>' +
      '<button type="button" class="help-close" aria-label="关闭">关闭</button></header>' +
      '<dl class="help-list">' + rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
      '<p class="help-tip">所有功能也都能用鼠标 / 触屏完成。</p></div>';
    host.querySelector('.help-close').addEventListener('click', () => { host.hidden = true; });
  }
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      const slots = ['夜', '晨', '上午', '午', '下午', '晚'];
      if (/^[1-6]$/.test(e.key)) { app.setSlot(slots[Number(e.key) - 1]); return; }
      const k = e.key.toLowerCase();
      if (k === 's') { const b = document.getElementById('sound-toggle'); if (b) b.click(); }
      else if (k === 'g') { openGallery(); }
      else if (k === 'b') { const b = document.getElementById('atlas-blind'); if (b) b.click(); }
      else if (k === 'c') { openCompare(); }
      else if (k === 'p') { playRoute(); }
      else if (e.key === '?') { openHelp(); }
    });
  }


  // —— 声景长图：把 20 条声景按类别排成一张长图，可下载分享 ——
  function longImage() {
    const W = 1400, rowH = 96, headH = 210, footH = 90;
    const H = headH + footH + points.length * rowH;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#F2F4F3'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(36,48,74,0.05)'; g.lineWidth = 1;
    for (let x = 50; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    // 头
    g.fillStyle = '#24304A';
    g.font = '400 64px "Songti SC","SimSun",serif';
    g.fillText('声景校园 · 北航', 64, 96);
    g.font = '400 26px "Songti SC","SimSun",serif';
    g.fillStyle = 'rgba(36,48,74,.6)';
    g.fillText('一张可以看的声景地图：20 条声景 · ' + (state.slot || '') + ' · ' + new Date().toLocaleDateString('zh-CN'), 64, 138);
    g.fillStyle = 'rgba(36,48,74,.45)';
    g.font = '400 20px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('每行一条声景：类别色 · 声纹 · 地点 · 热闹度；声音由 WebAudio 实时合成，无音频文件', 64, 176);
    let y = headH;
    for (const p of points) {
      const cat = CATEGORY.get(p.profile.category);
      const { wave } = fingerprint(p.profile, state.slot);
      // 类别色条 + 底
      g.fillStyle = 'rgba(36,48,74,.03)'; g.fillRect(56, y - 26, W - 112, rowH - 8);
      g.fillStyle = cat.color; g.fillRect(56, y - 26, 5, rowH - 8);
      // 标题 / 地点
      g.fillStyle = '#24304A';
      g.font = '400 30px "Songti SC","SimSun",serif';
      g.fillText(p.profile.title, 78, y + 4);
      g.fillStyle = 'rgba(36,48,74,.6)';
      g.font = '400 18px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(cat.name + ' · ' + p.where + ' · ' + p.profile.duration + 's · 热闹度 ' + loudness(p.profile, state.slot), 78, y + 32);
      // 小波形
      g.beginPath();
      const wx = 640, wy = y - 12, ww = 560, wh = 48;
      for (let i = 0; i < wave.length; i++) {
        const x = wx + (i / (wave.length - 1)) * ww;
        const yy = wy + wh / 2 + wave[i] * wh * 0.4;
        if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.strokeStyle = cat.color; g.lineWidth = 1.6; g.stroke();
      // 标签
      g.fillStyle = 'rgba(36,48,74,.45)';
      g.font = '400 16px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(p.profile.tags.map((t) => '#' + t).join(' '), 78, y + 52);
      y += rowH;
    }
    g.fillStyle = 'rgba(36,48,74,.5)';
    g.font = '400 18px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('声景校园 · 北航 · 听见学院路   —   程序化声景 / 不加载音频文件', 64, H - 32);
    return cv;
  }
  function downloadLongImage() {
    const cv = longImage();
    cv.toBlob((blob) => {
      if (!blob) return;
      const u = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = u; link.download = '声景校园-声景长图.png';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      flashRouteTip('长图已保存：声景校园-声景长图.png');
    }, 'image/png');
  }


  // —— 今日声景：按日期挑一条，像每天翻开的日历 ——
  function todayPick(offset = 0) {
    const day = Math.floor(Date.now() / 86400000) + offset;
    let h = day % points.length;
    if (h < 0) h += points.length;
    return points[h];
  }
  function renderToday(offset = 0) {
    const host = document.getElementById('today-sound');
    if (!host) return;
    const p = todayPick(offset);
    const cat = CATEGORY.get(p.profile.category);
    host.innerHTML = '<span class="today-kicker">今天的声景</span>' +
      '<button type="button" class="today-title"><i style="background:' + cat.color + '"></i>' + esc(p.profile.title) + ' · ' + esc(p.where) + '</button>' +
      '<button type="button" class="today-next" aria-label="换一条">换一条</button>';
    host.querySelector('.today-title').addEventListener('click', () => selectPoint(p, { fly: true }));
    host.querySelector('.today-next').addEventListener('click', () => renderToday(offset + 1));
  }


  // —— 骰子：带我去一个随机声景 ——
  function goLucky() {
    if (!points.length) return;
    let p = points[Math.floor(Math.random() * points.length)];
    if (state.selected && p.profile.id === state.selected.profile.id) p = points[(points.indexOf(p) + 1) % points.length];
    selectPoint(p, { fly: true });
    hooks.onAudio?.(p.profile, { x: p.x, y: p.y });
    flashRouteTip('骰子：' + p.profile.title + ' · ' + p.where);
  }


  // —— 跟随真实时间：按钟点自动选天光，每 60 秒对一次 ——
  function slotByClock() {
    const h = new Date().getHours();
    if (h >= 5 && h < 8) return '晨';
    if (h >= 8 && h < 11) return '上午';
    if (h >= 11 && h < 14) return '午';
    if (h >= 14 && h < 17) return '下午';
    if (h >= 17 && h < 20) return '晚';
    return '夜';
  }
  function followClock() {
    if (!document.body.classList.contains('is-clock')) return;
    const want = slotByClock();
    if (app.light !== want) app.setSlot(want);
  }


  // —— 我的收藏 ——
  const fav = new Set((() => { try { return JSON.parse(localStorage.getItem('ss-fav') || '[]'); } catch { return []; } })());
  function saveFav() { try { localStorage.setItem('ss-fav', JSON.stringify([...fav])); } catch { /* 隐私模式 */ } }
  function renderFavs() {
    const host = document.getElementById('favs');
    if (!host) return;
    if (!fav.size) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = '<span class="fav-kicker">我的收藏</span>' + [...fav].map((id) => {
      const p = pointById.get(id);
      if (!p) return '';
      const cat = CATEGORY.get(p.profile.category);
      return '<button type="button" class="fav-chip" data-id="' + id + '"><i style="background:' + cat.color + '"></i>' + esc(p.profile.title) + '</button>';
    }).join('');
    host.querySelectorAll('.fav-chip').forEach((b) => b.addEventListener('click', () => { const p = pointById.get(b.dataset.id); if (p) selectPoint(p, { fly: true }); }));
  }
  function toggleFav(p) {
    if (!p) return;
    if (fav.has(p.profile.id)) fav.delete(p.profile.id); else fav.add(p.profile.id);
    saveFav(); renderFavs(); renderDetail();
    flashRouteTip(fav.has(p.profile.id) ? '已收藏：' + p.profile.title : '取消收藏：' + p.profile.title);
  }


  // —— 我的笔记 ——
  const notes = (() => { try { return JSON.parse(localStorage.getItem('ss-notes') || '{}'); } catch { return {}; } })();
  function noteFor(id) { return notes[id] || ''; }
  function saveNote(id, v) { if (v) notes[id] = v; else delete notes[id]; try { localStorage.setItem('ss-notes', JSON.stringify(notes)); } catch { /* 隐私模式 */ } }


  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => flashRouteTip('已复制到剪贴板'), () => flashRouteTip('复制失败，请手动选择文字'));
    else flashRouteTip('浏览器不支持剪贴板，请手动选择文字');
  }
  function copyProfileText(p, where) {
    const cat = CATEGORY.get(p.category);
    const text = '『' + p.title + '』' + where + ' · ' + p.zone + ' · ' + p.duration + ' 秒 · ' + cat.name + '\n' + p.story + '\n' + p.tags.map((t) => '#' + t).join(' ') + '\n—— 声景校园 · 北航';
    copyText(text);
  }


  function openStats() {
    let host = document.getElementById('stats');
    if (!host) { host = document.createElement('div'); host.id = 'stats'; host.className = 'help'; host.hidden = true; document.body.appendChild(host); }
    host.hidden = false;
    const counts = categoryCounts(points.map((p) => p.profile));
    const avg = Math.round(points.reduce((s, p) => s + loudness(p.profile, state.slot), 0) / points.length);
    const maxW = Math.max(...CATEGORIES.map((c) => counts.get(c.id) || 0), 1);
    host.innerHTML = '<div class="help-box"><header class="help-head"><h4>声音统计</h4>' +
      '<button type="button" class="help-close">关闭</button></header>' +
      '<div class="stat-grid">' +
      '<div><b>' + points.length + '</b><span>条声景</span></div>' +
      '<div><b>' + CATEGORIES.length + '</b><span>个类别</span></div>' +
      '<div><b>' + avg + '</b><span>平均热闹度</span></div>' +
      '<div><b>' + visited.size + '</b><span>已收录</span></div>' +
      '<div><b>' + fav.size + '</b><span>已收藏</span></div>' +
      '<div><b>' + route.list.length + '</b><span>路线站数</span></div>' +
      '</div><ul class="stat-cats">' + CATEGORIES.map((c) => '<li><i style="background:' + c.color + '"></i><span>' + c.name + '</span><u><b style="width:' + Math.round((counts.get(c.id) || 0) / maxW * 100) + '%;background:' + c.color + '"></b></u><em>' + (counts.get(c.id) || 0) + '</em></li>').join('') + '</ul>' +
      '<p class="help-tip">当前天光：' + (state.slot || '') + ' · 统计的是本页 20 条声景档案</p></div>';
    host.querySelector('.help-close').addEventListener('click', () => { host.hidden = true; });
  }


  async function openAbout() {
    let host = document.getElementById('about');
    if (!host) { host = document.createElement('div'); host.id = 'about'; host.className = 'help'; host.hidden = true; document.body.appendChild(host); }
    host.hidden = false;
    let version = '';
    try { version = (await (await fetch('version.json', { cache: 'no-store' })).json()).version || ''; } catch { /* 忽略 */ }
    host.innerHTML = '<div class="help-box"><header class="help-head"><h4>关于这个作品</h4>' +
      '<button type="button" class="help-close">关闭</button></header>' +
      '<p class="about-lede">「声景校园 · 北航」是一个只关于校园的声景作品：一座能转着看的 3D 卡纸校园，加上 20 条可以看、可以听、可以收藏、可以排成散步路线的声景档案。</p>' +
      '<p class="about-lede">它没有导入任何音频文件：所有声音都由 WebAudio 在浏览器里实时合成，所有声景文案、权重与声纹都是为这座校园原创的示意内容。</p>' +
      '<dl class="about-meta"><div><dt>版本</dt><dd>v' + (version || '—') + ' · 共 22 轮创新</dd></div>' +
      '<div><dt>三维</dt><dd>Three.js（卡片/卡纸风格，MIT）</dd></div>' +
      '<div><dt>模型来源</dt><dd>「刻声 · 十秒声片柜」校园模型（MIT）</dd></div>' +
      '<div><dt>校园数据</dt><dd>OpenStreetMap contributors（ODbL 1.0）</dd></div>' +
      '<div><dt>交互</dt><dd>粒子波纹 · 声景档案 · 程序化声景 · 路线 · 明信片 · 长图 · 图鉴</dd></div></dl>' +
      '<p class="help-tip">快捷键：按 ? 看全部。</p></div>';
    host.querySelector('.help-close').addEventListener('click', () => { host.hidden = true; });
  }


  // —— 分享视图：把当前天光/季节/选中的声景写进链接 ——
  function shareView() {
    const hash = '#view=' + [state.slot, app.season, state.selected ? state.selected.profile.id : ''].join('|');
    location.hash = hash;
    const url = location.origin + location.pathname + location.search + hash;
    copyText(url);
  }
  function readViewFromHash() {
    const m = location.hash.match(/#view=([^&]+)/);
    if (!m) return;
    const [slot, season, sid] = decodeURIComponent(m[1]).split('|');
    if (slot && ['夜', '晨', '上午', '午', '下午', '晚'].includes(slot)) { state.slot = slot; app.setSlot(slot); }
    if (season && ['春', '夏', '秋', '冬'].includes(season)) app.setSeason(season);
    if (sid && /^snd-/.test(sid)) setTimeout(() => { const p = pointById.get(sid); if (p) selectPoint(p, { fly: false, scroll: false }); }, 400);
  }


  // —— 演示模式：自动巡演，适合开场/答辩 ——
  const demo = { on: false, timer: 0, step: 0 };
  const DEMO_SLOTS = ['晨', '上午', '午', '下午', '晚', '夜'];
  const DEMO_SEASONS = ['春', '夏', '秋', '冬'];
  function stopDemo() {
    demo.on = false;
    clearTimeout(demo.timer);
    document.body.classList.remove('is-demo');
    const b = document.getElementById('demo-btn');
    if (b) { b.textContent = '演示'; b.setAttribute('aria-pressed', 'false'); }
  }
  function startDemo() {
    demo.on = true; demo.step = 0;
    document.body.classList.add('is-demo');
    document.getElementById('demo-btn').textContent = '停止演示';
    const tick = () => {
      if (!demo.on) return;
      const i = demo.step++;
      app.setSlot(DEMO_SLOTS[i % DEMO_SLOTS.length]);
      if (i % 3 === 0) app.setSeason(DEMO_SEASONS[(i / 3 | 0) % DEMO_SEASONS.length]);
      const p = points[(i * 7 + 3) % points.length];
      selectPoint(p, { fly: true, scroll: false });
      if (i >= 17) { stopDemo(); return; }
      demo.timer = setTimeout(tick, 4200);
    };
    tick();
  }
  function toggleDemo() { if (demo.on) stopDemo(); else startDemo(); }


  // —— 声音日记：最近点开过的 8 条 ——
  let diary = (() => { try { return JSON.parse(localStorage.getItem('ss-diary') || '[]'); } catch { return []; } })();
  function pushDiary(p) {
    diary = [{ id: p.profile.id, t: Date.now() }, ...diary.filter((d) => d.id !== p.profile.id)].slice(0, 8);
    try { localStorage.setItem('ss-diary', JSON.stringify(diary)); } catch { /* 隐私模式 */ }
    renderDiary();
  }
  function renderDiary() {
    const host = document.getElementById('diary');
    if (!host) return;
    if (!diary.length) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = '<header class="diary-head"><h3>最近听过 <span>' + diary.length + '</span></h3><button type="button" class="diary-clear">清空</button></header><ol class="diary-list">' +
      diary.map((d) => {
        const p = pointById.get(d.id);
        if (!p) return '';
        const cat = CATEGORY.get(p.profile.category);
        const hh = new Date(d.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return '<li><button type="button" data-id="' + d.id + '"><i style="background:' + cat.color + '"></i>' + esc(p.profile.title) + '<em>' + hh + '</em></button></li>';
      }).join('') + '</ol>';
    host.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => { const p = pointById.get(b.dataset.id); if (p) selectPoint(p, { fly: true }); }));
    host.querySelector('.diary-clear').addEventListener('click', () => { diary = []; try { localStorage.removeItem('ss-diary'); } catch { /* 忽略 */ } renderDiary(); });
  }


  // —— 摇一个声音的一天：随机天光、季节、三站路线 ——
  function shakeDay() {
    const slots = ['夜', '晨', '上午', '午', '下午', '晚'];
    const seasons = ['春', '夏', '秋', '冬'];
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const season = seasons[Math.floor(Math.random() * seasons.length)];
    app.setSlot(slot);
    app.setSeason(season);
    const pool = points.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    route.list = pool;
    renderRoute();
    flashRouteTip('摇到：' + slot + ' · ' + season + ' · ' + pool.length + ' 站——点「播放」走一圈');
  }


  // —— 导出我的声景：收藏、笔记、图鉴、日记 ——
  function exportMine() {
    const data = {
      app: '声景校园 · 北航', exportedAt: new Date().toISOString(),
      favorites: [...fav], notes, visited: [...visited], diary,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = u; link.download = '我的声景-收藏与笔记.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    flashRouteTip('已导出：我的声景-收藏与笔记.json');
  }


  // —— 五类声音说明 ——
  const CAT_DESC = {
    study: ['学习', '铃声、笔记、键盘、翻书与安静的室内低鸣。'],
    life: ['生活', '食堂、刷卡、脚步、宿舍楼下的人声与猫。'],
    sport: ['运动', '球馆、跑道、哨声、鞋底摩擦与呼吸。'],
    nature: ['自然', '树、风、鸟、虫、水，校园里不需要人的那部分。'],
    art: ['艺术', '音乐厅的试音、展厅的脚步与回响。'],
  };
  function openCatsInfo() {
    let host = document.getElementById('catsinfo');
    if (!host) { host = document.createElement('div'); host.id = 'catsinfo'; host.className = 'help'; host.hidden = true; document.body.appendChild(host); }
    host.hidden = false;
    const counts = categoryCounts(points.map((p) => p.profile));
    host.innerHTML = '<div class="help-box"><header class="help-head"><h4>五类声音</h4><button type="button" class="help-close">关闭</button></header>' +
      '<div class="cat-cards">' + CATEGORIES.map((c) => {
        const d = CAT_DESC[c.id] || [c.name, ''];
        return '<div class="cat-card" style="border-left-color:' + c.color + '"><b>' + d[0] + ' <em>' + (counts.get(c.id) || 0) + '</em></b><p>' + d[1] + '</p></div>';
      }).join('') + '</div>' +
      '<p class="help-tip">类别颜色贯穿 3D 圆点、小地图、粒子波纹与档案标签。</p></div>';
    host.querySelector('.help-close').addEventListener('click', () => { host.hidden = true; });
  }


  // —— 常驻时间条：画面上直接切换天光 ——
  function updateTimeHud() {
    const hud = document.getElementById('time-hud');
    if (!hud) return;
    hud.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.slot === state.slot;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function buildTimeHud() {
    const stage = document.querySelector('.stage') || document.body;
    const hud = document.createElement('div');
    hud.id = 'time-hud';
    hud.className = 'time-hud';
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', '切换天光时段');
    ['夜', '晨', '上午', '午', '下午', '晚'].forEach((sl) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.slot = sl;
      b.textContent = sl;
      b.title = '切换到「' + sl + '」的天光';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        state.slot = sl;
        app.setSlot(sl);
        updateTimeHud();
      });
      hud.appendChild(b);
    });
    const label = document.createElement('span');
    label.className = 'time-hud-label';
    label.textContent = '天光';
    hud.insertBefore(label, hud.firstChild);
    stage.appendChild(hud);
    updateTimeHud();
  }


  // —— 地点全景：选中哪个地点就换哪张，右→左→右 8 秒一轮 ——
  function updatePanorama(p) {
    const img = document.getElementById('pano-img');
    if (!img || !p) return;
    const id = p.profile.id;
    const cat = CATEGORY.get(p.profile.category);
    const nameEl = document.getElementById('pano-name');
    if (nameEl) nameEl.textContent = p.where + ' · ' + cat.name;
    const box = document.getElementById('pano-box');
    const svg = 'src/assets/panorama/' + id + '.svg';
    const jpg = 'src/assets/panorama/' + id + '.jpg';
    const open = document.getElementById('pano-open');
    if (open) open.href = svg;
    img.onerror = () => {
      img.onerror = null;
      if (!/\.svg$/.test(img.getAttribute('src') || '')) img.setAttribute('src', svg);
    };
    img.setAttribute('src', jpg);
    img.alt = p.where + '的全景照片（示意）';
    // 换图后让平移动画从头开始（从右端往左扫）
    if (box) { box.classList.remove('is-pan'); void box.offsetWidth; box.classList.add('is-pan'); }
  }

  // —— 详情面板 ——
  function renderDetail() {
    const s = state.selected;
    if (!s) { els.detail.hidden = true; els.detail.innerHTML = ''; stopFingerprint(); return; }
    const p = s.profile;
    const cat = CATEGORY.get(p.category);
    const ls = layersAt(p, state.slot);
    const loud = loudness(p, state.slot);
    els.detail.hidden = false;
    els.detail.innerHTML = `
      <div class="ad-head">
        <span class="ad-cat" style="background:${cat.color}">${cat.name}</span>
        <h4>${esc(p.title)}</h4>
        <span class="ad-dur">${p.duration}s</span>
      </div>
      <p class="ad-place">${esc(s.where)} · ${esc(p.zone)}</p>
      <canvas class="ad-fp" id="atlas-fp" aria-label="声纹动画：这条声景的波形与频谱"></canvas>
      <div class="ad-meter"><span>安静</span><i><b style="width:${loud}%;background:${cat.color}"></b></i><span>热闹</span><em>${loud}</em></div>
      <ul class="ad-layers">${ls.slice(0, 5).map((l) => `
        <li><span>${esc(l.name)}</span><i><b style="width:${Math.round(Math.min(1, l.w / 1.5) * 100)}%;background:${cat.color}"></b></i></li>`).join('')}
      </ul>
      <div class="ad-day" role="group" aria-label="一天里的声景：点一条切换天光">
        ${SLOTS.map((sl) => `<button type="button" data-slot="${sl}" aria-pressed="${sl === state.slot}" style="--h:${loudness(p, sl)}%" title="${sl}：热闹度 ${loudness(p, sl)}"><i></i><span>${sl}</span></button>`).join('')}
      </div>
      <p class="ad-day-note">同一条声景，一天里不一样：点上面的小条切换天光。</p>
      <p class="ad-time">${esc(timeNote(p, state.slot))}</p>
      <p class="ad-story">${esc(p.story)}</p>
      <div class="ad-tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>
      <div class="ad-actions">
        <button type="button" data-act="fav">收藏 ☆</button>
        <button type="button" data-act="route">加入路线</button>
        <button type="button" data-act="listen">听一听（程序化）</button>
        <button type="button" data-act="postcard">保存明信片</button>
        <button type="button" data-act="copy">复制文案</button>
        <button type="button" data-act="replay">再看一次波纹</button>
      </div>
      <label class="ad-notebox"><span>我的笔记</span><textarea class="ad-noteinput" rows="2" maxlength="200" placeholder="给这条声音写一句话……"></textarea></label>
      <p class="ad-note">不加载音频文件：点「听一听」由 WebAudio 实时合成这一处的声音（默认静音，需要手动打开）。</p>
      <button type="button" class="ad-more" data-mine="sounds" title="上传/查看别的声音（不改变这一处播放的声音）">声音 · 更多</button>`;
    els.detail.querySelector('[data-act="replay"]').addEventListener('click', () => { state.suppress = true; flyTo(s); state.suppress = false; });
    els.detail.querySelector('[data-act="listen"]').addEventListener('click', () => {
      hooks.onAudio?.(p, { x: s.x, y: s.y });
    });
    els.detail.querySelector('[data-act="copy"]').addEventListener('click', () => copyProfileText(p, s.where));
    const noteEl = els.detail.querySelector('.ad-noteinput');
    if (noteEl) {
      noteEl.value = noteFor(p.id);
      noteEl.addEventListener('input', () => saveNote(p.id, noteEl.value.trim()));
    }
    const favBtn = els.detail.querySelector('[data-act="fav"]');
    if (favBtn) { favBtn.textContent = fav.has(p.id) ? '已收藏 ★' : '收藏 ☆'; favBtn.addEventListener('click', () => toggleFav(s)); }
    els.detail.querySelector('[data-act="route"]').addEventListener('click', () => addToRoute(p));
    els.detail.querySelector('[data-act="postcard"]').addEventListener('click', () => downloadPostcard(p, s));
    els.detail.querySelectorAll('.ad-day button').forEach((b) => {
      b.addEventListener('click', () => {
        state.slot = b.dataset.slot;
        app.setSlot(b.dataset.slot);
        renderDetail();
      });
    });
    stopFingerprint();
    drawFingerprint(performance.now());
  }

  function flyTo(s) {
    if (s.kind === 'place') app.rippleAt(s.profile.place);
    else app.focusPoint?.(s.x, s.y, { color: CATEGORY.get(s.profile.category).color, dist: 520 });
  }

  function selectPoint(p, opts = {}) {
    state.selected = p || null;
    renderList();
    renderDetail();
    updatePanorama(p);
    paintMap();
    if (p) {
      document.body.dataset.atlasSel = p.profile.id;
      if (!visited.has(p.profile.id)) { visited.add(p.profile.id); saveVisited(); refreshGalleryBtn(); }
      pushDiary(p);
      if (opts.fly) flyTo(p);
      // 页内滚动到档案块，避免用户以为没反应（打开页面时的初始选中不滚）
      if (opts.scroll !== false) els.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      delete document.body.dataset.atlasSel;
    }
    hooks.onSelect?.(p ? p.profile : null);
  }
  function selectByPlace(placeId) {
    const p = pointByPlace.get(placeId);
    if (p && (!state.selected || state.selected.profile.id !== p.profile.id)) selectPoint(p, { fly: false });
  }

  // —— 声景路线 ——
  function renderRoute() {
    const list = $('route-list');
    const cnt = $('route-count');
    if (!list) return;
    if (cnt) cnt.textContent = String(route.list.length);
    list.innerHTML = '';
    route.list.forEach((p, i) => {
      const li = document.createElement('li');
      const cat = CATEGORY.get(p.profile.category);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-chip' + (state.selected && state.selected.profile.id === p.profile.id ? ' is-on' : '') + (route.playing && route.idx === i ? ' is-playing' : '');
      b.innerHTML = '<i>' + (i + 1) + '</i><span style="border-color:' + cat.color + '">' + esc(p.profile.title) + '</span><em>×</em>';
      b.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'EM') { removeFromRoute(p.profile.id); return; }
        if (route.playing) stopRoute();
        selectPoint(p, { fly: true, scroll: false });
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    const tip = $('route-tip');
    if (tip) tip.textContent = route.list.length
      ? (route.playing ? '正在播放第 ' + (route.idx + 1) + ' / ' + route.list.length + ' 站…（点任意站点可停）' : '共 ' + route.list.length + ' 站 · 约 ' + (route.list.length * 6) + ' 秒，播放时会自动打开声音。')
      : '在声景档案里点「加入路线」，排一条自己的声音散步；播放时会自动飞过去、换声音。';
    const play = $('route-play');
    if (play) { play.textContent = route.playing ? '停止' : '播放'; play.setAttribute('aria-pressed', String(route.playing)); }
  }
  function addToRoute(p) {
    if (!p) return;
    if (route.list.some((x) => x.profile.id === p.profile.id)) { flashRouteTip('这条已经在路线里了'); return; }
    if (route.list.length >= 8) { flashRouteTip('最多 8 站，先去路线里点 × 删掉几站'); return; }
    route.list.push(p);
    renderRoute();
    flashRouteTip('已加入：' + p.profile.title);
  }
  function flashRouteTip(text) {
    const tip = $('route-tip');
    if (!tip) return;
    tip.textContent = text;
    clearTimeout(flashRouteTip.t);
    flashRouteTip.t = setTimeout(renderRoute, 1800);
  }
  function removeFromRoute(id) {
    route.list = route.list.filter((x) => x.profile.id !== id);
    if (route.playing) stopRoute();
    renderRoute();
  }
  function clearRoute() {
    route.list = [];
    if (route.playing) stopRoute();
    renderRoute();
  }
  function stopRoute() {
    route.playing = false;
    clearTimeout(route.timer);
    route.idx = 0;
    renderRoute();
  }
  function playRoute() {
    if (!route.list.length) { flashRouteTip('路线是空的：先去档案里点「加入路线」'); return; }
    if (route.playing) { stopRoute(); return; }
    hooks.onRequestSound?.();
    route.playing = true;
    route.idx = 0;
    renderRoute();
    const step = () => {
      if (!route.playing) return;
      if (route.idx >= route.list.length) { stopRoute(); flashRouteTip('走完了：' + route.list.length + ' 站声景'); return; }
      const p = route.list[route.idx];
      selectPoint(p, { fly: true, scroll: false });
      renderRoute();
      route.timer = setTimeout(() => { route.idx += 1; step(); }, 5600);
    };
    step();
  }
  function copyRouteLink() {
    const ids = route.list.map((p) => p.profile.id);
    const hash = ids.length ? '#walk=' + ids.join(',') : '';
    if (hash) location.hash = hash;      // 先写进地址栏，分享的就是这一条
    const url = location.origin + location.pathname + location.search + location.hash;
    const done = () => flashRouteTip(ids.length ? '链接已复制：打开就能看到这条路线' : '路线是空的，先加几站');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  }
  function readRouteFromHash() {
    const m = location.hash.match(/#walk=([^&]+)/);
    if (!m) return;
    const ids = decodeURIComponent(m[1]).split(',').filter(Boolean);
    for (const id of ids) { const p = pointById.get(id); if (p) route.list.push(p); }
    renderRoute();
  }

  // —— 声景小地图 ——
  const map = { pts: [], ox: 0, oy: 0, s: 1, w: 0, h: 0, hover: null };
  let mapMode = 'dots';   // dots：点位；heat：声景热力——越吵的地方越亮
  function mapLayout() {
    const c = els.mapCanvas;
    if (!c) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 236, h = 196;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    map.ctx = ctx; map.w = w; map.h = h;
    const out = app.outline || [];
    if (!out.length) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of out) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const pad = 10;
    const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
    map.s = s;
    map.minX = minX;
    map.maxY = maxY;
    map.ox = pad + ((w - pad * 2) - (maxX - minX) * s) / 2;
    map.oy = pad + ((h - pad * 2) - (maxY - minY) * s) / 2;
    return true;
  }
  /** 北向坐标（米）→ 小地图屏幕坐标：x 向右、北向上。 */
  function mapXY(x, y) {
    return [map.ox + (x - map.minX) * map.s, map.oy + (map.maxY - y) * map.s];
  }

  function paintMap() {
    if (!mapLayout()) return;
    const ctx = map.ctx;
    ctx.clearRect(0, 0, map.w, map.h);
    // 校园轮廓
    const out = app.outline || [];
    ctx.beginPath();
    out.forEach(([x, y], i) => {
      const [px, py] = mapXY(x, y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(242,244,243,.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,244,243,.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (mapMode === 'heat') {
      // 热力：按当前时段的「热闹度」画一团团光，越吵越亮越大；类别颜色
      ctx.globalCompositeOperation = 'lighter';
      for (const p of points) {
        const dim = state.filter !== 'all' && p.profile.category !== state.filter;
        if (dim) continue;
        const cat = CATEGORY.get(p.profile.category);
        const lv = loudness(p.profile, state.slot) / 100;
        const [px, py] = mapXY(p.x, p.y);
        const r = 9 + lv * 26;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, cat.color + 'cc');
        g.addColorStop(0.45, cat.color + '55');
        g.addColorStop(1, cat.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (state.selected) {
        const [px, py] = mapXY(state.selected.x, state.selected.y);
        ctx.strokeStyle = 'rgba(242,244,243,.85)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    // 点位
    for (const p of points) {
      const cat = CATEGORY.get(p.profile.category);
      const dim = state.filter !== 'all' && p.profile.category !== state.filter;
      const [px, py] = mapXY(p.x, p.y);
      p._sx = px; p._sy = py;
      const on = state.selected && state.selected.profile.id === p.profile.id;
      ctx.beginPath();
      ctx.arc(px, py, on ? 4.6 : p.kind === 'park' ? 2.8 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = dim ? cat.color + '33' : cat.color;
      ctx.fill();
      if (on) {
        ctx.beginPath();
        ctx.arc(px, py, 8.5, 0, Math.PI * 2);
        ctx.strokeStyle = cat.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    // 选中点位的小十字（在模型视角里也能找到）
    if (state.selected) {
      const [px, py] = mapXY(state.selected.x, state.selected.y);
      ctx.strokeStyle = 'rgba(242,244,243,.75)';
      ctx.beginPath();
      ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py);
      ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3);
      ctx.stroke();
    }
  }

  // 悬停 / 点击小地图
  function mapHit(ev) {
    const r = els.mapCanvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, bd = 12;
    for (const p of points) {
      if (p._sx == null) continue;
      const d = Math.hypot(p._sx - mx, p._sy - my);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  if (els.mapCanvas) {
    els.mapCanvas.addEventListener('pointermove', (ev) => {
      const p = mapHit(ev);
      if (!p) { els.mapTip.textContent = '点小图上的点，直接跳到那处声景'; return; }
      const cat = CATEGORY.get(p.profile.category);
      els.mapTip.innerHTML = `<b style="color:${cat.color}">${esc(p.profile.title)}</b> · ${esc(p.where)}`;
    });
    els.mapCanvas.addEventListener('pointerleave', () => { els.mapTip.textContent = '点小图上的点，直接跳到那处声景'; });
    els.mapCanvas.addEventListener('click', (ev) => { const p = mapHit(ev); if (p) selectPoint(p, { fly: true }); });
  }
  // 热力 / 点位 切换
  if (els.mapBody && els.mapCanvas) {
    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'map-mode';
    modeBtn.textContent = '热力';
    modeBtn.setAttribute('aria-label', '切换：点位 / 声景热力');
    modeBtn.addEventListener('click', () => {
      mapMode = mapMode === 'dots' ? 'heat' : 'dots';
      modeBtn.textContent = mapMode === 'dots' ? '热力' : '点位';
      if (els.mapTip) els.mapTip.textContent = mapMode === 'heat'
        ? '热力：越亮越吵（按当前时段）。再点「点位」回到地图。'
        : '点小图上的点，直接跳到那处声景';
      paintMap();
    });
    els.mapBody.insertBefore(modeBtn, els.mapCanvas);
  }
  if (els.mapToggle) {
    els.mapToggle.addEventListener('click', () => {
      const open = els.mapBody.hidden;
      els.mapBody.hidden = !open;
      els.mapToggle.setAttribute('aria-pressed', String(open));
    });
    els.mapToggle.setAttribute('aria-pressed', String(!els.mapBody.hidden));
  }

  // —— 盲猜：随机挑一条声景的「声纹」，让人从 3 个地点里选（不看名字，只看形状）——
  function blindGuess() {
    const pool = points.filter((p) => p.kind === 'place');
    const target = pool[Math.floor(Math.random() * pool.length)];
    const others = points.filter((p) => p !== target && p.profile.category !== target.profile.category);
    const opts = [target, ...others.sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5);
    const { bars } = fingerprint(target.profile, state.slot);
    const host = $('blind');
    host.hidden = false;
    host.innerHTML = `<div class="bg-card">
      <p class="bg-kicker">盲猜 · 声纹</p>
      <h4>这是哪一处的声音？</h4>
      <canvas class="bg-fp" id="blind-fp" aria-hidden="true"></canvas>
      <div class="bg-opts">${opts.map((p, i) => `<button type="button" data-i="${i}">${esc(p.where)}</button>`).join('')}</div>
      <p class="bg-fb" id="blind-fb"></p>
      <div class="bg-acts"><button type="button" data-act="new">换一个</button><button type="button" data-act="close">收起</button></div>
    </div>`;
    // 画一根「不泄露类别」的灰声纹
    const c = $('blind-fp');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 300 * dpr; c.height = 64 * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < bars.length; i++) {
      const bw = 300 / bars.length;
      const bh = Math.max(2, bars[i] * 54);
      ctx.fillStyle = 'rgba(242,244,243,.8)';
      ctx.fillRect(i * bw + bw * 0.18, 64 - bh, bw * 0.64, bh);
    }
    const fb = $('blind-fb');
    host.querySelectorAll('.bg-opts button').forEach((b) => {
      b.addEventListener('click', () => {
        const pick = opts[Number(b.dataset.i)];
        const ok = pick === target;
        host.querySelectorAll('.bg-opts button').forEach((x) => { x.disabled = true; });
        fb.textContent = ok ? `对了。这是「${target.where}」——${target.profile.title}` : `其实是「${target.where}」——${target.profile.title}`;
        fb.className = 'bg-fb ' + (ok ? 'ok' : 'bad');
        selectPoint(target, { fly: false });
      });
    });
    host.querySelector('[data-act="new"]').addEventListener('click', blindGuess);
    host.querySelector('[data-act="close"]').addEventListener('click', () => { host.hidden = true; host.innerHTML = ''; });
  }
  const blindBtn = $('atlas-blind');
  if (blindBtn) blindBtn.addEventListener('click', blindGuess);
  const galBtn = document.createElement('button');
  galBtn.type = 'button'; galBtn.id = 'atlas-gallery'; galBtn.className = 'ghost';
  galBtn.addEventListener('click', openGallery);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.appendChild(galBtn);
  const cmpBtn = document.createElement('button');
  cmpBtn.type = 'button'; cmpBtn.className = 'ghost'; cmpBtn.textContent = '对比';
  cmpBtn.addEventListener('click', openCompare);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.appendChild(cmpBtn);
  const helpBtn = document.createElement('button');
  helpBtn.type = 'button'; helpBtn.className = 'ghost'; helpBtn.textContent = '快捷键';
  helpBtn.addEventListener('click', openHelp);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.appendChild(helpBtn);
  const longBtn = document.createElement('button');
  longBtn.type = 'button'; longBtn.className = 'ghost'; longBtn.textContent = '长图';
  longBtn.addEventListener('click', downloadLongImage);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.appendChild(longBtn);
  buildTimeHud();
  const clockBtn = document.createElement('button');
  clockBtn.type = 'button'; clockBtn.className = 'ghost'; clockBtn.textContent = '跟随时间';
  clockBtn.setAttribute('aria-pressed', 'false');
  clockBtn.addEventListener('click', () => {
    const on = !document.body.classList.contains('is-clock');
    document.body.classList.toggle('is-clock', on);
    clockBtn.setAttribute('aria-pressed', String(on));
    clockBtn.textContent = on ? '实时' : '跟随时间';
    if (on) { app.setSlot(slotByClock()); setInterval(followClock, 60000); }
  });
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(clockBtn, blindBtn);
  const catsBtn = document.createElement('button');
  catsBtn.type = 'button'; catsBtn.className = 'ghost'; catsBtn.textContent = '类别';
  catsBtn.addEventListener('click', openCatsInfo);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(catsBtn, blindBtn);
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button'; exportBtn.className = 'ghost'; exportBtn.textContent = '导出';
  exportBtn.addEventListener('click', exportMine);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(exportBtn, blindBtn);
  const calmBtn = document.createElement('button');
  calmBtn.type = 'button'; calmBtn.className = 'ghost'; calmBtn.textContent = '降低动效';
  const applyCalm = (on) => {
    document.body.classList.toggle('is-calm', on);
    calmBtn.setAttribute('aria-pressed', String(on));
    calmBtn.textContent = on ? '动效已降' : '降低动效';
    try { localStorage.setItem('ss-calm', on ? '1' : '0'); } catch { /* 隐私模式 */ }
    if (!on && state.selected) { fp.w = 0; drawFingerprint(performance.now()); }
  };
  calmBtn.addEventListener('click', () => applyCalm(!document.body.classList.contains('is-calm')));
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(calmBtn, blindBtn);
  if ((() => { try { return localStorage.getItem('ss-calm') === '1'; } catch { return false; } })()) applyCalm(true);
  const shakeBtn = document.createElement('button');
  shakeBtn.type = 'button'; shakeBtn.className = 'ghost'; shakeBtn.textContent = '摇一天';
  shakeBtn.addEventListener('click', shakeDay);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(shakeBtn, blindBtn);
  const demoBtn = document.createElement('button');
  demoBtn.type = 'button'; demoBtn.id = 'demo-btn'; demoBtn.className = 'ghost'; demoBtn.textContent = '演示';
  demoBtn.addEventListener('click', toggleDemo);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(demoBtn, blindBtn);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && demo.on) stopDemo(); });
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button'; shareBtn.className = 'ghost'; shareBtn.textContent = '分享视图';
  shareBtn.addEventListener('click', shareView);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(shareBtn, blindBtn);
  const aboutBtn = document.createElement('button');
  aboutBtn.type = 'button'; aboutBtn.className = 'ghost'; aboutBtn.textContent = '关于';
  aboutBtn.addEventListener('click', openAbout);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(aboutBtn, blindBtn);
  const statsBtn = document.createElement('button');
  statsBtn.type = 'button'; statsBtn.clone; statsBtn.className = 'ghost'; statsBtn.textContent = '统计';
  statsBtn.addEventListener('click', openStats);
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(statsBtn, blindBtn);
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button'; themeBtn.className = 'ghost'; themeBtn.textContent = '配色';
  const THEMES = ['', 'theme-night', 'theme-blueprint'];
  let themeIdx = Math.max(0, THEMES.indexOf((() => { try { return localStorage.getItem('ss-theme') || ''; } catch { return ''; } })()));
  const applyTheme = () => {
    document.body.classList.remove('theme-night', 'theme-blueprint');
    if (THEMES[themeIdx]) document.body.classList.add(THEMES[themeIdx]);
    themeBtn.textContent = ['配色 · 纸', '配色 · 夜', '配色 · 蓝图'][themeIdx];
    try { localStorage.setItem('ss-theme', THEMES[themeIdx]); } catch { /* 隐私模式 */ }
  };
  themeBtn.addEventListener('click', () => { themeIdx = (themeIdx + 1) % THEMES.length; applyTheme(); });
  applyTheme();
  if (blindBtn && blindBtn.parentNode) blindBtn.parentNode.insertBefore(themeBtn, blindBtn);
  const diceBtn = document.createElement('button');
  diceBtn.type = 'button'; diceBtn.id = 'dice-btn'; diceBtn.className = 'dice-btn';
  diceBtn.textContent = '骰子';
  diceBtn.setAttribute('aria-label', '带我去一个随机声景');
  diceBtn.addEventListener('click', goLucky);
  (document.querySelector('.stage') || document.body).appendChild(diceBtn);
  bindKeys();
  refreshGalleryBtn();

  // —— 初始化 ——
  // 搜索：标题 / 地点 / 标签 / 类别；按 / 聚焦，Esc 清空
  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'atlas-search';
  search.className = 'atlas-search';
  search.placeholder = '搜声景 / 地点 / 标签（按 /）';
  search.setAttribute('aria-label', '搜索声景');
  if (els.cats && els.cats.parentNode) {
    const today = document.createElement('div');
    today.id = 'today-sound'; today.className = 'today-sound';
    els.cats.parentNode.insertBefore(today, els.cats);
    renderToday();
    const favs = document.createElement('div');
    favs.id = 'favs'; favs.className = 'favs'; favs.hidden = true;
    els.cats.parentNode.insertBefore(favs, today);
    renderFavs();
  }
  if (els.cats && els.cats.parentNode) els.cats.parentNode.insertBefore(search, els.cats);
  const sortSel = document.createElement('select');
  sortSel.id = 'atlas-sort'; sortSel.className = 'atlas-sort';
  sortSel.setAttribute('aria-label', '声景排序');
  sortSel.innerHTML = '<option value="default">排序：默认</option><option value="loud">按热闹度</option><option value="name">按名称</option><option value="cat">按类别</option>';
  if (els.cats && els.cats.parentNode) els.cats.parentNode.insertBefore(sortSel, els.cats);
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; renderList(); });
  search.addEventListener('input', () => { state.q = search.value.trim(); renderList(); });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); }
    if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; state.q = ''; renderList(); search.blur(); }
  });

  // 沉浸模式：Z 或右下角按钮，藏起展签与小地图，只剩校园与声音
  function toggleZen(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('is-zen');
    document.body.classList.toggle('is-zen', on);
    const b = document.getElementById('zen-btn');
    if (b) b.textContent = on ? '退出沉浸' : '沉浸';
  }
  const zenBtn = document.createElement('button');
  zenBtn.type = 'button'; zenBtn.id = 'zen-btn'; zenBtn.className = 'zen-btn'; zenBtn.textContent = '沉浸';
  zenBtn.setAttribute('aria-label', '沉浸模式：只看校园（Z）');
  zenBtn.addEventListener('click', () => toggleZen());
  const stageEl = document.querySelector('.stage') || document.body;
  stageEl.appendChild(zenBtn);
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); toggleZen(); }
    if (e.key === 'Escape' && document.body.classList.contains('is-zen')) toggleZen(false);
  });

  renderCats();
  renderList();
  buildPresetButtons();
  renderRoute();
  readRouteFromHash();
  readViewFromHash();
  paintMap();
  const diaryHost = document.createElement('section');
  diaryHost.id = 'diary'; diaryHost.className = 'diary'; diaryHost.hidden = true;
  const routeEl = document.querySelector('.route');
  if (routeEl && routeEl.parentNode) routeEl.parentNode.insertBefore(diaryHost, routeEl.nextSibling);
  renderDiary();
  const rPlay = $('route-play'), rCopy = $('route-copy'), rClear = $('route-clear');
  if (rPlay) rPlay.addEventListener('click', playRoute);
  if (rCopy) rCopy.addEventListener('click', copyRouteLink);
  if (rClear) rClear.addEventListener('click', clearRoute);
  window.addEventListener('resize', () => { fp.w = 0; paintMap(); });
  // 默认选中第一条，打开页面就有一张声景档案可看
  selectPoint(points.find((p) => p.profile.id === 'snd-001') || points[0], { fly: false, scroll: false });

  return {
    setSlot(slot) {
      state.slot = slot;
      updateTimeHud();
      if (state.selected) { renderDetail(); }
      paintMap();
    },
    selectByPlace,
    select: (id) => { const p = pointById.get(id); if (p) selectPoint(p, { fly: true }); },
    get selected() { return state.selected ? state.selected.profile : null; },
    selectedPoint: () => (state.selected ? { x: state.selected.x, y: state.selected.y } : null),
    get points() { return points.map((p) => p.profile); },
    get route() { return route.list.map((p) => p.profile.id); },
    addToRoute: (id) => { const p = pointById.get(id); if (p) addToRoute(p); },
    playRoute, stopRoute, clearRoute,
    preset: (id) => applyPreset(id),
    openGallery, openCompare, openHelp, longImage, goLucky, openStats, openAbout, shareView,
    startDemo, stopDemo, toggleDemo, shakeDay, exportMine, openCatsInfo,
    toggleFav: (id) => toggleFav(pointById.get(id)),
    postcard: (id) => { const p = pointById.get(id) || state.selected; return p ? postcard(p.profile, p) : null; },
  };
}






