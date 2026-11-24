// 声景档案：把 16 处地点 + 4 个园子写成 20 条「声音档案」。
// 这里没有任何音频文件：每一条只有一份「声音构成」（层 + 权重）、一段故事、和随天光变化的比例。
// 页面用这份数据生成声纹动画、声景地图、粒子波纹的颜色；第二轮会用它驱动程序化 WebAudio 合成。
//
// 数据结构刻意贴近课程需求文档里的 sounds.json：id / title / category / zone /
// location / story / tags / duration。

export const CATEGORIES = [
  { id: 'study', name: '学习', color: '#4A6FA5', note: '书页、铃声、键盘与空调的低鸣' },
  { id: 'life', name: '生活', color: '#E08A4B', note: '食堂、宿舍、开水房与人来人往' },
  { id: 'sport', name: '运动', color: '#3FA37A', note: '哨声、球鞋、水花与跑道的风' },
  { id: 'nature', name: '自然', color: '#7BA05B', note: '树、鸟、虫与一片安静的空地' },
  { id: 'art', name: '艺术', color: '#8B6FB0', note: '琴房、展厅、幕布与回声' },
];
export const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));
export const SLOTS = ['夜', '晨', '上午', '午', '下午', '晚'];

// 每个时段对各类声音层的增益：夜里人少、鸟静、猫多；清晨鸟最响；中午食堂最吵。
const SLOT_GAIN = {
  夜: { crowd: 0.15, traffic: 0.2, birds: 0.08, insects: 1.7, cat: 1.8, machine: 0.3, hum: 1.15, steps: 0.25, bell: 0.2, whistle: 0.15, ball: 0.1, dishes: 0.1, piano: 0.4, wind: 1.2, leaves: 1.2, water: 1, door: 0.3, click: 0.2, voice: 0.2 },
  晨: { crowd: 0.45, traffic: 0.7, birds: 2.1, insects: 0.3, cat: 0.6, machine: 0.6, hum: 0.9, steps: 0.8, bell: 1.1, whistle: 0.5, ball: 0.4, dishes: 0.8, piano: 0.5, wind: 1.1, leaves: 1, water: 0.9, door: 0.8, click: 0.6, voice: 0.4 },
  上午: { crowd: 1.05, traffic: 1.15, birds: 0.9, insects: 0.2, cat: 0.5, machine: 1.1, hum: 1, steps: 1.2, bell: 1.3, whistle: 1, ball: 1, dishes: 0.9, piano: 1, wind: 1, leaves: 1, water: 1, door: 1, click: 1, voice: 1 },
  午: { crowd: 1.6, traffic: 1.3, birds: 0.5, insects: 0.4, cat: 1, machine: 0.9, hum: 0.9, steps: 1.5, bell: 1, whistle: 0.8, ball: 0.9, dishes: 1.9, piano: 0.8, wind: 0.8, leaves: 0.9, water: 1.1, door: 1.3, click: 1.4, voice: 1.5 },
  下午: { crowd: 1.15, traffic: 1.2, birds: 0.7, insects: 0.3, cat: 0.6, machine: 1.1, hum: 1, steps: 1.2, bell: 1.1, whistle: 1.2, ball: 1.3, dishes: 0.8, piano: 1.15, wind: 1, leaves: 1, water: 1.05, door: 1, click: 1, voice: 1.2 },
  晚: { crowd: 0.85, traffic: 0.7, birds: 0.35, insects: 1.2, cat: 1.4, machine: 0.7, hum: 1.05, steps: 0.9, bell: 0.5, whistle: 0.5, ball: 0.7, dishes: 0.6, piano: 1.4, wind: 1.1, leaves: 1, water: 0.9, door: 0.7, click: 0.5, voice: 1 },
};

// 声音层的中文名与合成参数（第二轮的程序化音频直接读这张表）
export const LAYERS = {
  bell: { name: '钟声/下课铃', synth: 'bell' },
  click: { name: '刷卡/设备提示', synth: 'click' },
  crowd: { name: '人声嘈杂', synth: 'crowd' },
  dishes: { name: '餐盘与打菜', synth: 'dishes' },
  door: { name: '门与脚步', synth: 'door' },
  steps: { name: '脚步', synth: 'steps' },
  traffic: { name: '车流与自行车', synth: 'traffic' },
  machine: { name: '机器/通风', synth: 'machine' },
  hum: { name: '室内低鸣', synth: 'hum' },
  wind: { name: '风', synth: 'wind' },
  leaves: { name: '树叶沙沙', synth: 'leaves' },
  birds: { name: '鸟鸣', synth: 'birds' },
  insects: { name: '虫鸣', synth: 'insects' },
  water: { name: '水声', synth: 'water' },
  whistle: { name: '哨声', synth: 'whistle' },
  ball: { name: '球与球鞋', synth: 'ball' },
  piano: { name: '琴声', synth: 'piano' },
  cat: { name: '猫叫', synth: 'cat' },
  voice: { name: '朗读/对话', synth: 'voice' },
};

