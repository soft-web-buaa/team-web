// 核对刻声副本与源仓库是否逐字节一致。
// 用法：node scripts/verify-kesheng-import.mjs <刻声仓库的本地克隆目录> [--rev <本仓库的提交>]
//   不给 --rev 时，取"第一次把 public/kesheng/src 加进本仓库"的提交，也就是原样导入的那一次。
//   按 git 对象（blob）哈希逐文件比较，不看工作区文件：Windows 上 core.autocrlf 会改换行，
//   直接比工作区会把换行差异误报成内容差异（导入时踩过这个坑）。
// 退出码：0 一致；1 不一致；2 用法或环境错误。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OURS = 'people/naruto7/mvp/public/kesheng/src';
const SRC = 'app/kesheng/src';
const DIRS = ['web', 'dsp', 'worklets'];

const argv = process.argv.slice(2);
const revAt = argv.indexOf('--rev');
const revArg = revAt >= 0 ? argv[revAt + 1] : '';
const skip = revAt >= 0 ? revAt + 1 : -1; // --rev 后面跟着的那个值不是克隆目录
const clone = argv.find((a, i) => !a.startsWith('--') && i !== skip);
if (!clone) {
  console.error('用法：node scripts/verify-kesheng-import.mjs <刻声仓库的本地克隆目录> [--rev <提交>]');
  process.exit(2);
}

function git(repo, args) {
  const r = spawnSync('git', ['-C', repo, '-c', 'core.quotepath=off', ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error(`git ${args.join(' ')} 失败：${r.stderr.toString().trim()}`);
    process.exit(2);
  }
  return r.stdout;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = git(here, ['rev-parse', '--show-toplevel']).toString().trim();
const rev =
  revArg || git(root, ['log', '--diff-filter=A', '--reverse', '--format=%H', '--', OURS]).toString().split('\n')[0].trim();
if (!rev) {
  console.error('找不到导入提交，可以用 --rev 指定。');
  process.exit(2);
}

function treeOf(repo, at, paths, strip) {
  const out = git(repo, ['ls-tree', '-r', '-z', at, '--', ...paths]).toString('utf8');
  const map = new Map();
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [mode, , hash] = rec.slice(0, tab).split(' ');
    map.set(rec.slice(tab + 1).slice(strip.length + 1), { mode, hash });
  }
  return map;
}

const ours = treeOf(root, rev, [OURS], OURS);
const src = treeOf(clone, 'HEAD', DIRS.map((d) => `${SRC}/${d}`), SRC);
const srcRev = git(clone, ['rev-parse', 'HEAD']).toString().trim();

const onlyOurs = [...ours.keys()].filter((k) => !src.has(k));
const onlySrc = [...src.keys()].filter((k) => !ours.has(k));
const differ = [...src]
  .filter(([k, v]) => ours.has(k) && (ours.get(k).hash !== v.hash || ours.get(k).mode !== v.mode))
  .map(([k]) => k);
const same = src.size - onlySrc.length - differ.length;

console.log(`本仓库提交 ${rev.slice(0, 8)}：${ours.size} 个文件`);
console.log(`刻声提交 ${srcRev.slice(0, 8)}：${src.size} 个文件`);
console.log(`逐文件哈希一致 ${same}，不一致 ${differ.length}，只在副本里 ${onlyOurs.length}，只在源里 ${onlySrc.length}`);
for (const k of differ.slice(0, 10)) console.log(`  不一致：${k}`);
for (const k of onlyOurs.slice(0, 10)) console.log(`  只在副本：${k}`);
for (const k of onlySrc.slice(0, 10)) console.log(`  只在源：${k}`);

if (differ.length || onlyOurs.length || onlySrc.length) process.exit(1);
console.log('结论：副本与刻声源码逐字节一致。');
