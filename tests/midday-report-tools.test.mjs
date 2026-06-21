import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { THEMES, resolveTheme } from '../scripts/themes.mjs';
import { renderReport, renderReportHtml } from '../scripts/render-report.mjs';
import { validateReport, validateSourceNotesText } from '../scripts/validate-report.mjs';
import {
  countMarketNumericValues,
  middayDataName,
  outputPngName,
  reportHtmlName,
  validateMiddayData,
  validateMiddayDataAgainstSchema,
  viewpointName,
  wechatCommentaryText
} from '../scripts/lib/midday-report-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const samplePath = path.join(skillRoot, 'fixtures', 'sample-midday-data.json');
const sourceNotesPath = path.join(skillRoot, 'fixtures', 'sample-source-notes.md');

async function loadSample() {
  return JSON.parse(await readFile(samplePath, 'utf8'));
}

test('themes expose exactly three approved visual systems', () => {
  assert.equal(Object.keys(THEMES).length, 3);
  assert.equal(resolveTheme('暗金杂志封面风格').id, 'dark-editorial-magazine');
  assert.equal(resolveTheme('浅色机构午报风格').id, 'light-institutional-report');
  assert.equal(resolveTheme('深色终端杂志风格').id, 'dark-terminal-magazine');
  assert.throws(() => resolveTheme(), /Theme is required/);
  for (const theme of Object.values(THEMES)) {
    assert.equal(theme.tokens.radiusPanel, '6px');
    assert.equal(theme.tokens.radiusChip, '4px');
    assert.doesNotMatch(theme.background, /repeating-linear-gradient/i);
  }
});

test('sample midday data passes semantic and JSON Schema validation', async () => {
  const data = await loadSample();
  assert.deepEqual(validateMiddayData(data).errors, []);
  assert.deepEqual((await validateMiddayDataAgainstSchema(data)).errors, []);
});

test('schema rejects top-level legacy or unrelated fields', async () => {
  const data = await loadSample();
  data.emotion_model_v1 = { score: 88 };
  const result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /emotion_model_v1.*not allowed/);
});

test('schema enforces declared source object property minimums', async () => {
  const data = await loadSample();
  data.sources = {
    financial_analysis: data.sources.financial_analysis,
    eastmoney_market: data.sources.eastmoney_market,
    cls_limit_review: data.sources.cls_limit_review
  };

  const result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /sources.*at least 4 properties/);
});

test('temperature model requires the six fixed factors and score sum', async () => {
  const data = await loadSample();
  data.midday_temperature_v1.factors.push({
    name: '指数强度',
    score: 1,
    max: 18,
    reason: 'extra factor should fail'
  });
  let result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /at most 6 items/);

  data.midday_temperature_v1.factors.pop();
  data.midday_temperature_v1.score += 1;
  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /does not equal factor sum/);
});

test('capital-flow display rows keep net amount short and reject narrative fields', async () => {
  const data = await loadSample();
  data.capital_flow.metric_name = '行业主力资金净流入';
  data.capital_flow.net_text = '工业金属+69.63亿居首，有色+科技双线进攻';

  let result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /capital_flow\.metric_name.*at most 6/);
  assert.match(result.errors.join('\n'), /capital_flow\.net_text.*at most 16/);

  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /capital_flow\.metric_name must be <= 6/);
  assert.match(result.errors.join('\n'), /capital_flow\.net_text must be <= 16/);
  assert.match(result.errors.join('\n'), /capital_flow\.net_text must be a compact row value/);
});

test('capital-flow net amount must be verified money, not placeholders or vague descriptions', async () => {
  const data = await loadSample();
  data.capital_flow.net_text = '大幅净流入';

  let result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /capital_flow\.net_text must match/);

  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /capital_flow\.net_text must include a displayed money amount/);
});

test('capital-flow direction rows are required and cannot render placeholders', async () => {
  const data = await loadSample();
  data.capital_flow.receiving_directions = [];

  let result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /receiving_directions.*at least 1 items/);

  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /capital_flow\.receiving_directions must contain at least one displayed direction/);

  data.capital_flow.receiving_directions = [{ name: '待确认', amount_text: '暂无' }];
  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /capital_flow\.receiving_directions\[0\]\.name/);
  assert.match(result.errors.join('\n'), /capital_flow\.receiving_directions\[0\]\.amount_text/);
});

