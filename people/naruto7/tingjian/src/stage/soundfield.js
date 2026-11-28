// 声场（2026-11-28）：一段声音从录下它的地方往外传开，在校园地面上刻出一圈圈「等时线」。
// 二维波动方程（有限差分，蛙跳格式）跑在显卡上：楼是刚性边界，声波撞到墙上弹回来、从楼缝里绕过去；树林吸掉一点；
// 出了校界是吸声层。波速是真的 343 米每秒：模型水平方向是一比一的米，横穿校园约三秒。
//
// 画两样东西：
//  · 等时线：一张盘开始放时，从这一处发出一道探测脉冲，记下它最先到达每一格的时刻。每 0.14 秒一道线（48 米，正好一个载波波长），
//    读作「声音从那里传到这里要多久」。楼背后的线被挤密、往里弯，那是声影：声音要绕过去。线像唱片的纹，刻在校园上。
//  · 亮度：录音每 20 毫秒的响度从声源连续往外传（一道 7.1 赫兹的载波乘上包络），哪里此刻被这段声音照到，哪里的纹就亮。
//    声音响一下，亮光沿着纹一圈圈往外走，比唱针晚到的那一点就是真的传播时间。
// 录音本身的频率（几十到几千赫兹）波长只有厘米到米，这样的网格画不出来；看到的是「什么时候响、传到了哪、被哪栋楼挡住」，不是音高。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** 地面与墙的着色器共用：场的贴图、覆盖范围（x0, z0, 1/边长，世界米）、强度、增益、颜色、这一场开始多久（秒）、等时线间隔（秒）。 */
export const FIELD = {
  tex: { value: null }, ext: { value: new THREE.Vector3(0, 0, 1) }, k: { value: 0 }, gain: { value: 8 },
  col: { value: new THREE.Color('#E6BE3A') }, now: { value: 0 }, iso: { value: 0.14 },
};
export const SOUND_C = 343;            // 米每秒（20 °C 的空气）
const LAMBDA = 48;                     // 载波波长（米）：一栋楼宽上下，绕射看得出来
const F0 = SOUND_C / LAMBDA;
const MAXS = 8;
const HALF_LIFE = 1.1;                 // 秒：振幅减半（这个频段的空气吸收其实可以忽略，这是为了余响不越积越满）
export const ARRIVE_FOR = 5;           // 秒：探测脉冲走完全校（含绕到楼背后）用不了这么久，之后等时线不再变
const m = (v) => v / 10;

