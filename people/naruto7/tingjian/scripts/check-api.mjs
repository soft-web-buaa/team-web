// 接口自检：用本机文件存储（临时目录）把 server/api.mjs 的规矩挨个走一遍。CloudBase 用同一份 handle，只换存储。
//   npm run check:api
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/api.mjs';
import { fileStore } from '../server/store-file.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-api-'));
let T = Date.parse('2026-11-24T11:30:00Z');
const api = createApi({ store: fileStore(dir), now: () => T, review: true, adminToken: 'adm' });
const A = 'a'.repeat(16), B = 'b'.repeat(16), C = 'c'.repeat(16), D = 'd'.repeat(16);
const call = (method, p, body = null, key = A, extra = {}) => {
  const [path, qs = ''] = p.split('?');
  return api.handle({ method, path, query: Object.fromEntries(new URLSearchParams(qs)), body, headers: { 'x-ks-key': key, ...extra } });
};
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('不通过 ', name); } };

function wav(sec, fs = 24000, ch = 1, bits = 16) {
  const n = Math.round(sec * fs), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(fs, 24); b.writeUInt32LE(fs * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 9) * 8000), 44 + i * 2);
  return b.toString('base64');
}
// 一张真的 JPEG，带 EXIF（相机型号），用来验证服务端剥掉了它
const JPG = fs.readFileSync(new URL('./fixtures/exif.jpg', import.meta.url));

const r1 = await call('POST', '/api/discs', { id: 'ds-test-0001', placeId: 'XY01', note: '翻书的声音', author: { grade: '2024级', name: '阿川' }, audio: wav(6) });
t('刻一张：201', r1.status === 201 && r1.json.disc.slot === '晚' && r1.json.disc.semester === '2026-2027-1');
t('刻一张：时段按北京时间（19:30 是晚）', r1.json.disc.hour > 19.4 && r1.json.disc.hour < 19.6);
t('重复提交同一个编号是幂等的', (await call('POST', '/api/discs', { id: 'ds-test-0001', placeId: 'XY01', audio: wav(6) })).json.again === true);
t('别人用同一个编号：409', (await call('POST', '/api/discs', { id: 'ds-test-0001', placeId: 'XY01', audio: wav(6) }, B)).status === 409);
t('没有作者键：401', (await api.handle({ method: 'POST', path: '/api/discs', body: {}, headers: {} })).status === 401);
t('没有地点：400', (await call('POST', '/api/discs', { id: 'ds-test-0002', audio: wav(3) })).status === 400);
t('超过十秒：400', (await call('POST', '/api/discs', { id: 'ds-test-0003', placeId: 'XY02', audio: wav(11) })).json.error === '最长十秒。');
t('立体声：400', (await call('POST', '/api/discs', { id: 'ds-test-0004', placeId: 'XY02', audio: wav(2, 24000, 2) })).status === 400);
t('不是 WAV：400', (await call('POST', '/api/discs', { id: 'ds-test-0005', placeId: 'XY02', audio: Buffer.from('hello world, not a wav file at all......').toString('base64') })).status === 400);
t('一句话里有链接：400', (await call('POST', '/api/discs', { id: 'ds-test-0006', placeId: 'XY02', note: '看 www.x.com', audio: wav(2) })).status === 400);
t('落款里有号码：400', (await call('POST', '/api/discs', { id: 'ds-test-0007', placeId: 'XY02', author: { name: '13800138000' }, audio: wav(2) })).status === 400);

const priv = await call('POST', '/api/discs', { id: 'ds-test-0010', placeId: 'XY03', visibility: 'private', audio: wav(2) });
const cap = await call('POST', '/api/discs', { id: 'ds-test-0011', placeId: 'XY03', capsuleUntil: '2027-06-01T00:00:00+08:00', audio: wav(2) });
t('心事盘与时间胶囊：都存上了', priv.status === 201 && cap.status === 201 && cap.json.disc.locked === true);
t('胶囊开封日在一年零一个月以外：400', (await call('POST', '/api/discs', { id: 'ds-test-0012', placeId: 'XY03', capsuleUntil: '2029-01-01T00:00:00Z', audio: wav(2) })).status === 400);
t('限频：一分钟最多三张', (await call('POST', '/api/discs', { id: 'ds-test-0013', placeId: 'XY04', audio: wav(2) })).status === 429);
let listB = (await call('GET', '/api/discs', null, B)).json.discs;
t('别人看不到我的心事盘和没到期的胶囊', listB.length === 1 && listB[0].id === 'ds-test-0001' && listB[0].author.key === undefined);
const listA = (await call('GET', '/api/discs')).json.discs;
t('我自己看得到', listA.length === 3);
t('别人取不到心事盘的声音', (await call('GET', '/api/discs/ds-test-0010/audio', null, B)).status === 404);
const au = await call('GET', '/api/discs/ds-test-0001/audio', null, B);
t('取声音：WAV', au.status === 200 && au.buffer.toString('ascii', 0, 4) === 'RIFF');
T += 200 * 86400000;   // 过了开封日
listB = (await call('GET', '/api/discs', null, B)).json.discs;
t('开封日一过，别人看得到胶囊', listB.some((d) => d.id === 'ds-test-0011'));

