// 刻声 · 取中位数（纯函数）
// 为什么单独抽出来：T-05 的「三拍取中位数」在 e2e 里用的是同一段拍手的循环，
// 三次读数几乎相同（1.133/1.133/1.133），取中位数和取第一次结果一样，**测不出选择逻辑对不对**。
// 所以把选择逻辑做成纯函数，用 [1.0, 1.4, 1.1] 这种天然不同的数据单测（期望 1.1）。
export function pickMedian(items, key = (x) => x) {
  if (!items || !items.length) return null;
  const sorted = [...items].sort((a, b) => {
    const x = key(a), y = key(b);
    return (x == null ? -Infinity : x) - (y == null ? -Infinity : y);
  });
  return sorted[Math.floor(sorted.length / 2)];
}