function blur(a, N, r) {
  const b = new Float32Array(a.length), w = 2 * r + 1;
  for (let y = 0; y < N; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += a[y * N + Math.min(N - 1, Math.max(0, x))];
    for (let x = 0; x < N; x++) { b[y * N + x] = s / w; s += a[y * N + Math.min(N - 1, x + r + 1)] - a[y * N + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += b[Math.min(N - 1, Math.max(0, y)) * N + x];
    for (let y = 0; y < N; y++) { a[y * N + x] = s / w; s += b[Math.min(N - 1, y + r + 1) * N + x] - b[Math.max(0, y - r) * N + x]; }
  }
}

// 状态贴图的四个通道：r 这一步的声压，g 上一步的声压，b 振幅包络，a 探测脉冲最先到达的时刻（秒，0 = 还没到）
const SIM = `
  precision highp float;
  uniform sampler2D uS, uM;
  uniform vec2 uPx;
  uniform float uC2, uDamp, uW, uT, uTh, uArr;
  uniform vec4 uSrc[${MAXS}];
  uniform int uN;
  varying vec2 vUv;
  float nb(vec2 o, float u) { vec2 q = vUv + o; return texture2D(uM, q).r > 0.5 ? u : texture2D(uS, q).r; }
  void main() {
    vec4 s = texture2D(uS, vUv);
    vec4 k = texture2D(uM, vUv);
    float u = s.r, up = s.g;
    float lap = nb(vec2(-uPx.x, 0.0), u) + nb(vec2(uPx.x, 0.0), u) + nb(vec2(0.0, -uPx.y), u) + nb(vec2(0.0, uPx.y), u) - 4.0 * u;
    float un = 2.0 * u - up + uC2 * lap;
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = 1.0 - smoothstep(0.0, 0.04, min(e.x, e.y));
    un *= 1.0 - (uDamp + k.g * 0.0035 + max(k.b, edge) * 0.05);
    for (int i = 0; i < ${MAXS}; i++) {
      if (i >= uN) break;
      vec4 q = uSrc[i];
      vec2 d = (vUv - q.xy) / q.w;
      un += q.z * exp(-dot(d, d));
    }
    un *= step(k.r, 0.5);              // 楼里不传声；墙是刚性边界（nb 取自己），波在墙面整个弹回
    float vel = (un - u) / uW;
    float env = mix(s.b, sqrt(un * un + vel * vel), 0.15);   // 振幅包络：时间常数约 7 步
    float arr = s.a;
    if (uArr > 0.5 && arr <= 0.0 && env > uTh && k.r < 0.5) arr = uT;
    if (k.r > 0.5) arr = max(max(texture2D(uS, vUv - vec2(uPx.x, 0.0)).a, texture2D(uS, vUv + vec2(uPx.x, 0.0)).a), max(texture2D(uS, vUv - vec2(0.0, uPx.y)).a, texture2D(uS, vUv + vec2(0.0, uPx.y)).a));
    gl_FragColor = vec4(un, u, env, arr);
  }`;
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** 建声场。n 是网格边长（格数）。显卡不支持浮点渲染目标时返回 ok: false，其余方法都是空的。 */
export function createField(renderer, campus, { n = 512 } = {}) {
  const none = { ok: false, step() {}, tap() {}, start() {}, stop() {}, anchor: (x, z) => [x, z], probe: () => null, N: 0, active: false, origin: null, live: false };
  const fullFloat = renderer.extensions.has('EXT_color_buffer_float');
  if (!renderer.capabilities.isWebGL2 || !(fullFloat || renderer.extensions.has('EXT_color_buffer_half_float'))) return none;
  // 范围：校界的外接正方形，四周各留 60 米吸声层
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const ring = campus.campus[0];
  for (let i = 0; i < ring.length; i += 2) {
    const x = m(ring[i]), z = -m(ring[i + 1]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const size = Math.max(x1 - x0, z1 - z0) + 120, N = n, px = N / size, dx = size / N;
  x0 = (x0 + x1) / 2 - size / 2; z0 = (z0 + z1) / 2 - size / 2;
  const paint = (draw) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = '#fff';
    draw(g);
    const d = g.getImageData(0, 0, N, N).data, a = new Float32Array(N * N);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
    return a;
  };
  const path = (g, r) => { for (let i = 0; i < r.length; i += 2) { const X = (m(r[i]) - x0) * px, Z = (-m(r[i + 1]) - z0) * px; if (i) g.lineTo(X, Z); else g.moveTo(X, Z); } g.closePath(); };
  const wall = paint((g) => { for (const b of campus.buildings) { g.beginPath(); for (const r of b.r) path(g, r); g.fill('evenodd'); } });
  const inside = paint((g) => { g.beginPath(); path(g, ring); g.fill(); });
  const tree = paint((g) => {
    for (const z of campus.zones) for (let i = 0; i < z.trees.length; i += 3) { g.beginPath(); g.arc((m(z.trees[i]) - x0) * px, (-m(z.trees[i + 1]) - z0) * px, Math.max(0.6, m(z.trees[i + 2]) * px), 0, 6.2832); g.fill(); }
  });
  const out = inside.map((v) => 1 - v);
  for (let k = 0; k < 3; k++) blur(out, N, Math.max(2, Math.round(8 / dx)));
  blur(tree, N, 1);
  const pack = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { pack[i * 4] = wall[i] > 0.5 ? 255 : 0; pack[i * 4 + 1] = Math.round(tree[i] * 255); pack[i * 4 + 2] = Math.round(Math.min(1, out[i] * 1.6) * 255); pack[i * 4 + 3] = 255; }
  const maskTex = new THREE.DataTexture(pack, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter; maskTex.needsUpdate = true;

  // 到达时刻要存到 5 秒、精到毫秒：能用 32 位浮点就用（半精度在 4 秒附近两毫秒一档，等时线会起台阶）。
  // 地面上的线是在格子之间插出来的，要线性过滤；32 位浮点贴图能不能线性过滤看扩展
  const type = fullFloat ? THREE.FloatType : THREE.HalfFloatType;
  const filt = !fullFloat || renderer.extensions.has('OES_texture_float_linear') ? THREE.LinearFilter : THREE.NearestFilter;
  const rt = [0, 1].map(() => new THREE.WebGLRenderTarget(N, N, { type, format: THREE.RGBAFormat, minFilter: filt, magFilter: filt, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }));
  // 时间步：Courant 数 0.6（二维蛙跳格式要 ≤ 1/√2 才稳）
  const dt = (0.6 * dx) / SOUND_C;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: SIM, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uS: { value: null }, uM: { value: maskTex }, uPx: { value: new THREE.Vector2(1 / N, 1 / N) }, uC2: { value: 0.36 },
      uDamp: { value: 1 - Math.exp((-dt * Math.LN2) / HALF_LIFE) }, uW: { value: 2 * Math.PI * F0 * dt },
      uT: { value: 0 }, uTh: { value: 1 }, uArr: { value: 0 },
      uSrc: { value: Array.from({ length: MAXS }, () => new THREE.Vector4()) }, uN: { value: 0 },
    },
  });
  const quad = new FullScreenQuad(mat);
  const clear = () => {
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const t of rt) { renderer.setRenderTarget(t); renderer.clear(true, false, false); }
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  };
  clear();
  FIELD.ext.value.set(x0, z0, 1 / size);
  FIELD.tex.value = rt[0].texture;

  const cellOf = (x, z) => [Math.floor((x - x0) * px), Math.floor((z - z0) * px)];
  const free = (i, j) => i >= 1 && j >= 1 && i < N - 1 && j < N - 1 && wall[j * N + i] < 0.5 && wall[j * N + i + 1] < 0.5 && wall[j * N + i - 1] < 0.5 && wall[(j + 1) * N + i] < 0.5 && wall[(j - 1) * N + i] < 0.5;
  /** 离 (x, z) 最近的一块空地（声源不能在墙里）：一圈一圈往外找，最远 40 格。 */
  function anchor(x, z) {
    const [ci, cj] = cellOf(x, z);
    if (free(ci, cj)) return [x, z];
    for (let r = 1; r <= 40; r++) {
      let best = null, bd = 1e9;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !free(i, j)) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return [x0 + (best[0] + 0.5) / px, z0 + (best[1] + 0.5) / px];
    }
    return [x, z];
  }

  let cur = 0, acc = 0, simT = 0, t0 = 0, origin = null, active = false, live = false, at = null;
  const taps = [];
  const R = 4 / N;                     // 声源的半径（贴图坐标）：四格，约四分之一波长；再小就带出网格画不准的短波
  const GAIN = 0.02, TAP_GAIN = 0.12, PROBE_GAIN = 0.2;
  // 「到了」的门槛：探测脉冲在空旷处的振幅按柱面波 1/√r 衰减、再乘阻尼；门槛跟着它降，楼背后绕过去的弱波也算到了
  const TH0 = 0.0035;
  const thAt = (t) => TH0 * Math.pow(0.5, t / HALF_LIFE) / Math.sqrt(1 + (t * SOUND_C) / 30);
  /** 开一场：清空场，从 (x, z) 发一道探测脉冲，之后五秒里记下它最先到达每一格的时刻。key 是这一场的名字（地点 id）。 */
  function start(x, z, key) {
    clear();
    at = anchor(x, z);
    taps.length = 0;
    taps.push({ x: at[0], z: at[1], t: simT, g: PROBE_GAIN });
    t0 = simT; origin = key; active = true; acc = 0;
    FIELD.now.value = 0;
    return at;
  }
  function stop() { active = false; origin = null; taps.length = 0; clear(); FIELD.now.value = 0; }
  /** 走一帧。srcs：[{ x, z, a }]，a 是这一刻的响度（0–1）。 */
  function step(frameDt, srcs) {
    if (!active) return;
    acc += Math.min(frameDt, 0.05);
    const prev = renderer.getRenderTarget();
    let k = 0;
    while (acc >= dt && k < 16) {
      acc -= dt; simT += dt; k++;
      let ns = 0;
      const carrier = Math.sin(2 * Math.PI * F0 * simT);
      for (const s of srcs) { if (ns >= MAXS) break; mat.uniforms.uSrc.value[ns++].set((s.x - x0) / size, (s.z - z0) / size, GAIN * s.a * carrier, R); }
      for (let i = taps.length - 1; i >= 0; i--) {
        const t = taps[i], age = simT - t.t;
        if (age > 0.2) { taps.splice(i, 1); continue; }
        if (ns >= MAXS) continue;
        // Ricker 子波：一道清楚的环，前后不拖尾
        const q = Math.PI * F0 * (age - 0.09), w = (1 - 2 * q * q) * Math.exp(-q * q);
        mat.uniforms.uSrc.value[ns++].set((t.x - x0) / size, (t.z - z0) / size, t.g * w, R);
      }
      const since = simT - t0;
      mat.uniforms.uN.value = ns;
      mat.uniforms.uT.value = since;
      mat.uniforms.uArr.value = since < ARRIVE_FOR ? 1 : 0;
      mat.uniforms.uTh.value = thAt(since);
      mat.uniforms.uS.value = rt[cur].texture;
      renderer.setRenderTarget(rt[1 - cur]);
      quad.render(renderer);
      cur = 1 - cur;
    }
    renderer.setRenderTarget(prev);
    FIELD.tex.value = rt[cur].texture;
    FIELD.now.value = simT - t0;
  }
  /** 在 (x, z) 敲一下：没在放声音时，这一下开新的一场（等时线以这里为心）；在放时只是多一道波，等时线不变。 */
  function tap(x, z) {
    if (!active || (!live && simT - t0 > ARRIVE_FOR)) return start(x, z, 'tap');
    const a = anchor(x, z);
    taps.push({ x: a[0], z: a[1], t: simT, g: TAP_GAIN });
    return a;
  }
  /** 走查用：读回整张场。peak 最大声压；covered 校内空地里已有到达时刻的比例；late 最晚的到达时刻；far 已到达的格子离声源最远多少米。 */
  function probe() {
    const buf = new Float32Array(N * N * 4);
    const t = rt[cur];
    if (type === THREE.FloatType) renderer.readRenderTargetPixels(t, 0, 0, N, N, buf);
    else { const h = new Uint16Array(N * N * 4); renderer.readRenderTargetPixels(t, 0, 0, N, N, h); for (let i = 0; i < h.length; i++) buf[i] = THREE.DataUtils.fromHalfFloat(h[i]); }
    let peak = 0, open = 0, got = 0, late = 0, far = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = (j * N + i) * 4;
      peak = Math.max(peak, Math.abs(buf[q]));
      const isIn = inside[j * N + i] > 0.5 && wall[j * N + i] < 0.5;
      if (isIn) open++;
      if (buf[q + 3] > 0) {
        if (isIn) got++;
        late = Math.max(late, buf[q + 3]);
        if (at) far = Math.max(far, Math.hypot(x0 + (i + 0.5) / px - at[0], z0 + (j + 0.5) / px - at[1]));
      }
    }
    return { peak, covered: open ? got / open : 0, late, far, age: active ? simT - t0 : 0, active, origin, dx, dt, N, k: FIELD.k.value };
  }
  return {
    ok: true, step, tap, start, stop, anchor, probe, N,
    get active() { return active; }, get origin() { return origin; }, get live() { return live; }, set live(v) { live = v; },
  };
}
