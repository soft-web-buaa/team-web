// 云契约自检：npm run check:cloud
// 在进程里起一个开发用云模拟器（scripts/dev-cloud.mjs），用两个不同的作者键 A、B 验证：
// A 留的话 B 看得到；服务端重做文字校验；限频；照片去 EXIF；先审后显；举报收起；删除只有作者能做。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCloud } from './dev-cloud.mjs';
import { inspectJpeg, cleanJpeg } from '../public/kesheng/src/web/jpeg-clean.js';

const results = [];
const check = (name, cond, extra = '') => results.push({ pass: !!cond, line: `${cond ? '通过' : '失败'}  ${name}${extra ? '  ' + extra : ''}` });

const A = 'a1a1a1a1a1a1a1a1', B = 'b2b2b2b2b2b2b2b2', C = 'c3c3c3c3c3c3c3c3', D = 'd4d4d4d4d4d4d4d4', E = 'e5e5e5e5e5e5e5e5';
const fixture = new Uint8Array(fs.readFileSync(fileURLToPath(new URL('./fixtures/photo-64x48.jpg', import.meta.url))));
const b64 = (u8) => Buffer.from(u8).toString('base64');

/** 在 SOI 后插一个 APP1（EXIF），里面写着一段"定位"，看服务端会不会把它剥掉。 */
function withExif(u8) {
  const payload = Buffer.from('Exif\0\0GPSLatitude=39.9866N GPSLongitude=116.3446E Make=TestPhone');
  const len = payload.length + 2;
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 255]), payload]);
  return new Uint8Array(Buffer.concat([Buffer.from(u8.subarray(0, 2)), seg, Buffer.from(u8.subarray(2))]));
}
const hasBytes = (u8, s) => Buffer.from(u8).includes(Buffer.from(s));

let clock = 1_000_000;
const cloud = createCloud({ now: () => clock });
const call = (method, path, body, key, query) => cloud.handle({ method, path, query: query || {}, headers: key ? { 'x-ks-key': key } : {}, body });
const echoBody = (id, text, extra = {}) => ({ id, discId: 'concept-033', t: 6.7, dur: 8, text, author: { grade: '2025级', dept: '宇航学院', name: '阿川' }, ...extra });

// ---- 回声：A 留，B 看得到 ----
let r = await call('POST', '/api/echoes', echoBody('ec-test-0001', '铃一响，后排的人已经把书合上了。'), A);
check('A 钉一句话成功', r.status === 201 && r.json.echo.mine === true, `status ${r.status}`);
r = await call('GET', '/api/discs/concept-033/echoes', null, B);
check('B 看得到 A 留的话', r.json.echoes.length === 1 && r.json.echoes[0].text.startsWith('铃一响'));
check('B 看到的不是"我的"，也拿不到作者键', r.json.echoes[0].mine === false && !JSON.stringify(r.json).includes(A));
r = await call('POST', '/api/echoes', echoBody('ec-test-0001', '铃一响，后排的人已经把书合上了。'), A);
check('同一个编号重复提交是幂等的（断网重发不会出两条）', r.status === 200 && r.json.again === true);
r = await call('POST', '/api/echoes', echoBody('ec-test-0001', '别人用了同一个编号'), B);
check('别人用同一个编号被拒绝', r.status === 409);
r = await call('GET', '/api/discs/concept-033/echoes', null, B);
check('重复提交之后仍然只有一条', r.json.echoes.length === 1);

