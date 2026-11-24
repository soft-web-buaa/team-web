// 刻声 · 校园平面（示意，不按比例）
// 口径（docs/tickets/T-02 + 用户裁决 D5）：
// - 平面是**示意图**：只画区块与地标，不描摹官方图、不嵌底图、不写坐标与经纬网；
// - 区块来自 data/places.json（划分由用户定稿）；区块可点，点开就是「这一片里有哪些声片」；
// - 钉点用 0–1 归一化坐标，和经纬度无关；不做就近吸附。
// 颜色只用冻结色板四色，见 docs/DESIGN-FREEZE。

const NS = 'http://www.w3.org/2000/svg';

const C = {
  base: '#D3D7DA',     // 冷铝底
  block: '#F2F4F3',    // 档案白
  ink: '#24304A',      // 石墨蓝
  road: '#8E979E',     // 车床灰
  pin: '#24304A',
  pinText: '#F2F4F3',
};

function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** 某个归一化点落在哪个区块（没有则 null）。区块之间不重叠，按顺序取第一个命中。 */
export function blockAt(campus, x, y) {
  if (!campus) return null;
  for (const b of campus.blocks) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

export function blockById(campus, id) {
  return campus ? campus.blocks.find((b) => b.id === id) || null : null;
}

/**
 * 把平面画进 root（一个 <div>）。
 * @param {HTMLElement} root
 * @param {object} campus   places.json 里的一个 campus
 * @param {object} opts     { pins: Map<blockId, number>, selected: blockId|null, onBlock(id|null) }
 */
export function renderPlan(root, campus, { pins = new Map(), selected = null, onBlock = () => {} } = {}) {
  root.replaceChildren();
  if (!campus) {
    const p = document.createElement('p');
    p.className = 'plan-empty';
    p.textContent = '还没有这个校区的平面。';
    root.append(p);
    return;
  }

  const svg = el('svg', { viewBox: '0 0 1000 1000', class: 'plan-svg', role: 'group', 'aria-label': `${campus.name}校园示意平面` });
  svg.append(el('rect', { x: 0, y: 0, width: 1000, height: 1000, fill: C.base }));

  // 一条贯穿的主路，纯示意
  svg.append(el('line', { x1: 60, y1: 470, x2: 940, y2: 470, stroke: C.road, 'stroke-width': 14, 'stroke-linecap': 'square' }));
  svg.append(el('line', { x1: 500, y1: 80, x2: 500, y2: 930, stroke: C.road, 'stroke-width': 10, 'stroke-linecap': 'square' }));

  for (const b of campus.blocks) {
    const g = el('g', { class: 'plan-block', tabindex: '0', role: 'button', 'aria-label': `${b.name}（${b.id}）` });
    if (selected === b.id) g.setAttribute('aria-pressed', 'true');

    const rect = el('rect', {
      x: b.x * 1000, y: b.y * 1000, width: b.w * 1000, height: b.h * 1000,
      fill: selected === b.id ? C.ink : C.block, stroke: C.ink, 'stroke-width': 2,
    });
    g.append(rect);

    const label = el('text', {
      x: (b.x + b.w / 2) * 1000, y: (b.y + b.h / 2) * 1000 + 6,
      'text-anchor': 'middle', fill: selected === b.id ? C.pinText : C.ink,
      'font-size': '26', 'font-family': 'var(--fang), serif',
    });
    label.textContent = b.name;
    g.append(label);

    const n = pins.get(b.id) || 0;
    if (n) {
      const cx = (b.x + b.w) * 1000 - 34, cy = b.y * 1000 + 34;
      g.append(el('circle', { cx, cy, r: 20, fill: C.pin }));
      const t = el('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', fill: C.pinText, 'font-size': '20' });
      t.textContent = String(n);
      g.append(t);
    }

    const pick = () => onBlock(selected === b.id ? null : b.id);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    svg.append(g);
  }

  const note = el('text', { x: 960, y: 980, 'text-anchor': 'end', fill: C.ink, 'font-size': '18', opacity: '0.7' });
  note.textContent = '示意，不按比例';
  svg.append(note);

  root.append(svg);
  if (campus.draft) {
    const d = document.createElement('p');
    d.className = 'plan-draft';
    d.textContent = '区块划分是草稿，等用户定稿后才能当事实引用。';
    root.append(d);
  }
}
