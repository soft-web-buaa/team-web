// 左下角控件：天光 / 季节（唱片永远转；针脚由是否播放声音自动控制）
(function () {
  const css = `
.ctrl-root{position:fixed;left:16px;bottom:16px;z-index:40;display:grid;gap:6px;padding:10px 12px;border:1px solid rgba(242,244,243,.22);border-radius:3px;background:rgba(16,22,32,.66);backdrop-filter:blur(8px);font-family:inherit}
.ctrl-root .row{display:flex;align-items:center;gap:3px}
.ctrl-root .lb{width:2.6em;color:#9aa7b8;font-size:10px;letter-spacing:.12em}
.ctrl-root button{min-width:30px;min-height:24px;padding:0 6px;border:1px solid transparent;border-radius:2px;background:transparent;color:#9aa7b8;font-size:12px;cursor:pointer}
.ctrl-root button:hover{color:#f2f4f3;border-color:rgba(242,244,243,.45)}
.ctrl-root button[data-on]{background:#e6be3a;color:#10151c;border-color:#e6be3a}
@media(max-width:880px){.ctrl-root{left:8px;bottom:8px;padding:7px 8px;gap:4px}.ctrl-root .lb{width:2em;font-size:9px}.ctrl-root button{min-width:22px;min-height:20px;padding:0 3px;font-size:11px}}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function boot() {
    const app = window.__campus;
    if (!app || !app.setSlot) { setTimeout(boot, 300); return; }
    app.setRecordSpin?.(true);       // 圆盘永远转
    app.setTonearm?.(false);         // 没有声音：针脚抬起；播放时会自动落下

    const root = document.createElement('div');
    root.className = 'ctrl-root';
    root.innerHTML = '<div class="row"><span class="lb">天光</span><span class="slots"></span></div>' +
      '<div class="row"><span class="lb">季节</span><span class="seasons"></span></div>' +
      '<div class="row"><span class="lb">针脚</span><span class="arms"></span></div>';
    document.body.appendChild(root);
    const slotsBox = root.querySelector('.slots');
    const seasonsBox = root.querySelector('.seasons');
    const armsBox = root.querySelector('.arms');
    const slots = ['夜', '晨', '上午', '午', '下午', '晚'];
    const seasons = ['春', '夏', '秋', '冬'];
    const sync = () => {
      [...slotsBox.children].forEach((b) => b.toggleAttribute('data-on', b.dataset.v === app.light));
      [...seasonsBox.children].forEach((b) => b.toggleAttribute('data-on', b.dataset.v === (app.seasonNow || app.season)));
      const armBtn = armsBox.querySelector('button');
      if (armBtn) {
        const on = !!(app.tonearm && app.tonearm.playing);
        armBtn.textContent = on ? '落针' : '抬起';
        armBtn.toggleAttribute('data-on', on);
      }
    };
    slots.forEach((s) => { const b = document.createElement('button'); b.textContent = s; b.dataset.v = s; b.addEventListener('click', () => { app.setSlot(s); sync(); }); slotsBox.appendChild(b); });
    const arm = document.createElement('button');
    arm.textContent = '抬起';
    arm.addEventListener('click', () => { if (window.__toggleAudio) window.__toggleAudio(); });
    armsBox.appendChild(arm);
    seasons.forEach((s) => { const b = document.createElement('button'); b.textContent = s; b.dataset.v = s; b.addEventListener('click', () => { app.setSeason(s); sync(); }); seasonsBox.appendChild(b); });
    setInterval(sync, 400);
    sync();
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