export const POINTS = [
  {
    id: 'snd-001', place: 'XY01', title: '闭馆铃', category: 'study', zone: '教学区',
    duration: 15, tags: ['闭馆', '铃声', '夜晚'],
    story: '21:55，闭馆铃会响三遍。第一遍大家抬头，第二遍开始收书包，第三遍灯灭了一半，只剩管理员推车的轮子声，从书架之间慢慢碾过去。',
    layers: { bell: 0.9, hum: 0.5, steps: 0.35, crowd: 0.2, door: 0.3 },
  },
  {
    id: 'snd-002', place: 'XY02', title: '上课铃与粉笔', category: 'study', zone: '教学区',
    duration: 12, tags: ['上课', '粉笔', '楼道'],
    story: '预备铃响过，楼道里一阵拉书包的忙乱，然后是粉笔落在黑板上的「嗒、嗒」。下课铃一响，声音像水一样从每扇门里涌出来。',
    layers: { bell: 1, crowd: 0.9, steps: 0.7, door: 0.5, hum: 0.35 },
  },
  {
    id: 'snd-003', place: 'XY03', title: '新主楼的键盘', category: 'study', zone: '教学区',
    duration: 18, tags: ['键盘', '电梯', '通宵'],
    story: '新主楼的夜里只剩键盘声和中央空调。电梯到层的「叮」一响，一整层的人都知道又有人来通宵了。',
    layers: { click: 0.8, hum: 0.7, machine: 0.4, steps: 0.25, door: 0.35 },
  },
  {
    id: 'snd-004', place: 'XY04', title: '空场试音', category: 'art', zone: '教学区',
    duration: 22, tags: ['音乐厅', '钢琴', '回声'],
    story: '演出前的音乐厅是空的。钢琴弹几个音，声音先撞到后墙再回来，像整座厅一起轻轻应了一声；幕布被风掀起时，是纸一样的沙沙。',
    layers: { piano: 1, hum: 0.35, wind: 0.3, door: 0.25, crowd: 0.2 },
  },
  {
    id: 'snd-005', place: 'XY05', title: '展厅里的脚步', category: 'study', zone: '教学区',
    duration: 20, tags: ['博物馆', '讲解', '脚步'],
    story: '航空航天博物馆最响的是脚步，其次才是讲解。孩子踮脚看机翼，鞋底在抛光地面上转半圈，回声比人声多留一秒。',
    layers: { steps: 0.9, voice: 0.6, hum: 0.5, crowd: 0.4, door: 0.3 },
  },
  {
    id: 'snd-006', place: 'XY06', title: '球鞋与哨声', category: 'sport', zone: '运动区',
    duration: 20, tags: ['篮球', '哨声', '球鞋'],
    story: '体育馆里最清楚的是球鞋摩擦地板的尖叫。哨声一响，所有拍球声同时停下，只剩球在地上弹了两下，慢慢滚远。',
    layers: { ball: 1, whistle: 0.7, crowd: 0.6, steps: 0.6, hum: 0.4, voice: 0.3 },
  },
  {
    id: 'snd-007', place: 'XY07', title: '水花与回声', category: 'sport', zone: '运动区',
    duration: 16, tags: ['游泳馆', '水花', '回声'],
    story: '游泳馆的拱顶把水声放大：划水、换气、拍水，一层一层叠在一起。安静下来的两秒，能听见水沿着池边往下滴。',
    layers: { water: 1, crowd: 0.4, whistle: 0.45, voice: 0.25, hum: 0.35 },
  },
  {
    id: 'snd-008', place: 'XY08', title: '刷卡那一声', category: 'life', zone: '生活区',
    duration: 8, tags: ['食堂', '刷卡', '中午'],
    story: '中午十二点，刷卡机「滴」一声，后面的人已经端着盘子往前挪了半步。找座位的托盘声，比叫号还急。',
    layers: { click: 1, dishes: 0.8, crowd: 0.9, steps: 0.6, door: 0.35 },
  },
  {
    id: 'snd-009', place: 'XY09', title: '打菜窗口的蒸汽', category: 'life', zone: '生活区',
    duration: 26, tags: ['食堂', '蒸汽', '嘈杂'],
    story: '打菜窗口的蒸汽一冒，勺子碰盆的声音就密起来。阿姨喊一声「下一位」，人群往里挤了挤，羽绒服互相摩擦。',
    layers: { dishes: 1, crowd: 1, steps: 0.5, machine: 0.3, voice: 0.5 },
  },
  {
    id: 'snd-010', place: 'XY10', title: '楼下的猫', category: 'life', zone: '生活区',
    duration: 12, tags: ['宿舍', '猫叫', '夜晚'],
    story: '晚上十一点，宿舍楼下那几只猫开始巡场。一声短、一声长，配合着洗衣机转筒的嗡鸣和远处宿舍的电视声。',
    layers: { cat: 1, machine: 0.6, crowd: 0.3, insects: 0.5, wind: 0.4 },
  },
  {
    id: 'snd-011', place: 'XY11', title: '木地板的回声', category: 'study', zone: '教学区',
    duration: 15, tags: ['老楼', '木地板', '回声'],
    story: '第一馆的楼梯是木头的，脚踩上去会「咯吱」一声，随后在楼梯井里滚两圈。上课前，整栋楼像在一层一层地醒过来。',
    layers: { steps: 1, door: 0.6, crowd: 0.5, hum: 0.35, bell: 0.5 },
  },
  {
    id: 'snd-012', place: 'XY12', title: '实验室通风', category: 'study', zone: '教学区',
    duration: 20, tags: ['实验室', '通风', '仪器'],
    story: '为民楼的走廊永远有通风声，像一条很低的海。偶尔一台仪器「嘀」一下，然后又是很长很长的、什么都没发生的安静。',
    layers: { machine: 1, hum: 0.8, click: 0.5, steps: 0.3, door: 0.25 },
  },
  {
    id: 'snd-013', place: 'XY13', title: '跑道上的风', category: 'sport', zone: '运动区',
    duration: 25, tags: ['田径场', '风', '哨声'],
    story: '看台是最听风的地方。跑道上的人跑过去，脚步声被风扯成一片；哨声很远，反而比人声更清楚。',
    layers: { wind: 1, steps: 0.7, whistle: 0.6, crowd: 0.5, leaves: 0.5, voice: 0.3 },
  },
  {
    id: 'snd-014', place: 'XY14', title: '自行车铃与食堂', category: 'life', zone: '生活区',
    duration: 18, tags: ['自行车', '食堂', '下午'],
    story: '下午的合一楼门口，自行车铃一响就是三四个。食堂还没开饭，只有抽油烟机和几个打球回来的男生在楼下说话。',
    layers: { traffic: 0.7, crowd: 0.6, dishes: 0.4, steps: 0.5, machine: 0.4, voice: 0.4 },
  },
  {
    id: 'snd-015', place: 'XY15', title: '走廊里的秒针', category: 'life', zone: '生活区',
    duration: 14, tags: ['校医院', '安静', '秒针'],
    story: '校医院的走廊很安静，安静到能听见挂钟的秒针和药房打印机吐纸的声音。偶尔有人轻轻咳一声，又没了。',
    layers: { hum: 0.9, click: 0.4, door: 0.5, steps: 0.4, machine: 0.35, wind: 0.25 },
  },
  {
    id: 'snd-016', place: 'XY16', title: '晚自习的楼道', category: 'study', zone: '教学区',
    duration: 16, tags: ['晚自习', '楼道', '下课'],
    story: '三号楼的晚自习，楼道比教室吵。有人背单词，有人打电话，有人把椅子往后一拖——十分钟后，整栋楼一起关灯。',
    layers: { voice: 0.9, crowd: 0.7, steps: 0.6, hum: 0.4, door: 0.5, bell: 0.3 },
  },
  // —— 园子：只在「自然」分类与声景地图里出现的 4 个自然声景点 ——
  {
    id: 'snd-017', park: '绿园', title: '绿园的树', category: 'nature', zone: '自然区',
    duration: 40, tags: ['鸟鸣', '树叶', '清晨'],
    story: '绿园是校园里最像「外面」的地方：树冠很高，风一过就是一片沙沙。清晨的鸟叫从各个方向来，谁也数不清有几只。',
    layers: { birds: 1, leaves: 0.9, wind: 0.7, insects: 0.4, steps: 0.2 },
  },
  {
    id: 'snd-018', park: '晨读园', title: '清早的朗读', category: 'nature', zone: '自然区',
    duration: 30, tags: ['朗读', '鸟鸣', '早晨'],
    story: '六点半的晨读园，背书声和鸟叫混在一起。隔着一排冬青，你只能听出「有人在念」，听不出念的是哪一页。',
    layers: { voice: 0.9, birds: 0.9, leaves: 0.6, wind: 0.5, steps: 0.4 },
  },
  {
    id: 'snd-019', park: '静园', title: '最安静的一角', category: 'nature', zone: '自然区',
    duration: 35, tags: ['安静', '风', '午后'],
    story: '静园在下午几乎没有声音。风从楼缝里过来，树叶响一下又停一下；远处操场的一声哨，传到这里已经很薄了。',
    layers: { wind: 1, leaves: 0.8, birds: 0.4, whistle: 0.15, insects: 0.3 },
  },
  {
    id: 'snd-020', park: '唯实园', title: '西南角的风', category: 'nature', zone: '自然区',
    duration: 32, tags: ['风', '虫鸣', '傍晚'],
    story: '唯实园在校园西南角，傍晚风最大。草一动，虫就开始叫；天黑得再晚一点，风里会夹进远处新主楼下班的人声。',
    layers: { wind: 1, insects: 0.8, leaves: 0.6, crowd: 0.2, traffic: 0.2 },
  },
];

