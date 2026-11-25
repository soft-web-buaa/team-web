// 听见校园 · 社区的固定口径：预置话题、心情、反应。浏览器与服务端共用（纯数据，不依赖任何东西）。
// 话题像贴吧的吧、小红书的 #话题：一个话题一个广场，用户也可以自己建（服务端限频、查重、拦链接号码）。
// 心情由用户自己选，不从声音推断（2026-11-23 定的口径）。

export const PRESET_TOPICS = [
  { id: 'tp-bimian', name: '闭馆前十分钟', intro: '图书馆熄灯前那十分钟，你听见了什么。' },
  { id: 'tp-xiake', name: '下课铃响以后', intro: '铃声之后的三十秒。' },
  { id: 'tp-shenye', name: '深夜的校园', intro: '二十二点以后还醒着的地方。' },
  { id: 'tp-diyici', name: '第一次来这里', intro: '报到那天，第一次走进某一栋楼。' },
  { id: 'tp-weilai', name: '给三年后的自己', intro: '封一段声音，到那一天再打开。' },
  { id: 'tp-tianqi', name: '下雨和下雪', intro: '天气改了校园的声音。' },
  { id: 'tp-shitang', name: '食堂的声音', intro: '窗口、餐盘、排队的人。' },
  { id: 'tp-biye', name: '毕业季', intro: '快要离开的人在录什么。' },
  { id: 'tp-jieli', name: '声音接力', intro: '一人一棒，把校园串起来。' },
  { id: 'tp-xiaoshi', name: '校史里的声音', intro: '史料、口述、旧广播。' },
];

export const MOODS = [
  { id: 'calm', name: '平静' },
  { id: 'miss', name: '想念' },
  { id: 'glad', name: '开心' },
  { id: 'tired', name: '疲惫' },
  { id: 'tense', name: '紧张' },
  { id: 'warm', name: '温暖' },
];
export const MOOD_IDS = new Set(MOODS.map((m) => m.id));
export const moodName = (id) => (MOODS.find((m) => m.id === id) || {}).name || '';

// 反应：共鸣（不评价内容，只说「我听见了，也被打动」。原先叫「抱抱」，学网易云音乐；组员说太亲昵，2026-11-26 改名，数据里的 id 仍是 hug）、我也是（同一种经历）。用声音回应走「回复」，附一段声音
export const REACTIONS = [
  { id: 'hug', name: '共鸣' },
  { id: 'same', name: '我也是' },
];

export const POST = { textMax: 280, replyMax: 200, topicsMax: 3, topicName: [2, 16], topicIntro: 60 };
export const DEMO_POST_RE = /^ps-demo-[a-z0-9]{2,8}$/;
export const SOUND_ID_RE = /^(ds-[a-z0-9-]{6,40}|concept-\d{3}|arc-[a-z0-9-]{3,40})$/;
