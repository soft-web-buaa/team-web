// 听见校园 · 合辑的固定口径（浏览器与服务端共用，纯数据）。
// 学黄泰霖原型的「主题合辑 / 共建唱片」：官方征集的和大家自己建的都是合辑，谁都可以往里放一段。
// 一张合辑有两种听法：一段接一段（连着听），或者全部叠在一起压成一张十秒的盘（叠成一张）。后一种是共建唱片的本意：几个人的十秒刻进同一道纹。
// 预置合辑的种子是馆藏里的示意盘（页面合成的声音），标「示意」，不算人数；用户放进来的存在云上。

export const ALBUM = { nameMin: 2, nameMax: 16, introMax: 60, tracksMax: 24, perDay: 3, trackPerMin: 10, trackPerDay: 30, mixMax: 8 };
export const ALBUM_ID_RE = /^al-[a-z0-9-]{3,40}$/;
export const TRACK_ID_RE = /^tk-[a-z0-9-]{6,40}$/;

export const PRESET_ALBUMS = [
  { id: 'al-baoshi', name: '学校用声音报时', intro: '下课铃、闭馆广播、取餐叫号、闸机的一声。学校一天里有很多个钟。',
    seeds: ['concept-036', 'concept-171', 'concept-018', 'concept-128', 'concept-206', 'concept-179', 'concept-051', 'concept-001'] },
  { id: 'al-zaoba', name: '早八之前', intro: '七点到八点之间，校园先醒过来的那些声音。',
    seeds: ['concept-197', 'concept-163', 'concept-039', 'concept-042', 'concept-164', 'concept-070', 'concept-154', 'concept-189', 'concept-223', 'concept-036'] },
  { id: 'al-shenye', name: '夜里还醒着的', intro: '二十三点以后，还有人在走、在说话、在烧水。',
    seeds: ['concept-194', 'concept-087', 'concept-001', 'concept-159', 'concept-178', 'concept-141', 'concept-139', 'concept-170', 'concept-142', 'concept-006'] },
  { id: 'al-paishou', name: '同一下拍手', intro: '在不同的屋子里拍一下手，尾巴拖得不一样长。叠在一起听最清楚。',
    seeds: ['concept-081', 'concept-098', 'concept-067', 'concept-156', 'concept-021', 'concept-058'] },
  { id: 'al-meiyouren', name: '没有人声的十秒', intro: '风、雨、虫和鸟。',
    seeds: ['concept-178', 'concept-070', 'concept-220', 'concept-158', 'concept-170', 'concept-147'] },
];
