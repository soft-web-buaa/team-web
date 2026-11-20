const { lookup, judge } = require('./cite_match');
const MAIL = 'cite-proto@example.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REAL = [
  'Granovetter, M. S. (1973). The strength of weak ties. American Journal of Sociology, 78(6), 1360-1380.',
  'Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.',
  'Prelec, D., Seung, H. S., & McCoy, J. (2017). A solution to the single-question crowd wisdom problem. Nature, 541, 532-535.',
  'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521, 436-444.',
  "Watts, D. J., & Strogatz, S. H. (1998). Collective dynamics of 'small-world' networks. Nature, 393, 440-442.",
  'Arthur, W. B. (1994). Inductive reasoning and bounded rationality. American Economic Review, 84(2), 406-411.',
  'Challet, D., & Zhang, Y.-C. (1997). Emergence of cooperation and organization in an evolutionary game. Physica A, 246, 407-418.',
  'Shapley, L., & Scarf, H. (1974). On cores and indivisibility. Journal of Mathematical Economics, 1(1), 23-37.',
  'Roth, A. E., Sonmez, T., & Unver, M. U. (2004). Kidney exchange. Quarterly Journal of Economics, 119(2), 457-488.',
  'Tero, A., et al. (2010). Rules for biologically inspired adaptive network design. Science, 327, 439-442.',
  'Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation. Journal of the American Statistical Association, 102, 359-378.',
  'Warner, S. L. (1965). Randomized response: A survey technique for eliminating evasive answer bias. Journal of the American Statistical Association, 60, 63-69.',
  'He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. CVPR, 770-778.',
  'Dawid, A. P., & Skene, A. M. (1979). Maximum likelihood estimation of observer error-rates using the EM algorithm. Journal of the Royal Statistical Society: Series C, 28(1), 20-28.',
];
const BOOKS = [
  'Surowiecki, J. (2004). The Wisdom of Crowds. Doubleday.',
  '周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.',
  'Schelling, T. C. (1960). The Strategy of Conflict. Harvard University Press.',
];
const FAKE = [
  'Hartmann, L., & Okonkwo, B. (2019). Herd dynamics in algorithmic queue recommendation. Journal of Behavioral Operations, 14(3), 211-229.',
  'Zhang, W., & Liu, H. (2021). Surprisingly popular aggregation under correlated priors. Management Science, 67(8), 4881-4899.',
  'Rivera, M. (2018). Calibration drift in student probabilistic forecasts. Journal of Educational Psychology, 110(5), 701-716.',
  'Nakamura, T., Ibarra, C., & Weiss, D. (2020). Capped-cycle exchange for campus course seats. Games and Economic Behavior, 122, 312-330.',
  'Kowalski, J., & Brandt, F. (2017). A theory of unreliable crowds. Nature Human Behaviour, 1, 0221.',
  'Muller, S. (2016). Slime mold heuristics for pedestrian path design. Transportation Research Part B, 91, 55-72.',
  'Li, Y., & Chen, X. (2022). Large language models as El Farol bar players: a minority game study. Artificial Intelligence, 310, 103745.',
  'Anderson, P. K. (2015). Queueing with stale information in cafeterias. Operations Research Letters, 43(4), 401-406.',
  'Okafor, N. (2020). Peer prediction without common priors in classroom polling. Journal of Economic Education, 51(3), 233-248.',
  'Bianchi, G., & Park, J. (2022). Do language models know what they do not know? Interval calibration of LLM forecasts. Journal of Forecasting, 41(6), 1120-1138.',
];
// 拼接型:真标题加错作者或错年份
const MUT = [
  ['年份', 'Granovetter, M. S. (1974). The strength of weak ties. American Journal of Sociology, 80(2), 15-30.'],
  ['年份', 'Roth, A. E., Sonmez, T., & Unver, M. U. (2008). Kidney exchange. Quarterly Journal of Economics, 119(2), 457-488.'],
  ['年份', 'Warner, S. L. (1967). Randomized response: A survey technique for eliminating evasive answer bias. Journal of the American Statistical Association, 60, 63-69.'],
  ['第二作者', 'Kahneman, D., & Thaler, R. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.'],
  ['第二作者', 'Watts, D. J., & Newman, M. E. J. (1998). Collective dynamics of small-world networks. Nature, 393, 440-442.'],
  ['整组作者', 'Smith, J., & Lee, K. (2017). A solution to the single-question crowd wisdom problem. Nature, 541, 532-535.'],
  ['期刊(软)', 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Science, 521, 436-444.'],
  ['标题改写', 'Granovetter, M. S. (1973). The power of weak ties in social networks. American Journal of Sociology, 78(6), 1360-1380.'],
];

(async () => {
  const rows = [];
  const run = async (label, c) => {
    const r = judge(c, await lookup(c, MAIL));
    rows.push({ label, ...r });
    console.log(label.padEnd(9), (r.verdict + (r.soft ? '+软' : '')).padEnd(10), (r.issues || []).join(';').padEnd(28), c.slice(0, 58));
    await sleep(350);
  };
  for (const c of REAL) await run('真文献', c);
  for (const c of BOOKS) await run('书/中文', c);
  for (const c of FAKE) await run('编造', c);
  for (const [k, c] of MUT) await run('拼接-' + k, c);
  const n = (pre, v) => rows.filter((r) => r.label.startsWith(pre) && r.verdict === v).length;
  const t = (pre) => rows.filter((r) => r.label.startsWith(pre)).length;
  console.log('\n真文献 ', t('真文献'), '条: OK', n('真文献', 'OK'), 'DIFF', n('真文献', 'DIFF'), 'NOT_FOUND', n('真文献', 'NOT_FOUND'));
  console.log('书/中文', t('书/中文'), '条: OK', n('书/中文', 'OK'), 'DIFF', n('书/中文', 'DIFF'), 'NOT_FOUND', n('书/中文', 'NOT_FOUND'));
  console.log('编造   ', t('编造'), '条: 被拦(NOT_FOUND或DIFF)', n('编造', 'NOT_FOUND') + n('编造', 'DIFF'), '放过(OK)', n('编造', 'OK'));
  console.log('拼接   ', t('拼接'), '条: 被拦', n('拼接', 'DIFF') + n('拼接', 'NOT_FOUND'), '放过(OK)', n('拼接', 'OK'),
    '其中软提示', rows.filter((r) => r.label.startsWith('拼接') && r.soft).length);
})();
