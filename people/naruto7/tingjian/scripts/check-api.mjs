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
const call = (method, p, body = null, key = A, extra = {}) => api.handle({ method, path: p, body, headers: { 'x-ks-key': key, ...extra } });
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

// 云函数那一层：HTTP 访问服务的 event 进来，集成响应出去（和本机同一个 handle）
const { toHttp } = await import('../cloudfunctions/api/handler.mjs');
const fnMain = toHttp(api);
const ev = await fnMain({ httpMethod: 'POST', path: '/discs', headers: { 'X-KS-Key': D, 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify({ id: 'ds-test-0020', placeId: 'XY05', audio: wav(2) })).toString('base64'), isBase64Encoded: true });
t('云函数：base64 的请求体、不带 /api 前缀的路径、大写的请求头', ev.statusCode === 201 && JSON.parse(ev.body).disc.placeId === 'XY05');
const evA = await fnMain({ httpMethod: 'GET', path: '/api/discs/ds-test-0020/audio', headers: { 'x-ks-key': D } });
t('云函数：声音以 base64 返回', evA.statusCode === 200 && evA.isBase64Encoded && Buffer.from(evA.body, 'base64').toString('ascii', 0, 4) === 'RIFF');
t('云函数：跨域预检', (await fnMain({ httpMethod: 'OPTIONS', path: '/discs' })).statusCode === 204);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`接口自检：${pass} 项通过，${fail} 项不通过`);
process.exit(fail ? 1 : 0);
