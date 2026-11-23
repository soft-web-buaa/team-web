// 刻声 · 回执：把一张盘的刻纹画成 SVG 盘面，配上编号、时间、地点、落款。
// 浏览器（投稿回执）与 Node（tools/archive-cli.mjs 的入馆回执）共用这一份；纯字符串，不碰 DOM。
// 仪式放在回执上（用户 2026-10-20 裁决 1a）：入馆可撤回，但回执是一件留得住的东西。
import { TURN, TEX_W, BANDS, R0, R1, PITCH } from './groove.js';

const C = { paper: '#F2F4F3', alu: '#D3D7DA', lathe: '#515C6A', ink: '#24304A', scope: '#E6BE3A' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 每帧（10 ms）的刻纹深度 0–1：64 个频带里最响的 16 个取平均（只看平均会把人声压得太平）。 */
export function frameEnergy(tex, frames) {
  const out = new Float32Array(frames), col = new Float32Array(BANDS);
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < BANDS; k++) col[k] = tex[k * TEX_W + i] / 255;
    col.sort();
    let s = 0;
    for (let k = BANDS - 16; k < BANDS; k++) s += col[k];
    out[i] = s / 16;
  }
  return out;
}

/** 盘面：铝盘 + 螺旋刻纹（线宽 = 那一刻的声音）+ 石墨蓝盘心。返回 <g>，坐标系是半径 1 的单位圆。 */
export function discFace(tex, seconds, { label = '' } = {}) {
  const frames = Math.max(1, Math.min(TEX_W, Math.round(seconds * 100)));
  const e = frameEnergy(tex, frames);
  const pt = (t) => {
    const a = (2 * Math.PI * t) / TURN, r = R0 - (PITCH * t) / TURN;
    return [(r * Math.sin(a)).toFixed(4), (-r * Math.cos(a)).toFixed(4)];
  };
  const guide = [];
  for (let i = 0; i <= frames; i += 2) guide.push(pt(i / 100).join(','));
  // 相邻帧量化到同一档线宽就并成一条，路径数从上千降到几十
  const paths = [];
  let lvl = -1, run = [];
  const flush = () => { if (run.length > 1) paths.push(`<polyline points="${run.join(' ')}" stroke-width="${(0.004 + 0.0045 * lvl).toFixed(4)}"/>`); };
  for (let i = 0; i < frames; i++) {
    const L = Math.min(5, Math.round(Math.pow(e[i], 1.3) * 5));
    if (L !== lvl) { flush(); run = run.length ? [run.at(-1)] : []; lvl = L; }
    run.push(pt(i / 100).join(','));
  }
  run.push(pt(frames / 100).join(','));
  flush();
  return `<g>
  <circle r="1" fill="${C.alu}"/>
  <circle r="0.985" fill="none" stroke="${C.lathe}" stroke-width="0.004" opacity="0.5"/>
  <polyline points="${guide.join(' ')}" fill="none" stroke="${C.lathe}" stroke-width="0.0025" opacity="0.35"/>
  <g fill="none" stroke="${C.ink}" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g>
  <circle r="${(R1 - 0.04).toFixed(3)}" fill="${C.ink}"/>
  <circle r="0.022" fill="${C.paper}"/>
  ${label ? `<text y="0.12" text-anchor="middle" font-size="0.07" fill="${C.paper}" font-family="KS Fangsong Plan, KS Fangsong, FangSong, serif">${esc(label)}</text>` : ''}
</g>`;
}

/**
 * 回执（800 × 1160）。kind: 'submit' 投稿回执（投稿人自己导出）/ 'accession' 入馆回执（馆员发）。
 * f: { tex, seconds, no, place, when, signature, sha256, license, withdraw, issued }
 */
export function receiptSVG(kind, f) {
  const title = kind === 'accession' ? '刻声 · 入馆回执' : '刻声 · 投稿回执';
  const rows = [
    ['地点', f.place],
    ['时间', f.when],
    ['落款', f.signature],
    [kind === 'accession' ? '档案号' : '本机号', f.no],
    ['SHA-256', String(f.sha256 || '').slice(0, 32)],
  ];
  const foot = kind === 'accession'
    ? [`许可：只授刻声展示权，版权归作者，保留所有权利。`, `撤回码：${f.withdraw || '（见馆员回执）'}。凭它可要求下架，落款一并撤下。`]
    : ['这张盘还在你的柜子里。把投稿包交给馆员，入馆后会收到档案号与撤回码。', '许可：只授刻声展示权，版权归你，保留所有权利，可撤回。'];
  const y0 = 820;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1160" width="800" height="1160" font-family="KS Fangsong Plan, KS Fangsong, FangSong, STFangsong, 'Noto Serif CJK SC', serif">
<rect width="800" height="1160" fill="${C.paper}"/>
<text x="64" y="88" font-size="34" fill="${C.ink}" letter-spacing="2">${esc(title)}</text>
<text x="736" y="88" font-size="18" fill="${C.lathe}" text-anchor="end">${esc(f.issued || '')}</text>
<line x1="64" y1="112" x2="736" y2="112" stroke="${C.ink}" stroke-width="1.5"/>
<g transform="translate(400 450) scale(300)">${discFace(f.tex, f.seconds, { label: f.place })}</g>
${rows.map(([k, v], i) => `<text x="64" y="${y0 + i * 44}" font-size="18" fill="${C.lathe}">${esc(k)}</text><text x="190" y="${y0 + i * 44}" font-size="${k === 'SHA-256' ? 16 : 22}" fill="${C.ink}" font-family="${k === 'SHA-256' ? 'monospace' : 'inherit'}">${esc(v)}</text>`).join('\n')}
<line x1="64" y1="${y0 + rows.length * 44 - 16}" x2="736" y2="${y0 + rows.length * 44 - 16}" stroke="${C.alu}" stroke-width="1.5"/>
${foot.map((t, i) => `<text x="64" y="${y0 + rows.length * 44 + 18 + i * 28}" font-size="16" fill="${C.lathe}">${esc(t)}</text>`).join('\n')}
</svg>`;
}

/** 16 位单声道 PCM 的 WAV（encodeWav 写出的那种）→ { pcm, fs }。馆员脚本用。 */
export function decodeWav16(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('不是 WAV');
  let o = 12, fs = 0, ch = 1, bits = 16;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = v.getUint16(o + 10, true); fs = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === 'data') {
      if (bits !== 16) throw new Error(`只认 16 位 PCM（这个是 ${bits} 位）`);
      const n = Math.floor(size / 2 / ch), pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = v.getInt16(o + 8 + i * 2 * ch, true) / 32768;
      return { pcm, fs };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV 里没有 data 块');
}
