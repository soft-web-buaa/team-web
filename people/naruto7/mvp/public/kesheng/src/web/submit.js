// 刻声 · 投稿包：WAV + 侧车 JSON + 同意书 + 投稿回执（SVG）。主页与分区图共用。
// 页面不上传：投稿人把 zip 交给馆员，馆员用 tools/archive-cli.mjs 入馆（ARCHIVE-T1 §2）。
import { encodeWav } from '../dsp/synth.js';
import { makeZip } from './zip.js';
import { receiptSVG } from './receipt.js';
import { signature } from './identity.js';
import { semesterLabel, SLOT_WORD } from './semester.js';

export const CONSENT_VERSION = '2';
// 用户 2026-10-19 裁决 (a)：只授展示权、保留所有权利、可撤回。不授 CC（CC 不可撤回，与撤回承诺冲突）。
export const ARCHIVE_LICENSE = 'display-only';
export const SCHEMA = 2;

export function wavBytes(d) {
  return new Uint8Array(encodeWav(d.pcm.subarray(0, Math.round(d.seconds * d.fs)), d.fs));
}

export async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 单张的侧车文件：指纹与元数据在这里，WAV 只放声音。author 带卡号——入馆时馆员工具把卡号挪进台账。 */
export function sidecar(d) {
  return {
    schema: SCHEMA, id: d.id, fs: d.fs, seconds: d.seconds,
    place: d.place, placeId: d.placeId || null, campus: d.campus, note: d.note,
    at: d.at, date: d.date || null, no: d.no, pin: d.pin || null,
    zoneId: d.zoneId || null, buildingId: d.buildingId || null,
    slot: d.slot || null, week: d.week ?? null, semester: d.semester || null,
    kind: d.kind || null, status: d.status || 'local', sha256: d.sha256 || null, license: ARCHIVE_LICENSE,
    author: d.author || null,
    prints: d.prints, wav: `${d.no}.wav`,
  };
}

/** 一句话的时间：「2026 秋 · 第 7 周 · 晚上 · 10 月 20 日 19:42」 */
export function whenText(d) {
  const at = new Date(d.at);
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return [semesterLabel(d.semester), d.week ? `第 ${d.week} 周` : 'W--', SLOT_WORD[d.slot] || d.slot, `${at.getMonth() + 1} 月 ${at.getDate()} 日 ${hm}`].filter(Boolean).join(' · ');
}

export function submitReceipt(d) {
  return receiptSVG('submit', {
    tex: d.tex, seconds: d.seconds, no: d.no, place: d.place, when: whenText(d),
    signature: signature(d.author), sha256: d.sha256, issued: new Date().toISOString().slice(0, 10),
  });
}

/** → { name, blob }。顺手补上 sha256。 */
export async function buildSubmission(d) {
  if (!d.sha256) d.sha256 = await sha256Hex(wavBytes(d));
  const s = { ...sidecar(d), consentVersion: CONSENT_VERSION };
  const consent = [
    `刻声 · 投稿同意书 v${CONSENT_VERSION}`,
    '',
    `许可：${ARCHIVE_LICENSE}（只授予「刻声」在其站点与演示中展示这张声片；版权仍归投稿人，不授予任何可再分发、可商用的许可）`,
    '撤回：凭入馆回执上的撤回码可要求下架，刻声收到后停止展示，落款一并撤下；已经私下流传出去的副本不受此约束。',
    `落款：${signature(d.author)}。公开展示的只有年级、院系和名字（名字可以是昵称）；刻声卡号只给馆员用于认领与撤回，不公开。`,
    `档案号：${d.no}（本机号；入馆时重新编号）`,
    `SHA-256：${d.sha256}`,
  ].join('\n');
  const enc = new TextEncoder();
  const files = [
    { name: `${d.id}.wav`, data: wavBytes(d) },
    { name: `${d.id}.json`, data: enc.encode(JSON.stringify({ ...s, wav: `${d.id}.wav` }, null, 2)) },
    { name: 'CONSENT.txt', data: enc.encode(consent) },
    { name: 'RECEIPT.svg', data: enc.encode(submitReceipt(d)) },
  ];
  return { name: `投稿-${d.no}.zip`, blob: new Blob([await makeZip(files)], { type: 'application/zip' }) };
}

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
