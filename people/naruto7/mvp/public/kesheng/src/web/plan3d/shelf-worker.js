// 刻声 · 示例柜的后台线程：摆盘（解码峰值星座 → 重建回放层索引、声场剖面库）+ 按配方做示例 + 听声寻片判定。
// 判定全走 src/web/find.js 的 Listener（与主页同一段逻辑、同一套门槛）；这里只是把它挪出主线程，三维画面不卡。
// 页面播放示例时，按播放到的秒数揭晓每个判读点——第 L 秒揭晓的结论只用了前 L 秒的声音，和边听边判是同一件事。
import { decodeShelf, indexShelf, offsetCurve } from './shelf.js';
import { makeExample, EX_FS } from './examples.js';
import { Listener, words } from '../find.js';
import { stft } from '../../dsp/stft.js';
import { fingerprintFrames } from '../../dsp/fingerprint.js';
import { buildSceneIndex, sceneProfile } from '../../dsp/scene.js';
import { placeCandidates } from '../place-guess.js';
import { synthClip } from './sounds.js';
import { cutWhole, padToTurns } from '../groove.js';

let lib = null;

async function load(base, discs) {
  const t0 = performance.now();
  const [meta, bin] = await Promise.all([
    fetch(`${base}shelf-v1.json`).then((r) => { if (!r.ok) throw new Error(`示例柜目录取不到（HTTP ${r.status}）`); return r.json(); }),
    fetch(`${base}shelf-v1.bin`).then((r) => { if (!r.ok) throw new Error(`示例柜声纹取不到（HTTP ${r.status}）`); return r.arrayBuffer(); }),
  ]);
  const byId = new Map(discs.map((d) => [d.id, d]));
  const missing = meta.ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`示例柜和页面的盘对不上（${missing.length} 张，比如 ${missing[0]}）：重新跑 node tools/derive-shelf.mjs`);
  const list = decodeShelf(meta, bin);
  const index = indexShelf(list);
  const scene = buildSceneIndex(meta.ids.map((id, i) => ({ key: id, v: meta.profiles[i] && Float32Array.from(meta.profiles[i]) })).filter((x) => x.v));
  lib = { meta, index, scene, byId };
  return { n: meta.ids.length, ms: Math.round(performance.now() - t0) };
}

function run(which, exclude = []) {
  const ex = lib.meta.examples[which];
  if (!ex) throw new Error(`没有这段示例：${which}`);
  const x = makeExample(ex.recipe, (id) => lib.byId.get(id), EX_FS);
  // 每个判读点各记一笔（第 L 秒的结论只用了前 L 秒）：页面放到第 L 秒才揭晓它
  const looks = [];
  const snap = () => ({ at: L.at, top: (L.res.ranked[0] && L.res.ranked[0].score) || 0, second: (L.res.ranked[1] && L.res.ranked[1].score) || 0, threshold: L.res.threshold, match: !!L.res.match });
  const L = new Listener(lib.index, EX_FS, { onLook: () => looks.push(snap()) });
  for (let i = 0; i < x.length; i += 4800) if (L.push(x.subarray(i, i + 4800))) break;
  looks.push(snap());
  const r = L.result();
  const res = r.res;
  // 画图：判定那一刻的查询指纹（与 Listener 最后一次判读同样取前 L·100 帧）
  const fr = stft(x.subarray(0, Math.round(r.seconds * EX_FS)), EX_FS);
  const prints = fingerprintFrames(fr.frames.slice(0, Math.round(r.seconds * 100)), EX_FS, fr.fftSize);
  const curves = res.ranked.slice(0, 2).map((z) => ({ id: z.id, ...offsetCurve(lib.index, prints, z.id) }));
  const places = placeCandidates(lib.scene, sceneProfile(x, EX_FS), (id) => lib.byId.get(id) && lib.byId.get(id).placeId, { exclude });
  // 刻纹：示例自己的（放的时候一边放一边露出来）；认出时连原盘一起备好，接上时不用再等合成
  // 示例后面补一段静音再补齐整圈：8 秒的示例不至于正好一圈圈绕回开头接着响
  const tail = new Float32Array(Math.min(10 * EX_FS, x.length + EX_FS)); tail.set(x);
  const exPcm = padToTurns(tail, EX_FS), exTex = cutWhole(exPcm, EX_FS).tex;
  let disc = null;
  if (res.match) {
    const d = lib.byId.get(res.match.id);
    const pcm = padToTurns(synthClip(d.synth.v, d.synth.seed, d.seconds, EX_FS), EX_FS);
    disc = { id: d.id, pcm, tex: cutWhole(pcm, EX_FS).tex };
  }
  const same = r.tier === ex.expect.tier && r.seconds === ex.expect.seconds && (r.tier !== 'match' || res.match.id === ex.expect.top[0].id);
  return {
    which, audio: x, fs: EX_FS, exPcm, exTex, disc, len: ex.recipe.len,
    tier: r.tier, seconds: r.seconds, match: res.match, candidates: r.candidates, ranked: res.ranked.slice(0, 3),
    threshold: res.threshold, N: res.N, queryHashes: res.queryHashes, why: r.tier === 'reject' ? words.reject(r.quality) : '',
    curves, places, same, looks,
  };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') self.postMessage({ type: 'loaded', ...(await load(data.base, data.discs)) });
    else if (data.type === 'run') {
      const out = run(data.which, data.exclude);
      const moved = [out.audio.buffer, out.exPcm.buffer, out.exTex.buffer];
      if (out.disc) moved.push(out.disc.pcm.buffer, out.disc.tex.buffer);
      self.postMessage({ type: 'result', ...out }, moved);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
