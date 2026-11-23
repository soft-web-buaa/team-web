// 刻声 · 导出文件名的去重（纯函数，单测覆盖）
// 为什么需要：档案号 no 只在「同一台设备」里唯一；导入别人的包、或者旧记录不带 no，
// 都可能撞名。zip 是按文件名放进 Map 的，撞名就会互相覆盖（2026-10-19 云端实测：3 张导出只剩 1 对）。
// 口径：保留可读的档案号；重复的从第二份起加 -2、-3；没有 no 的用 id 前 8 位。
export function uniqueStems(list, { fallback = 'disc' } = {}) {
  const seen = new Map();
  return list.map((d, i) => {
    let base = (d && d.no && String(d.no).trim()) || (d && d.id ? `${fallback}-${String(d.id).slice(0, 8)}` : `${fallback}-${i + 1}`);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}
