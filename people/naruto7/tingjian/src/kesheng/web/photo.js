// 听见校园 · 照片在手机或电脑上的处理：读进来、转正方向、缩成缩略图和大图、重新编码成 JPEG。
// 重新编码本身就会丢掉 EXIF（拍摄地点的经纬度、设备型号、时间）。服务端还会再剥一遍（jpeg-clean.js），前端的处理可以被绕过。
// 缩放只缩小不放大；PNG 的透明底铺成白色。长边和体积上限来自 contract.js，和服务端同一份。
import { PHOTO } from './contract.js';

const MAX_INPUT = 25 * 1024 * 1024;

async function bitmapOf(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 退回 <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

function scaled(src, side) {
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const k = Math.min(1, side / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function toJpeg(canvas, maxBytes) {
  for (const q of [0.84, 0.74, 0.62, 0.5, 0.4]) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error('这张照片压不到上限以内，换一张小一点的。');
}

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 返回 { thumb, full, previewUrl, width, height }：thumb、full 是 base64 的 JPEG；previewUrl 是本机预览用的 blob 地址（用完要 revoke）。失败抛一句人话。 */
export async function prepare(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('这不是一张图片。');
  if (file.size > MAX_INPUT) throw new Error('这张照片太大了（超过 25 MB）。');
  let src;
  try { src = await bitmapOf(file); } catch { throw new Error('读不出这张照片。换一张，或者先在相册里转成 JPEG。'); }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  if (Math.min(w, h) < PHOTO.minSide) throw new Error('这张照片太小了。');
  const full = await toJpeg(scaled(src, PHOTO.fullSide), PHOTO.fullMaxBytes);
  const thumb = await toJpeg(scaled(src, PHOTO.thumbSide), PHOTO.thumbMaxBytes);
  if (src.close) src.close();
  return { thumb: b64(await thumb.arrayBuffer()), full: b64(await full.arrayBuffer()), previewUrl: URL.createObjectURL(thumb), width: w, height: h };
}