t('我也听过', (await call('POST', '/api/discs/ds-test-0001/heard', {}, B)).json.heard === 1);
t('概念盘也能点听过', (await call('POST', '/api/discs/concept-051/heard', {}, B)).json.heard === 1);
t('再点一次取消', (await call('POST', '/api/discs/concept-051/heard', {}, B)).json.heard === 0);

const e1 = await call('POST', '/api/echoes', { id: 'ec-test-0001', discId: 'ds-test-0001', t: 3.2, text: '这一秒是我', dur: 6 }, B);
t('钉一句话：201', e1.status === 201);
t('钉在声片长度以外：400', (await call('POST', '/api/echoes', { id: 'ec-test-0002', discId: 'ds-test-0001', t: 9, text: '超了', dur: 6 }, B)).status === 400);
t('回声里有联系方式：400', (await call('POST', '/api/echoes', { id: 'ec-test-0003', discId: 'ds-test-0001', t: 1, text: '加我微信号', dur: 6 }, B)).status === 400);
const me = (await call('GET', '/api/me')).json;
t('我的收件箱：回声与听过都在', me.inbox.some((x) => x.kind === 'echo') && me.inbox.some((x) => x.kind === 'heard'));
t('社区的回声流', (await call('GET', '/api/feed', null, C)).json.echoes.length === 1);
for (const k of [A, C, D]) await call('POST', '/api/echoes/ec-test-0001/report', {}, k);
t('不同的三个人举报：先收起', (await call('GET', '/api/discs/ds-test-0001/echoes', null, C)).json.echoes.length === 0);
t('作者自己还看得到被收起的', (await call('GET', '/api/discs/ds-test-0001/echoes', null, B)).json.echoes[0].held === true);

