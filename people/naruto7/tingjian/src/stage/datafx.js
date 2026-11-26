// 听见校园 · 数据地图的三维画法（2026-11-26 重做，组长与组员的意见：要三维的波峰波谷、星云、像卫星拍的夜景灯光、楼本身也要有表示）。
//   nebula  星云：每个地方上空一团星尘，留得越多越密、越亮、越艳；相邻的几团之间有细细的一股在流（点在形状之间流动，学《涌现》的表达）
//   lights  夜景灯光：校园压暗，路和楼的轮廓上撒灯点，越热闹的地方灯越密越亮（像卫星夜里拍的城市）
//   surface 曲面：楼顶上方悬一张点阵的曲面，峰在留得多的地方；点稀，透得过去看得见楼。等高处的点亮一点，连成等高线
//   fill    注满：地点楼像量杯一样从底往上亮到它的量，顶上一道亮边
//
// 四种画法共用一张「场」：16 个地方各是一座高斯的山，权重 w = √(量 / 最大量)。场在着色器里算（每个点算 16 个高斯），
// CPU 每帧只把 16 个权重往目标值靠一点：换钟点、换量的时候，图是连续地涌过去的，不是跳过去的。
import * as THREE from 'three';

const N = 16;
const TAU = Math.PI * 2;
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function gauss(i) { const u = Math.max(1e-6, hash(i * 3.1 + 1)), v = hash(i * 7.7 + 2); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

// —— 颜色：少 → 多。夜观（暗底，相加）和跟着钟点的白天（亮底，正常叠，像墨）各一套 ——
// 示波黄 #E6BE3A 留给「此刻 / 我的 / 正在放」，这里不用
export const RAMPS = {
  count: { dark: ['#7F95C8', '#B48CF0', '#FF9C6E'], light: ['#7D8AA6', '#7B4FA3', '#C2413A'] },
  quiet: { dark: ['#5E7FA8', '#4FD1C5', '#D8FFF7'], light: ['#7A8C9E', '#1F7A7A', '#0D4F57'] },
  mood: { dark: ['#7F95C8', '#B48CF0', '#FF9C6E'], light: ['#7D8AA6', '#7B4FA3', '#C2413A'] },
};

const FIELD = /* glsl */ `
  uniform vec2 uP[16]; uniform float uW[16]; uniform vec3 uC[16];
  uniform vec3 uR0, uR1, uR2; uniform float uMood, uT, uScale, uDark, uK;
  // 场：16 座高斯的山。返回 0..1（叠在一起的地方用 1 - e^-x 压住，不会冲出去）；col 是按权重混的每处颜色（心情用）
  float field(vec2 q, float sig, out vec3 col) {
    float s = 0.0, ws = 1e-5; vec3 c = vec3(0.0);
    for (int i = 0; i < 16; i++) { vec2 d = q - uP[i]; float g = uW[i] * exp(-dot(d, d) / (2.0 * sig * sig)); s += g; c += uC[i] * g; ws += g; }
    col = c / ws;
    return 1.0 - exp(-1.5 * s);
  }
  // 按顶点属性里的编号取第 i 处：用常量下标的循环取，不直接 uW[i]（ANGLE 走 D3D11 时，按属性算出来的下标取 uniform 数组取不到值，星云整团不见）
  void site(int i, out vec2 p, out float w, out vec3 c) {
    p = vec2(0.0); w = 0.0; c = vec3(1.0);
    for (int k = 0; k < 16; k++) if (k == i) { p = uP[k]; w = uW[k]; c = uC[k]; }
  }
  vec3 ramp(float t, vec3 moodC) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = t < 0.5 ? mix(uR0, uR1, t * 2.0) : mix(uR1, uR2, t * 2.0 - 1.0);
    return mix(a, mix(uR0, moodC, smoothstep(0.0, 0.5, t)), uMood);
  }
`;
const SPRITE = /* glsl */ `
  varying vec3 vCol; varying float vA;
  uniform float uDark, uK;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    // 一颗星：外面一层软晕，里面一个亮芯（渐变，不是实心点）
    float a = exp(-r2 * 3.2) * 0.55 + exp(-r2 * 22.0) * 0.9;
    a *= vA * uK;
    if (uDark > 0.5) gl_FragColor = vec4(vCol * a, a);
    else gl_FragColor = vec4(vCol, min(1.0, a * 1.15));
  }
`;
function pointsMat(U, vertex) {
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FIELD + vertex, fragmentShader: SPRITE, transparent: true, depthWrite: false, toneMapped: false });
  return m;
}

