import type { AppData, SoundRecord, Scene, MemoryType, Collection, InboxMessage } from '@/types'

const H = 3600_000
const now = Date.now()
const ago = (h: number) => now - h * H

type RecSeed = [
  id: string, title: string, loc: string, author: string, color: string,
  c1: string, c2: string, scene: Scene, dur: number, mood: number,
  activity: number, quiet: number, memory: MemoryType, sceneTag?: string,
]

const raw: RecSeed[] = [
  ['r1',  '风把银杏吹成一封没寄出的信', 'ginkgo', '林间风', '#f0a35e',
    '#f6c177', '#a9632f', 'leaves', 28, 82, 46, 71, '黄昏', '银杏季'],
  ['r2',  '翻页声像时间在轻轻呼吸',       'lib',    ' Paper', '#8fb8de',
    '#a8c8e8', '#3d5a80', 'library', 34, 68, 22, 92, '午后', '夜读'],
  ['r3',  '跑完八百米，晚风比心跳还响',   'field',  '阿澈',   '#ef7d6a',
    '#f4a28c', '#8e3b46', 'gym', 22, 88, 91, 8, '黄昏'],
  ['r4',  '一教前的鸟叫，是早八的闹钟',   'main',   '柚子',   '#8fd6a0',
    '#b8e0c2', '#3f7d63', 'birds', 26, 78, 63, 34, '清晨', '晨间北航'],
  ['r5',  '湖面的风把烦恼吹散了一点点',   'lake',   '沉舟',   '#7fc8c8',
    '#9fdedd', '#2f6f78', 'wind', 31, 74, 38, 65, '午后'],
  ['r6',  '夜里的实验楼，只有我和 principles', 'lab', '码农K', '#9a9fe0',
    '#b9bdf0', '#4b4f8e', 'night', 40, 55, 30, 80, '深夜', '夜的声音'],
  ['r7',  '食堂的喧闹，是人间烟火的形状', 'canteen','饭团',   '#f2b56b',
    '#f7cd8e', '#b3693a', 'canteen', 25, 90, 95, 5, '午后'],
  ['r8',  '雨落在窗台上，像谁在轻轻敲门', 'lib',    '听雨人', '#8aa6c8',
    '#a9c2dc', '#4a6484', 'rain', 36, 62, 44, 58, '雨后', '雨的颜色'],
  ['r9',  '宿舍楼下的脚步声，都急着回某个地方', 'dorm', '小满', '#d3a2c0',
    '#e6bcd6', '#7a4a68', 'footsteps', 24, 58, 72, 22, '深夜'],
  ['r10', '新主楼的玻璃反射着整个下午',   'newmain','一鸣', '#9ec5e8',
    '#bcd8f0', '#4f7093', 'chatter', 29, 70, 68, 28, '午后'],
  ['r11', '体育馆的回声替我喊了那句加油', 'gym',   '跳跳', '#f0a58f',
    '#f7c1a8', '#98514a', 'gym', 20, 92, 88, 10, '黄昏'],
  ['r12', '咖啡角的爵士，让赶due变得温柔', 'cafe', '南风', '#c2a888',
    '#dcc4a4', '#7a5c3f', 'music', 33, 84, 41, 55, '黄昏'],
  ['r13', '南园的树影，替我保管了一个秘密', 'woods','默默', '#93c99a',
    '#b6dec0', '#3d6b57', 'birds', 30, 76, 29, 83, '清晨', '考试周'],
  ['r14', '北门的风，吹来了放假的味道',   'north','远行', '#e6c07a',
    '#f2d79b', '#a37a3e', 'wind', 27, 86, 57, 44, '午后'],
  ['r15', '喷泉的水声盖过了所有犹豫',     'main', '澄澄', '#8fd2d8',
    '#b6e6ea', '#3c7a86', 'fountain', 23, 80, 66, 37, '午后'],
  ['r16', '深夜的南门，路灯陪我走了一段', 'south','归人', '#a6a8d6',
    '#c2c4e8', '#51548c', 'footsteps', 35, 52, 25, 88, '深夜', '夜的声音'],
  ['r17', '考试周的风里都是咖啡和焦虑',   'lib',  '小北', '#d8b48f',
    '#ecd0ab', '#926a48', 'chatter', 32, 48, 74, 18, '考试周', '考试周'],
  ['r18', ' chlorophyll 的味道，是雨后的操场', 'field','青禾', '#a8cf9c',
    '#c8e3bd', '#587d4f', 'rain', 26, 79, 51, 60, '雨后', '雨的颜色'],
]

function makeRecord(
  s: RecSeed, idx: number, extra: Partial<SoundRecord> = {},
): SoundRecord {
  const [id, title, locationId, authorName, authorColor, c1, c2, scene, duration, mood, activity, quiet, memoryType, tag] = s
  const loc = require$loc(locationId)
  return {
    id, title, locationId, locationName: loc,
    authorId: `u-${idx % 7}`, authorName, authorColor,
    cover: [c1, c2], scene, duration, mood, activity, quiet,
    createdAt: ago(idx * 5 + 2),
    memoryType,
    visibility: '匿名公开',
    inCommunity: true,
    isMine: false,
    favorite: false,
    likedBy: Array.from({ length: Math.floor(Math.random() * 9) + 1 }, (_, k) => `v${k}`),
    echoes: [],
    collectionId: tag ? collectionIdFor(tag) : undefined,
    isCapsule: false,
    ...extra,
  }
}

