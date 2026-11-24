// 阶段1：顶部「默认/个人/社区」+ 地点大详情页（默认来源 = v38.9 声景档案）
import { POINTS, CATEGORY, layersAt, timeNote } from './soundscape.js';
import { createSoundscape } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
let app = null, sound = null, currentPid = null, currentProfile = null, tab = 'default';
let animTimer = 0;
const byPlace = new Map(POINTS.filter((p) => p.place).map((p) => [p.place, p]));
const byId = new Map(POINTS.map((p) => [p.id, p]));

function ensureSound() { if (!sound) sound = createSoundscape({ getCam: () => null }); return sound; }

function bar() {
  if ($('#top-tabs')) return;
  const d = document.createElement('div');
  d.id = 'top-tabs';
  d.innerHTML = ['默认', '个人', '社区'].map((t, i) => '<button type="button" data-tab="' + ['default', 'mine', 'community'][i] + '"' + (i === 0 ? ' class="on"' : '') + '>' + t + '</button>').join('');
  d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });
  document.body.appendChild(d);
}

function panel() {
  let p = $('#detail-panel');
  if (!p) {
    p = document.createElement('section');
    p.id = 'detail-panel';
    document.body.appendChild(p);
  }
  return p;
}
const isShown = () => { const p = panel(); return p.classList.contains('show'); };
function showPanel() {
  const p = panel();
  clearTimeout(animTimer);
  p.classList.add('show');
  document.body.classList.add('detail-open');
  try { window.__campus?.setFocusZoom?.(2.6); } catch (e) { /* ignore */ }
}
function hidePanel(keepModel) {
  const p = panel();
  clearTimeout(animTimer);
  p.classList.remove('show');
  if (!keepModel) {
    document.body.classList.remove('detail-open');
    try { window.__campus?.clearFocus?.(); window.__campus?.setFocusZoom?.(1); } catch (e) { /* ignore */ }
  }
  stopAllSounds();
}

function switchTab(next) {
  if (tab === next) return;
  [...document.querySelectorAll('#top-tabs button')].forEach((b) => b.classList.toggle('on', b.dataset.tab === next));
  const p = panel();
  if (p.classList.contains('show')) {
    // 先向上滑出，再切换内容，再滑入
    p.classList.remove('show');
    animTimer = setTimeout(() => { tab = next; render(); p.classList.add('show'); }, 1040);
  } else {
    tab = next;
    render();
  }
}

function contentHtml() {
  if (!currentProfile) return '';
  const cat = CATEGORY.get(currentProfile.category) || { name: currentProfile.category, color: '#8B949E' };
  const head = '<header class="dp-head"><b style="background:' + cat.color + '">' + cat.name + '</b>';
  if (tab === 'mine' || tab === 'community') {
    return '<div class="dp-inner">' + head + '<h2>' + (tab === 'mine' ? '个人' : '社区') + '</h2><button type="button" class="dp-close">×</button></header>' +
      '<div class="dp-empty">暂无</div><p class="dp-note">' + (tab === 'mine' ? '你上传的声音与全景图会显示在这里（阶段 2 接入）。' : '所有人上传中评分最高的声音与全景会显示在这里（阶段 3 接入）。') + '</p></div>';
  }
  const pan = 'src/assets/panorama/' + currentProfile.id + '.svg';
  const where = app ? ((app.places || []).find((x) => x.id === currentPid) || {}).name || '' : '';
  return '<div class="dp-inner">' + head + '<h2>' + currentProfile.title + '</h2><span class="dp-dur">' + currentProfile.duration + 's</span><button type="button" class="dp-close">×</button></header>' +
    '<p class="dp-where">' + where + ' · ' + currentProfile.zone + '</p>' +
    '<div class="dp-pano-wrap"><img class="dp-pano" src="' + pan + '" alt="' + currentProfile.title + ' 全景"></div>' +
    '<div class="dp-cols"><div><p class="dp-story">' + (currentProfile.story || '') + '</p><p class="dp-time">' + timeNote(currentProfile, app ? app.light : '上午') + '</p></div>' +
    '<div class="dp-side"><button type="button" class="dp-play">听一听（程序化）</button><div class="dp-tags">' + (currentProfile.tags || []).map((t) => '<span>#' + t + '</span>').join('') + '</div><p class="dp-note">默认声音与全景来自 v38.9 声景档案。</p></div></div></div>';
}

