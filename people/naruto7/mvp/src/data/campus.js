// 校园示意图的分区。坐标是 0 到 1 的相对位置，不是真实地理位置。
// 分区名称沿用刻声的 places.json 草稿（学院路校区，draft）：定稿前只当示意，不当事实引用。
// 底图方案（自绘平面图还是真地图）还没定，换底图时只改这个文件和 CampusMap.vue。

export const BLOCKS = [
  { id: 'XY-01', name: '主楼区', x: 0.28, y: 0.22, w: 0.24, h: 0.22 },
  { id: 'XY-02', name: '教学区', x: 0.56, y: 0.22, w: 0.22, h: 0.22 },
  { id: 'XY-03', name: '图书馆与音乐厅', x: 0.28, y: 0.48, w: 0.24, h: 0.18 },
  { id: 'XY-04', name: '生活区', x: 0.56, y: 0.48, w: 0.22, h: 0.26 },
  { id: 'XY-05', name: '运动场', x: 0.14, y: 0.7, w: 0.3, h: 0.16 },
  { id: 'XY-06', name: '东门一带', x: 0.8, y: 0.4, w: 0.14, h: 0.34 },
];

export const CAMPUS_NAME = '学院路校区（示意）';

// SVG 画布：1000 × 760 的坐标系，只裁出有分区的那一块
export const MAP_W = 1000;
export const MAP_H = 760;
export const VIEWBOX = '110 150 860 540';

export function blockById(id) {
  return BLOCKS.find((b) => b.id === id) || null;
}

/** 字符串哈希到 [0,1)，让用户新留的声音在分区里有稳定的落点 */
function hash01(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** 分区内的稳定相对位置 [x, y]（0 到 1）；y 从 0.5 起，避开左上角的分区名 */
export function pointInBlock(seed) {
  return [0.2 + 0.6 * hash01(seed, 1), 0.5 + 0.38 * hash01(seed, 2)];
}

/** 声音点在画布上的位置；分区不存在返回 null */
export function absPos(sound) {
  const b = blockById(sound.block);
  if (!b || !Array.isArray(sound.at)) return null;
  return { x: (b.x + b.w * sound.at[0]) * MAP_W, y: (b.y + b.h * sound.at[1]) * MAP_H };
}