// ---- 服务端重做文字校验 ----
for (const [name, text, want] of [['链接', '看 https://example.com', '这里不能放链接。'], ['号码', '加我 13800138000', '这里不能放号码或联系方式。'], ['空', '   ', '先写一句话。'], ['太长', '很'.repeat(41), '最多 40 个字。']]) {
  r = await call('POST', '/api/echoes', echoBody(`ec-bad-${name.length}${text.length}`, text), C);
  check(`服务端拦下${name}（前端的检查可以被绕过）`, r.status === 400 && r.json.error === want, r.json.error);
}
r = await call('POST', '/api/echoes', echoBody('ec-bad-author', '一句正常的话', { author: { grade: '2025级', dept: 'www.abc.com', name: '' } }), C);
check('服务端拦下落款里的链接', r.status === 400 && r.json.error.includes('学院'), r.json.error);
r = await call('POST', '/api/echoes', echoBody('ec-bad-time', '一句正常的话', { t: 99 }), C);
check('服务端拦下超出声片长度的秒数', r.status === 400);
r = await call('POST', '/api/echoes', echoBody('ec-nokey-1', '一句正常的话'), null);
check('没有作者键不能写', r.status === 401);
r = await call('POST', '/api/echoes', echoBody('ec-xss-0001', '<b>我也在这里等过</b>'), C);
check('<b> 当文本存下，不被当成 HTML', r.status === 201 && r.json.echo.text === '<b>我也在这里等过</b>');

// ---- 限频 ----
let last = 0;
for (let i = 0; i < 9; i++) last = (await call('POST', '/api/echoes', echoBody(`ec-rate-${i}00000`, `第 ${i} 句`), D)).status;
check('同一个人一分钟里最多 8 条，第 9 条被限频', last === 429, `第 9 条 status ${last}`);
clock += 61_000;
r = await call('POST', '/api/echoes', echoBody('ec-rate-after1', '过了一分钟又可以了'), D);
check('过一分钟又放行', r.status === 201);

// ---- 照片：去 EXIF、校验、先审后显 ----
const photoBody = (id, o = {}) => ({ id, placeId: 'XY02', consent: { version: 1, noIdentifiable: true }, thumb: b64(withExif(fixture)), full: b64(withExif(fixture)), ...o });
check('测试夹具带着 EXIF 定位', hasBytes(withExif(fixture), 'GPSLatitude'));
r = await call('POST', '/api/photos', photoBody('ph-test-0001'), A);
check('上传一张带 EXIF 的照片成功', r.status === 201 && r.json.photo.state === 'ok', `status ${r.status} ${r.json.error || ''}`);
r = await call('GET', '/api/photos/ph-test-0001/full', null, B);
const served = new Uint8Array(r.buffer || []);
check('取回的照片是 JPEG', r.status === 200 && inspectJpeg(served).ok, `${inspectJpeg(served).width}×${inspectJpeg(served).height}`);
check('服务端剥掉了 EXIF：定位、设备型号都不在了', !hasBytes(served, 'GPSLatitude') && !hasBytes(served, 'TestPhone') && !hasBytes(served, 'Exif'));
check('剥掉之后图像本身没变（体积只减不增）', served.length < withExif(fixture).length && served.length >= fixture.length - 20, `${withExif(fixture).length} → ${served.length} 字节`);
const direct = cleanJpeg(withExif(fixture));
check('cleanJpeg 对没有 EXIF 的图是原样返回', cleanJpeg(fixture).length === fixture.length);
check('cleanJpeg 与服务端结果一致', Buffer.from(direct).equals(Buffer.from(served)));

r = await call('POST', '/api/photos', photoBody('ph-test-0002', { consent: undefined }), A);
check('没有同意不能上传', r.status === 400 && r.json.error.includes('勾选'));
r = await call('POST', '/api/photos', photoBody('ph-test-0003', { consent: { version: 1, noIdentifiable: false } }), A);
check('同意没勾上不能上传', r.status === 400);
r = await call('POST', '/api/photos', photoBody('ph-test-0004', { full: b64(new Uint8Array([1, 2, 3, 4, 5, 6])) }), A);
check('不是 JPEG 的拒绝', r.status === 400 && r.json.error.includes('JPEG'), r.json.error);
r = await call('POST', '/api/photos', photoBody('ph-test-0005', { thumb: b64(new Uint8Array(200 * 1024).fill(7)) }), A);
check('太大的拒绝', r.status === 400);
r = await call('POST', '/api/photos', photoBody('ph-test-0006', { thumb: 'not base64!!' }), A);
check('不是 base64 的拒绝', r.status === 400);