test('capital-flow data rejects legacy northbound field', async () => {
  const data = await loadSample();
  data.capital_flow.northbound_text = '净流入 56.2亿';

  const result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /capital_flow\.northbound_text must be removed/);
});

test('leading themes require limit-up counts for count-based bars', async () => {
  const data = await loadSample();
  delete data.themes.leading[0].limit_up_count;

  let result = await validateMiddayDataAgainstSchema(data);
  assert.match(result.errors.join('\n'), /limit_up_count/);

  result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /themes\.leading\[0\]\.limit_up_count/);
});

test('source coverage notes accept Chinese source-family names', async () => {
  const data = await loadSample();
  data.data_quality.status = 'review_needed';
  data.data_quality.confidence = 'medium';
  data.data_quality.source_coverage.eastmoney = false;
  data.data_quality.warnings = ['东方财富午盘页面暂不可用，已使用备用公开来源交叉核验。'];

  const result = validateMiddayData(data);
  assert.deepEqual(result.errors, []);
});

test('wechat viewpoint is opinionated, concise, and afternoon-oriented', async () => {
  const data = await loadSample();
  const text = wechatCommentaryText(data);
  assert.ok(text.length > 0);
  assert.match(text, /不是|而是|本质|更像|说明|关键|核心|实质/);
  assert.match(text, /午后|下午|若|如果|一旦|除非/);
  assert.ok(countMarketNumericValues(text) <= 3);

  data.wechat_commentary_v1.text = '上证指数上涨，成交放大，玻璃基板上涨，涨停很多，跌停很少。';
  const result = validateMiddayData(data);
  assert.match(result.errors.join('\n'), /explicit market judgment/);
});

test('renderer emits self-contained HTML with two posters and three-theme support', async () => {
  const data = await loadSample();
  let html = renderReportHtml(data);
  assert.equal((html.match(/class="[^"]*\bposter\b[^"]*"/g) || []).length, 2);
  assert.match(html, /data-page="1"/);
  assert.match(html, /data-page="2"/);
  assert.match(html, /A股午评/);

  data.theme = '深色终端杂志风格';
  html = renderReportHtml(data);
  assert.match(html, /data-theme="dark-terminal-magazine"/);

  data.theme = '浅色机构午报风格';
  html = renderReportHtml(data);
  assert.match(html, /data-theme="light-institutional-report"/);
});

test('dark editorial theme temperature rows use vertically centered copy and meter columns', async () => {
  const data = await loadSample();
  data.theme = '暗金杂志封面风格';

  const html = renderReportHtml(data);

  assert.match(html, /class="de-rank-copy"/);
  assert.match(html, /class="de-rank-meter"/);
  assert.match(html, /\.de-rank-row \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 210px/s);
  assert.match(html, /\.de-rank-meter \{[^}]*align-self: center/s);
});

test('light institutional leading themes align heat header and use limit-up count bars', async () => {
  const data = await loadSample();
  data.theme = '浅色机构午报风格';

  const html = renderReportHtml(data);

  assert.match(html, /<div class="li-table-head"><span>题材<\/span><span>涨幅<\/span><span>涨停数<\/span><span>热度<\/span><\/div>/);
  assert.match(html, /data-theme-name="6G概念"[^>]*data-limit-up-count="3"[\s\S]*?<div class="li-limit-count-cell"><i class="li-limit-count-bar"><u style="width:38%"><\/u><\/i><span class="li-limit-count-value">3只<\/span><\/div>/);
  assert.match(html, /\.li-theme-structure \{[^}]*grid-template-columns: 1\.22fr \.88fr/s);
  assert.match(html, /\.li-table-head span:nth-child\(2\) \{ text-align: center; \}/);
  assert.match(html, /\.li-heat \{[^}]*justify-content: flex-start/s);
});