const LOC_NAME: Record<string, string> = {
  lib: '图书馆', lake: '绿园湖畔', main: '主楼广场', newmain: '新主楼',
  field: '田径场', gym: '体育馆', canteen: '食堂街', dorm: '宿舍区',
  ginkgo: '银杏大道', woods: '南园树林', cafe: '咖啡角', lab: '实验楼群',
  north: '北门', south: '南门',
}
function require$loc(id: string) { return LOC_NAME[id] ?? '校园' }
function collectionIdFor(tag: string) {
  const map: Record<string, string> = { '银杏季': 'c1', '夜读': 'c2', '晨间北航': 'c3', '夜的声音': 'c4', '雨的颜色': 'c5', '考试周': 'c6' }
  return map[tag]
}

export const COLLECTIONS: Collection[] = [
  { id: 'c1', name: '银杏季·2026', theme: '秋日 / 落叶 / 温柔', kind: '官方', description: '官方统一收集的秋日声景，风格一致的金黄记忆。', color: '#e7a758', memberCount: 46 },
  { id: 'c2', name: '夜读计划', theme: '深夜 / 灯光 / 安静', kind: '共建', description: '把每个挑灯的夜晚，压成一张安静的唱片。', color: '#7a86c9', memberCount: 28 },
  { id: 'c3', name: '晨间北航', theme: '清晨 / 鸟鸣 / 开始', kind: '共建', description: '记录一天开始前的第一声。', color: '#84c9a0', memberCount: 63 },
  { id: 'c4', name: '夜的声音', theme: '深夜 / 虫鸣 / 独处', kind: '官方', description: '官方精选的夜间声景合集。', color: '#5f6fa8', memberCount: 35 },
  { id: 'c5', name: '雨天的三种颜色', theme: '雨后 / 水汽 / 朦胧', kind: '共建', description: '同一场雨，三种心情。', color: '#6fa8bd', memberCount: 19 },
  { id: 'c6', name: '考试周生存指南', theme: '焦虑 / 咖啡 / 互相打气', kind: '共建', description: '一起熬过的那几天。', color: '#c98a8a', memberCount: 82 },
]

export const createSeedData = (): AppData => {
  const records: SoundRecord[] = raw.map((s, i) => makeRecord(s, i))

  // 当前用户「我」的唱片
  const mine: RecSeed[] = [
    ['m1', '第一次听见北航的春天', 'lake', '我', '#7fd4c1',
      '#a8e6d4', '#3f8a83', 'birds', 30, 85, 52, 62, '清晨'],
    ['m2', '图书馆靠窗的位置有风', 'lib', '我', '#8fb8de',
      '#bcd6ef', '#41628a', 'wind', 26, 72, 30, 84, '午后'],
    ['m3', '夜跑时操场只剩我和月亮', 'field', '我', '#a89ad8',
      '#c6bcec', '#514a8c', 'footsteps', 24, 78, 61, 40, '深夜'],
    ['m4', '一摞书倒下的声音太响了', 'main', '我', '#e0a98f',
      '#f0c6aa', '#9a5f4a', 'chatter', 18, 66, 70, 25, '午后'],
  ]
  mine.forEach((s, i) => records.push(makeRecord(s, i + 100, {
    isMine: true,
    visibility: i === 2 ? '好友可见' : '匿名公开',
    inCommunity: i !== 2,
    likedBy: ['a', 'b', 'c', 'd', 'e'].slice(0, i + 2),
    echoes: i === 0 ? [{
      id: 'e1', authorName: '林间风', authorColor: '#f0a35e',
      text: '也被这阵风吹到了，谢谢你的春天。', scene: 'birds' as Scene,
      cover: ['#f6c177', '#a9632f'] as [string, string], createdAt: ago(9),
    }] : [],
  })))

  // 收藏的他人唱片
  ;[raw[0], raw[3], raw[11], raw[7]].forEach((s) => {
    const r = records.find(x => x.id === s[0])
    if (r) r.favorite = true
  })

  // 与他人共同创建的唱片（共建）
  records.push(makeRecord(
    ['j1', '我们把雨声叠成了一首歌', 'lake', '我 & 听雨人', '#8abecf',
      '#a8d5e2', '#3f7185', 'rain', 42, 80, 55, 60, '雨后', '雨的颜色'],
    200, { isMine: true, inCommunity: true, collectionId: 'c5', likedBy: ['x', 'y', 'z', 'w'] },
  ))

  const inbox: InboxMessage[] = [
    { id: 'i1', from: '林间风', text: '你的《第一次听见北航的春天》打动我了，像回到了大一。', recordId: 'm1', createdAt: ago(3), read: false, type: '打动' },
    { id: 'i2', from: '听雨人', text: '在《雨天的三种颜色》里留了一段回声，来听听看～', recordId: 'j1', createdAt: ago(7), read: false, type: '回声' },
    { id: 'i3', from: '官方小助手', text: '邀请你加入官方合辑「银杏季·2026」，一起收集秋天。', recordId: 'c1', createdAt: ago(12), read: true, type: '合辑邀请' },
    { id: 'i4', from: 'Aria', text: '被你在图书馆录的风声治愈了，谢谢！', recordId: 'm2', createdAt: ago(20), read: true, type: '打动' },
  ]

  return { records, inbox, collections: COLLECTIONS }
}

export const COVER_PRESETS: [string, string][] = [
  ['#f6c177', '#a9632f'], ['#a8c8e8', '#3d5a80'], ['#b8e0c2', '#3f7d63'],
  ['#e6bcd6', '#7a4a68'], ['#bcd8f0', '#4f7093'], ['#f7c1a8', '#98514a'],
  ['#9fdedd', '#2f6f78'], ['#c2c4e8', '#51548c'],
]