// —— 后来：刻下很久以后，作者在盘旁边补的一句（和回声一个集合，带 later: true）——
const lt1 = await call('POST', '/api/echoes', { id: 'ec-later-0001', discId: 'ds-test-0001', later: true, text: '后来我又去了一次，铃声换了。' }, A);
t('后来：作者能写，201，带距刻下几天', lt1.status === 201 && lt1.json.echo.later === true && lt1.json.echo.daysAfter === 200 && lt1.json.echo.t === undefined);
t('后来：不是作者，403', (await call('POST', '/api/echoes', { id: 'ec-later-0002', discId: 'ds-test-0001', later: true, text: '我也补一句' }, B)).status === 403);
t('后来：空的 400', (await call('POST', '/api/echoes', { id: 'ec-later-0003', discId: 'ds-test-0001', later: true, text: '   ' }, A)).status === 400);
t('后来：超过八十个字 400', (await call('POST', '/api/echoes', { id: 'ec-later-0004', discId: 'ds-test-0001', later: true, text: '声'.repeat(81) }, A)).status === 400);
t('后来：带链接 400', (await call('POST', '/api/echoes', { id: 'ec-later-0005', discId: 'ds-test-0001', later: true, text: '看 www.x.com' }, A)).status === 400);
t('后来：盘不存在 404', (await call('POST', '/api/echoes', { id: 'ec-later-0006', discId: 'ds-nope-0001', later: true, text: '一句' }, A)).status === 404);
t('后来：第二、三条 201', (await call('POST', '/api/echoes', { id: 'ec-later-0007', discId: 'ds-test-0001', later: true, text: '第二句' }, A)).status === 201 && (await call('POST', '/api/echoes', { id: 'ec-later-0008', discId: 'ds-test-0001', later: true, text: '第三句' }, A)).status === 201);
t('后来：一分钟里第四条 429', (await call('POST', '/api/echoes', { id: 'ec-later-0009', discId: 'ds-test-0001', later: true, text: '第四句' }, A)).status === 429);
T += 61_000;
t('后来：等一分钟，补到第五条', (await call('POST', '/api/echoes', { id: 'ec-later-0010', discId: 'ds-test-0001', later: true, text: '第四句' }, A)).status === 201 && (await call('POST', '/api/echoes', { id: 'ec-later-0011', discId: 'ds-test-0001', later: true, text: '第五句' }, A)).status === 201);
t('后来：第六条放不下 400', (await call('POST', '/api/echoes', { id: 'ec-later-0012', discId: 'ds-test-0001', later: true, text: '第六句' }, A)).status === 400);
t('后来：公开盘的后来，别人看得到', (await call('GET', '/api/discs/ds-test-0001/echoes', null, B)).json.echoes.filter((x) => x.later).length === 5);
t('后来：我的里带回来自己写的', (await call('GET', '/api/me', null, A)).json.later['ds-test-0001'].length === 5);
t('回声流里不混后来', (await call('GET', '/api/feed', null, C)).json.echoes.every((x) => !x.later));
t('心事盘：C 刻了一张', (await call('POST', '/api/discs', { id: 'ds-test-0030', placeId: 'XY03', visibility: 'private', audio: wav(2) }, C)).status === 201);
t('心事盘的后来：作者写得上', (await call('POST', '/api/echoes', { id: 'ec-later-0020', discId: 'ds-test-0030', later: true, text: '只有我自己看得到' }, C)).status === 201);
t('心事盘的后来：别人看不到', (await call('GET', '/api/discs/ds-test-0030/echoes', null, B)).json.echoes.length === 0);
t('心事盘的后来：作者看得到', (await call('GET', '/api/discs/ds-test-0030/echoes', null, C)).json.echoes.filter((x) => x.later).length === 1);
t('后来：别人删不了', (await call('DELETE', '/api/echoes/ec-later-0020', null, B)).status === 403);
t('后来：作者删掉自己的', (await call('DELETE', '/api/echoes/ec-later-0020', null, C)).status === 200 && (await call('GET', '/api/discs/ds-test-0030/echoes', null, C)).json.echoes.length === 0);
t('D 刻一张公开的', (await call('POST', '/api/discs', { id: 'ds-test-0031', placeId: 'XY05', audio: wav(2) }, D)).status === 201);
t('D 写一条后来', (await call('POST', '/api/echoes', { id: 'ec-later-0030', discId: 'ds-test-0031', later: true, text: '这句等着被举报' }, D)).status === 201);
for (const k of [A, B, C]) await call('POST', '/api/echoes/ec-later-0030/report', {}, k);
t('后来被三个人举报：先收起', (await call('GET', '/api/discs/ds-test-0031/echoes', null, B)).json.echoes.length === 0);
t('后来被举报后，作者自己还看得到（标已收起）', (await call('GET', '/api/discs/ds-test-0031/echoes', null, D)).json.echoes[0].held === true);

const ph = await call('POST', '/api/photos', { id: 'ph-test-0001', placeId: 'XY01', consent: { version: 1, noIdentifiable: true }, thumb: JPG.toString('base64'), full: JPG.toString('base64') }, B);
t('照片：先审后显', ph.status === 201 && ph.json.photo.state === 'pending');
t('没勾同意：400', (await call('POST', '/api/photos', { id: 'ph-test-0002', placeId: 'XY01', consent: {}, thumb: JPG.toString('base64'), full: JPG.toString('base64') }, B)).status === 400);
t('审核中：别人看不到', (await call('GET', '/api/photos/ph-test-0001/thumb', null, C)).status === 404);
const own = await call('GET', '/api/photos/ph-test-0001/full', null, B);
t('审核中：作者看得到，且 EXIF 段被剥掉', own.status === 200 && !own.buffer.includes(Buffer.from('Exif')));
t('没有审核口令：403', (await call('GET', '/api/admin/pending', null, A)).status === 403);
t('审核：待审一张', (await call('GET', '/api/admin/pending', null, A, { 'x-ks-admin': 'adm' })).json.photos.length === 1);
await call('POST', '/api/admin/photos/ph-test-0001', { status: 'ok' }, A, { 'x-ks-admin': 'adm' });
t('放行之后人人可看', (await call('GET', '/api/photos/ph-test-0001/thumb', null, C)).status === 200);

