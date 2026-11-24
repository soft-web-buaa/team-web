// 听见校园 · 云契约：浏览器、开发用云模拟器（scripts/dev-cloud.mjs）、将来的云函数共用这一份常量与文字规则。
// 谁改了这里，三边一起变；scripts/check-cloud.mjs 会用同一份规则验服务端。
//
// 数据放哪（决策 0006）：
//   云    声片与档案、回声、照片（缩略与大图）、落款快照、同听、举报与审核状态、同意记录、计数。别人要看到的、要长期在的、要统计的，都以云为准。
//   本机  录到一半的声音、还没发出的话（发件箱）、画质档、「对我隐藏」。只有我自己要用，或者丢了能重新下载。
//   不留  照片里的 EXIF（含定位）：浏览器重新编码时去掉，服务端再检一遍并剥掉。
//
// 接口（JSON；字段含义见 scripts/dev-cloud.mjs 顶部）：
//   GET    /api/health
//   GET    /api/discs/:discId/echoes              一张声片上的回声（审核通过的 + 我自己的）
//   POST   /api/echoes                            钉一句话；id 由客户端生成，重复提交同一个 id 是幂等的
//   DELETE /api/echoes/:id                        只有作者能删，照片一并删
//   POST   /api/echoes/:id/report                 举报；不同的人举报满 3 次先收起，等人看
//   POST   /api/photos                            上传一张照片（缩略 + 大图，base64），要带同意；先审后显
//   GET    /api/photos/:id/(thumb|full)           审核通过的人人可看；审核中只有作者能看（?k=作者键）
//   GET    /api/places/:placeId/photos            这个地点的照片印样
// 身份：请求头 x-ks-key = 作者键（identity.js 的 authorKey，16 位十六进制）。它不是登录，只是认出"这是同一台设备上的同一个人"；
//       换成 CloudBase 匿名登录后，由云端的匿名 uid 代替，页面不用动。

export const ECHO_MAX = 40;
export const NAME_MAX = { grade: 12, dept: 24, name: 16 };
export const CONSENT_VERSION = 1;
export const PHOTO = {
  thumbSide: 480, fullSide: 1600,                       // 客户端缩放的长边
  thumbMaxBytes: 150 * 1024, fullMaxBytes: 900 * 1024,  // 服务端上限
  thumbMaxSide: 640, fullMaxSide: 2048, minSide: 16,    // 服务端接受的尺寸范围
};
export const LIMITS = { echoPerMin: 8, echoPerDay: 60, photoPerMin: 4, reportsToHold: 3 };

// 文字规则：和 src/lib/rules.js 同一份（那边给 Vue 页面用，这边给舞台页和服务端用）。
// scripts/check-echoes.mjs 会拿一组句子比两边的结果，改一边忘了另一边会报错。
const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|edu|top|xyz)\b)/i;
const DIGITS_RE = /\d[\d\s-]{5,}\d/;
const CONTACT_RE = /(加我|私信我|私我|微信号|vx号|qq号|\bvx\b|\bv信\b)/i;

/** 通过返回空字符串，不通过返回一句说明。 */
export function validateLine(text, max = ECHO_MAX) {
  const t = String(text || '').trim();
  if (!t) return '先写一句话。';
  if (t.length > max) return `最多 ${max} 个字。`;
  if (URL_RE.test(t)) return '这里不能放链接。';
  if (DIGITS_RE.test(t) || CONTACT_RE.test(t)) return '这里不能放号码或联系方式。';
  return '';
}

/** 落款里的短字段：可以空；有内容就查长度、链接、号码和联系方式。 */
export function validateField(text, max) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length > max) return `最多 ${max} 个字。`;
  if (URL_RE.test(t) || DIGITS_RE.test(t) || CONTACT_RE.test(t)) return '这里不能放链接、号码或联系方式。';
  return '';
}

export const cleanField = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