test('page two main theme notes and highest-board panels are driven by current data in every theme', async () => {
  const data = await loadSample();
  data.market_view.thesis = '端侧AI与机器人共振修复';
  data.themes.leading = [
    {"rank": 1, "name": "AI PC", "pct": 6.6, "limit_up_count": 6, "reason": "端侧AI扩散", "leaders": ["春秋电子"], "口径": "题材概念口径"},
    {"rank": 2, "name": "机器人", "pct": 4.4, "limit_up_count": 4, "reason": "产业催化升温", "leaders": ["机器人A"], "口径": "题材概念口径"}
  ];
  data.ladder = {
    highest_board: 3,
    highest_stock: "中央商场",
    highest_theme: "零售",
    promotion_summary: "中央商场从2板晋级3板，零售消费短线高度打开。",
    boards: [
      {"board": 3, "stocks": [{"name": "中央商场", "theme": "零售", "role": "空间龙"}, {"name": "春秋电子", "theme": "AI PC", "role": "共振高标"}]},
      {"board": 2, "stocks": [{"name": "机器人A", "theme": "机器人", "role": "补涨"}]}
    ],
    source_key: "cls_limit_review"
  };

  for (const theme of ['暗金杂志封面风格', '浅色机构午报风格', '深色终端杂志风格']) {
    data.theme = theme;
    const html = renderReportHtml(data);
    const mainNote = html.match(/class="(?:de-hot-note|li-main-note|dt-hot-note)"[\s\S]*?<\/div>/)?.[0] ?? '';
    assert.match(mainNote, /AI PC/);
    assert.match(mainNote, /机器人/);
    assert.match(mainNote, /端侧AI与机器人共振修复/);
    assert.doesNotMatch(mainNote, /玻璃基板|6G|低位硬科技全面爆发/);

    const highestPanel = html.match(/class="(?:de-panel de-high-board|li-highest|dt-highest)"[\s\S]*?(?:<\/section>|<\/div>\s*<\/div>)/)?.[0] ?? '';
    assert.match(highestPanel, /中央商场/);
    assert.match(highestPanel, /3连板/);
    assert.match(highestPanel, /2板\s*[→＞>]\s*3板/);
    assert.doesNotMatch(highestPanel, /4板\s*[→＞>]\s*5板|天津新材|红星发展|茂业商业|大有能源/);
  }
});

test('dark terminal leading theme rows keep long names and reasons in protected two-line cells', async () => {
  const data = await loadSample();
  data.theme = '深色终端杂志风格';
  data.themes.leading[0] = {
    rank: 1,
    name: '机器人/具身智能',
    pct: 5,
    limit_up_count: 5,
    reason: '宇树过会+GTC人形机器人催化',
    leaders: ['机器人A'],
    口径: '题材概念口径'
  };

  const html = renderReportHtml(data);

  assert.match(html, /<div class="dt-theme-copy"><span class="dt-theme-name">机器人\/具身智能<\/span><small class="dt-theme-reason">\(宇树过会\+GTC人形机器人催化\)<\/small><\/div>/);
  assert.match(html, /\.dt-hot-panel \.dt-theme-row \.dt-theme-copy \{[^}]*display: grid;[^}]*min-width: 0/s);
  assert.match(html, /\.dt-hot-panel \.dt-theme-name,[\s\S]*\.dt-hot-panel \.dt-theme-reason \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis/s);
  assert.doesNotMatch(html, /\.dt-hot-panel \.dt-theme-row div \{ display: flex; align-items: baseline/);
});