t('收藏', (await call('PUT', '/api/me/favs/concept-051', null, C)).status === 200 && (await call('GET', '/api/me', null, C)).json.favs[0] === 'concept-051');
t('别人删不了我的盘', (await call('DELETE', '/api/discs/ds-test-0001', null, B)).status === 403);
t('我能真删，回声一并删', (await call('DELETE', '/api/discs/ds-test-0001')).status === 200 && (await call('GET', '/api/discs/ds-test-0001/echoes', null, B)).json.echoes.length === 0);
t('删了之后声音也取不到', (await call('GET', '/api/discs/ds-test-0001/audio', null, A)).status === 404);
t('删盘时，后来一并删了（再删那条后来是 404）', (await call('DELETE', '/api/echoes/ec-later-0001', null, A)).status === 404);

// —— 社区 ——
const tps = (await call('GET', '/api/topics')).json.topics;
t('话题：预置 10 个', tps.filter((x) => x.preset).length === 10);
const nt = await call('POST', '/api/topics', { id: 'tp-test-0001', name: '#考试周', intro: '复习到几点' }, B);
t('建话题：去掉 #，201', nt.status === 201 && nt.json.topic.name === '考试周');
t('同名话题不重复建', (await call('POST', '/api/topics', { id: 'tp-test-0002', name: '考试周' }, C)).json.again === true);
t('话题名里有链接：400', (await call('POST', '/api/topics', { id: 'tp-test-0003', name: 'www.x.com' }, C)).status === 400);
const p1 = await call('POST', '/api/posts', { id: 'ps-test-0001', text: '闭馆音乐响起来的时候，整层楼都在收书包。', topics: ['tp-bimian'], placeId: 'XY01', mood: 'warm', soundId: 'concept-051' }, B);
t('发帖：带话题、地点、心情、声音', p1.status === 201 && p1.json.post.topics[0] === 'tp-bimian');
t('发帖：不存在的话题 400', (await call('POST', '/api/posts', { id: 'ps-test-0002', text: '一句话', topics: ['tp-nope'] }, B)).status === 400);
t('发帖：心情只能从给的里选', (await call('POST', '/api/posts', { id: 'ps-test-0003', text: '一句话', mood: 'angry' }, B)).status === 400);
t('发帖：附别人的心事盘 400', (await call('POST', '/api/posts', { id: 'ps-test-0004', text: '一句话', soundId: 'ds-test-0010' }, B)).status === 400);
t('发帖：联系方式被拦', (await call('POST', '/api/posts', { id: 'ps-test-0005', text: '私信我' }, C)).status === 400);
const q1 = await call('POST', '/api/posts/ps-test-0001/replies', { id: 'rp-test-0001', text: '我也在那一层' }, C);
const q2 = await call('POST', '/api/posts/ps-test-0001/replies', { id: 'rp-test-0002', text: '哪一层？', parentId: 'rp-test-0001' }, D);
const q3 = await call('POST', '/api/posts/ps-test-0001/replies', { id: 'rp-test-0003', text: '三楼', parentId: 'rp-test-0002' }, C);
t('楼层与楼中楼：回楼中楼也挂在那一层下', q1.status === 201 && q2.json.reply.parentId === 'rp-test-0001' && q3.json.reply.parentId === 'rp-test-0001');
t('示例帖也能回', (await call('POST', '/api/posts/ps-demo-01/replies', { id: 'rp-test-0004', text: '同感' }, C)).status === 201);
t('共鸣', (await call('POST', '/api/react', { target: 'ps-test-0001', type: 'hug' }, C)).json.hug === 1);
t('我也是', (await call('POST', '/api/react', { target: 'ps-test-0001', type: 'same' }, D)).json.same === 1);
t('再点一次共鸣就取消', (await call('POST', '/api/react', { target: 'ps-test-0001', type: 'hug' }, C)).json.hug === 0);
t('示例帖也能共鸣', (await call('POST', '/api/react', { target: 'ps-demo-01', type: 'hug' }, D)).json.hug === 1);
const pd = (await call('GET', '/api/posts/ps-test-0001', null, A)).json;
t('帖子详情：三条回复、我也是 1', pd.replies.length === 3 && pd.post.same === 1);
const feedP = (await call('GET', '/api/posts?sort=hot&demo=ps-demo-01', null, A)).json;
t('帖子流：热门排序、示例帖的回复与反应数也带回来', feedP.posts.length === 1 && feedP.demo['ps-demo-01'].replies === 1 && feedP.demo['ps-demo-01'].hug === 1);
t('按话题筛', (await call('GET', '/api/posts?topic=tp-bimian')).json.posts.length === 1 && (await call('GET', '/api/posts?topic=tp-xiake')).json.posts.length === 0);
const j1 = await call('POST', '/api/posts', { id: 'ps-test-0010', text: '第一棒：主楼的下课铃', soundId: 'concept-051', relayStart: true, topics: ['tp-jieli'] }, B);
const j2 = await call('POST', '/api/posts', { id: 'ps-test-0011', text: '第二棒：楼梯', soundId: 'concept-051', relayOf: 'ps-test-0010' }, C);
const j3 = await call('POST', '/api/posts', { id: 'ps-test-0012', text: '第三棒', soundId: 'concept-051', relayOf: 'ps-test-0011' }, D);
t('接力：第几棒由服务端数', j1.json.post.relayIndex === 1 && j2.json.post.relayIndex === 2 && j3.json.post.relayIndex === 3 && j3.json.post.relayRoot === 'ps-test-0010');
t('接力：不附声音 400', (await call('POST', '/api/posts', { id: 'ps-test-0013', text: '没声音', relayOf: 'ps-test-0012' }, A)).status === 400);
t('接力：详情里有整条链', (await call('GET', '/api/posts/ps-test-0011', null, A)).json.relay.length === 3);
const inboxB = (await call('GET', '/api/me', null, B)).json.inbox;
t('回应我的：别人回了我的帖、对我说我也是', inboxB.some((x) => x.kind === 'reply') && inboxB.some((x) => x.kind === 'same'));
const st = (await call('GET', '/api/stats')).json;
t('看板：心情只数帖子上选的', st.mood.warm === 1 && st.moodPlace.warm.XY01 === 1);
for (const k of [A, B, D]) await call('POST', '/api/posts/ps-test-0011/report', {}, k);   // 0011 是 C 发的：举报的是另外三个人
t('帖子被三个人举报：先收起', (await call('GET', '/api/posts/ps-test-0011', null, A)).status === 404 && (await call('GET', '/api/posts/ps-test-0011', null, C)).status === 200);
t('删楼层：楼中楼升成一层，不跟着消失', (await call('DELETE', '/api/replies/rp-test-0001', null, C)).status === 200 && (await call('GET', '/api/posts/ps-test-0001', null, A)).json.replies.every((r) => r.parentId === null));
t('别人删不了我的帖', (await call('DELETE', '/api/posts/ps-test-0001', null, C)).status === 403);
t('删帖：回复与反应一并删', (await call('DELETE', '/api/posts/ps-test-0001', null, B)).status === 200 && (await call('GET', '/api/posts/ps-test-0001', null, A)).status === 404);