// 照片挂到回声上
r = await call('POST', '/api/echoes', echoBody('ec-photo-0001', '这里秋天的光很好。', { photoId: 'ph-test-0001' }), A);
check('回声可以挂自己上传的照片', r.status === 201 && r.json.echo.photo && r.json.echo.photo.id === 'ph-test-0001');
r = await call('POST', '/api/echoes', echoBody('ec-photo-0002', '偷别人的照片。', { photoId: 'ph-test-0001' }), B);
check('不能挂别人上传的照片', r.status === 400);
r = await call('GET', '/api/places/XY02/photos', null, B);
check('地点的印样里能看到', r.json.photos.length === 1 && r.json.photos[0].id === 'ph-test-0001');

// ---- 先审后显 ----
const review = createCloud({ now: () => clock, review: true });
const rcall = (method, path, body, key) => review.handle({ method, path, query: {}, headers: key ? { 'x-ks-key': key } : {}, body });
r = await rcall('POST', '/api/photos', photoBody('ph-rev-00001'), A);
check('先审后显：上传后是 pending', r.status === 201 && r.json.photo.state === 'pending');
r = await rcall('GET', '/api/photos/ph-rev-00001/thumb', null, A);
check('先审后显：作者自己看得到', r.status === 200);
r = await rcall('GET', '/api/photos/ph-rev-00001/thumb', null, B);
check('先审后显：别人看不到（404，不泄露它存在）', r.status === 404);
r = await rcall('GET', '/api/places/XY02/photos', null, B);
check('先审后显：别人的印样里没有', r.json.photos.length === 0);
await rcall('POST', '/api/echoes', echoBody('ec-rev-000001', '有照片的话。', { photoId: 'ph-rev-00001' }), A);
r = await rcall('GET', '/api/discs/concept-033/echoes', null, B);
check('先审后显：话先显，照片不显', r.json.echoes.length === 1 && r.json.echoes[0].photo === null);
review.moderate('ph-rev-00001', 'ok');
r = await rcall('GET', '/api/discs/concept-033/echoes', null, B);
check('审核通过后别人看得到照片', r.json.echoes[0].photo && r.json.echoes[0].photo.id === 'ph-rev-00001');

// ---- 举报与删除 ----
r = await call('POST', '/api/echoes/ec-test-0001/report', {}, A);
check('自己举报自己被拒（直接删就行）', r.status === 400);
for (const k of [B, C]) await call('POST', '/api/echoes/ec-test-0001/report', {}, k);
r = await call('GET', '/api/discs/concept-033/echoes', null, E);
check('两个人举报：还看得到', r.json.echoes.some((e) => e.id === 'ec-test-0001'));
await call('POST', '/api/echoes/ec-test-0001/report', {}, D);
await call('POST', '/api/echoes/ec-test-0001/report', {}, D);
r = await call('GET', '/api/discs/concept-033/echoes', null, E);
check('三个不同的人举报：先收起，别人看不到', !r.json.echoes.some((e) => e.id === 'ec-test-0001'));
r = await call('GET', '/api/discs/concept-033/echoes', null, A);
check('收起之后作者自己还看得到，并且知道被收起', r.json.echoes.some((e) => e.id === 'ec-test-0001' && e.held === true));
r = await call('DELETE', '/api/echoes/ec-photo-0001', null, B);
check('别人不能删', r.status === 403);
r = await call('DELETE', '/api/echoes/ec-photo-0001', null, A);
check('作者能删', r.status === 200);
r = await call('GET', '/api/photos/ph-test-0001/full', null, B);
check('删回声时挂着的照片一起删', r.status === 404);

const failed = results.filter((x) => !x.pass).length;
console.log(results.map((x) => x.line).join('\n'));
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed}，失败 ${failed}。`);
process.exit(failed ? 1 : 0);
