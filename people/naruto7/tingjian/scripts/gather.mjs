// 听见校园 · 采集入馆：把组员在校园里录的声音收进馆藏（真实，署「某某 采集」）。
// 每一段：ffmpeg 解成 24 kHz 单声道 → 掐掉头尾各 0.4 秒（按下、停止的手碰声）→ 挑最「有事」的十秒
// （50 毫秒一帧的响度，起伏最大、整体不太弱的那一段）→ 首尾 80 毫秒淡入淡出 → 均方根拉到 −20 dBFS、峰值不过 −1 dBFS
// → 16 位 WAV → POST /api/admin/discs（审核口令从 .env 的 KS_ADMIN_TOKEN 读，不打印）。
//
//   node scripts/gather.mjs scripts/gather/sy-20261127.json            只看计划（窗口、响度、时刻），不上传
//   node scripts/gather.mjs scripts/gather/sy-20261127.json --post     传到本机开发服 http://127.0.0.1:5288
//   node scripts/gather.mjs 清单 --post --api https://…/api            传到别处（比如线上）
//   node scripts/gather.mjs 清单 --undo [--api …]                       按清单撤下（真删）
//
// 清单：{ by, consent: { ok, basis }, dir, items: [{ id, file, placeId, spot, at, note }] }。spot 是她站的那块场地（比馆藏的十六个地点细）。at 用录下的那一刻（北京时间，带 +08:00）。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS = 24000, MAX = 10, TRIM = 0.4, FADE = 0.08, TARGET = -20, CEIL = 0.891;

const args = process.argv.slice(2);
const listPath = args.find((a) => !a.startsWith('--'));
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
if (!listPath) { console.log('用法：node scripts/gather.mjs 清单.json [--post | --undo] [--api 地址]'); process.exit(1); }
const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const api = opt('--api', 'http://127.0.0.1:5288/api').replace(/\/$/, '');

function adminToken() {
  if (process.env.KS_ADMIN_TOKEN) return process.env.KS_ADMIN_TOKEN;
  try {
    const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('KS_ADMIN_TOKEN='));
    return line ? line.slice('KS_ADMIN_TOKEN='.length).trim() : '';
  } catch { return ''; }
}

async function decode(file) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(FS), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

/** 挑窗口：响度起伏（标准差）+ 0.3 × 平均响度，最大的那一段。短于十秒的整段用。 */
function pick(x) {
  const t0 = x.length / FS > 2 ? Math.round(TRIM * FS) : 0;
  const y = x.subarray(t0, x.length - t0);
  const W = Math.min(y.length, MAX * FS);
  if (y.length <= W) return { start: t0 / FS, pcm: Float32Array.from(y) };
  const F = Math.round(0.05 * FS), n = Math.floor(y.length / F), db = new Float32Array(n);
  for (let i = 0; i < n; i++) { let q = 0; for (let j = i * F; j < (i + 1) * F; j++) q += y[j] * y[j]; db[i] = 10 * Math.log10(q / F + 1e-10); }
  const wf = Math.floor(W / F);
  let best = 0, bestS = -Infinity;
  for (let s = 0; s + wf <= n; s += 5) {
    let m = 0; for (let i = s; i < s + wf; i++) m += db[i]; m /= wf;
    let v = 0; for (let i = s; i < s + wf; i++) v += (db[i] - m) ** 2; v = Math.sqrt(v / wf);
    const score = v + 0.3 * m;
    if (score > bestS) { bestS = score; best = s; }
  }
  return { start: (t0 + best * F) / FS, pcm: Float32Array.from(y.subarray(best * F, best * F + W)) };
}

function master(pcm) {
  const f = Math.round(FADE * FS);
  for (let i = 0; i < f && i < pcm.length; i++) { const g = i / f; pcm[i] *= g; pcm[pcm.length - 1 - i] *= g; }
  let q = 0, pk = 0; for (const v of pcm) { q += v * v; pk = Math.max(pk, Math.abs(v)); }
  const rms = 10 * Math.log10(q / pcm.length + 1e-12);
  const gain = Math.min(10 ** ((TARGET - rms) / 20), CEIL / Math.max(pk, 1e-6));
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  return { rawDb: Math.round(rms * 10) / 10, outDb: Math.round((rms + 20 * Math.log10(gain)) * 10) / 10, gainDb: Math.round(20 * Math.log10(gain) * 10) / 10 };
}

function wav(pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(FS, 24); b.writeUInt32LE(FS * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 0x7fff), 44 + i * 2);
  return b;
}

const token = flag('--post') || flag('--undo') ? adminToken() : '';
if ((flag('--post') || flag('--undo')) && !token) { console.log('没有审核口令：在 .env 填 KS_ADMIN_TOKEN，或用环境变量传。'); process.exit(1); }
const call = async (method, p, body) => {
  const r = await fetch(api + p, { method, headers: { 'content-type': 'text/plain;charset=utf-8', 'x-ks-admin': token }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* 空 */ }
  return { status: r.status, json: j };
};

let ok = 0, bad = 0;
for (const it of list.items) {
  if (flag('--undo')) {
    const r = await call('DELETE', `/admin/discs/${it.id}`);
    console.log(r.status === 200 ? '撤下' : `没撤（${r.status} ${r.json.error || ''}）`, it.id);
    r.status === 200 ? ok++ : bad++;
    continue;
  }
  const src = path.resolve(path.dirname(listPath), list.dir, it.file);
  const x = await decode(src);
  const { start, pcm } = pick(x);
  const lv = master(pcm);
  const line = `${it.id}  ${it.placeId}  ${it.at}  原长 ${(x.length / FS).toFixed(1)}s  取 ${start.toFixed(1)}–${(start + pcm.length / FS).toFixed(1)}s  ${lv.rawDb}→${lv.outDb} dBFS（${lv.gainDb >= 0 ? '+' : ''}${lv.gainDb}）  ${it.note}`;
  if (!flag('--post')) { console.log('计划', line); ok++; continue; }
  const r = await call('POST', '/admin/discs', { id: it.id, placeId: it.placeId, at: it.at, note: it.note, audio: wav(pcm).toString('base64'), src: { by: list.by, file: it.file, spot: it.spot || '', consent: list.consent && list.consent.ok === true } });
  if (r.status === 201 || (r.status === 200 && r.json.again)) { ok++; console.log(r.status === 201 ? '入馆' : '已在', line); }
  else { bad++; console.log(`不通过（${r.status} ${r.json.error || ''}）`, line); }
}
console.log(`采集入馆：${ok} 段${flag('--undo') ? '撤下' : flag('--post') ? '成功' : '计划'}，${bad} 段不通过`);
process.exit(bad ? 1 : 0);
