// CloudBase 云函数的入口（CommonJS）。真正的处理在 handler.mjs（ES 模块，和本机的 server/api.mjs 同一份代码）。
// 运行时：Node.js 18 或更新。HTTP 访问服务把 /api 路由到这个函数（scripts/deploy-cloudbase.mjs 里的 service create）。
let h = null;
exports.main = async (event, context) => {
  if (!h) h = await import('./handler.mjs');
  return h.main(event, context);
};
