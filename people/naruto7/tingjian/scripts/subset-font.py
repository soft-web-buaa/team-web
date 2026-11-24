"""朱雀仿宋子集：只留页面和数据里用到的字（src/、public/data/、public/archive/catalog.json、public/history/）。
用法：python scripts/subset-font.py <ZhuqueFangsong-Regular.ttf>
原字体从 https://github.com/TrionesType/zhuque/releases 取（SIL OFL 1.1）。页面加了新字就重跑一次。
"""
import sys, pathlib, re
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    sys.exit('用法：python scripts/subset-font.py <ZhuqueFangsong-Regular.ttf>')
chars = set()
for p in list((root / 'src').rglob('*')) + list((root / 'public' / 'data').glob('*.json')) + [root / 'public' / 'archive' / 'catalog.json', root / 'public' / 'history' / 'index.json', root / 'index.html']:
    if p.is_file() and p.suffix in {'.vue', '.js', '.json', '.html', '.css'}:
        chars.update(p.read_text(encoding='utf-8'))
# 常用的标点、数字、拉丁字母、汉字数字都留着（用户输入的字回落到系统字体）
chars.update('0123456789０１２３４５６７８９ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
             '，。、；：？！「」『』（）《》〈〉—…·・“”‘’ 　〇一二三四五六七八九十百千万年月日时分秒学期周春夏秋冬晨午昏夜')
chars = {c for c in chars if ord(c) >= 32}
out = root / 'public' / 'fonts' / 'zhuque-subset.woff2'
out.parent.mkdir(parents=True, exist_ok=True)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
font = subset.load_font(src, opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(out), opts)
han = sum(1 for c in chars if '一' <= c <= '鿿')
print(f'{out.relative_to(root)}：{len(chars)} 个字符（汉字 {han} 个），{out.stat().st_size // 1024} KB')
