// 听见校园 · JPEG 检查与清洗（浏览器与 Node 共用，纯函数，不依赖任何库）。
// 为什么：手机拍的照片带 EXIF（拍摄地点的经纬度、设备型号、时间）。上传前浏览器重新编码已经会去掉，
// 但前端的检查可以被绕过，所以服务端对每一张收到的照片再做一遍：验证它真是 JPEG，读出尺寸，把 APP1 到 APP15 和注释段剥掉。
// 只留图像本身需要的段（量化表、霍夫曼表、帧头、扫描数据）和 APP0（JFIF，里面没有隐私信息）。

const isSOF = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** 读出 { ok, width, height } 或 { ok: false, error }。 */
export function inspectJpeg(b) {
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ok: false, error: '这不是 JPEG 图片。' };
  let i = 2, width = 0, height = 0, scan = false;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return { ok: false, error: '图片文件损坏。' };
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) break;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return { ok: false, error: '图片文件损坏。' };
    if (isSOF(m)) { height = (b[i + 5] << 8) | b[i + 6]; width = (b[i + 7] << 8) | b[i + 8]; }
    if (m === 0xda) { scan = true; break; }
    i += 2 + len;
  }
  if (!width || !height || !scan) return { ok: false, error: '图片文件缺少图像数据。' };
  return { ok: true, width, height };
}

/** 去掉 APP1 到 APP15 与注释段（EXIF、XMP、IPTC、定位都在这些段里）。返回新的 Uint8Array；输入不合法时抛错。 */
export function cleanJpeg(b) {
  const chk = inspectJpeg(b);
  if (!chk.ok) throw new Error(chk.error);
  const parts = [b.subarray(0, 2)];
  let i = 2;
  while (i + 3 < b.length) {
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) { parts.push(b.subarray(i, i + 2)); i += 2; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xda) { parts.push(b.subarray(i)); i = b.length; break; }   // 扫描数据照原样拷到结尾
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