t('示例楼层也能回、也能共鸣', (await call('POST', '/api/posts/ps-demo-01/replies', { id: 'rp-test-0020', text: '我也等', parentId: 'rp-demo-01' }, C)).json.reply.parentId === 'rp-demo-01'
  && (await call('POST', '/api/react', { target: 'rp-demo-01', type: 'same' }, C)).json.same === 1);
const dj = await call('POST', '/api/posts', { id: 'ps-test-0030', text: '第四棒', soundId: 'concept-051', relayOf: 'ps-demo-r3', relayRoot: 'ps-demo-r1', relayUpIndex: 3 }, C);
t('接示例接力：根是示例链的第一棒，第 4 棒', dj.json.post.relayRoot === 'ps-demo-r1' && dj.json.post.relayIndex === 4
  && (await call('GET', '/api/posts/ps-demo-r2?root=ps-demo-r1', null, A)).json.relay.length === 1);
t('给未来的自己：封存期间作者本人也听不到', (await call('GET', '/api/discs/ds-test-0011/audio', null, A)).status === 403 || T > Date.parse('2027-06-01'));

// —— 合辑与共建 ——
const al0 = (await call('GET', '/api/albums', null, A)).json.albums;
t('合辑：预置的几张都在，带种子', al0.length >= 5 && al0.every((a) => a.preset ? a.seeds.length > 0 : true));
const ownA = await call('POST', '/api/albums', { id: 'al-test-0001', name: '三楼的雨', intro: '下雨那天三楼的走廊', author: { grade: '2024级' } }, A);
t('建一张合辑：201', ownA.status === 201 && ownA.json.album.mine === true);
t('同名的合辑：409', (await call('POST', '/api/albums', { id: 'al-test-0002', name: '三楼的雨' }, B)).status === 409);
t('合辑名太短：400', (await call('POST', '/api/albums', { id: 'al-test-0003', name: '雨' }, B)).status === 400);
t('合辑名里有链接：400', (await call('POST', '/api/albums', { id: 'al-test-0004', name: '看 www.x.com' }, B)).status === 400);
t('预置合辑的编号不能抢：400', (await call('POST', '/api/albums', { id: 'al-baoshi', name: '抢一个' }, B)).status === 400);
const tk1 = await call('POST', '/api/albums/al-test-0001/tracks', { id: 'tk-test-0001', soundId: 'concept-147', author: { name: '小雨' } }, B);
t('别人往我的合辑里放一段：201', tk1.status === 201 && tk1.json.track.mine === true);
t('同一段不能放两次：409', (await call('POST', '/api/albums/al-test-0001/tracks', { id: 'tk-test-0002', soundId: 'concept-147' }, C)).status === 409);
t('预置合辑里的种子也不能重复放：409', (await call('POST', '/api/albums/al-baoshi/tracks', { id: 'tk-test-0003', soundId: 'concept-036' }, C)).status === 409);
t('放一段没有的声音：400', (await call('POST', '/api/albums/al-baoshi/tracks', { id: 'tk-test-0004', soundId: 'xx' }, C)).status === 400);
t('往预置合辑里放：201', (await call('POST', '/api/albums/al-baoshi/tracks', { id: 'tk-test-0005', soundId: 'concept-020' }, C)).status === 201);
const one = (await call('GET', '/api/albums/al-test-0001', null, A)).json;
t('合辑详情：一段、一个人，建的人能拿出别人的', one.tracks.length === 1 && one.album.people === 1 && one.tracks[0].canTake === true && one.tracks[0].mine === false);
t('收件箱：有人往我的合辑里放了一段', (await call('GET', '/api/me', null, A)).json.inbox.some((x) => x.kind === 'track' && x.albumName === '三楼的雨'));
t('不相干的人拿不出：403', (await call('DELETE', '/api/tracks/tk-test-0001', null, D)).status === 403);
t('别人删不了我的合辑：403', (await call('DELETE', '/api/albums/al-test-0001', null, B)).status === 403);
t('建的人拿出一段：200', (await call('DELETE', '/api/tracks/tk-test-0001', null, A)).status === 200);
t('删合辑：里面的一并删', (await call('DELETE', '/api/albums/al-test-0001', null, A)).status === 200 && (await call('GET', '/api/albums/al-test-0001', null, A)).status === 404);

