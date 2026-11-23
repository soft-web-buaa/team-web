// 预置话题：每个话题是一个问题，下面挂几条原声和大家的回应。
// 话题先预置、不开放自由新建（防刷、好审）。replies 里的是示例回应，demo: true。

export const TOPICS = [
  {
    id: 'closing',
    title: '闭馆之后',
    prompt: '铃响之后，你走出图书馆听到的第一个声音是什么？',
    soundIds: ['snd-001', 'snd-008'],
    replies: [
      { id: 'r-closing-1', text: '先是自行车铃，然后是风。', mood: '安心', demo: true },
      { id: 'r-closing-2', text: '管理员在身后说，慢点走，门还没锁。', mood: '怀念', demo: true },
    ],
  },
  {
    id: 'morning',
    title: '早八路上',
    prompt: '哪个声音一响，你就知道该跑了？',
    soundIds: ['snd-002', 'snd-003'],
    replies: [{ id: 'r-morning-1', text: '预备铃。一听见就开始数还有几层楼。', mood: '犯困', demo: true }],
  },
  {
    id: 'canteen',
    title: '食堂里的声音',
    prompt: '哪个窗口的声音，你闭着眼也认得出？',
    soundIds: ['snd-005'],
    replies: [{ id: 'r-canteen-1', text: '刷卡机那一声“嘀”，余额不够时会拖得长一点。', mood: '热闹', demo: true }],
  },
  {
    id: 'sport',
    title: '傍晚的运动场',
    prompt: '傍晚的操场，你最先听到什么？',
    soundIds: ['snd-004', 'snd-007'],
    replies: [{ id: 'r-sport-1', text: '球场的运球声，隔着一整条跑道都能听见。', mood: '期待', demo: true }],
  },
  {
    id: 'rain',
    title: '下雨的时候',
    prompt: '下雨天，学校里哪个角落最好听？',
    soundIds: ['snd-006'],
    replies: [],
  },
];