export const BY_ID = new Map(POINTS.map((p) => [p.id, p]));
export const BY_PLACE = new Map(POINTS.filter((p) => p.place).map((p) => [p.place, p]));
export const BY_PARK = new Map(POINTS.filter((p) => p.park).map((p) => [p.park, p]));

/** 某个时段下这条声景的「声音构成」：层按权重从大到小排好，权重已乘上时段增益。 */
export function layersAt(profile, slot = '上午') {
  const gain = SLOT_GAIN[slot] || SLOT_GAIN['上午'];
  return Object.entries(profile.layers)
    .map(([id, w]) => ({ id, name: LAYERS[id]?.name || id, synth: LAYERS[id]?.synth || id, w: Math.min(1.6, w * (gain[id] ?? 1)) }))
    .filter((l) => l.w >= 0.06)
    .sort((a, b) => b.w - a.w);
}

/** 这条声景在某个时段的一句话提示，用于档案面板的「此刻」一行。 */
export function timeNote(profile, slot) {
  const ls = layersAt(profile, slot);
  const top = ls.slice(0, 3).map((l) => l.name).join('、');
  const quiet = ls.reduce((s, l) => s + l.w, 0) < 0.9;
  if (quiet) return `${slot}：几乎是静的，只剩${top || '一点空气声'}。`;
  return `${slot}：现在主要是${top}。`;
}