// 云函数那一层：HTTP 访问服务的 event 进来，集成响应出去（和本机同一个 handle）
const { toHttp } = await import('../cloudfunctions/api/handler.mjs');
const fnMain = toHttp(api);
const ev = await fnMain({ httpMethod: 'POST', path: '/discs', headers: { 'X-KS-Key': D, 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify({ id: 'ds-test-0020', placeId: 'XY05', audio: wav(2) })).toString('base64'), isBase64Encoded: true });
t('云函数：base64 的请求体、不带 /api 前缀的路径、大写的请求头', ev.statusCode === 201 && JSON.parse(ev.body).disc.placeId === 'XY05');
const evA = await fnMain({ httpMethod: 'GET', path: '/api/discs/ds-test-0020/audio', headers: { 'x-ks-key': D } });
t('云函数：声音以 base64 返回', evA.statusCode === 200 && evA.isBase64Encoded && Buffer.from(evA.body, 'base64').toString('ascii', 0, 4) === 'RIFF');
t('云函数：跨域预检', (await fnMain({ httpMethod: 'OPTIONS', path: '/discs' })).statusCode === 204);

t('云函数：跨域预检放行 authorization', /authorization/.test((await fnMain({ httpMethod: 'OPTIONS', path: '/auth/me' })).headers['access-control-allow-headers']));