/**
 * @param o { scene, campus, TILE_TOP, EX, lite }
 * @returns { set, step, tagY, form }
 */
export function createDataFx({ scene, campus, TILE_TOP, EX, lite = false }) {
  const m = (v) => v / 10;
  const places = campus.places.slice(0, N);
  const P = places.map((p) => new THREE.Vector2(m(p.x), -m(p.y)));
  const bOf = (p) => campus.buildings.find((b) => b.n === p.b);
  const roof = places.map((p) => TILE_TOP + (bOf(p)?.h ?? p.h) * EX);   // 楼顶的世界高度
  const U = {
    uP: { value: P }, uW: { value: new Array(N).fill(0) }, uC: { value: places.map(() => new THREE.Color('#ffffff')) },
    uR0: { value: new THREE.Color() }, uR1: { value: new THREE.Color() }, uR2: { value: new THREE.Color() },
    uMood: { value: 0 }, uT: { value: 0 }, uScale: { value: 800 }, uDark: { value: 1 }, uK: { value: 0 },
    uH: { value: roof.slice() }, uBase: { value: 0 }, uAmp: { value: 0 }, uMaxPx: { value: lite ? 9 : 16 },
  };
  const goal = new Array(N).fill(0);
  let form = null, k = 0;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // —— 星云 ——
  const nebula = (() => {
    const M = lite ? 520 : 1100, pos = [], att = [], seed = [];
    let id = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++, id++) {
      // 单位高斯的偏移；rank 决定这一颗在多大的量时出现（量越大出现的越多）
      pos.push(gauss(id), gauss(id + 0.5), gauss(id + 0.25));
      att.push(i, hash(id + 9), 0);
      seed.push(hash(id + 17));
    }
    // 流：每个地方连到离它最近的两处，一股细细的星尘在两处之间来回走（两处都有量时才出现）
    const edges = new Set();
    for (let i = 0; i < N; i++) {
      const near = P.map((q, j) => [j, q.distanceTo(P[i])]).filter((x) => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of near) edges.add(i < j ? `${i},${j}` : `${j},${i}`);
    }
    const F = lite ? 90 : 180;
    for (const e of edges) {
      const [i, j] = e.split(',').map(Number);
      for (let q = 0; q < F; q++, id++) { pos.push(gauss(id) * 0.35, gauss(id + 0.5) * 0.35, j); att.push(i, hash(id + 9), 1); seed.push(hash(id + 17)); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(att, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const mat = pointsMat(U, /* glsl */ `
      attribute vec3 aA; attribute float aSeed; uniform float uH[16]; uniform float uMaxPx;
      varying vec3 vCol; varying float vA;
      float roofOf(int i) { float h = 0.0; for (int k = 0; k < 16; k++) if (k == i) h = uH[k]; return h; }
      void main() {
        int i = int(aA.x + 0.5); float rank = aA.y; bool flow = aA.z > 0.5;
        vec3 off = position; vec3 col; float w; vec3 p;
        vec2 Pi; vec3 Ci; float Wi; site(i, Pi, Wi, Ci); float Hi = roofOf(i);
        if (!flow) {
          w = Wi;
          float R = 22.0 + 64.0 * sqrt(w);
          // 绕自己那一处慢慢转：越靠里转得越快（像一团星云）
          float rr = length(off.xz), ang = uT * (0.06 + 0.05 * aSeed) / (0.5 + rr * 0.35);
          vec2 xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * off.xz;
          p = vec3(Pi.x + xz.x * R, Hi + 26.0 + R * (0.42 + 0.3 * off.y), Pi.y + xz.y * R);
          p.y += sin(uT * 0.5 + aSeed * 6.28) * 2.0;
          float core = exp(-rr * rr * 0.6);
          vA = smoothstep(rank, rank + 0.06, w) * (0.35 + 0.65 * core) * (0.45 + 0.55 * w);
          col = ramp(w * (0.55 + 0.6 * core), Ci);
          if (uDark > 0.5) col *= 1.0 + 1.5 * core * w;          // 芯里亮过泛光的门槛，夜里会晕开
        } else {
          int j = int(off.z + 0.5);
          vec2 Pj; vec3 Cj; float Wj; site(j, Pj, Wj, Cj); float Hj = roofOf(j);
          w = min(Wi, Wj);
          float t = fract(aSeed + uT * (0.012 + 0.02 * rank));
          vec2 a = Pi, b = Pj; vec2 d = b - a; vec2 nrm = normalize(vec2(-d.y, d.x) + 1e-5);
          float bow = sin(t * 3.14159);
          vec2 xz = mix(a, b, t) + nrm * (off.x * 18.0 + bow * 14.0 * (aSeed - 0.5));
          float y = mix(Hi, Hj, t) + 30.0 + bow * (18.0 + 30.0 * w) + off.y * 8.0;
          p = vec3(xz.x, y, xz.y);
          vA = smoothstep(rank, rank + 0.1, w * 1.4) * 0.55 * bow;
          col = ramp(w * 0.6, mix(Ci, Cj, t));
        }
        vCol = col;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((flow ? 5.0 : 6.0 + 5.0 * aSeed) * uScale / -mv.z, 1.5, uMaxPx);
        gl_Position = projectionMatrix * mv;
      }`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    return pts;
  })();

  // —— 夜景灯光：路（中线两侧）和楼的轮廓上撒灯点 ——
  const lights = (() => {
    const pos = [], seed = [];
    let id = 0;
    const along = (pts, step, y, jit) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
        const nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
        for (let k2 = 0; k2 < n; k2++, id++) { const t = (k2 + hash(id)) / n, s = (hash(id + 3) - 0.5) * 2 * jit; pos.push(ax + (bx - ax) * t + nx * s, y, az + (bz - az) * t + nz * s); seed.push(hash(id + 5)); }
      }
    };
    for (const z of campus.zones) for (const r of z.roads) {
      const w = m(r[0]) / 2, pts = [];
      for (let i = 1; i < r.length; i += 2) pts.push([m(r[i]), -m(r[i + 1])]);
      along(pts, lite ? 9 : 6, TILE_TOP + 0.6, w * 0.85);
    }
    for (const b of campus.buildings) {
      const ring = b.r[0], pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([m(ring[i]), -m(ring[i + 1])]);
      pts.push(pts[0]);
      along(pts, lite ? 7 : 4.5, TILE_TOP + b.h * EX + 0.8, 0.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const mat = pointsMat(U, /* glsl */ `
      attribute float aSeed; uniform float uMaxPx; varying vec3 vCol; varying float vA;
      void main() {
        vec3 c; float b = field(position.xz, 62.0, c);
        // 底下一层稀稀的暗灯（看得出路网），越热闹灯越密越亮
        float on = step(aSeed, 0.28 + 0.72 * b);
        float tw = 0.9 + 0.1 * sin(uT * (2.0 + aSeed * 3.0) + aSeed * 40.0);
        // 没点亮的那些也留一层很淡的底光：路网和楼的轮廓能隐约看出，不是一片黑
        vA = (0.13 * (0.5 + 0.5 * b) + on * (0.5 + 1.0 * b)) * tw;
        vec3 sodium = vec3(0.92, 0.62, 0.34);
        vCol = mix(sodium * 0.8, ramp(0.35 + 0.65 * b, c), smoothstep(0.05, 0.6, b)) * (uDark > 0.5 ? 1.05 + 1.9 * b * b : 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp((4.4 + 7.0 * b) * uScale / -mv.z, 1.5, uMaxPx);
        gl_Position = projectionMatrix * mv;
      }`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    return pts;
  })();

  // —— 曲面：校园轮廓里的一张点阵，悬在最高的楼顶上方 ——
  const ringPts = (() => { const r = campus.campus[0], v = [];   // campus.campus 是环的数组，第 0 个是外轮廓
 for (let i = 0; i < r.length; i += 2) v.push([m(r[i]), -m(r[i + 1])]); return v; })();
  const inside = (x, z) => { let c = false; for (let i = 0, j = ringPts.length - 1; i < ringPts.length; j = i++) { const [xi, zi] = ringPts[i], [xj, zj] = ringPts[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const topRoof = Math.max(...campus.buildings.map((b) => b.h)) * EX + TILE_TOP;
  U.uBase.value = topRoof + 16;
  U.uAmp.value = 150;
  const surface = (() => {
    const xs = ringPts.map((p) => p[0]), zs = ringPts.map((p) => p[1]);
    const step = lite ? 11 : 7.5, pos = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) if (inside(x, z)) pos.push(x, 0, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = pointsMat(U, /* glsl */ `
      uniform float uBase, uAmp, uMaxPx; varying vec3 vCol; varying float vA;
      void main() {
        vec3 c; float b = field(position.xz, 78.0, c);
        float y = uBase + uAmp * b + sin(position.x * 0.021 + uT * 0.55) * cos(position.z * 0.019 + uT * 0.42) * (1.2 + 3.0 * b);
        // 等高处的点亮一点：点连成一圈圈等高线
        float iso = 1.0 - smoothstep(0.0, 0.07, abs(fract(b * 7.0 + 0.5) - 0.5));
        vA = (0.1 + 0.9 * smoothstep(0.02, 0.55, b)) * (0.75 + 0.6 * iso * step(0.04, b));
        vCol = ramp(b, c) * (uDark > 0.5 ? 1.0 + 0.9 * iso * b + 1.2 * b * b : 1.0);
        vec4 mv = modelViewMatrix * vec4(position.x, y, position.z, 1.0);
        gl_PointSize = clamp((4.0 + 4.0 * b) * uScale / -mv.z, 1.2, uMaxPx);
        gl_Position = projectionMatrix * mv;
      }`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    return pts;
  })();
  // 曲面上的峰对着哪栋楼：每处一根细线从楼顶连到曲面
  const stems = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    l.renderOrder = 6;
    return l;
  })();
  const surfY = (i) => {   // 曲面在第 i 处的高度（和着色器同一个公式，不带波纹）
    let s = 0;
    for (let j = 0; j < N; j++) { const d2 = P[i].distanceToSquared(P[j]); s += U.uW.value[j] * Math.exp(-d2 / (2 * 78 * 78)); }
    return U.uBase.value + U.uAmp.value * (1 - Math.exp(-1.5 * s));
  };

  // —— 注满：每栋地点楼外面套一层略大一圈的「玻璃」，从底往上亮到它的量 ——
  const fill = (() => {
    const grp = new THREE.Group();
    const items = places.map((p, i) => {
      const b = bOf(p);
      if (!b) return null;
      const r = b.r[0], v = [];
      for (let q = 0; q < r.length; q += 2) v.push(new THREE.Vector2(m(r[q]), m(r[q + 1])));
      // 往外扩 0.9 米：按顶点到中心的方向推（地点楼都是凸的或接近凸的）
      const cx = v.reduce((s, a) => s + a.x, 0) / v.length, cy = v.reduce((s, a) => s + a.y, 0) / v.length;
      const sh = new THREE.Shape(v.map((a) => { const d = a.clone().sub(new THREE.Vector2(cx, cy)); return a.clone().add(d.setLength(0.9)); }));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      const H = b.h * EX;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color() }, uF: { value: 0 }, uH: { value: H }, uDark: U.uDark, uK: U.uK, uT: U.uT },
        vertexShader: 'varying float vY; varying vec3 vN; void main(){ vY = position.y; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform vec3 uCol; uniform float uF, uH, uDark, uK, uT; varying float vY; varying vec3 vN;
          void main() {
            float top = step(0.5, vN.y);
            // 越往上越浓，顶上（水面）一道亮边；水面轻轻晃
            float a = mix(0.35 + 0.55 * vY, 0.9, top);
            float rim = (1.0 - top) * smoothstep(0.93, 1.0, vY);
            a = (a + rim * 0.8) * uK;
            vec3 c = uCol * (1.0 + (uDark > 0.5 ? 2.2 : 0.15) * (rim + top * 0.6));
            if (uDark > 0.5) gl_FragColor = vec4(c * a, a); else gl_FragColor = vec4(c, min(0.9, a));
          }`,
        transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = TILE_TOP;
      mesh.scale.y = 0.001;
      mesh.renderOrder = 5;
      grp.add(mesh);
      return { mesh, mat, H, f: 0, i };
    });
    return { grp, items };
  })();

  const parts = { nebula, lights, surface, fill: fill.grp };
  group.add(nebula, lights, surface, stems, fill.grp);

  /** 新的目标：values Map(pid → 数)，colors Map(pid → '#hex' 或 null)。form 为 null = 收起来。 */
  function set({ form: f, values, colors = null, metric = 'count', dark = true }) {
    form = f;
    const vmax = Math.max(1e-6, ...places.map((p) => values.get(p.id) || 0));
    places.forEach((p, i) => { goal[i] = Math.sqrt((values.get(p.id) || 0) / vmax); U.uC.value[i].set((colors && colors.get(p.id)) || '#ffffff'); });
    const rp = (RAMPS[metric] || RAMPS.count)[dark ? 'dark' : 'light'];
    U.uR0.value.set(rp[0]); U.uR1.value.set(rp[1]); U.uR2.value.set(rp[2]);
    U.uMood.value = metric === 'mood' ? 1 : 0;
    U.uDark.value = dark ? 1 : 0;
    const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const o of [nebula, lights, surface]) { if (o.material.blending !== blend) { o.material.blending = blend; o.material.needsUpdate = true; } }
    for (const it of fill.items) if (it) { if (it.mat.blending !== blend) { it.mat.blending = blend; it.mat.needsUpdate = true; } it.mat.uniforms.uCol.value.copy(U.uC.value[it.i]); if (metric !== 'mood') it.mat.uniforms.uCol.value.set(rp[2]); }
    stems.material.color.set(dark ? '#DCE3F5' : '#3A4560');
  }
  /** 每帧：权重往目标靠、渐显渐隐、时间、点的像素尺度。 */
  function step(dt, { camera, height, pixelRatio, reduced }) {
    const want = form ? 1 : 0;
    k += (want - k) * (reduced ? 1 : 1 - Math.exp(-dt / 0.35));
    if (Math.abs(want - k) < 0.002) k = want;
    U.uK.value = k;
    group.visible = k > 0.002;
    if (!group.visible) return;
    const a = reduced ? 1 : 1 - Math.exp(-dt / 0.55);
    for (let i = 0; i < N; i++) U.uW.value[i] += (goal[i] - U.uW.value[i]) * a;
    if (!reduced) U.uT.value += dt;
    U.uScale.value = (height * pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const [name, o] of Object.entries(parts)) o.visible = form === name || (!form && o.visible);
    stems.visible = surface.visible;
    if (stems.visible) {
      const arr = stems.geometry.attributes.position.array;
      for (let i = 0; i < N; i++) { const y1 = surfY(i), on = U.uW.value[i] > 0.02; arr.set([P[i].x, roof[i] + 2, P[i].y, P[i].x, on ? y1 : roof[i] + 2, P[i].y], i * 6); }
      stems.geometry.attributes.position.needsUpdate = true;
      stems.material.opacity = 0.45 * k;
    }
    if (fill.grp.visible) for (const it of fill.items) {
      if (!it) continue;
      const target = U.uW.value[it.i] > 0.001 ? it.H * (0.06 + 0.94 * U.uW.value[it.i]) : 0.001;
      it.mesh.scale.y = Math.max(0.001, target);
    }
  }
  /** 地名签挂多高（世界坐标 y）。 */
  function tagY(pid) {
    const i = places.findIndex((p) => p.id === pid);
    if (i < 0) return null;
    const w = U.uW.value[i];
    if (form === 'nebula') return roof[i] + 26 + (22 + 64 * Math.sqrt(w)) * 0.95;
    if (form === 'surface') return surfY(i) + 10;
    if (form === 'fill') return roof[i] + 8;
    if (form === 'lights') return roof[i] + 10;
    return null;
  }
  return { set, step, tagY, get form() { return form; }, get k() { return k; } };
}
