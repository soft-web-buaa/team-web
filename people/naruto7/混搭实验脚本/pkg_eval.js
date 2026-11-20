// 依赖名核验原型:npm / PyPI 是否存在、npm 周下载量、PyPI 最早上传时间。
// 名单里的“编造风格”名字是我按常见模式自己拼的,不是实测的 LLM 输出。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NPM = {
  real: ['react', 'lodash', 'express', 'axios', 'vue', 'element-plus', 'vite', 'pinia', 'dayjs', 'echarts'],
  invented: ['vue-element-chart-helper', 'express-session-lite-auth', 'easy-mongo-wrapper', 'react-use-localstorage-sync',
    'cloudbase-realtime-easy', 'element-plus-form-builder-pro', 'vite-plugin-auto-cloudfunction', 'dayjs-chinese-lunar-helper',
    'echarts-heatmap-campus', 'pinia-persist-cloudbase'],
};
const PYPI = {
  real: ['requests', 'numpy', 'flask', 'pandas', 'scipy', 'networkx', 'sympy', 'beautifulsoup4'],
  invented: ['flask-easy-jwt-helper', 'numpy-fast-statistics', 'requests-auto-retry-session', 'pandas-campus-loader',
    'scipy-quick-optimize', 'networkx-graph-helper-pro', 'sympy-easy-solver', 'bs4-simple-scraper-lite'],
};

async function npmInfo(name) {
  const r = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name) + '/latest');
  if (r.status === 404) return { exists: false };
  if (!r.ok) return { exists: null, status: r.status };
  const d = await r.json();
  let weekly = null;
  try {
    const dl = await fetch('https://api.npmjs.org/downloads/point/last-week/' + encodeURIComponent(name));
    if (dl.ok) weekly = (await dl.json()).downloads;
  } catch (e) { /* 忽略 */ }
  return { exists: true, version: d.version, weekly };
}

async function pypiInfo(name) {
  const r = await fetch('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json');
  if (r.status === 404) return { exists: false };
  if (!r.ok) return { exists: null, status: r.status };
  const d = await r.json();
  let first = null;
  for (const files of Object.values(d.releases || {})) {
    for (const f of files) if (!first || f.upload_time < first) first = f.upload_time;
  }
  return { exists: true, version: d.info.version, first: first && first.slice(0, 10) };
}

(async () => {
  const rows = [];
  for (const [eco, set, fn] of [['npm', NPM, npmInfo], ['PyPI', PYPI, pypiInfo]]) {
    for (const kind of ['real', 'invented']) {
      for (const name of set[kind]) {
        let info; try { info = await fn(name); } catch (e) { info = { exists: null, err: String(e).slice(0, 40) }; }
        rows.push({ eco, kind, name, ...info });
        const extra = info.exists ? (eco === 'npm' ? 'v' + info.version + ' 周下载 ' + info.weekly : 'v' + info.version + ' 首次上传 ' + info.first) : '';
        console.log(eco.padEnd(5), kind.padEnd(9), name.padEnd(36), info.exists === true ? '存在 ' + extra : info.exists === false ? '不存在' : '未知 ' + (info.status || info.err));
        await sleep(200);
      }
    }
  }
  for (const eco of ['npm', 'PyPI']) {
    const inv = rows.filter((r) => r.eco === eco && r.kind === 'invented');
    const gone = inv.filter((r) => r.exists === false).length;
    const exist = inv.filter((r) => r.exists === true);
    console.log('\n' + eco + ' 编造风格名字 ' + inv.length + ' 个: 不存在 ' + gone + ', 存在 ' + exist.length +
      (exist.length ? ' (' + exist.map((r) => r.name + (r.weekly != null ? ' 周下载 ' + r.weekly : ' 首传 ' + r.first)).join('; ') + ')' : ''));
    const re = rows.filter((r) => r.eco === eco && r.kind === 'real');
    console.log(eco + ' 真实常用包 ' + re.length + ' 个: 全部存在 ' + (re.every((r) => r.exists === true)));
  }
})();
