import type { Category, CategoryId, DaySlot, Sound } from '@/types'

export const CATEGORIES: Category[] = [
  { id: 'study', name: '学习', color: '#5b7fa6' },
  { id: 'life', name: '生活', color: '#d98a4a' },
  { id: 'sport', name: '运动', color: '#4f9e7a' },
  { id: 'nature', name: '自然', color: '#7f9e5f' },
]

export const CATEGORY_MAP: Record<CategoryId, Category> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<CategoryId, Category>,
)

export const SOUNDS: Sound[] = [
  {
    id: 'snd-001',
    title: '图书馆闭馆音乐',
    category: 'study',
    slot: 'night',
    timeLabel: '21:55',
    place: '图书馆 · 一层大厅',
    x: 815,
    y: 397,
    story:
      '闭馆前十分钟，广播里会放一段钢琴曲。有人合上书，有人还在赶最后一道题，保洁阿姨推着车从书架间穿过。',
    duration: 24,
    credit: '演示数据 · 合成音',
    motif: { notes: [784, 659, 523, 392], type: 'triangle', step: 0.45, decay: 1.1 },
    memories: [
      {
        id: 'm-001',
        author: '2021 级 匿名',
        text: '毕业前最后一次闭馆，保安说“明天再来”，可我已经没有明天了。',
        date: '2026-06-18',
      },
      {
        id: 'm-002',
        author: '2023 级 林同学',
        text: '每次听到这段钢琴曲，就知道该把电脑合上了。',
        date: '2026-11-02',
      },
    ],
  },
  {
    id: 'snd-002',
    title: '新主楼的下课铃',
    category: 'study',
    slot: 'morning',
    timeLabel: '09:45',
    place: '新主楼 · 连廊',
    x: 1075,
    y: 815,
    story:
      '新主楼的连廊很长，铃一响，人流从两头同时涌出来。有人边走边回消息，有人已经拐进了下一间教室。',
    duration: 18,
    credit: '演示数据 · 合成音',
    motif: { notes: [880, 1108, 880], type: 'sine', step: 0.35, decay: 0.8 },
    memories: [
      {
        id: 'm-003',
        author: '2023 级 匿名',
        text: '大一第一次走错新主楼，在连廊里转了三圈才找到教室。',
        date: '2026-09-12',
      },
    ],
  },
  {
    id: 'snd-003',
    title: '一食堂的刷卡声',
    category: 'life',
    slot: 'noon',
    timeLabel: '12:03',
    place: '一食堂 · 2 号窗口',
    x: 430,
    y: 505,
    story:
      '中午十二点，刷卡机几乎没有停过。“滴”一声，后面的人已经端着盘子往前挪了半步，窗口里的阿姨头也不抬。',
    duration: 12,
    credit: '演示数据 · 合成音',
    motif: { notes: [], type: 'sine', step: 0.2, decay: 0.15, noise: 0.55 },
    memories: [
      {
        id: 'm-004',
        author: '2022 级 匿名',
        text: '食堂阿姨记得我不吃香菜，刷卡的时候会多问一句。',
        date: '2026-10-21',
      },
    ],
  },
  {
    id: 'snd-004',
    title: '学院路东门的车流',
    category: 'life',
    slot: 'dusk',
    timeLabel: '18:10',
    place: '东门 · 学院路',
    x: 1265,
    y: 365,
    story:
      '晚高峰，学院路上的车灯连成一条线。东门的保安在指挥，外卖骑手从车缝里穿过去，公交报站声混在风里。',
    duration: 26,
    credit: '演示数据 · 合成音',
    motif: { notes: [], type: 'sine', step: 0.3, decay: 0.4, noise: 0.85 },
    memories: [
      {
        id: 'm-005',
        author: '2019 级 周同学',
        text: '每次打车回学校，听到东门外的车流就知道到了。',
        date: '2026-05-30',
      },
    ],
  },
  {
    id: 'snd-005',
    title: '操场夜跑的脚步',
    category: 'sport',
    slot: 'night',
    timeLabel: '21:20',
    place: '田径场 · 西侧跑道',
    x: 530,
    y: 810,
    story:
      '九点后的田径场，脚步声一圈一圈。跑道边的灯只开一半，剩下的一半留给月亮和耳机里的歌。',
    duration: 22,
    credit: '演示数据 · 合成音',
    motif: { notes: [110, 120, 105, 115], type: 'sine', step: 0.3, decay: 0.25 },
    memories: [
      {
        id: 'm-006',
        author: '2023 级 匿名',
        text: '体测前夜在操场走了十圈，其实一圈都没跑。',
        date: '2026-10-15',
      },
    ],
  },
  {
    id: 'snd-006',
    title: '篮球场的拍球声',
    category: 'sport',
    slot: 'afternoon',
    timeLabel: '16:40',
    place: '篮球场 · 3 号场',
    x: 680,
    y: 825,
    story:
      '下午四点半，篮球场永远缺一个捡球的人。球鞋摩擦地面的声音、球砸在篮筐上的声音，一直响到天黑。',
    duration: 20,
    credit: '演示数据 · 合成音',
    motif: { notes: [170, 150, 165], type: 'triangle', step: 0.28, decay: 0.2 },
    memories: [
      {
        id: 'm-007',
        author: '2022 级 陈同学',
        text: '篮球场边的自动贩卖机，夏天永远只剩无糖可乐。',
        date: '2026-09-28',
      },
    ],
  },
  {
    id: 'snd-007',
    title: '绿园清晨的鸟鸣',
    category: 'nature',
    slot: 'dawn',
    timeLabel: '06:30',
    place: '绿园 · 东侧树林',
    x: 600,
    y: 330,
    story:
      '六点半的绿园，鸟比人早到。晨读的人坐在长椅上，声音压得很低，怕惊动树上的麻雀。',
    duration: 30,
    credit: '演示数据 · 合成音',
    motif: { notes: [1800, 2200, 1900, 2400, 2100], type: 'sine', step: 0.13, decay: 0.18 },
    memories: [
      {
        id: 'm-008',
        author: '2020 级 匿名',
        text: '考研那年每天六点半到绿园背单词，鸟叫比闹钟管用。',
        date: '2026-04-11',
      },
    ],
  },
  {
    id: 'snd-008',
    title: '荷花池的蛙声',
    category: 'nature',
    slot: 'night',
    timeLabel: '22:10',
    place: '荷花池 · 北岸',
    x: 720,
    y: 330,
    story:
      '荷花池的蛙声从五月响到十月。夏天晚上路过，声音大得像在开会；冬天池面结冰，就只剩风。',
    duration: 28,
    credit: '演示数据 · 合成音',
    motif: { notes: [220, 180, 240], type: 'triangle', step: 0.35, decay: 0.3 },
    memories: [
      {
        id: 'm-009',
        author: '2023 级 匿名',
        text: '夏天晚上路过荷花池，蛙声大得像在开会。',
        date: '2026-07-06',
      },
    ],
  },
  {
    id: 'snd-009',
    title: '宿舍楼下的猫叫',
    category: 'nature',
    slot: 'dusk',
    timeLabel: '19:10',
    place: '宿舍区 · 3 号楼',
    x: 620,
    y: 520,
    story:
      '宿舍楼下那只橘猫，听到塑料袋就出现。它不亲人，但会保持一米距离跟着你，直到你蹲下来。',
    duration: 14,
    credit: '演示数据 · 合成音',
    motif: { notes: [620, 780], type: 'triangle', step: 0.22, decay: 0.5 },
    memories: [
      {
        id: 'm-010',
        author: '2022 级 王同学',
        text: '橘猫只认火腿肠，不认人。',
        date: '2026-10-30',
      },
    ],
  },
  {
    id: 'snd-010',
    title: '主楼前的自行车铃',
    category: 'life',
    slot: 'afternoon',
    timeLabel: '17:20',
    place: '主楼 · 南广场',
    x: 1000,
    y: 360,
    story:
      '主楼前下课，自行车铃一路响到食堂。有人逆行，有人后座带人，保安吹哨子的声音永远慢半拍。',
    duration: 16,
    credit: '演示数据 · 合成音',
    motif: { notes: [2000, 2200, 2000], type: 'sine', step: 0.12, decay: 0.25 },
    memories: [
      {
        id: 'm-011',
        author: '2021 级 匿名',
        text: '下课铃一响，自行车铃就跟着响，像接力。',
        date: '2026-06-01',
      },
    ],
  },
]

export const REPRESENTATIVES: Record<DaySlot, string> = {
  dawn: 'snd-007',
  morning: 'snd-002',
  noon: 'snd-003',
  afternoon: 'snd-006',
  dusk: 'snd-004',
  night: 'snd-001',
}
