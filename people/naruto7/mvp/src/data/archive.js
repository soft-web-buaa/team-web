// 校史史料：截自公开视频的十秒片段，来自刻声的史料层（catalog.json 里 tier=archival 且有文案的 7 条）。
// 口径照刻声：史料不冒充真人录音，不进"真实录音"的计数，不上地图（没有可靠的校园位置）；
// 有 copy 的才显示文案，没有就只显示事实，不替它编话。
//
// 授权状态（如实写）：口头认可，书面授权待补。刻声目录里这批音频的授权字段是 course-internal-only
// （仅课程内部引用、不公开部署）。2026-11-23 组长明确批准把它们放进团队仓库，音频在 public/audio/archive/。
// 如果之后收到权利人的异议，删掉这个目录和本文件即可，页面其余部分不受影响。
// 文件不在时，播放会提示"没有找到这段声音的文件"。

const A = (name) => `audio/archive/${name}.mp3`;

export const ARCHIVE = [
  {
    id: 'arc-oral-ep1-125',
    title: '建校十年',
    from: '口述北航 1，第 1 分 25 秒',
    copy: '打上木桩、围起来，就是学校头几栋楼——先修一号楼，再修对面三号楼。',
    url: 'https://www.bilibili.com/video/BV1gt411d7Sz',
    src: A('oral-ep1-125'),
  },
  {
    id: 'arc-oral-ep3-043',
    title: '北京五号（一）',
    from: '口述北航 3，第 43 秒',
    copy: '那会儿是一片荒地，上课、吃饭、开会，都在工棚里。',
    url: 'https://www.bilibili.com/video/av34673136',
    src: A('oral-ep3-043'),
  },
  {
    id: 'arc-oral-ep3-804',
    title: '北京五号（二）',
    from: '口述北航 3，第 8 分 4 秒',
    copy: '地面只剩一米。我国第一架无人驾驶飞机，在那一刻落地。',
    url: 'https://www.bilibili.com/video/av34673136',
    src: A('oral-ep3-804'),
  },
  {
    id: 'arc-oral-ep4-845',
    title: '王洪星口述',
    from: '口述北航 4，第 8 分 45 秒',
    copy: '一段写给老院长的诗，后来被当作这一代人的注脚。',
    url: 'https://www.bilibili.com/video/av34762657',
    src: A('oral-ep4-845'),
  },
  {
    id: 'arc-oral-ep5-109',
    title: '高镇同口述',
    from: '口述北航 5，第 1 分 9 秒',
    copy: '看见场边那些修了又修的旧飞机，他起了学航空的念头。',
    url: 'https://www.bilibili.com/video/av34905263',
    src: A('oral-ep5-109'),
  },
  {
    id: 'arc-oly-o04',
    title: '奥运举重 女58kg',
    from: '2008 年奥运举重赛场声音',
    copy: '十秒里声音几乎没落过，一直在同一条线上。',
    url: 'https://www.bilibili.com/video/av631861137',
    src: A('oly-o04'),
  },
  {
    id: 'arc-oly-o06',
    title: '奥运举重 男85kg',
    from: '2008 年奥运举重赛场声音',
    copy: '前四秒是压着的，第 5.5 秒和第 8 秒各冲上去一次。',
    url: 'https://www.bilibili.com/video/av631861137',
    src: A('oly-o06'),
  },
].map((a) => ({ ...a, duration: 10, tier: 'archival', demo: false }));