// 学号登记：寄码、验码、令牌、认领匿名留下的、盖过章的键不带令牌写不进
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-auth-'));
const sent = [];
const lapi = createApi({ store: fileStore(dir2), now: () => T, login: { secret: 's'.repeat(32), mailer: { kind: 'test', send: async (m) => { sent.push(m); } } } });
const lc = (method, p, body = null, headers = {}) => lapi.handle({ method, path: p, query: {}, body, headers });
const codeOf = () => sent.at(-1).text.match(/验证码：(\d{6})/)[1];
const E = 'e'.repeat(16), F = 'f'.repeat(16);
t('登记：health 报 login', (await lc('GET', '/api/health')).json.login === true && (await call('GET', '/api/health')).json.login === false);
t('登记：没开的环境寄码 503', (await call('POST', '/api/auth/code', { sid: '21371234' })).status === 503);
t('登记：学号样子不对 400', (await lc('POST', '/api/auth/code', { sid: '12ab' })).status === 400);
await lc('POST', '/api/discs', { id: 'ds-auth-0001', placeId: 'XY01', audio: wav(2) }, { 'x-ks-key': E });
const c1 = await lc('POST', '/api/auth/code', { sid: ' 21371234@BUAA.edu.cn ' });
t('登记：寄到 学号@buaa.edu.cn，回给页面的是打码的', c1.status === 200 && sent.at(-1).to === '21371234@buaa.edu.cn' && c1.json.to === '21****34@buaa.edu.cn' && !('devCode' in c1.json));
t('登记：六十秒内不重寄', (await lc('POST', '/api/auth/code', { sid: '21371234' })).status === 429);
const good = codeOf();
const bad = good === '000000' ? '111111' : '000000';
t('登记：错码 400 并报剩几次', /还能再试 4 次/.test((await lc('POST', '/api/auth/verify', { sid: '21371234', code: bad })).json.error));
const v1 = await lc('POST', '/api/auth/verify', { sid: '21371234', code: good }, { 'x-ks-key': E });
t('登记：验对了发令牌，作者键沿用这台设备的', v1.status === 200 && /^[A-Za-z0-9_-]{32}$/.test(v1.json.token) && v1.json.key === E && v1.json.account.sid === '21****34');
t('登记：一码一用', (await lc('POST', '/api/auth/verify', { sid: '21371234', code: good })).status === 400);
const tok = { authorization: `Bearer ${v1.json.token}` };
t('登记：带令牌认得出我的盘', (await lc('GET', '/api/discs', null, tok)).json.discs.find((d) => d.id === 'ds-auth-0001').mine === true);
t('登记：盖过章的键不带令牌写不进', (await lc('POST', '/api/discs', { id: 'ds-auth-0002', placeId: 'XY01', audio: wav(2) }, { 'x-ks-key': E })).json.code === 'sealed');
t('登记：带令牌写得进', (await lc('POST', '/api/discs', { id: 'ds-auth-0002', placeId: 'XY01', audio: wav(2) }, tok)).status === 201);
t('登记：落款跟着账号走', (await lc('PUT', '/api/auth/sig', { grade: '2021级', name: '阿川' }, tok)).json.account.sig.name === '阿川' && (await lc('GET', '/api/auth/me', null, tok)).json.account.sig.grade === '2021级');
// 第二台设备：匿名先刻一张、收藏一张，再用同一个学号登记，两样都并过来
await lc('POST', '/api/discs', { id: 'ds-auth-0003', placeId: 'XY02', audio: wav(2) }, { 'x-ks-key': F });
await lc('PUT', '/api/me/favs/ds-auth-0001', null, { 'x-ks-key': F });
T += 61_000;
await lc('POST', '/api/auth/code', { sid: '21371234' });
const v2 = await lc('POST', '/api/auth/verify', { sid: '21371234', code: codeOf() }, { 'x-ks-key': F });
const tok2 = { authorization: `Bearer ${v2.json.token}` };
const me2 = (await lc('GET', '/api/me', null, tok2)).json;
t('登记：第二台设备拿到同一个作者键，匿名的并过来', v2.json.key === E && v2.json.merged === 2 && me2.discs.some((d) => d.id === 'ds-auth-0003') && me2.favs.includes('ds-auth-0001'));
t('登记：退出后令牌作废', (await lc('POST', '/api/auth/logout', null, tok2)).status === 200 && (await lc('GET', '/api/auth/me', null, tok2)).json.code === 'session');
t('登记：另一台的令牌不受影响', (await lc('GET', '/api/auth/me', null, tok)).status === 200);
t('登记：假令牌 401', (await lc('GET', '/api/discs', null, { authorization: 'Bearer ' + 'x'.repeat(32) })).status === 401);
T += 61_000;
await lc('POST', '/api/auth/code', { sid: 'SY2106123' });
for (let i = 0; i < 5; i++) await lc('POST', '/api/auth/verify', { sid: 'sy2106123', code: '999999' === codeOf() ? '888888' : '999999' });
t('登记：错满五次，对的码也不收了', (await lc('POST', '/api/auth/verify', { sid: 'sy2106123', code: codeOf() })).status === 429);
const v3 = await (async () => { T += 61_000; await lc('POST', '/api/auth/code', { sid: 'sy2106123' }); return lc('POST', '/api/auth/verify', { sid: 'sy2106123', code: codeOf() }, { 'x-ks-key': E }); })();
t('登记：别人的键（已盖章）不会被认走，新账号另起一个键', v3.status === 200 && v3.json.key !== E && /^[0-9a-f]{16}$/.test(v3.json.key) && v3.json.merged === 0);
await new Promise((r) => setTimeout(r, 150));   // 文件存储合并写，等它落盘
const raw = fs.readdirSync(dir2).filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(path.join(dir2, f), 'utf8')).join('\n');
t('登记：库里不存学号原文、不存验证码原文、不存令牌原文', !raw.includes('21371234') && !raw.includes('2106123') && !raw.includes(v1.json.token) && !raw.includes(good));
fs.rmSync(dir2, { recursive: true, force: true });

