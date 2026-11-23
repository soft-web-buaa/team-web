// 回声和回应的文字规则：一句话，不放链接、号码、联系方式。
// 这是前端的第一道关，后端接上以后要在服务端再校验一遍（前端的检查可以被绕过）。

const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|edu|top|xyz)\b)/i;
const DIGITS_RE = /\d[\d\s-]{5,}\d/; // 连续 7 位以上的数字，像手机号、QQ 号、学号
const CONTACT_RE = /(加我|私信我|私我|微信号|vx号|qq号|\bvx\b|\bv信\b)/i;

/** 通过返回空字符串，不通过返回一句说明 */
export function validateLine(text, max) {
  const t = String(text || '').trim();
  if (!t) return '先写一句话。';
  if (t.length > max) return `最多 ${max} 个字。`;
  if (URL_RE.test(t)) return '这里不能放链接。';
  if (DIGITS_RE.test(t) || CONTACT_RE.test(t)) return '这里不能放号码或联系方式。';
  return '';
}

/** 选填的短字段（学院、名字）：空的算通过，有内容就查长度、链接、号码和联系方式 */
export function validateField(text, max) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length > max) return `最多 ${max} 个字。`;
  if (URL_RE.test(t)) return '这里不能放链接。';
  if (DIGITS_RE.test(t) || CONTACT_RE.test(t)) return '这里不能放号码或联系方式。';
  return '';
}
