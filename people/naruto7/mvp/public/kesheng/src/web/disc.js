// 刻声 · 盘面渲染（WebGL2，一个全屏四边形 + 一个片元着色器）。
// 几何与 docs/DESIGN-FREEZE-v0.md「盘面几何」一致：盘面角度 = 播放位置，刻刀/唱针在 12 点。
import { TURN, TEX_W, BANDS, R0, R1, PITCH, MAX_SEC } from './groove.js';

const VS = `#version 300 es
in vec2 aPos;
out vec2 vPos;
void main() { vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vPos;
out vec4 o;
uniform sampler2D uG;
uniform float uAngle, uPlay, uCut, uDur, uTrail, uPx, uHas;
uniform vec2 uLight;
const float TAU = 6.28318530718;
const float TURN_S = ${TURN.toFixed(4)};
const float R0 = ${R0.toFixed(4)};
const float R1 = ${R1.toFixed(4)};
const float P = ${PITCH.toFixed(6)};
const float TEX_SEC = ${MAX_SEC.toFixed(1)};
const vec3 ALU = vec3(0.827, 0.843, 0.855);
const vec3 INK = vec3(0.141, 0.188, 0.290);
const vec3 PAPER = vec3(0.949, 0.957, 0.953);
const vec3 SCOPE = vec3(0.902, 0.745, 0.227);
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  vec2 p = vPos;
  float rho = length(p);
  float alpha = 1.0 - smoothstep(1.0 - uPx, 1.0, rho);
  if (alpha <= 0.0) { o = vec4(0.0); return; }
  vec2 rdir = p / max(rho, 1e-4);

  // 车削留下的同心细纹：一纹约两个像素
  float ring = hash(floor(rho / (uPx * 2.0)));
  vec3 col = ALU * (0.962 + 0.038 * ring);

  // 掠射光：同心纹把光反射成沿光源方向穿过盘心的一条亮带
  float a = abs(dot(rdir, uLight));
  float spec = pow(a, 22.0) * 0.6 + pow(a, 4.0) * 0.07;

  if (uHas > 0.5) {
    float psi = atan(p.x, p.y);           // 从 12 点起顺时针
    float g = fract((uAngle - psi) / TAU);
    float u = (R0 - rho) / P - g;
    float k = floor(u);
    float f = u - k;                      // 0 = 这一圈的外沿（低频），越往里频率越高
    float tau = (g + k) * TURN_S;
    if (k >= 0.0 && tau <= uCut && rho >= R1 - P) {
      float aa = uPx / P;
      float cut = 1.0 - smoothstep(0.88 - aa, 0.88 + aa, f);   // 两圈之间留一道未刻的“岸”
      float e = texture(uG, vec2(tau / TEX_SEC, clamp(f / 0.88, 0.0, 1.0))).r;
      float depth = smoothstep(0.03, 0.85, e) * cut;
      col = mix(col, INK, depth * 0.93);
      spec *= mix(1.0, 0.4 + 0.9 * ring, cut * 0.6) * (1.0 - depth * 0.75);
      float d = mod(uPlay - tau, uDur);
      float trail = (d < 0.25 ? 1.0 - d / 0.25 : 0.0) * uTrail;
      col = mix(col, SCOPE, trail * cut * (0.3 + 0.7 * smoothstep(0.02, 0.6, e)));
    }
  }
  col += PAPER * spec * 0.42;
  col = mix(col, ALU * 0.8, smoothstep(0.972, 0.996, rho));   // 外沿倒角
  o = vec4(col * alpha, alpha);
}`;

export class DiscRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uG', 'uAngle', 'uPlay', 'uCut', 'uDur', 'uTrail', 'uPx', 'uHas', 'uLight']) this.u[n] = gl.getUniformLocation(prog, n);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TEX_W, BANDS, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(TEX_W * BANDS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uG, 0);
    this.has = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = w; }
    if (this.gl) this.gl.viewport(0, 0, w, w);
  }

  /** 整张刻纹（导入或切换盘时）。tex=null 表示空白盘。 */
  setGroove(tex) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, BANDS, gl.RED, gl.UNSIGNED_BYTE, tex || new Uint8Array(TEX_W * BANDS));
    this.has = tex ? 1 : 0;
  }

  /** 录音时刻刀刻下一列。 */
  cutColumn(i, col) {
    if (!this.ok || i >= TEX_W) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, i, 0, 1, BANDS, gl.RED, gl.UNSIGNED_BYTE, col);
    this.has = 1;
  }

  /** s = {play 秒, cut 秒, dur 秒, trail 0–1, light [x,y]（y 向上）} */
  draw(s) {
    if (!this.ok) return;
    const gl = this.gl, u = this.u;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uAngle, ((2 * Math.PI * s.play) / TURN) % (2 * Math.PI));
    gl.uniform1f(u.uPlay, s.play);
    gl.uniform1f(u.uCut, s.cut);
    gl.uniform1f(u.uDur, Math.max(TURN, s.dur));
    gl.uniform1f(u.uTrail, s.trail);
    gl.uniform1f(u.uPx, 2 / this.canvas.width);
    gl.uniform1f(u.uHas, this.has);
    gl.uniform2f(u.uLight, s.light[0], s.light[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** 导轨上刻刀/唱针的 y（SVG 坐标，向下为正，盘半径 = 1）。 */
export function carriageY(sec) {
  return -(R0 - (PITCH * sec) / TURN);
}