/** 确定性的伪随机：同一个 id + 序号永远给同一个数，声纹不会每次刷新都变。 */
export function hash01(seed, i) {
  let h = (seed * 2654435761 + i * 40503 + 1013904223) >>> 0;
  h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** 声纹：给一条声景生成 96 个采样点的「波形」和 32 根「频谱」，全部由 id、层权重决定。 */
export function fingerprint(profile, slot = '上午') {
  const ls = layersAt(profile, slot);
  const total = ls.reduce((s, l) => s + l.w, 0) || 1;
  let seed = 2166136261;
  for (const ch of profile.id) seed = ((seed ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  const wave = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    let v = 0;
    let k = 0;
    for (const l of ls) {
      const f = 1.4 + (k++ % 4) * 2.3 + l.w * 2.2;
      v += Math.sin((i / N) * Math.PI * 2 * f + hash01(seed, i + k * 17) * 3) * l.w;
    }
    wave.push(Math.max(-1, Math.min(1, (v / total) * 0.9)));
  }
  const bars = [];
  const B = 32;
  for (let i = 0; i < B; i++) {
    // 低频高、高频低，再叠一点由层权重决定的小峰，像真正的频谱
    let v = Math.pow(1 - i / B, 1.6) * 0.55;
    for (let k = 0; k < ls.length; k++) {
      const center = Math.floor(hash01(seed + 7, k) * (B - 4)) + 2;
      v += Math.exp(-Math.pow((i - center) / 2.2, 2)) * ls[k].w * 0.16;
    }
    bars.push(Math.min(1, v + hash01(seed + 13, i) * 0.12));
  }
  return { wave, bars, layers: ls, total };
}

/** 分类统计，给筛选条上的数字用。 */
export function categoryCounts(points = POINTS) {
  const m = new Map(CATEGORIES.map((c) => [c.id, 0]));
  for (const p of points) m.set(p.category, (m.get(p.category) || 0) + 1);
  return m;
}