// —— 采集入馆：组员在校园里录的声音，由审核口令收进馆藏（保留录下的时刻，不走限频，可撤下） ——
{
  const ADM = { 'x-ks-admin': 'adm' };
  const src = { by: 'Sh1yuhang2008', file: '11月26日 19点 篮球场1.m4a', consent: true };
  const one = (id, extra = {}) => ({ id, placeId: 'XY13', at: '2026-11-20T10:45:09Z', note: '篮球场', audio: wav(5), src, ...extra });
  t('入馆：没有审核口令 403', (await call('POST', '/api/admin/discs', one('ds-sy-test-01'))).status === 403);
  t('入馆：没写采集人同意 400', (await call('POST', '/api/admin/discs', one('ds-sy-test-01', { src: { by: 'x', consent: false } }), A, ADM)).status === 400);
  t('入馆：录下的时刻在将来 400', (await call('POST', '/api/admin/discs', one('ds-sy-test-01', { at: new Date(T + 86400000).toISOString() }), A, ADM)).status === 400);
  t('入馆：地点不对 400', (await call('POST', '/api/admin/discs', one('ds-sy-test-01', { placeId: 'XY99' }), A, ADM)).status === 400);
  const g1 = await call('POST', '/api/admin/discs', one('ds-sy-test-01'), A, ADM);
  t('入馆：201，时刻按录下的那一刻（北京 18:45，秋季学期）', g1.status === 201 && g1.json.disc.at === '2026-11-20T10:45:09.000Z' && Math.abs(g1.json.disc.hour - 18.75) < 0.01 && g1.json.disc.semester === '2026-2027-1' && g1.json.disc.slot === '晚');
  t('入馆：再提交同一张是幂等的', (await call('POST', '/api/admin/discs', one('ds-sy-test-01'), A, ADM)).json.again === true);
  let burst = true;
  for (let i = 2; i <= 6; i++) burst = burst && (await call('POST', '/api/admin/discs', one(`ds-sy-test-0${i}`), A, ADM)).status === 201;
  t('入馆：一口气收五张不被限频', burst);
  const lst = (await call('GET', '/api/discs', null, C)).json.discs.find((d) => d.id === 'ds-sy-test-01');
  t('入馆：大家都看得到，是真实，带采集人，不算谁的', !!lst && lst.tier === 'real' && lst.src && lst.src.by === 'Sh1yuhang2008' && !lst.src.file && lst.mine === false && lst.author === null);
  t('入馆：声音取得到', (await call('GET', '/api/discs/ds-sy-test-01/audio', null, C)).status === 200);
  t('入馆：普通用户删不了', (await call('DELETE', '/api/discs/ds-sy-test-01', null, A)).status === 403);
  t('撤下：没有口令 403', (await call('DELETE', '/api/admin/discs/ds-sy-test-01', null, A)).status === 403);
  t('撤下：有口令就撤，之后取声音 404', (await call('DELETE', '/api/admin/discs/ds-sy-test-01', null, A, ADM)).status === 200 && (await call('GET', '/api/discs/ds-sy-test-01/audio', null, C)).status === 404);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`接口自检：${pass} 项通过，${fail} 项不通过`);
process.exit(fail ? 1 : 0);
