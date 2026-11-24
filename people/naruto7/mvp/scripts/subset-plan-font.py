"""舞台页仿宋子集：把页面上出现的字补进 ks-fangsong-plan.woff2，只增不减（别处还在用的字不会掉）。
字体：朱雀仿宋 v0.212，SIL OFL 1.1，https://github.com/TrionesType/zhuque/releases 。
和刻声原仓库的 tools/subset-plan-font.py 同一个规则，区别只有两处：字体路径可以在命令行给，页面文字的来源多了
community.js、echo-seed.json、sleeves.json 和 Vue 外壳里的文案。改了页面文案就重跑一次。

用法：
  python scripts/subset-plan-font.py <ZhuqueFangsong-Regular.ttf>          # 补字并写回
  python scripts/subset-plan-font.py <ZhuqueFangsong-Regular.ttf> --dry    # 只列出缺哪些字，不写文件
依赖：pip install fonttools brotli
"""
import glob, json, pathlib, re, sys
from fontTools import subset as FTS
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / 'public/kesheng/src/web'
OUT = WEB / 'fonts/ks-fangsong-plan.woff2'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args:
    sys.exit('用法：python scripts/subset-plan-font.py <ZhuqueFangsong-Regular.ttf> [--dry]')
SRC = args[0]
DRY = '--dry' in sys.argv


def shown(path):
    t = pathlib.Path(path).read_text(encoding='utf-8')
    if path.endswith(('.js', '.vue')):
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        t = re.sub(r'(?m)(^|[\s;,{}()])//(?!/).*$', r'\1', t)
    if path.endswith(('.html', '.vue')):
        t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    if path.endswith('.css'):
        t = ''.join(re.findall(r'content:\s*"([^"]*)"', re.sub(r'/\*.*?\*/', '', t, flags=re.S)))
    return t


files = glob.glob(str(WEB / 'plan3d/*.*')) + [str(WEB / n) for n in (
    'rings.js', 'semester.js', 'identity.js', 'submit.js', 'receipt.js', 'library.js', 'find.js', 'community.js', 'tier.js', 'place-guess.js')]
files = [f for f in files if f.endswith(('.html', '.js', '.json', '.css')) and 'demo-catalog' not in f]
text = ''.join(shown(f) for f in files)
# 史料与馆藏目录里会显示出来的字段
cat = json.loads((WEB / 'archive/catalog.json').read_text(encoding='utf-8'))
text += ''.join(str(e.get(k) or '') for e in cat['entries'] for k in ('note', 'copy', 'title', 'place'))
hist = json.loads((WEB / 'history/index.json').read_text(encoding='utf-8'))
text += ''.join(f['text'] for pl in hist.get('places', {}).values() for f in pl.get('facts', []))
text += ''.join(str(i.get(k) or '') for i in hist['items'] for k in ('title', 'what', 'event', 'cut'))
text += ''.join(str(i['source'].get(k) or '') for i in hist['items'] for k in ('site', 'uploader', 'kind'))
# 概念盘里显示出来的字段（只取字，不取整个文件）
demo = json.loads((WEB / 'plan3d/demo-catalog.json').read_text(encoding='utf-8'))
text += ''.join(str(e.get(k) or '') for e in (demo.get('entries') or demo) for k in ('note', 'place'))
# 校园地点与分区名
campus = json.loads((WEB / 'plan3d/campus-xy.json').read_text(encoding='utf-8'))
text += ''.join(z['name'] for z in campus['zones']) + ''.join(p['name'] for p in campus['places'])

want = {c for c in text if ord(c) > 0x2000} | {chr(c) for c in range(0x20, 0x7F)} | set('0123456789年月日周秒张级')
have = set()
if OUT.exists():
    have = {chr(u) for u in TTFont(str(OUT)).getBestCmap()}
src_font = TTFont(SRC)
in_src = set(chr(u) for u in src_font.getBestCmap())
missing = sorted(c for c in want - have)
no_glyph = [c for c in missing if c not in in_src]
print(f'现有子集 {len(have)} 个字符；页面用到 {len(want)} 个；需要新增 {len(missing)} 个。')
if missing:
    print('新增：' + ''.join(missing))
if no_glyph:
    print('字体里本来就没有的字（会用后备字体）：' + ''.join(no_glyph))
if DRY or not missing:
    sys.exit(0)

keep = (want | have) & in_src
o = FTS.Options()
o.flavor = 'woff2'
o.layout_features = ['*']
o.name_IDs = ['*']
font = TTFont(SRC)
ss = FTS.Subsetter(o)
ss.populate(text=''.join(sorted(keep)))
ss.subset(font)
for rec in font['name'].names:
    if rec.nameID in (1, 4, 16):
        rec.string = 'KeSheng Fangsong Plan'  # 改名：OFL 的衍生字体不用原名
font.flavor = 'woff2'
font.save(str(OUT))
print(f'已写入 {OUT.relative_to(ROOT)}：{OUT.stat().st_size // 1024} KB，{len(keep)} 个字符')