test('render report writes viewpoint txt from midday data', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'a-share-midday-render-'));
  try {
    const result = await renderReport({
      dataPath: samplePath,
      outDir: tempDir,
      themeName: '浅色机构午报风格',
      htmlOnly: true
    });
    const html = await readFile(result.htmlPath, 'utf8');
    assert.match(html, /午盘全景与资金风格/);
    const renderedData = JSON.parse(await readFile(path.join(result.outDir, middayDataName('2026-06-05')), 'utf8'));
    assert.equal(renderedData.theme, '浅色机构午报风格');
    const viewpointText = await readFile(path.join(result.outDir, viewpointName('2026-06-05')), 'utf8');
    assert.equal(viewpointText.trim(), wechatCommentaryText(renderedData));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('source notes must document source families, morning-close口径, and disclaimer', async () => {
  const data = await loadSample();
  const bad = '# 数据来源\n\n仅供复盘，不构成投资建议。';
  let result = validateSourceNotesText(bad, data);
  assert.match(result.join('\n'), /morning-close口径/);
  assert.match(result.join('\n'), /financial_analysis/);

  const good = await readFile(sourceNotesPath, 'utf8');
  result = validateSourceNotesText(good, data);
  assert.deepEqual(result, []);
});

test('final report validation catches missing pngs but accepts completed metadata', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'a-share-midday-validate-'));
  try {
    const data = await loadSample();
    await writeFile(path.join(tempDir, '2026-06-05-midday-data.json'), JSON.stringify(data, null, 2), 'utf8');
    await renderReport({ dataPath: path.join(tempDir, '2026-06-05-midday-data.json'), outDir: tempDir, htmlOnly: true });
    await writeFile(path.join(tempDir, '2026-06-05-数据来源与口径.md'), await readFile(sourceNotesPath, 'utf8'), 'utf8');
    const result = await validateReport({ dir: tempDir });
    assert.match(result.errors.join('\n'), new RegExp(outputPngName('2026-06-05', 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(result.errors.join('\n'), new RegExp(outputPngName('2026-06-05', 2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(await readFile(path.join(tempDir, reportHtmlName('2026-06-05')), 'utf8'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('countMarketNumericValues ignores dates and times', () => {
  assert.equal(countMarketNumericValues('今天2026-06-05上涨'), 0);
  assert.equal(countMarketNumericValues('11:30收盘后再观察'), 0);
  assert.equal(countMarketNumericValues('2026/06/05，半日成交1.88万亿'), 1);
  assert.equal(countMarketNumericValues('2026年6月5日，两市成交1.88万亿'), 1);
  assert.equal(countMarketNumericValues('成交2万亿，半日3.5%涨幅'), 2);
  assert.equal(countMarketNumericValues('no numbers here'), 0);
});

test('market_view.core_features requires at least three items', async () => {
  const data = await loadSample();
  data.market_view.core_features = data.market_view.core_features.slice(0, 2);

  const schemaResult = await validateMiddayDataAgainstSchema(data);
  assert.match(schemaResult.errors.join('\n'), /core_features.*at least 3 items/);

  const semanticResult = validateMiddayData(data);
  assert.match(semanticResult.errors.join('\n'), /core_features must contain at least 3 items/);
});

test('light and dark terminal themes never embed hardcoded sector or signal fallbacks', async () => {
  const data = await loadSample();
  data.themes.leading[0].reason = '专属催化语';
  data.afternoon_signals = {
    确认信号: ['专属确认信号文案'],
    弱化信号: ['专属弱化信号文案'],
    风险信号: ['专属风险信号文案']
  };

  for (const theme of ['浅色机构午报风格', '深色终端杂志风格', '暗金杂志封面风格']) {
    data.theme = theme;
    const html = renderReportHtml(data);
    assert.doesNotMatch(html, /玻璃基板、6G持续走强/);
    assert.doesNotMatch(html, /主线冲高回落/);
    assert.doesNotMatch(html, /跌停家数快速增加/);
    assert.match(html, /专属确认信号文案/);
    if (theme === '深色终端杂志风格') {
      assert.match(html, /专属催化语/);
    }
  }
});

test('dark terminal index delta does not embed hardcoded numeric fallbacks', async () => {
  const data = await loadSample();
  data.indices = data.indices.map((item) => ({ ...item, delta_text: null, change_text: null }));
  data.theme = '深色终端杂志风格';
  const html = renderReportHtml(data);
  assert.doesNotMatch(html, /\+17\.47/);
  assert.doesNotMatch(html, /-37\.98/);
  assert.doesNotMatch(html, /-33\.58/);
  assert.doesNotMatch(html, /\+83\.00/);
});

test('light institutional page 2 hero subtitle and metric box come from midday data', async () => {
  const data = await loadSample();
  data.theme = '浅色机构午报风格';
  data.market_view.style_shift = '指数护盘+低位科技承接';
  data.limit_up.change_text = '昨日61只 → 今日68只';
  const html = renderReportHtml(data);
  assert.match(html, /指数护盘\+低位科技承接/);
  assert.match(html, /昨日61只 → 今日68只/);
  assert.doesNotMatch(html, /科技主线强势扩散，市场活跃度提升/);
  assert.doesNotMatch(html, /较昨日 \+23/);
  assert.doesNotMatch(html, /较昨日 -2/);
});

test('capital flow modules omit northbound and show flow-in/out rows', async () => {
  const data = await loadSample();
  for (const theme of ['浅色机构午报风格', '暗金杂志封面风格', '深色终端杂志风格']) {
    data.theme = theme;
    const html = renderReportHtml(data);
    assert.doesNotMatch(html, /北向资金/);
    assert.doesNotMatch(html, /northbound_text/);
    if (theme !== '暗金杂志封面风格') {
      assert.match(html, /流入方向/);
      assert.match(html, /流出方向/);
    }
  }
});

test('light institutional capital rows use compact fixed-width guards', async () => {
  const data = await loadSample();
  data.theme = '浅色机构午报风格';
  const html = renderReportHtml(data);

  assert.match(html, /\.li-flow p \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 98px\) minmax\(0, 1fr\)/s);
  assert.match(html, /\.li-flow span, \.li-flow b \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/s);
  assert.match(html, /\.li-flow b \{[^}]*text-align: right/s);
  assert.match(html, /\.li-flow b\.bearish \{[^}]*color: #138450/s);
});

test('dark terminal page 1 red banner keeps long subtitle within the box and uses line-clamp safety net', async () => {
  const data = await loadSample();
  data.theme = '深色终端杂志风格';
  data.market_view.headline = '缩量分化·科技抱团·四千股跌·科创独红';
  data.market_view.style_shift = '资金从电力设备/有色金属/大消费大幅流出，极致抱团半导体存储芯片/玻璃基板/CPO/煤炭等少数方向，指数护盘+题材抱团在并行。';

  const html = renderReportHtml(data);

  // Banner must use flex + min-height (not fixed height that would clip content)
  assert.match(html, /\.dt-red-banner \{[^}]*min-height: 125px/s);
  assert.match(html, /\.dt-red-banner \{[^}]*display: flex/s);
  assert.match(html, /\.dt-red-banner strong \{[^}]*font-size: 36px/s);
  assert.match(html, /\.dt-red-banner span \{[^}]*font-size: 19px;[^}]*-webkit-line-clamp: 2/s);

  // The long subtitle must be present in the rendered output
  assert.match(html, /缩量分化·科技抱团·四千股跌·科创独红/);
  assert.match(html, /指数护盘\+题材抱团在并行/);
});

test('dark terminal page 1 map grid handles 2-line descriptions and never clips with overflow hidden', async () => {
  const data = await loadSample();
  data.theme = '深色终端杂志风格';
  data.capital_flow.receiving_directions = [
    { name: '半导体', amount_text: 'MLCC+面板+PCB多线爆发' },
    { name: '煤炭', amount_text: '夏季用电+国企重组' },
    { name: '玻璃基板', amount_text: '京东方A封单36.86亿' }
  ];
  data.capital_flow.selling_directions = [
    { name: '油气', amount_text: '通源石油跌近10%' },
    { name: '大消费', amount_text: '零售/食品饮料整体走弱' }
  ];

  const html = renderReportHtml(data);

  // Grid must use min-height (not fixed height) so 2-line cells can grow
  assert.match(html, /\.dt-map-grid \{[^}]*min-height: 82px/s);
  // The b element (amount_text) must have line-clamp: 2 and word-break to prevent overflow
  assert.match(html, /\.dt-map-grid b \{[^}]*-webkit-line-clamp: 2/s);
  assert.match(html, /\.dt-map-grid b \{[^}]*word-break: break-word/s);
  // Cells must be flex-column with text-align: center for proper centering
  assert.match(html, /\.dt-map-grid div \{[^}]*display: flex;[^}]*flex-direction: column/s);

  // Verify all 5 cells (3 hot + 2 cold) are rendered
  const cells = html.match(/<div class="(?:hot|cold)">/g) || [];
  assert.equal(cells.length, 5);
  // Verify the longest 2-line descriptions are present
  assert.match(html, /MLCC\+面板\+PCB多线爆发/);
  assert.match(html, /零售\/食品饮料整体走弱/);
});