function render() {
  const p = panel();
  if (!currentProfile) { p.classList.remove('show'); document.body.classList.remove('detail-open'); return; }
  if (tab === 'mine') { renderMine(); return; }
  if (tab === 'community') { renderCommunity(); return; }
  p.innerHTML = contentHtml();
  const close = $('.dp-close', p);
  if (close) close.onclick = () => { hidePanel(false); currentPid = null; currentProfile = null; };
  const play = $('.dp-play', p);
  if (play) play.onclick = () => { playProfile(currentProfile); play.textContent = playingId === currentProfile.id ? '停止播放' : '听一听（程序化）'; };
}

// 点右上角的小区块模型 → 返回
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('focus-layer')) {
    hidePanel(false);
    currentPid = null;
    currentProfile = null;
  }
});
window.addEventListener('campus-place-focus', (e) => {
  currentPid = e.detail.pid;
  currentProfile = byPlace.get(currentPid) || byId.get(currentPid) || null;
  render();
  showPanel();
});
window.addEventListener('campus-zone-focus', (e) => { if (!e.detail.flat) { hidePanel(false); currentPid = null; currentProfile = null; } });

(function boot() { if (!window.__campus) { setTimeout(boot, 350); return; } app = window.__campus; bar(); })();


// —— 阶段2：个人资料（本机 IndexedDB）——
const MDB = 'campus-mine-v1';
function mineDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(MDB, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function mineAll() {
  const db = await mineDB();
  return new Promise((res, rej) => { const tx = db.transaction('items', 'readonly'); const q = tx.objectStore('items').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
}
async function mineAdd(item) {
  const db = await mineDB();
  return new Promise((res, rej) => { const tx = db.transaction('items', 'readwrite'); const q = tx.objectStore('items').add(item); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function mineDel(id) {
  const db = await mineDB();
  return new Promise((res) => { const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').delete(id); tx.oncomplete = () => res(); });
}
const urls = [];
let playingId = null, lastProfile = null, lastAudio = null;
const playingAudios = new Set();
function syncArm() {
  const app2 = window.__campus;
  app2?.setTonearm?.(!!(playingId || playingAudios.size));
}
function stopAllSounds() {
  if (playingId) { try { sound && sound.stopAll(); } catch (e) { /* ignore */ } playingId = null; }
  for (const a of [...playingAudios]) { try { a.pause(); } catch (e) { /* ignore */ } }
  playingAudios.clear();
  syncArm();
}
function playProfile(prof) {
  if (!prof) return;
  lastProfile = prof;
  if (playingId === prof.id) { stopAllSounds(); return; }
  if (playingId) { try { sound && sound.stopAll(); } catch (e) { /* ignore */ } }
  const s = ensureSound();
  s.setVolume(0.7);
  s.enable().then(() => { s.play(prof, layersAt(prof, app ? app.light : '上午'), null); playingId = prof.id; syncArm(); }).catch((e) => console.warn(e));
}
async function renderMine() {
  const p = panel();
  p.innerHTML = '<div class="dp-inner"><header class="dp-head"><b style="background:#4A6FA5">个人</b><h2>我的上传</h2><button type="button" class="dp-close">×</button></header>' +
    '<div class="dp-up"><label class="dp-upload">上传声音<input type="file" accept="audio/*" multiple data-kind="sound" hidden></label>' +
    '<label class="dp-upload">上传全景图<input type="file" accept="image/*" multiple data-kind="pano" hidden></label></div>' +
    '<div class="dp-mine"></div></div>';
  $('.dp-close', p).onclick = () => { hidePanel(false); currentPid = null; currentProfile = null; };
  p.querySelectorAll('.dp-upload input').forEach((inp) => {
    inp.addEventListener('change', async () => {
      for (const f of inp.files || []) {
        const kind = inp.dataset.kind;
        if (kind === 'sound' && !/^audio\//.test(f.type)) continue;
        if (kind === 'pano' && !/^image\//.test(f.type)) continue;
        try { await mineAdd({ kind, name: f.name.replace(/\.[^.]+$/, ''), type: f.type, blob: f, time: Date.now() }); } catch (e) { console.warn(e); }
      }
      renderMine();
    });
  });
  let items = [];
  try { items = await mineAll(); } catch { items = []; }
  const host = p.querySelector('.dp-mine');
  if (!items.length) { host.innerHTML = '<div class="dp-empty">暂无</div><p class="dp-note">上传你自己的声音或全景图后，会显示在这里（只保存在本机浏览器）。</p>'; return; }
  urls.forEach((u) => URL.revokeObjectURL(u)); urls.length = 0;
  host.innerHTML = '';
  for (const it of items) {
    const u = URL.createObjectURL(it.blob); urls.push(u);
    const row = document.createElement('div');
    row.className = 'dp-item';
    row.innerHTML = '<div class="dp-item-main">' + (it.kind === 'pano' ? '<img src="' + u + '" alt="">' : '<audio controls src="' + u + '"></audio>') + '</div>' +
      '<div class="dp-item-meta"><b>' + (it.name || '未命名') + '</b><em>' + (it.kind === 'pano' ? '全景图' : '声音') + '</em></div>' +
      '<button type="button" class="dp-del" aria-label="删除">×</button>';
    row.querySelector('.dp-del').onclick = async () => { await mineDel(it.id); renderMine(); };
    const au = row.querySelector('audio');
    if (au) {
      au.addEventListener('play', () => { lastAudio = au; for (const o of [...playingAudios]) if (o !== au) { try { o.pause(); } catch (e) { /* ignore */ } } playingAudios.add(au); syncArm(); });
      au.addEventListener('pause', () => { playingAudios.delete(au); syncArm(); });
      au.addEventListener('ended', () => { playingAudios.delete(au); syncArm(); });
    }
    host.appendChild(row);
  }
}


// —— 阶段3：社区资料（生成的虚构内容 + 本机点赞/评论各一次）——

// 每个地点生成 3 条社区资料（确定性伪随机，刷新不变）
const AUTHORS = ['一只耳机', '晚归的人', '早起的鸟', '排队第一名', '六楼住户', '夜跑的人', '看展的人', '打伞的人', '阿北', '小满', '青禾', '栗子'];
const STORIES = [
  '树叶还没被太阳晒热，鸟叫比人声先到。',
  '只剩脚步声和很慢的风，像校园在这一刻屏住了呼吸。',
  '上课前十分钟，走廊里全是拉书包链和说话的声音。',
  '中午的窗口最吵，锅铲、刷卡、拖鞋声挤在一起。',
  '夜里这一带很安静，偶尔有车铃和很远的人声。',
  '球鞋摩擦、球落地、哨声一响就全停。',
  '雨落在屋檐上，水声把其他声音都压低了。',
];
const CMTS = [['阿北', '这段太有画面了'], ['小满', '像回到那个下午'], ['十一', '耳机里单曲循环'], ['青禾', '好安静'], ['Momo', '我每天都路过这里'], ['栗子', '最后一圈的感觉'], ['林一', '听见了回声'], ['白露', '收藏了']];
function h1(s) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return ((x >>> 0) % 10000) / 10000; }
const COMMUNITY = [];
for (const place of POINTS.filter((p) => p.place)) {
  const own = place.id;
  for (let i = 0; i < 3; i++) {
    const key = place.place + '#' + i;
    const r = (n) => h1(key + ':' + n);
    const author = AUTHORS[Math.floor(r(1) * AUTHORS.length)];
    const story = STORIES[Math.floor(r(2) * STORIES.length)];
    const sound = POINTS[Math.floor(r(3) * POINTS.length)];
    const likes = Math.floor(r(4) * 1000);
    const commentCount = Math.floor(r(5) * 100);
    const cs = [CMTS[Math.floor(r(6) * CMTS.length)], CMTS[Math.floor(r(7) * CMTS.length)]];
    COMMUNITY.push({
      id: place.place + '-c' + i,
      place: place.place,
      title: (i === 0 ? place.title : i === 1 ? place.title + '（另一个时候）' : place.title + '（别人的录音）'),
      author, sound: sound.id, pano: own, story, likes, commentCount, comments: cs,
    });
  }
}
const CKEY = 'campus-community-v1';
function cStore() { try { return JSON.parse(localStorage.getItem(CKEY) || '{}') || {}; } catch { return {}; } }
function cSave(v) { try { localStorage.setItem(CKEY, JSON.stringify(v)); } catch (e) { console.warn(e); } }
function cScore(m, mine) {
  const extra = mine && mine.likes ? 1 : 0;
  const extraC = mine && mine.comments ? mine.comments.length : 0;
  return m.likes + extra + (m.commentCount + extraC) * 3;
}
function renderCommunity() {
  const p = panel();
  const mine = cStore();
  const pool = COMMUNITY.filter((m) => m.place === currentPid);
  if (!pool.length) {
    p.innerHTML = '<div class="dp-inner"><header class="dp-head"><b style="background:#8B6FB0">社区</b><h2>社区</h2><button type="button" class="dp-close">×</button></header><div class="dp-empty">暂无</div><p class="dp-note">这个小区域还没有社区资料。</p></div>';
    $('.dp-close', p).onclick = () => { hidePanel(false); currentPid = null; currentProfile = null; };
    return;
  }
  const scored = pool.map((m) => ({ m, score: cScore(m, mine[m.id]) })).sort((a, b) => b.score - a.score);
  const top = scored[0].score;
  const tops = scored.filter((x) => x.score === top);
  const pick = tops[Math.floor(Math.random() * tops.length)].m;
  const st = mine[pick.id] || {};
  const likes = pick.likes + (st.likes ? 1 : 0);
  const cmts = pick.comments.concat((st.comments || []).map((t) => ['我', t]));
  const count = pick.commentCount + ((st.comments || []).length);
  p.innerHTML = '<div class="dp-inner"><header class="dp-head"><b style="background:#8B6FB0">社区</b><h2>' + pick.title + '</h2><span class="dp-dur">作者 ' + pick.author + '</span><button type="button" class="dp-close">×</button></header>' +
    '<p class="dp-where">总分 ' + (likes + count * 3) + '（赞 ' + likes + ' × 1 + 评论 ' + count + ' × 3） · 按该地点最高分展示</p>' +
    '<div class="dp-pano-wrap"><img class="dp-pano" src="src/assets/panorama/' + pick.pano + '.svg" alt="' + pick.title + ' 全景"></div>' +
    '<div class="dp-cols"><div><p class="dp-story">' + pick.story + '</p>' +
    '<div class="dp-cmt"><h3>评论 <em>' + count + '</em></h3>' + (cmts.length ? cmts.map((x) => '<p><b>' + x[0] + '</b>' + x[1] + '</p>').join('') : '<p class="dp-note">还没有评论</p>') + '</div></div>' +
    '<div class="dp-side">' +
    '<button type="button" class="dp-play dp-play-community">▶ 听一听 · 社区声音</button>' +
    '<button type="button" class="dp-like"' + (st.likes ? ' disabled' : '') + '>' + (st.likes ? '已点赞 · ' + likes : '👍 点赞 ' + likes) + '</button>' +
    '<div class="dp-cmtbox"><textarea maxlength="50" placeholder="写一句评论（1~50 字，仅一次）"' + (st.comments && st.comments.length ? ' disabled' : '') + '></textarea><button type="button" class="dp-send"' + (st.comments && st.comments.length ? ' disabled' : '') + '>发表评论</button></div>' +
    '<p class="dp-note">同一份资料每人只能点赞一次、评论一次；点赞与评论记录只保存在本机。</p></div></div></div>';
  $('.dp-close', p).onclick = () => { hidePanel(false); currentPid = null; currentProfile = null; };
  const cPlay = $('.dp-play-community', p);
  if (cPlay) cPlay.onclick = () => { playProfile(byId.get(pick.sound)); cPlay.textContent = playingId === pick.sound ? '停止播放' : '▶ 听一听 · 社区声音'; };
  const likeBtn = $('.dp-like', p);
  if (likeBtn) likeBtn.onclick = () => {
    const s = cStore(); s[pick.id] = s[pick.id] || {}; if (s[pick.id].likes) return;
    s[pick.id].likes = true; cSave(s); renderCommunity();
  };
  const send = $('.dp-send', p);
  if (send) send.onclick = () => {
    const ta = $('.dp-cmtbox textarea', p);
    const t = (ta.value || '').trim().slice(0, 50);
    if (!t) { ta.focus(); return; }
    const s = cStore(); s[pick.id] = s[pick.id] || {}; if (s[pick.id].comments && s[pick.id].comments.length) return;
    s[pick.id].comments = [t]; cSave(s); renderCommunity();
  };
}

// 针脚按钮：有声音在播 → 暂停（抬针）；否则继续上次的声音（落针）
window.__toggleAudio = function () {
  if (playingId || playingAudios.size) {
    if (playingAudios.size && lastAudio) { try { lastAudio.pause(); } catch (e) { /* ignore */ } }
    stopAllSounds();
    return false;
  }
  if (lastAudio) { try { lastAudio.play().catch(() => {}); return true; } catch (e) { /* ignore */ } }
  if (lastProfile) { playProfile(lastProfile); return true; }
  return false;
};
