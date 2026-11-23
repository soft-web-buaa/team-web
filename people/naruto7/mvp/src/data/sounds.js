// 声音的唯一数据源（种子数据）。地图、列表、详情、时间视图都从这里和 store.js 读，组件里不写死声音。
// 现在 8 条全是示例（demo: true）：声音由 lib/synth.js 在浏览器里合成，文字是对场景的描述，不是某个人的真实记录。
// 真实录音到位后：给条目加 src（如 '/audio/final/snd-001.mp3'）、把 demo 改成 false、by 写录制者。
//
// 字段：
//   id        唯一，snd-三位数
//   title     ≤ 12 字
//   block     校园分区，必须是 campus.js 里的 id
//   at        声音点在分区内的相对位置 [x, y]，0 到 1，y 从 0.5 起避开分区名
//   place     具体地点
//   hour      通常在一天里的几点听到，小数小时（21.92 = 21:55）
//   mood      安心 / 热闹 / 怀念 / 犯困 / 期待 之一
//   story     一两句场景描述
//   recipe    示例声音的合成配方名（见 synth.js）；有 src 时忽略
//   src       真实录音文件，没有就是 null
//   duration  秒
//   demo      true = 示例，false = 真实录音
//   by        录制者；示例写 '示例'

export const MOODS = ['安心', '热闹', '怀念', '犯困', '期待'];

export const SEED_SOUNDS = [
  {
    id: 'snd-001',
    title: '图书馆闭馆铃',
    block: 'XY-03',
    at: [0.62, 0.62],
    place: '图书馆一楼大厅',
    hour: 21.92,
    mood: '安心',
    story: '21:55，铃响三遍。第一遍抬头，第二遍合上电脑，第三遍灯灭一半，只剩推车的轮子声。',
    recipe: 'bell',
    src: null,
    duration: 10,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-002',
    title: '早八预备铃',
    block: 'XY-02',
    at: [0.45, 0.6],
    place: '一教走廊',
    hour: 7.75,
    mood: '犯困',
    story: '预备铃一响，走廊里的脚步一下子变快，有人在楼梯口把包子塞进口袋。',
    recipe: 'prepbell',
    src: null,
    duration: 7,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-003',
    title: '清晨的鸟',
    block: 'XY-01',
    at: [0.5, 0.62],
    place: '主楼前草坪',
    hour: 6.4,
    mood: '安心',
    story: '天刚亮，草坪上有几只鸟在对叫，远处还听不到自行车。',
    recipe: 'birds',
    src: null,
    duration: 12,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-004',
    title: '操场哨声',
    block: 'XY-05',
    at: [0.25, 0.62],
    place: '操场看台',
    hour: 17.5,
    mood: '期待',
    story: '一声长哨，三声短哨，跑道上的人同时抬头。哨声之后是散开的脚步和说话声。',
    recipe: 'whistle',
    src: null,
    duration: 9,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-005',
    title: '食堂窗口',
    block: 'XY-04',
    at: [0.3, 0.5],
    place: '东区食堂',
    hour: 12.1,
    mood: '热闹',
    story: '刷卡的一声“嘀”，托盘碰撞，窗口里喊号，几种声音混在一起，听不清哪一句是谁说的。',
    recipe: 'canteen',
    src: null,
    duration: 12,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-006',
    title: '雨落在车棚',
    block: 'XY-04',
    at: [0.66, 0.82],
    place: '宿舍楼车棚',
    hour: 14.0,
    mood: '安心',
    story: '雨点打在铁皮棚上，一阵密一阵疏。有人推着车跑进来，把伞抖了抖。',
    recipe: 'rain',
    src: null,
    duration: 12,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-007',
    title: '球场运球声',
    block: 'XY-05',
    at: [0.72, 0.62],
    place: '篮球场',
    hour: 18.3,
    mood: '热闹',
    story: '运球声很有节奏，间或有鞋底摩擦的声音，和球砸在篮板上的闷响。',
    recipe: 'basketball',
    src: null,
    duration: 9,
    demo: true,
    by: '示例',
  },
  {
    id: 'snd-008',
    title: '东门花坛的猫',
    block: 'XY-06',
    at: [0.5, 0.72],
    place: '东门花坛',
    hour: 22.4,
    mood: '怀念',
    story: '夜里很安静，花坛边的猫叫了两声，背景里有虫鸣。',
    recipe: 'cat',
    src: null,
    duration: 7,
    demo: true,
    by: '示例',
  },
];
