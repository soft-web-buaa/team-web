// 刻声 · 校园模型（第十轮）：摆在盘心标签上的一座卡纸模型。机器是金属的，校园是手做的——
// 卡纸有厚度、边缘有一道细倒角、每一栋的纸色都差一点点；立面是印在纸上的窗，不开洞。
// 和唱机同一套影棚光照着（不做屏幕空间描边、不做卡通着色）：手作感在物件上，不在渲染上。
// 这里只放纯函数（颜色、立面参数、轮廓外扩 / 内缩、外接矩形、季节），页面与单测共用。

// —— 纸色 ——
// 用途色保留色相，只降饱和（OKLCH 色度 × 0.45–0.62，明度提到 0.70–0.80）：教学科研偏米、学生生活偏砖红、文体偏灰绿。
// 原色取自北航导览图图例（r3）：#DC9A72 #D48E9D #62AFAA #9C8CC6 #90B3D3。
export const FUNC_CARD = ['#DAB59F', '#BE928C', '#8CADA5', '#A7A0BB', '#AABAC8'];
// 五十年代那一批（《北京市历史建筑保护图则》）：米白墙；一至四号楼的出檐涂暗红、仿椽下沿涂黄；主楼群是白面砖 + 灰挑檐
export const ERA = {
  eave: { wall: '#E2D9C6', eave: '#8E4F42', under: '#C7A458' },
  main: { wall: '#E8E4DA', eave: '#85827C', under: '#9C988F' },
};
export const ROOF_PAPER = '#DEDAD0';      // 屋面：卡纸本色（俯看时屋面占大头）
export const POOL_STONE = '#D5CBB6';

/** 一栋楼的纸色抖动：同一种纸，裁的批次不同。seed 是楼名或下标，结果确定。返回 { dl 明度, dw 偏暖 }，都在 ±0.04 内。 */
export function tintOf(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const a = (h & 0xffff) / 0xffff, b = (h >>> 16) / 0xffff;
  return { dl: (a - 0.5) * 0.08, dw: (b - 0.5) * 0.06 };
}

// —— 立面 ——
// style：0 普通窗格 / 1 五十年代（窄高窗 + 壁柱）/ 2 新主楼（横向带窗）/ 3 住宅（小窗 + 阳台线）/ 4 不印窗
export const STYLE = { grid: 0, era: 1, ribbon: 2, home: 3, none: 4 };
/** 立面参数：层高（世界米，含竖向放大）、开间（米）、样式。层数 L 来自 OSM building:levels 或楼高估算（campus-xy.json 的 L / Lo）。 */
export function facadeOf(b, H) {
  const L = Math.max(1, b.L || Math.round((b.h || 16) / 3.4));
  const n = b.n || '';
  let style = STYLE.grid, bay = 3.6;
  if (b.era) { style = STYLE.era; bay = 3.3; }
  else if (n.startsWith('新主楼') && n !== '新主楼会议中心') { style = STYLE.ribbon; bay = 4.2; }
  else if (b.f === 4) { style = STYLE.home; bay = 3.0; }
  else if (b.f === 2 || /馆$|看台|走廊|器材室/.test(n)) { style = STYLE.none; }
  return { floor: H / L, bay, style, L };
}

// —— 平面几何（米，x 东 y 北；环逆时针）——
/** 环按 d 外扩（d>0）或内缩（d<0）：逐顶点斜接，斜接长度封顶 2.5|d|（尖角不扎出去）。不处理自交：只用在 ≥ 4 米宽的楼上。 */
export function offsetRing(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [cx, cy] = pts[i], [nx, ny] = pts[(i + 1) % n];
    let ax = cx - px, ay = cy - py, bx = nx - cx, by = ny - cy;
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    // 逆时针环的外法线 = 边方向顺时针转 90°
    const n1x = ay, n1y = -ax, n2x = by, n2y = -bx;
    let mx = n1x + n2x, my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const k = Math.min(2.5, 1 / Math.max(0.2, mx * n1x + my * n1y));
    out.push([cx + mx * d * k, cy + my * d * k]);
  }
  return out;
}

/** 环的面积（逆时针为正）。 */
export function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]; s += ax * by - bx * ay; }
  return s / 2;
}

/** 最小面积外接矩形（逐边试方向）：{ cx, cy, ang（长轴，弧度）, L, W }。球场摆球门、篮架用。 */
export function obbOf(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const a = Math.atan2(by - ay, bx - ax), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of pts) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      best = { area, cx: um * c - vm * s, cy: um * s + vm * c, ang: a, L: u1 - u0, W: v1 - v0 };
    }
  }
  if (best.W > best.L) { best = { ...best, ang: best.ang + Math.PI / 2, L: best.W, W: best.L }; }
  return best;
}

// —— 季节：景观跟着正在放的那张声片录下的月份走（和天光跟着它的时段走是同一条规则）——
// 北京的季节按月：3–5 春、6–8 夏、9–11 秋、12–2 冬。学期（秋 / 春 / 夏）是校历的事，季节是天气的事，两样不混。
export const SEASONS = ['春', '夏', '秋', '冬'];
export function seasonOf(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬';
}
/** 史料的日期是日历日字符串（YYYY-MM-DD），不带时区：按字面取月份。 */
export function seasonOfDay(date) {
  const m = /^\d{4}-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  const k = +m[1];
  return k >= 3 && k <= 5 ? '春' : k >= 6 && k <= 8 ? '夏' : k >= 9 && k <= 11 ? '秋' : '冬';
}

// 每一季的景：树冠配色（颜色, 权重）、落叶树留下的比例（冬天只剩常绿）、地面三色、屋面积雪
export const SCENERY = {
  春: { crown: [['#8DAA6C', 0.34], ['#A3B97C', 0.26], ['#6F8D5C', 0.2], ['#E3B9C0', 0.12], ['#EEE6DA', 0.08]], keep: 1, green: '#9DB27E', tile: '#A9A69B', road: '#E8E3D6', snow: 0 },
  夏: { crown: [['#5E7F52', 0.34], ['#6C8C5A', 0.3], ['#4F6E4C', 0.26], ['#7C9862', 0.1]], keep: 1, green: '#7F9A6A', tile: '#A4A398', road: '#E6E1D3', snow: 0 },
  秋: { crown: [['#6D8A5C', 0.3], ['#7E9466', 0.24], ['#5C7656', 0.18], ['#C9A84A', 0.18], ['#A8664A', 0.1]], keep: 1, green: '#94A374', tile: '#A9A497', road: '#E7E1D2', snow: 0 },
  冬: { crown: [['#4E6650', 1]], keep: 0.26, green: '#C9CBC2', tile: '#B9B8B0', road: '#E9E8E3', snow: 0.85 },
};
/** 第 i 棵树在这一季的冠色下标；落叶树在冬天返回 -1（只剩树干）。i 决定它是不是常绿，所以同一棵树每年冬天都在。 */
export function crownPick(season, i) {
  const s = SCENERY[season] || SCENERY['秋'];
  const ever = (((i * 40503) >>> 0) % 1000) / 1000 < 0.26;      // 约四分之一是常绿（松柏）
  if (s.keep < 1 && !ever) return -1;
  let q = ((i * 2246822519) >>> 0) / 4294967296;
  for (let k = 0; k < s.crown.length; k++) { if ((q -= s.crown[k][1]) < 0) return k; }
  return 0;
}
