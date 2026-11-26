// 校园材质贴图：三张灰度图集，全来自 Poly Haven 的 CC0 素材（出处见 docs/design/素材来源.md）。
// 只用它们的明暗（和一点粗糙度）：色相还是顶点色 / 材质色的，四季换色时贴图不用重做。
// 按需加载：进站不等它，下载完把 uniform 一换就生效；没到、或失败，就退回原来的纯色。
import * as THREE from 'three';

// 共享的 uniform 对象：所有材质引用同一份，加载完一次全部生效
export const TEX = {
  wall: { value: null }, wallOn: { value: 0 },
  ground: { value: null }, groundOn: { value: 0 },
  roof: { value: null }, roofOn: { value: 0 },
};

let began = false;
/** 开始异步加载；base 是页面基路径（vite 的 BASE_URL）。重复调用只算一次。 */
export function loadCampusTex(base, maxAniso = 4) {
  if (began) return;
  began = true;
  const loader = new THREE.TextureLoader();
  const grab = (file, slot) => loader.loadAsync(`${base}tex/${file}`).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    slot.value.value = t;
    slot.on.value = 1;
  }).catch(() => {});                       // 加载失败就算了，保持纯色，不留报错
  grab('wall.webp', { value: TEX.wall, on: TEX.wallOn });
  grab('ground.webp', { value: TEX.ground, on: TEX.groundOn });
  grab('roof.webp', { value: TEX.roof, on: TEX.roofOn });
}
