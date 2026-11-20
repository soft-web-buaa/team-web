// 引用核验匹配器 v2(Crossref)。浏览器与 Node 通用,不依赖其他库。
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'with', 'from', 'by', 'at', 'as', 'is', 'are']);
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t)));
const overlap = (small, big) => (small.size ? [...small].filter((t) => big.has(t)).length / small.size : 0);

function parseCitation(c) {
  const ym = c.match(/\((\d{4})[a-z]?\)/) || c.match(/\b((?:19|20)\d{2})\b/);
  const year = ym ? Number(ym[1]) : null;
  const head = ym ? c.slice(0, c.indexOf(ym[0])) : c.slice(0, 90);
  const etAl = /et al/i.test(head);
  const surnames = [...head.matchAll(/([A-Z][A-Za-z'’\-]+),\s*(?:[A-Z]\.|&|$)/g)].map((m) => norm(m[1]));
  return { year, etAl, surnames: [...new Set(surnames)] };
}

async function lookup(cite, mailto) {
  const url = 'https://api.crossref.org/works?rows=5&select=title,author,issued,container-title,short-container-title,DOI&mailto=' +
    encodeURIComponent(mailto) + '&query.bibliographic=' + encodeURIComponent(cite);
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'cite-proto/0.2 (mailto:' + mailto + ')' } });
      if (r.ok) return (await r.json()).message.items || [];
    } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}

function judge(cite, items) {
  if (items === null) return { verdict: 'ERROR' };
  const p = parseCitation(cite), ct = toks(cite);
  let best = null;
  for (const it of items) {
    const title = (it.title || [''])[0];
    const tt = toks(title);
    if (!tt.size) continue;
    const cov = overlap(tt, ct);
    const year = it.issued && it.issued['date-parts'] && it.issued['date-parts'][0][0];
    const fams = (it.author || []).map((a) => norm(a.family || a.name || ''));
    const cand = { cov, year, fams, title, doi: it.DOI,
      venue: [...(it['container-title'] || []), ...(it['short-container-title'] || [])].join(' ') };
    const key = cov + (year === p.year ? 0.01 : 0);
    if (!best || key > best.key) best = { ...cand, key };
  }
  if (!best || best.cov < 0.8) return { verdict: 'NOT_FOUND', cov: best ? best.cov : 0 };
  const issues = [];
  if (p.year && best.year && p.year !== best.year) issues.push('年份 ' + p.year + ' 对 ' + best.year);
  const check = p.etAl ? p.surnames.slice(0, 1) : p.surnames;
  const missing = check.filter((s) => !best.fams.some((f) => f === s || f.split(' ').includes(s)));
  if (missing.length) issues.push('作者 ' + missing.join('/') + ' 不在记录里');
  const hard = issues.length > 0;
  const vt = toks(best.venue);
  const soft = vt.size && overlap(vt, ct) < 0.3 ? '期刊名对不上(可能是缩写)' : '';
  return { verdict: hard ? 'DIFF' : 'OK', soft, issues, cov: best.cov, doi: best.doi, title: best.title };
}

module.exports = { lookup, judge, parseCitation };
