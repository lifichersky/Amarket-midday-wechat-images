#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveTheme } from './themes.mjs';
import {
  escapeHtml,
  marketClass,
  outputPngName,
  pctText,
  printValidationResult,
  readJsonFile,
  readPngDimensions,
  reportHtmlName,
  middayDataName,
  sourceNotesName,
  validateMiddayData,
  validateMiddayDataAgainstSchema,
  viewpointName,
  wechatCommentaryText
} from './lib/midday-report-utils.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { htmlOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--data') args.data = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--theme') args.theme = argv[++i];
    else if (arg === '--html-only') args.htmlOnly = true;
    else if (!arg.startsWith('--') && !args.data) args.data = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.data) throw new Error('Usage: node render-report.mjs --data <midday-data.json> [--out <dir>] [--theme <name>] [--html-only]');
  return args;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatChineseDate(dateText, { joiner = '' } = {}) {
  const match = String(dateText ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return String(dateText ?? '');
  return `${match[1]}${joiner}年${joiner}${Number(match[2])}${joiner}月${joiner}${Number(match[3])}${joiner}日`;
}

function lightChineseDate(dateText) {
  return formatChineseDate(dateText, { joiner: ' ' });
}

function darkChineseDate(dateText) {
  return formatChineseDate(dateText, { joiner: '' });
}

function lightSparkCanvas(seed, pct) {
  return `<canvas class="li-spark" width="190" height="48" data-seed="${escapeHtml(seed)}" data-pct="${escapeHtml(pct)}" data-bearish="${Number(pct) < 0 ? '1' : '0'}"></canvas>`;
}

function lightIndexDelta(item) {
  return item.delta_text ?? item.change_text ?? '';
}

function lightBreadthNotableText(data, up) {
  const notable = String(data.breadth?.notable ?? '').trim();
  if (notable) return notable;
  if (Number.isFinite(up) && up > 0) {
    const bucket = up >= 1000 ? `${Math.floor(up / 1000) * 1000}+股上涨` : `${up}股上涨`;
    return bucket;
  }
  return '';
}

function lightIndexCards(indices) {
  return (indices ?? []).slice(0, 4).map((item, index) => `
    <div class="li-index-card">
      <span>${escapeHtml(item.name)}</span>
      <strong class="${marketClass(item.pct)}">${escapeHtml(Number(item.close ?? 0).toFixed(2))}</strong>
      <em class="${marketClass(item.pct)}">${escapeHtml(lightIndexDelta(item))}　${escapeHtml(pctText(item.pct))}</em>
      ${lightSparkCanvas(`li-${index}:${item.pct}`, item.pct)}
    </div>
  `).join('');
}

function lightMiniFlame() {
  return `<svg viewBox="0 0 12 18" aria-hidden="true"><path d="M7.1.9c.2 3.3 3.8 5.1 3.8 10 0 4.1-2.5 6.6-6.3 6.6-3 0-5.1-2.3-5.1-5.7 0-2.6 1.3-4.5 3.1-6.4-.1 2 .7 3.4 2.1 3.8C5.1 5.5 5.9 2.7 7.1.9Z" fill="#df302b"/><path d="M6 15.8c-1.9 0-3.1-1.1-3.1-2.9 0-1.3.7-2.3 1.8-3.4.2 1.3.7 2.1 1.6 2.3.5-1.6 1.2-2.8 2.3-3.9.4 2 1.8 3 1.8 5 0 1.8-1.6 2.9-4.4 2.9Z" fill="#ff7662"/></svg>`;
}

function lightLaurel() {
  return `
    <svg viewBox="0 0 72 96" aria-hidden="true">
      <path d="M58 86C36 68 27 42 43 10" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" opacity=".52"/>
      <g fill="currentColor">
        <ellipse cx="47" cy="75" rx="5.2" ry="15.2" transform="rotate(-48 47 75)" opacity=".62"/>
        <ellipse cx="36" cy="64" rx="5" ry="14.2" transform="rotate(-37 36 64)" opacity=".62"/>
        <ellipse cx="31" cy="51" rx="4.8" ry="13" transform="rotate(-20 31 51)" opacity=".62"/>
        <ellipse cx="32" cy="38" rx="4.5" ry="12" transform="rotate(-2 32 38)" opacity=".60"/>
        <ellipse cx="38" cy="25" rx="4.1" ry="10.8" transform="rotate(18 38 25)" opacity=".60"/>
        <ellipse cx="58" cy="68" rx="4.6" ry="12.5" transform="rotate(35 58 68)" opacity=".45"/>
        <ellipse cx="54" cy="54" rx="4.3" ry="11.7" transform="rotate(23 54 54)" opacity=".43"/>
        <ellipse cx="53" cy="41" rx="4" ry="10.8" transform="rotate(7 53 41)" opacity=".42"/>
        <ellipse cx="56" cy="28" rx="3.6" ry="9.5" transform="rotate(-12 56 28)" opacity=".36"/>
      </g>
    </svg>
  `;
}

function lightThemeRows(items, options = {}) {
  const rows = (items ?? []).slice(0, options.limit ?? 7);
  const useLimitUpCount = options.barMetric === 'limit_up_count';
  const barValue = (item) => {
    const value = useLimitUpCount ? item.limit_up_count : (item.pct ?? item.count ?? 0);
    return Math.abs(Number(value ?? 0));
  };
  const values = rows.map(barValue).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  return rows.map((item, index) => {
    const rawLimitUpCount = Number(item.limit_up_count ?? 0);
    const limitUpCount = Number.isInteger(rawLimitUpCount) && rawLimitUpCount >= 0 ? rawLimitUpCount : 0;
    const width = clamp(Math.round((barValue(item) / max) * 100), 10, 100);
    const cls = options.negative ? 'bearish' : 'bullish';
    const flames = [5, 3, 4, 3, 3, 2, 2][index] ?? 2;
    return `
      <div class="li-theme-row" data-theme-name="${escapeHtml(item.name)}" data-limit-up-count="${escapeHtml(limitUpCount)}">
        <b>${index + 1}</b>
        <span>${escapeHtml(item.name)}</span>
        <em class="${cls}">${escapeHtml(pctText(item.pct))}</em>
        ${options.withBar ? `<div class="li-limit-count-cell"><i class="li-limit-count-bar"><u style="width:${width}%"></u></i><span class="li-limit-count-value">${escapeHtml(limitUpCount)}只</span></div><div class="li-heat">${Array.from({ length: flames }).map(() => `<span class="li-mini-flame">${lightMiniFlame()}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

function leadingThemeNote(data) {
  const names = (data.themes?.leading ?? [])
    .map((item) => String(item.name ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const title = names.length >= 2 ? `${names[0]} + ${names[1]}双主线` : `${names[0] ?? '领涨题材'}主线`;
  const subtitle = [
    data.market_view?.thesis,
    data.midday_interpretation?.core_judgment,
    data.themes?.leading?.[0]?.reason
  ].map((item) => String(item ?? '').trim()).find(Boolean) ?? '题材结构等待午后验证';
  return { title, subtitle };
}

function highestBoardNumber(data) {
  const board = Number(data.ladder?.highest_board);
  return Number.isFinite(board) && board >= 0 ? Math.trunc(board) : null;
}

function highestBoardStocks(data) {
  const board = highestBoardNumber(data);
  const row = (data.ladder?.boards ?? []).find((item) => Number(item.board) === board);
  const stocks = (row?.stocks ?? []).filter((item) => item?.name);
  if (stocks.length > 0) return stocks;
  const fallbackName = data.ladder?.highest_stock;
  return fallbackName ? [{ name: fallbackName, theme: data.ladder?.highest_theme }] : [];
}

function highestBoardStockLabel(data, limit = 2) {
  const names = highestBoardStocks(data).map((stock) => stock.name).filter(Boolean);
  if (names.length === 0) return data.ladder?.highest_stock ?? '--';
  return names.slice(0, limit).join('/');
}

function highestBoardThemeLabel(data) {
  const themes = [...new Set(highestBoardStocks(data).map((stock) => stock.theme).filter(Boolean))];
  return themes.slice(0, 2).join('/') || data.ladder?.highest_theme || '短线高标';
}

function boardTransitionText(data, separator = '→') {
  const board = highestBoardNumber(data);
  if (!board) return '--';
  if (board <= 1) return '首板启动';
  return `${board - 1}板${separator}${board}板`;
}

function boardActionText(data) {
  const board = highestBoardNumber(data);
  if (!board) return '待确认';
  return board <= 1 ? '启动' : '升级';
}

function ladderSummaryText(data, limit = 3) {
  const rows = data.ladder?.boards ?? [];
  const labels = [];
  for (const row of rows) {
    const board = Number(row.board);
    for (const stock of row.stocks ?? []) {
      if (!stock?.name || !Number.isFinite(board)) continue;
      labels.push(`${stock.name} ${board}连板`);
      if (labels.length >= limit) return labels.join(' ｜ ');
    }
  }
  return data.ladder?.promotion_summary ?? '';
}

function lightSignalCards(data) {
  const turnover = data.turnover?.amount_text ?? '--';
  const change = String(data.turnover?.change_text ?? '').replace(/较昨日放量约?/, '');
  const northbound = data.capital_flow?.northbound_text ?? data.capital_flow?.net_text ?? '--';
  const leadingNames = (data.themes?.leading ?? []).map((item) => String(item.name ?? '').trim()).filter(Boolean);
  const focusNames = leadingNames.length >= 2 ? `${leadingNames[0]}、${leadingNames[1]}` : leadingNames.join('、') || '主线题材';
  const focusDetail = (data.afternoon_signals?.['确认信号']?.[0]) || `关注${focusNames}能否继续扩散`;
  const riskDetail = (data.afternoon_signals?.['弱化信号']?.[0]) || (data.afternoon_signals?.['风险信号']?.[0]) || '关注午后是否出现冲高回落';
  const cards = [
    ['bars', '量能观察', `半日成交${turnover}，较昨日放量${change}，量能延续是关键`],
    ['target', '主线验证', focusDetail],
    ['trend', '走弱信号', riskDetail],
    ['yen', '资金风向', `北向${northbound}，关注午后是否持续流入`]
  ];
  return cards.map(([icon, title, text]) => `
    <div class="li-signal-card">
      <div class="li-signal-icon">${lightIcon(icon)}</div>
      <b>${escapeHtml(title)}</b>
      <p>${escapeHtml(text)}</p>
    </div>
  `).join('');
}

function lightIcon(name) {
  if (name === 'flame') return `<svg viewBox="0 0 48 58" aria-hidden="true"><path d="M29.6 2.8c1 10.7 12.1 15.6 12.1 31.1 0 12.8-8.8 22.2-22.1 22.2C8.2 56.1.8 48 .8 37.4c0-8.1 4.8-14.7 10.6-20.4-.3 6.5 2.2 10.4 7.3 11.2C20.6 17.4 23.8 9 29.6 2.8Z" fill="#df302b"/><path d="M23.1 52.2c-7.1 0-11.6-4.3-11.6-10.9 0-5.2 3.1-8.9 7-12.9.3 4.8 2.3 7.7 5.8 8.7 1.8-5.9 4.8-10.8 9.1-14.8 1.3 7.7 6.7 11.2 6.7 19 0 6.4-6.1 10.9-17 10.9Z" fill="#ff6d55"/></svg>`;
  if (name === 'coins') return `<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="12" rx="15" ry="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M9 12v20c0 4 6.7 7 15 7s15-3 15-7V12M9 22c0 4 6.7 7 15 7s15-3 15-7M9 31c0 4 6.7 7 15 7s15-3 15-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  if (name === 'chat') return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 12h28v21H22l-8 7v-7h-4V12Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M17 20h14M17 26h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  if (name === 'yuan' || name === 'yen') return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M15.5 14.5 24 25l8.5-10.5M24 25v11.5M16.5 25.5h15M16.5 31h15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'bars') return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8.5 39.5h31" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><rect x="11" y="28" width="6.2" height="11" rx="1.2" fill="currentColor"/><rect x="21" y="20" width="6.2" height="19" rx="1.2" fill="currentColor"/><rect x="31" y="11" width="6.2" height="28" rx="1.2" fill="currentColor"/></svg>`;
  if (name === 'target') return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="22" cy="26" r="15" fill="none" stroke="currentColor" stroke-width="3.1"/><circle cx="22" cy="26" r="7.2" fill="none" stroke="currentColor" stroke-width="3.1"/><circle cx="22" cy="26" r="2.5" fill="currentColor"/><path d="M27 21 40.5 7.5m-8.5.7h9.3v9.3" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'trend') return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8.5 38.5h31" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/><path d="M10 31.5h6.5l5.8-7.2 6.4 4.8L39 16.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M37.4 16.6v7.1h-7.1" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="29" width="4.6" height="4.6" rx="1" fill="currentColor"/><rect x="20.2" y="23.2" width="4.4" height="4.4" rx="1" fill="currentColor"/></svg>`;
  return '';
}

function lightMetricBox(label, value, sub, cls = 'bullish') {
  return `
    <div class="li-metric-box ${cls}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(sub)}</em>
    </div>
  `;
}

function lightInstitutionalPage1(data) {
  const indices = data.indices ?? [];
  const up = Number(data.breadth?.up ?? 0);
  const down = Number(data.breadth?.down ?? 0);
  const total = Math.max(up + down, 1);
  const upPct = clamp(Math.round((up / total) * 1000) / 10, 0, 100);
  const downPct = Math.round((100 - upPct) * 10) / 10;
  const features = data.market_view?.core_features ?? [];
  const feature0 = features[0] ?? '';
  const feature1 = features[1] ?? '';
  const feature2 = features[2] ?? '';
  const heroSubtitle = data.market_view?.style_shift || data.market_view?.headline || feature0;
  const observationParagraphs = [feature0, feature1, feature2, data.midday_interpretation?.afternoon_confirm]
    .filter((item) => String(item ?? '').trim().length > 0);
  const capitalRows = [
    [data.capital_flow?.metric_name ?? '主力资金', data.capital_flow?.net_text ?? '--'],
    ['北向资金', data.capital_flow?.northbound_text ?? '--']
  ];
  return `
    <section class="poster li-poster li-page1" data-page="1" data-title="午盘全景与资金风格">
      <div class="li-paper">
        <header class="li-topline"><span>${escapeHtml(lightChineseDate(data.report_date))}　${escapeHtml(data.weekday)}</span><b>客观 · 专业 · 及时</b></header>
        <section class="li-hero">
          <h1>A股午评 · 午盘全景</h1>
          <div><i></i><span>${escapeHtml(heroSubtitle)}</span></div>
        </section>

        <section class="li-panel panel li-index-panel">
          <div class="li-index-grid">${lightIndexCards(indices)}</div>
        </section>

        <section class="li-panel panel li-breadth-panel">
          <h2>市场宽度</h2>
          <div class="li-breadth-head">
            <span>上涨 <b class="bullish">${escapeHtml(up)}</b>只</span>
            <span>下跌 <b class="bearish">${escapeHtml(down)}</b>只</span>
          </div>
          <div class="li-breadth-bar"><i class="bullish-bg" style="width:${upPct}%"></i><i class="bearish-bg" style="width:${downPct}%"></i></div>
          <div class="li-breadth-foot">
            <span>涨跌比　${escapeHtml(data.breadth?.ratio_text?.replace('涨跌比 ', '') ?? '--')}</span>
            <span>${escapeHtml(lightBreadthNotableText(data, up))}</span>
            <span>涨停　<b class="bullish">${escapeHtml(data.limit_up?.limit_up ?? '--')}</b></span>
            <span>跌停　<b class="bearish">${escapeHtml(data.limit_up?.limit_down ?? '--')}</b></span>
          </div>
        </section>

        <section class="li-panel panel li-capital-panel">
          <div class="li-turnover">
            <div class="li-round-icon">${lightIcon('coins')}</div>
            <div><h2>两市半日成交</h2><strong>${escapeHtml(data.turnover?.amount_text ?? '--')}</strong><p>较昨日放量 <b>${escapeHtml(String(data.turnover?.change_text ?? '').replace(/较昨日放量约?/, ''))}</b></p></div>
          </div>
          <div class="li-flow">
            <div class="li-round-icon gold">${lightIcon('yuan')}</div>
            <div>
              <h2>资金动向 <em>（半日）</em></h2>
              ${capitalRows.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></p>`).join('')}
            </div>
          </div>
        </section>

        <section class="li-panel panel li-observe-panel">
          <div class="li-round-icon filled">${lightIcon('chat')}</div>
          <div>
            <h2>市场观点</h2>
            ${observationParagraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}
          </div>
        </section>

        <footer class="li-footer footer">数据来源：公开市场数据｜仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function lightInstitutionalPage2(data) {
  const note = leadingThemeNote(data);
  const heroSubtitle = data.market_view?.style_shift || data.market_view?.headline || note.subtitle || '题材结构等待午后验证';
  return `
    <section class="poster li-poster li-page2" data-page="2" data-title="题材温度与涨跌停结构">
      <div class="li-paper">
        <header class="li-topline"><span>${escapeHtml(lightChineseDate(data.report_date))}　${escapeHtml(data.weekday)}</span><b>A股午评</b></header>
        <section class="li-hero li-hero-page2">
          <div class="li-flame">${lightIcon('flame')}</div>
          <h1>题材温度 · 涨跌停结构</h1>
          <p>${escapeHtml(heroSubtitle)}</p>
        </section>

        <section class="li-panel panel li-theme-structure">
          <div class="li-leading-table">
            <h2>领涨题材 TOP7</h2>
            <div class="li-table-head"><span>题材</span><span>涨幅</span><span>涨停数</span><span>热度</span></div>
            ${lightThemeRows(data.themes?.leading, { limit: 7, withBar: true, barMetric: 'limit_up_count' })}
            <div class="li-main-note"><b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.subtitle)}</span></div>
          </div>
          <div class="li-structure-box">
            <h2>涨跌停结构</h2>
            <div class="li-metric-grid">
              ${lightMetricBox('涨停', String(data.limit_up?.limit_up ?? '--'), data.limit_up?.change_up_text ?? data.limit_up?.change_text ?? '', 'bullish')}
              ${lightMetricBox('跌停', String(data.limit_up?.limit_down ?? '--'), data.limit_up?.change_down_text ?? '', 'bearish')}
              ${lightMetricBox('封板率', `${data.limit_up?.seal_rate_pct ?? '--'}%`, '', 'bullish')}
              ${lightMetricBox('连板高度', `${data.ladder?.highest_board ?? '--'}连板`, data.ladder?.highest_stock ?? '', 'bullish')}
            </div>
            <div class="li-highest">
              <h3>最高连板</h3>
              <div><span class="li-laurel li-laurel-left">${lightLaurel()}</span><strong>${escapeHtml(data.ladder?.highest_board ?? '--')}连板</strong><span class="li-laurel li-laurel-right">${lightLaurel()}</span></div>
              <p>${escapeHtml(highestBoardStockLabel(data))}（${escapeHtml(boardTransitionText(data))}）</p>
              <em>${escapeHtml(highestBoardThemeLabel(data))} · ${escapeHtml(boardActionText(data))}</em>
            </div>
          </div>
        </section>

        <section class="li-panel panel li-bottom-grid">
          <div class="li-lagging-table">
            <h2>领跌题材 TOP5</h2>
            <div class="li-table-head"><span>题材</span><span>跌幅</span></div>
            ${lightThemeRows(data.themes?.lagging, { limit: 5, negative: true })}
          </div>
          <div class="li-signal-panel">
            <h2>午后关注信号</h2>
            ${lightSignalCards(data)}
          </div>
        </section>

        <footer class="li-footer footer">数据来源：公开市场数据｜仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function lightInstitutionalCss() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: #ded8cc; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    #report-root { display: flex; align-items: flex-start; gap: 0; background: #ded8cc; }
    .li-poster {
      width: 1080px;
      height: 1440px;
      flex: 0 0 1080px;
      position: relative;
      overflow: hidden;
      color: #142641;
      background:
        radial-gradient(circle at 50% 48%, rgba(255,255,255,.90), rgba(255,255,255,.20) 39%, transparent 68%),
        linear-gradient(135deg, #f6f1e8 0%, #f9faf8 48%, #efe7d9 100%);
    }
    .li-paper {
      position: absolute;
      inset: 18px 20px;
      padding: 36px 34px 48px;
      border-radius: 6px;
      background: rgba(255,255,255,.72);
      border: 1px solid rgba(24,43,71,.16);
      box-shadow: 0 12px 38px rgba(38,36,28,.24), inset 0 0 80px rgba(235,224,204,.34);
    }
    .li-topline {
      height: 40px;
      border-bottom: 2px solid #1c3154;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      color: #31343a;
      font-size: 25px;
      letter-spacing: 0;
    }
    .li-topline b { color: #a0742d; font-weight: 500; }
    .li-page2 .li-topline b { color: #142641; }
    .li-hero { position: relative; padding-top: 26px; }
    .li-hero h1 {
      margin: 0;
      color: #122844;
      font-family: SimSun, STSong, "Noto Serif CJK SC", serif;
      font-size: 70px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
    }
    .li-hero div:not(.li-flame) { display: flex; align-items: center; margin-top: 16px; gap: 18px; color: #2d2f34; font-size: 27px; letter-spacing: 7px; }
    .li-hero i { width: 70px; height: 8px; background: #d8211d; display: block; }
    .li-panel {
      position: absolute;
      border: 1.5px solid rgba(30,58,91,.54);
      border-radius: 7px;
      background: rgba(255,255,255,.58);
      box-shadow: inset 0 0 60px rgba(239,232,218,.30);
      overflow: hidden;
    }
    .li-index-panel { left: 34px; right: 34px; top: 266px; height: 214px; padding: 22px 20px; }
    .li-index-grid { display: grid; grid-template-columns: repeat(4, 1fr); height: 100%; }
    .li-index-card { position: relative; text-align: center; padding: 0 18px; border-right: 1px solid rgba(33,54,82,.36); overflow: hidden; }
    .li-index-card:last-child { border-right: 0; }
    .li-index-card span { display: block; color: #171c23; font-size: 24px; font-weight: 700; }
    .li-index-card strong { display: block; margin-top: 12px; font-size: 38px; line-height: 1; font-weight: 500; }
    .li-index-card em { display: block; margin-top: 8px; font-size: 18px; line-height: 1; font-style: normal; }
    .li-spark { width: 190px; height: 48px; margin-top: 12px; }
    .li-breadth-panel { left: 34px; right: 34px; top: 506px; height: 244px; padding: 20px 28px; }
    .li-breadth-panel h2, .li-observe-panel h2, .li-turnover h2, .li-flow h2, .li-leading-table h2, .li-structure-box h2, .li-lagging-table h2, .li-signal-panel h2 {
      margin: 0;
      color: #152b49;
      font-size: 34px;
      line-height: 1;
      font-weight: 900;
    }
    .li-breadth-head { display: flex; justify-content: space-between; margin-top: 24px; color: #24282c; font-size: 24px; }
    .li-breadth-head b { font-size: 36px; margin: 0 4px; }
    .li-breadth-bar { display: flex; height: 18px; margin-top: 18px; border-radius: 999px; overflow: hidden; background: rgba(35,47,60,.10); }
    .li-breadth-bar i { display: block; height: 100%; }
    .li-breadth-foot { display: grid; grid-template-columns: 1fr 1fr .75fr .75fr; gap: 18px; margin-top: 19px; padding-top: 0; color: #2f3336; font-size: 22px; text-align: center; }
    .li-breadth-foot span { border-right: 1px solid rgba(34,52,76,.24); }
    .li-breadth-foot span:last-child { border-right: 0; }
    .li-breadth-foot b { font-size: 28px; }
    .li-capital-panel { left: 34px; right: 34px; top: 770px; height: 222px; display: grid; grid-template-columns: 1fr 1.08fr; }
    .li-turnover, .li-flow { display: grid; grid-template-columns: 70px 1fr; column-gap: 24px; padding: 24px 22px; }
    .li-flow { border-left: 1px solid rgba(30,58,91,.36); }
    .li-round-icon { width: 56px; height: 56px; border: 1.5px solid #1b3c64; border-radius: 50%; display: grid; place-items: center; color: #244868; }
    .li-round-icon svg { width: 34px; height: 34px; }
    .li-round-icon.gold { color: #ad8958; border-color: #ad8958; }
    .li-round-icon.filled { background: #244868; color: white; border-color: #244868; }
    .li-turnover strong { display: block; margin-top: 14px; color: #d8211d; font-size: 54px; line-height: 1; font-weight: 400; }
    .li-turnover p { margin: 16px 0 0; color: #62666a; font-size: 20px; }
    .li-turnover p b { color: #d8211d; font-weight: 500; }
    .li-flow h2 em { font-size: 19px; font-style: normal; font-weight: 400; color: #323840; }
    .li-flow p { display: flex; justify-content: space-between; align-items: center; height: 36px; margin: 0; border-bottom: 1px solid rgba(30,58,91,.14); color: #42464a; font-size: 19px; }
    .li-flow p:first-of-type { margin-top: 15px; }
    .li-flow b { color: #d8211d; font-size: 20px; font-weight: 500; }
    .li-observe-panel { left: 34px; right: 34px; top: 1016px; height: 268px; display: grid; grid-template-columns: 70px 1fr; gap: 24px; padding: 24px 24px; }
    .li-observe-panel p { margin: 15px 0 0; color: #25282b; font-size: 20px; line-height: 1.52; }
    .li-footer { position: absolute; left: 34px; right: 34px; bottom: 35px; color: #3a3d41; font-size: 20px; text-align: center; letter-spacing: 4px; }
    .li-page2 .li-hero { padding-top: 24px; padding-left: 84px; }
    .li-page2 .li-hero h1 { font-size: 60px; }
    .li-hero-page2 p { margin: 15px 0 0; color: #31343a; font-size: 28px; letter-spacing: 8px; }
    .li-flame { position: absolute; left: 0; top: 26px; width: 64px; height: 72px; color: #d8211d; }
    .li-flame svg { width: 64px; height: 72px; }
    .li-theme-structure { left: 34px; right: 34px; top: 262px; height: 608px; display: grid; grid-template-columns: 1.22fr .88fr; border-color: #163251; border-radius: 0; }
    .li-leading-table { padding: 24px 22px; border-right: 1.5px solid rgba(22,50,81,.56); }
    .li-leading-table h2, .li-lagging-table h2, .li-signal-panel h2 { font-size: 34px; }
    .li-table-head { display: grid; grid-template-columns: minmax(0, 1fr) 70px 166px 72px; column-gap: 12px; height: 38px; margin-top: 18px; padding-left: 38px; border-top: 1px solid rgba(30,58,91,.28); border-bottom: 1px solid rgba(30,58,91,.28); align-items: center; color: #60666d; font-size: 17px; }
    .li-table-head span:nth-child(2) { text-align: center; }
    .li-table-head span:nth-child(3) { text-align: center; }
    .li-table-head span:nth-child(4) { text-align: left; }
    .li-theme-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) 70px 166px 72px; column-gap: 12px; align-items: center; min-height: 47px; border-bottom: 1px solid rgba(30,58,91,.15); color: #1d2227; font-size: 18px; }
    .li-theme-row b { color: #d8211d; font-weight: 400; }
    .li-theme-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .li-theme-row em { font-style: normal; text-align: right; font-size: 18px; }
    .li-limit-count-cell { display: grid; grid-template-columns: minmax(0, 1fr) 34px; align-items: center; gap: 8px; }
    .li-limit-count-bar { display: block; height: 16px; background: rgba(216,33,29,.10); }
    .li-limit-count-bar u { display: block; height: 100%; background: linear-gradient(90deg, #e24b40, #d8211d); }
    .li-limit-count-value { color: #a9472f; font-size: 15px; line-height: 1; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .li-heat { display: flex; justify-content: flex-start; align-items: center; gap: 3px; }
    .li-mini-flame { width: 9px; height: 15px; display: block; }
    .li-mini-flame svg { width: 100%; height: 100%; display: block; }
    .li-main-note { height: 112px; margin-top: 22px; border: 1px solid rgba(176,116,42,.45); border-radius: 6px; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #1e252b; background: linear-gradient(180deg, rgba(255,246,229,.76), rgba(255,255,255,.46)); }
    .li-main-note b { color: #b56b00; font-size: 25px; }
    .li-main-note span { margin-top: 8px; font-size: 21px; }
    .li-structure-box { padding: 24px 24px; }
    .li-metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 20px; margin-top: 22px; }
    .li-metric-box { height: 134px; border: 1px solid rgba(216,33,29,.36); border-radius: 8px; text-align: center; padding: 17px 10px; }
    .li-metric-box.bearish { border-color: rgba(10,157,112,.28); }
    .li-metric-box span { display: block; color: #32363b; font-size: 20px; }
    .li-metric-box strong { display: block; margin-top: 13px; color: #d8211d; font-size: 40px; line-height: 1; font-weight: 500; }
    .li-metric-box.bearish strong { color: #0a9d70; }
    .li-metric-box em { display: block; margin-top: 10px; color: #3f444a; font-size: 17px; font-style: normal; }
    .li-highest { margin-top: 18px; padding-top: 14px; border-top: 1.5px solid rgba(30,58,91,.36); text-align: center; }
    .li-highest h3 { margin: 0; text-align: left; color: #142641; font-size: 25px; }
    .li-highest div { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 8px; }
    .li-laurel { width: 76px; height: 94px; display: block; color: rgba(205,167,111,.84); }
    .li-laurel svg { width: 100%; height: 100%; display: block; }
    .li-laurel-right { transform: scaleX(-1); }
    .li-highest strong { color: #d8211d; font-size: 39px; line-height: 1; }
    .li-highest p { margin: 7px 0 0; color: #20262d; font-size: 17px; }
    .li-highest em { display: block; margin-top: 5px; color: #4f555b; font-size: 16px; font-style: normal; }
    .li-bottom-grid { left: 34px; right: 34px; top: 888px; height: 388px; display: grid; grid-template-columns: .92fr 1.28fr; border-color: #163251; border-radius: 0; }
    .li-lagging-table { padding: 24px 22px; border-right: 1.5px solid rgba(30,58,91,.28); }
    .li-lagging-table .li-table-head { grid-template-columns: minmax(0, 1fr) 82px; }
    .li-lagging-table .li-table-head span:last-child { text-align: right; }
    .li-lagging-table .li-theme-row { grid-template-columns: 26px 1fr 82px; min-height: 45px; }
    .li-lagging-table .li-theme-row b, .li-lagging-table .li-theme-row em { color: #0a9d70; }
    .li-signal-panel { padding: 24px 26px; }
    .li-signal-card { height: 62px; margin-top: 10px; border: 1px solid rgba(30,58,91,.34); border-radius: 7px; display: grid; grid-template-columns: 52px 88px 1fr; align-items: center; color: #1c3558; background: rgba(255,255,255,.44); }
    .li-signal-icon { width: 36px; height: 36px; margin-left: 13px; color: #244868; }
    .li-signal-icon svg { width: 36px; height: 36px; display: block; }
    .li-signal-card b { font-size: 18px; }
    .li-signal-card p { margin: 0; color: #303740; font-size: 16px; line-height: 1.28; }
    .bullish { color: #d8211d !important; }
    .bearish { color: #0a8c68 !important; }
    .bullish-bg { background: linear-gradient(90deg,#e24b40,#d8211d); }
    .bearish-bg { background: linear-gradient(90deg,#0fa879,#0a8c68); }
  `;
}

function lightInstitutionalScript() {
  return `
    <script>
      for (const canvas of document.querySelectorAll('.li-spark')) {
        const ctx = canvas.getContext('2d');
        const seed = String(canvas.dataset.seed || 'light');
        const bearish = canvas.dataset.bearish === '1';
        const pct = Number(canvas.dataset.pct || 0);
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(160, rect.width || 190);
        const height = Math.max(42, rect.height || 48);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        let hash = 2166136261;
        for (let i = 0; i < seed.length; i += 1) {
          hash ^= seed.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        const rand = () => {
          hash ^= hash << 13;
          hash ^= hash >>> 17;
          hash ^= hash << 5;
          return ((hash >>> 0) % 10000) / 10000;
        };
        const sparkProfiles = {
          upA: [.70,.61,.67,.59,.73,.55,.62,.50,.68,.72,.63,.48,.42,.55,.60,.46,.65,.71,.58,.74,.62,.69,.56,.66,.72,.61,.49,.38,.45,.33,.42,.30,.37,.25,.35,.22,.29,.18,.25,.14,.19],
          upB: [.64,.55,.61,.47,.42,.57,.63,.46,.36,.44,.54,.60,.45,.32,.38,.50,.40,.27,.34,.46,.36,.25,.18,.31,.23,.15,.26,.12,.22,.10,.18,.08,.16,.06,.14,.08,.12,.05,.10,.07,.09],
          downA: [.34,.25,.36,.29,.45,.37,.53,.43,.57,.48,.52,.40,.49,.44,.56,.47,.60,.69,.55,.64,.75,.67,.80,.71,.84,.76,.88,.79,.86,.82,.90,.81,.87,.78,.91,.83,.93,.84,.90,.82,.92],
          downB: [.45,.34,.42,.30,.50,.39,.58,.46,.62,.51,.68,.54,.61,.49,.57,.66,.59,.73,.64,.78,.69,.82,.72,.86,.77,.91,.80,.88,.74,.93,.82,.90,.78,.94,.84,.92,.80,.95,.86,.91,.83]
        };
        const match = seed.match(/^(?:li-)?(\\d+)/);
        const index = match ? Number(match[1]) : 0;
        const strongMove = Math.abs(pct) >= 1 || index % 2 === 1;
        const profile = sparkProfiles[bearish ? (strongMove ? 'downB' : 'downA') : (strongMove ? 'upB' : 'upA')];
        const step = width / (profile.length - 1);
        const pts = profile.map((value, i) => {
          const impulse = i % 5 === 0 ? (rand() - 0.5) * height * 0.14 : 0;
          const micro = (rand() - 0.5) * height * 0.085;
          const baseY = height * (0.08 + value * 0.68);
          const yVal = Math.max(height * 0.06, Math.min(height * 0.84, baseY + impulse + micro));
          return [i * step, Math.round(yVal * 10) / 10];
        });
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, bearish ? 'rgba(10,140,104,.20)' : 'rgba(216,33,29,.20)');
        grad.addColorStop(.58, bearish ? 'rgba(10,140,104,.09)' : 'rgba(216,33,29,.10)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[pts.length - 1][0], height + 2);
        ctx.lineTo(pts[0][0], height + 2);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = bearish ? '#0a8c68' : '#d8211d';
        ctx.lineWidth = 1.7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = bearish ? 'rgba(10,140,104,.30)' : 'rgba(216,33,29,.32)';
        ctx.shadowBlur = 1.8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    </script>
  `;
}

function renderLightInstitutionalHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.report_date)} A股午评</title>
<style>${lightInstitutionalCss()}</style>
</head>
<body>
<main id="report-root" data-report-date="${escapeHtml(data.report_date)}" data-theme="light-institutional-report">
${lightInstitutionalPage1(data)}
${lightInstitutionalPage2(data)}
</main>
${lightInstitutionalScript()}
</body>
</html>`;
}

function darkRankRows(items, limit = 7) {
  const max = Math.max(...(items ?? []).map((item) => Math.abs(Number(item.pct ?? item.count ?? 0))).filter(Number.isFinite), 1);
  return (items ?? []).slice(0, limit).map((item, index) => {
    const value = item.pct !== undefined && item.pct !== null ? pctText(item.pct) : `${item.count ?? '--'}只+`;
    const width = clamp(Math.round((Math.abs(Number(item.pct ?? item.count ?? 0)) / max) * 100), 16, 100);
    return `
      <div class="de-rank-row">
        <div class="de-rank-no">${index + 1}</div>
        <div class="de-rank-copy">
          <b>${escapeHtml(item.name)}</b>
          <p>${escapeHtml(item.reason ?? (item.leaders ?? []).join(' / '))}</p>
        </div>
        <div class="de-rank-meter">
          <strong>${escapeHtml(value)}</strong>
          <i><em style="width:${width}%"></em></i>
        </div>
      </div>
    `;
  }).join('');
}

function darkSmallRank(items, cls, limit = 5) {
  return (items ?? []).slice(0, limit).map((item, index) => `
    <div class="de-small-row">
      <b>${index + 1}</b>
      <span>${escapeHtml(item.name)}</span>
      <em class="${cls}">${escapeHtml(item.pct !== undefined && item.pct !== null ? pctText(item.pct) : `${item.count ?? '--'}只`)}</em>
    </div>
  `).join('');
}

function darkIcon(name, extraClass = '') {
  const cls = `de-svg-icon ${extraClass}`.trim();
  const iconClass = escapeHtml(cls);
  if (name === 'flame') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M27.7 4.8c1.3 8.2 8.3 10.8 8.3 22.1 0 9.2-6.4 16.3-15.8 16.3-8.3 0-14-5.7-14-13.7 0-6.2 3.1-10.4 7.1-14.7-.2 4.6 1.4 7.3 4.5 8.1 1.8-7.9 5-13.4 9.9-18.1Z" fill="currentColor" opacity=".96"/><path d="M22.9 40.2c-4.9 0-8-3.1-8-7.5 0-3.5 2.2-5.9 4.8-8.5.2 3.2 1.5 5.1 3.8 5.9 1.2-3.9 3.2-7.1 6.1-9.8.8 5.3 4.4 7.7 4.4 13.1 0 4-3.3 6.8-11.1 6.8Z" fill="#ffe0a0"/></svg>`;
  }
  if (name === 'trophy') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M15 9h18v5h6v5.2c0 6.3-4.2 10.4-10.2 11.2-.9 2.6-2.3 4.5-4.8 5.2v3.7h8.2v4H15.8v-4H24v-3.7c-2.5-.7-3.9-2.6-4.8-5.2C13.2 29.6 9 25.5 9 19.2V14h6V9Zm18 8v8.8c2.5-.8 3.9-3.1 3.9-6.6V17H33Zm-21 0v2.2c0 3.5 1.4 5.8 3.9 6.6V17H12Z" fill="currentColor"/></svg>`;
  }
  if (name === 'spark') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5.5 29.3 19 42.5 24 29.3 29 24 42.5 18.7 29 5.5 24 18.7 19 24 5.5Z" fill="currentColor"/><path d="M24 16.2 27 22l5.8 2-5.8 2-3 5.8-3-5.8-5.8-2 5.8-2 3-5.8Z" fill="#111711" opacity=".72"/></svg>`;
  }
  if (name === 'eye') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M4.8 24c5.1-8.2 11.5-12.3 19.2-12.3S38.1 15.8 43.2 24C38.1 32.2 31.7 36.3 24 36.3S9.9 32.2 4.8 24Z" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linejoin="round"/><circle cx="24" cy="24" r="6.2" fill="currentColor"/></svg>`;
  }
  if (name === 'chart') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M9 38h30" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".8"/><path d="M13 32V22m9 10V14m9 18V19" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M12 16 22 10l8 5 8-9" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 6v8h-8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (name === 'coins') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="13" rx="14" ry="6" fill="currentColor"/><path d="M10 13v18c0 3.3 6.3 6 14 6s14-2.7 14-6V13" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M10 22c0 3.3 6.3 6 14 6s14-2.7 14-6M10 31c0 3.3 6.3 6 14 6s14-2.7 14-6" fill="none" stroke="#ffe1a2" stroke-width="2.4" stroke-linecap="round" opacity=".85"/></svg>`;
  }
  if (name === 'yen') {
    return `<svg class="${iconClass}" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 7h7.6L24 18l5.4-11H37L28 23h7v5h-8v4h8v5h-8v6h-6v-6h-8v-5h8v-4h-8v-5h7L11 7Z" fill="currentColor"/></svg>`;
  }
  if (name === 'medal') {
    return `<svg class="${iconClass}" viewBox="0 0 64 64" aria-hidden="true"><path d="M21 38 15 58l10-6 7 9 7-9 10 6-6-20" fill="#7c2c24" opacity=".9"/><circle cx="32" cy="28" r="22" fill="#4f3517" stroke="#f2bd65" stroke-width="3"/><circle cx="32" cy="28" r="15" fill="#8b5f22" stroke="#ffe0a0" stroke-width="2" opacity=".96"/><path d="m32 16 3.4 7 7.7 1.1-5.6 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.6-5.4 7.7-1.1L32 16Z" fill="none" stroke="#ffe0a0" stroke-width="2.8" stroke-linejoin="round"/></svg>`;
  }
  return '';
}

function darkLimitArrow(kind) {
  const up = kind === 'up';
  const suffix = up ? 'up' : 'down';
  const curve = up ? 'M6 133 C76 136 146 121 211 78' : 'M6 68 C76 105 146 126 211 132';
  const x2 = 211;
  const y2 = up ? 78 : 132;
  return `<svg class="de-limit-arrow ${suffix}" viewBox="0 0 232 170" aria-hidden="true">
    <defs>
      <linearGradient id="de-limit-arrow-grad-${suffix}" x1="6" y1="${up ? 133 : 68}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="currentColor" stop-opacity=".08"/>
        <stop offset=".45" stop-color="currentColor" stop-opacity=".42"/>
        <stop offset="1" stop-color="currentColor" stop-opacity=".96"/>
      </linearGradient>
      <marker id="de-limit-arrow-head-${suffix}" viewBox="0 0 14 12" markerWidth="4.8" markerHeight="4.1" refX="9.8" refY="6" orient="auto" markerUnits="strokeWidth">
        <path d="M0 0 L14 6 L0 12 L4.4 6 Z" fill="currentColor"/>
      </marker>
    </defs>
    <path class="de-limit-arrow-line" d="${curve}" fill="none" stroke="url(#de-limit-arrow-grad-${suffix})" marker-end="url(#de-limit-arrow-head-${suffix})"/>
  </svg>`;
}

function darkSparkCanvas(seed, pct) {
  return `<canvas class="de-spark" width="210" height="58" data-seed="${escapeHtml(seed)}" data-pct="${escapeHtml(pct)}" data-bearish="${Number(pct) < 0 ? '1' : '0'}"></canvas>`;
}

function darkEditorialPage1(data) {
  const indices = data.indices ?? [];
  const up = Number(data.breadth?.up ?? 0);
  const down = Number(data.breadth?.down ?? 0);
  const total = Math.max(up + down, 1);
  const upPct = clamp(Math.round((up / total) * 1000) / 10, 0, 100);
  const downPct = Math.round((100 - upPct) * 10) / 10;
  const features = (data.market_view?.core_features ?? []).map((item) => String(item ?? '').trim()).filter(Boolean);
  const northbound = data.capital_flow?.northbound_text ?? data.capital_flow?.net_text ?? '--';
  const coreHeadings = ['指数与权重', '题材与情绪', '量能与博弈'];
  const coreCards = features.slice(0, coreHeadings.length).map((body, index) => ({
    icon: ['chart', 'flame', 'coins'][index] ?? 'chart',
    heading: coreHeadings[index] ?? '要点',
    body
  }));
  const thesis = String(data.market_view?.thesis ?? '').trim();
  const headline = String(data.market_view?.headline ?? '').trim();
  const styleShift = String(data.market_view?.style_shift ?? '').trim();
  return `
    <section class="poster de-poster de-page1" data-page="1" data-title="午盘全景与资金风格">
      <div class="de-frame">
        <header class="de-title-block de-title-page1">
          <h1><span>A股午评</span><i>· 午盘全景</i></h1>
          <div class="de-date">◎ ${escapeHtml(darkChineseDate(data.report_date))}　${escapeHtml(data.weekday)}　｜　午盘收盘</div>
        </header>

        <section class="de-judgement de-panel">
          <div class="de-badge">市场判断</div>
          <strong>${escapeHtml(thesis)}</strong>
          <p>${escapeHtml(styleShift || headline)}</p>
        </section>

        <section class="de-panel de-index-panel">
          <h2>主要指数</h2>
          <div class="de-index-grid">
            ${indices.slice(0, 4).map((item, index) => `
              <div class="de-index-card">
                <span>${escapeHtml(item.name)}</span>
                <strong class="${marketClass(item.pct)}">${escapeHtml(Number(item.close ?? 0).toFixed(2))}</strong>
                <em class="${marketClass(item.pct)}">${escapeHtml(pctText(item.pct))}</em>
                ${darkSparkCanvas(`${index}:${item.pct}`, item.pct)}
              </div>
            `).join('')}
          </div>
        </section>

        <section class="de-panel de-breadth">
          <h2>市场宽度</h2>
          <div class="de-breadth-main">
            <div class="de-breadth-side"><span>上涨</span><div><strong class="bullish">${escapeHtml(up)}</strong><em>家</em></div></div>
            <div class="de-breadth-bar"><i class="bullish-bg" style="width:${upPct}%"><b>${upPct}%</b></i><i class="bearish-bg" style="width:${downPct}%"><b>${downPct}%</b></i></div>
            <div class="de-breadth-side"><span>下跌</span><div><strong class="bearish">${escapeHtml(down)}</strong><em>家</em></div></div>
          </div>
          <p>涨跌比 ${escapeHtml(data.breadth?.ratio_text?.replace('涨跌比 ', '') ?? '--')} ｜ ${escapeHtml(data.breadth?.notable ?? '')}</p>
        </section>

        <section class="de-panel de-money">
          <h2>资金与成交</h2>
          <div class="de-money-grid">
            <div class="de-icon-bubble red">${darkIcon('yen')}</div>
            <div><span>两市半日成交</span><strong class="bullish">${escapeHtml(data.turnover?.amount_text ?? '--')}</strong></div>
            <div><span>较昨日放量</span><strong class="bullish">${escapeHtml(String(data.turnover?.change_text ?? '').replace(/较昨日放量约?/, ''))}</strong></div>
            <div class="de-divider"></div>
            <div class="de-icon-bubble gold">${darkIcon('coins')}</div>
            <div><span>北向资金(半日)</span><strong class="bullish">${escapeHtml(northbound)}</strong></div>
          </div>
        </section>

        <section class="de-panel de-core">
          <h2>核心要点</h2>
          <div class="de-core-grid">
            ${coreCards.map((card) => `
              <div>
                <div class="de-round-icon">${darkIcon(card.icon)}</div>
                <h3>${escapeHtml(card.heading)}</h3>
                <p>${escapeHtml(card.body)}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <footer class="de-footer footer">数据来源：公开市场数据 ｜ 仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function darkEditorialPage2(data) {
  const note = leadingThemeNote(data);
  return `
    <section class="poster de-poster de-page2" data-page="2" data-title="题材温度与涨跌停结构">
      <div class="de-frame">
        <header class="de-title-block de-title-page2">
          <h1><span>题材温度</span><i>· 涨跌停结构</i></h1>
          <div class="de-date">◎ ${escapeHtml(darkChineseDate(data.report_date))}　${escapeHtml(data.weekday)}　｜　午盘收盘</div>
        </header>

        <section class="de-panel de-hot-list">
          <h2><span class="de-title-icon">${darkIcon('flame')}</span> 题材温度榜 <em>TOP7</em></h2>
          ${darkRankRows(data.themes?.leading, 7)}
          <div class="de-hot-note">${escapeHtml(note.title)} ${escapeHtml(note.subtitle)}</div>
        </section>

        <section class="de-panel de-limit-box">
          <h2><span class="de-title-icon">${darkIcon('spark')}</span> 涨跌停结构</h2>
          <div class="de-limit-two">
            <div class="de-limit-card red">
              <span>涨停</span>
              <strong>${escapeHtml(data.limit_up?.limit_up ?? '--')}<em>只</em></strong>
              ${darkLimitArrow('up')}
            </div>
            <div class="de-limit-card green">
              <span>跌停</span>
              <strong>${escapeHtml(data.limit_up?.limit_down ?? '--')}<em>只</em></strong>
              ${darkLimitArrow('down')}
            </div>
          </div>
        </section>

        <section class="de-panel de-concentrated">
          <h2><span class="de-title-icon">${darkIcon('trophy')}</span> 涨停集中题材 <em>TOP3</em></h2>
          ${(data.themes?.concentrated_limit_up ?? []).slice(0, 3).map((item, index) => `
            <div class="de-con-row">
              <b>${index + 1}</b><span>${escapeHtml(item.name)}</span><em>${escapeHtml(item.count ?? '--')}只+</em>
            </div>
          `).join('')}
        </section>

        <section class="de-panel de-small-up">
          <h2><span class="de-title-icon">${darkIcon('flame')}</span> 领涨板块 <em>TOP5</em></h2>
          ${darkSmallRank(data.themes?.leading, 'bullish', 5)}
        </section>

        <section class="de-panel de-small-down">
          <h2><span class="de-title-icon">${darkIcon('flame')}</span> 领跌板块 <em>TOP5</em></h2>
          ${darkSmallRank(data.themes?.lagging, 'bearish', 5)}
        </section>

        <section class="de-panel de-high-board">
          <div class="de-medal">${darkIcon('medal')}</div>
          <h2>最高连板</h2>
          <h3>${escapeHtml(highestBoardStockLabel(data))}</h3>
          <strong>${escapeHtml(data.ladder?.highest_board ?? '--')}<span>连板</span></strong>
          <div class="de-upgrade">${escapeHtml(boardTransitionText(data, ' → '))} ${escapeHtml(boardActionText(data))}</div>
          <p>${escapeHtml(ladderSummaryText(data))}</p>
        </section>

        <section class="de-panel de-watch">
          <h2><span class="de-title-icon">${darkIcon('eye')}</span> 午后观察</h2>
          <div class="de-watch-grid">
            <div><span>关注主线</span><b>${escapeHtml(data.afternoon_signals?.['确认信号']?.[0] ?? '')}</b><p>${escapeHtml(data.midday_interpretation?.afternoon_confirm ?? '')}</p></div>
            <div><span>资金动向</span><b>${escapeHtml(data.capital_flow?.style_label ?? data.capital_flow?.net_text ?? '')}</b><p>${escapeHtml(data.afternoon_signals?.['弱化信号']?.[0] ?? '')}</p></div>
            <div><span>情绪观察</span><b>${escapeHtml(`${data.midday_temperature_v1?.state ?? '--'}　${data.limit_up?.limit_up ?? '--'}只`)}</b><p>${escapeHtml(data.midday_interpretation?.core_judgment ?? '')}</p></div>
            <div><span>风险提示</span><b>${escapeHtml(data.afternoon_signals?.['风险信号']?.[0] ?? '')}</b><p>${escapeHtml(data.midday_interpretation?.afternoon_risk ?? '')}</p></div>
          </div>
        </section>

        <footer class="de-footer footer">数据来源：公开市场数据 ｜ 仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function darkEditorialCss() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: #101010; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    #report-root { display: flex; align-items: flex-start; gap: 0; background: #101010; }
    .de-poster {
      width: 1080px;
      height: 1440px;
      flex: 0 0 1080px;
      position: relative;
      overflow: hidden;
      color: #eee6d7;
      background:
        radial-gradient(circle at 50% 7%, rgba(229,207,160,.12), transparent 25%),
        radial-gradient(circle at 80% 26%, rgba(134,67,50,.13), transparent 24%),
        linear-gradient(150deg, #101820 0%, #10120f 48%, #071018 100%);
    }
    .de-frame {
      position: absolute;
      inset: 18px 20px 20px;
      border: 1px solid rgba(211,157,82,.50);
      border-radius: 10px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.045), transparent 16%),
        radial-gradient(circle at 50% 0%, rgba(255,237,180,.10), transparent 24%),
        rgba(8,13,14,.62);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.035), 0 18px 45px rgba(0,0,0,.42);
      overflow: hidden;
    }
    .de-panel {
      position: absolute;
      border: 1px solid rgba(202,144,69,.55);
      border-radius: 8px;
      background:
        radial-gradient(circle at 50% 0%, rgba(217,165,93,.08), transparent 35%),
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.015)),
        rgba(12,18,18,.82);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 10px 22px rgba(0,0,0,.25);
      overflow: hidden;
    }
    .de-svg-icon { display: block; width: 1em; height: 1em; color: currentColor; overflow: visible; }
    .de-title-icon { display: inline-grid; place-items: center; width: 1.08em; height: 1.08em; margin-right: 6px; color: currentColor; vertical-align: -0.16em; filter: drop-shadow(0 2px 5px rgba(0,0,0,.42)); }
    .de-title-icon .de-svg-icon { width: 1em; height: 1em; }
    .de-title-block { position: absolute; left: 38px; right: 38px; top: 42px; text-align: center; }
    .de-title-block h1 {
      margin: 0;
      font-family: SimSun, STSong, "Noto Serif CJK SC", serif;
      font-size: 86px;
      line-height: .98;
      font-weight: 900;
      letter-spacing: 0;
      text-shadow: 0 4px 12px rgba(0,0,0,.65);
    }
    .de-title-block h1 span {
      background: linear-gradient(180deg, #fff5cf 0%, #e7b96d 58%, #b47b39 100%);
      -webkit-background-clip: text;
      color: transparent;
    }
    .de-title-block h1 i {
      font-style: normal;
      margin-left: 18px;
      color: #f0eee8;
      text-shadow: 0 4px 12px rgba(0,0,0,.65);
    }
    .de-date { margin-top: 18px; color: #8d9292; font-size: 21px; font-weight: 700; letter-spacing: 0; }

    .de-page1 .de-judgement { left: 26px; right: 26px; top: 196px; height: 204px; text-align: center; padding-top: 54px; }
    .de-badge {
      position: absolute;
      top: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: 172px;
      height: 46px;
      line-height: 42px;
      border-radius: 0 0 26px 26px;
      background: linear-gradient(180deg, #f8d991, #c78d42);
      color: #10100d;
      font-size: 24px;
      font-weight: 900;
      box-shadow: 0 8px 18px rgba(0,0,0,.28);
    }
    .de-judgement strong {
      display: block;
      font-family: SimSun, STSong, serif;
      font-size: 62px;
      line-height: 1;
      color: #f1d39a;
      text-shadow: 0 3px 12px rgba(0,0,0,.6);
    }
    .de-judgement p { margin: 18px 0 0; color: #e8e2d7; font-size: 29px; font-weight: 800; letter-spacing: 2px; }

    .de-index-panel { left: 26px; right: 26px; top: 414px; height: 300px; padding: 18px 18px; }
    .de-index-panel h2, .de-breadth h2, .de-money h2, .de-core h2 {
      margin: 0 0 14px;
      color: #f1d39a;
      font-size: 29px;
      line-height: 1;
      font-weight: 900;
    }
    .de-index-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .de-index-card {
      height: 210px;
      padding: 21px 16px 12px;
      border: 1px solid rgba(222,169,92,.42);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.015));
      text-align: center;
      overflow: hidden;
    }
    .de-index-card span { display: block; color: #d8ddd8; font-size: 22px; font-weight: 800; }
    .de-index-card strong { display: block; margin-top: 12px; font-size: 38px; line-height: 1; font-weight: 900; }
    .de-index-card em { display: block; margin-top: 10px; font-size: 27px; line-height: 1; font-style: normal; font-weight: 900; }
    .de-spark { width: 210px; height: 58px; margin-top: 4px; }

    .de-breadth { left: 26px; right: 26px; top: 742px; height: 184px; padding: 18px 28px; }
    .de-breadth h2 { margin-bottom: 8px; }
    .de-breadth-main { display: grid; grid-template-columns: 132px 1fr 132px; gap: 16px; align-items: center; height: 66px; }
    .de-breadth-side { min-width: 0; text-align: center; white-space: nowrap; }
    .de-breadth-main span { display: block; text-align: center; color: #d9dddd; font-size: 20px; line-height: 1; font-weight: 800; }
    .de-breadth-side div { display: inline-flex; align-items: flex-end; justify-content: center; gap: 2px; margin-top: 4px; white-space: nowrap; }
    .de-breadth-main strong { display: block; font-size: 38px; line-height: .95; }
    .de-breadth-main em { display: block; font-style: normal; font-size: 18px; line-height: 1.05; margin-left: 0; padding-bottom: 1px; }
    .de-breadth-bar { display: flex; height: 38px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.10); box-shadow: inset 0 2px 6px rgba(0,0,0,.35); }
    .de-breadth-bar i { display: block; position: relative; height: 100%; }
    .de-breadth-bar b { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); color: #fff0df; font-size: 18px; white-space: nowrap; }
    .de-breadth p { margin: 6px 0 0; text-align: center; color: #b8b9b6; font-size: 18px; line-height: 1.15; font-weight: 700; }

    .de-money { left: 26px; right: 26px; top: 936px; height: 168px; padding: 22px 26px; }
    .de-money-grid { display: grid; grid-template-columns: 72px 1fr 1fr 1px 72px 1fr; gap: 22px; align-items: center; }
    .de-money-grid span { display: block; color: #c9cac5; font-size: 19px; font-weight: 800; }
    .de-money-grid strong { display: block; margin-top: 6px; color: #ff5652; font-size: 34px; line-height: 1; }
    .de-icon-bubble { width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; font-size: 43px; font-weight: 900; box-shadow: inset 0 0 0 4px rgba(255,255,255,.10), 0 8px 18px rgba(0,0,0,.28); }
    .de-icon-bubble.red { color: #ff4f49; background: radial-gradient(circle, rgba(255,78,72,.38), rgba(80,18,16,.85)); border: 2px solid #d84b41; }
    .de-icon-bubble.gold { color: #ffcf76; background: radial-gradient(circle, rgba(255,207,118,.38), rgba(78,51,16,.85)); border: 2px solid #d49b45; font-size: 30px; }
    .de-icon-bubble .de-svg-icon { width: 42px; height: 42px; filter: drop-shadow(0 3px 4px rgba(0,0,0,.36)); }
    .de-divider { width: 1px; height: 74px; background: rgba(220,177,108,.52); }

    .de-core { left: 26px; right: 26px; top: 1115px; height: 222px; padding: 24px 26px; }
    .de-core-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .de-core-grid > div { display: grid; grid-template-columns: 58px 1fr; column-gap: 14px; border-right: 1px solid rgba(218,166,87,.38); min-height: 120px; }
    .de-core-grid > div:last-child { border-right: 0; }
    .de-round-icon { grid-row: 1 / span 2; width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; border: 1px solid #d8a052; color: #f0c979; font-size: 26px; background: radial-gradient(circle, rgba(216,160,82,.18), rgba(8,10,10,.16)); }
    .de-round-icon .de-svg-icon { width: 31px; height: 31px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.42)); }
    .de-core h3 { grid-column: 2; margin: 2px 0 6px; color: #f0d49c; font-size: 20px; line-height: 1.12; }
    .de-core p { grid-column: 2; margin: 0; color: #aeb1ac; font-size: 16px; line-height: 1.38; }
    .de-footer { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; color: #9aa0a0; font-size: 18px; font-weight: 700; }

    .de-page2 .de-title-block { top: 45px; }
    .de-page2 .de-title-block h1 { font-size: 76px; }
    .de-hot-list { left: 26px; top: 184px; width: 496px; height: 606px; padding: 16px; }
    .de-hot-list h2, .de-limit-box h2, .de-concentrated h2, .de-small-up h2, .de-small-down h2, .de-high-board h2, .de-watch h2 {
      margin: 0 0 13px;
      color: #f1d39a;
      font-size: 25px;
      line-height: 1;
      font-weight: 900;
    }
    .de-hot-list .de-title-icon, .de-small-up .de-title-icon { color: #ff5750; }
    .de-small-down .de-title-icon { color: #1caf83; }
    .de-hot-list h2 em, .de-concentrated h2 em, .de-small-up h2 em, .de-small-down h2 em { font-style: normal; margin-left: 12px; font-size: 18px; color: #d6c09a; }
    .de-rank-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 210px; gap: 12px; min-height: 68px; border-top: 1px solid rgba(255,255,255,.055); align-items: center; }
    .de-rank-no { width: 35px; height: 35px; border-radius: 7px; display: grid; place-items: center; color: #f5eee1; border: 1px solid rgba(226,164,86,.64); font-size: 21px; font-weight: 900; background: rgba(4,8,10,.72); }
    .de-rank-copy { min-width: 0; align-self: center; display: grid; gap: 5px; }
    .de-rank-copy b { color: #f1f3ec; font-size: 21px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .de-rank-copy p { margin: 0; color: #8e9695; font-size: 14px; line-height: 1.1; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .de-rank-meter { align-self: center; display: grid; justify-items: end; gap: 10px; }
    .de-rank-meter strong { color: #ff5750; font-size: 20px; line-height: 1; }
    .de-rank-meter i { display: block; height: 10px; width: 210px; border-radius: 999px; background: rgba(126,35,34,.36); overflow: hidden; }
    .de-rank-meter em { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#e83d3a,#ff7844); box-shadow: 0 0 10px rgba(255,80,60,.7); }
    .de-hot-note { height: 38px; line-height: 38px; margin-top: 8px; border: 1px solid rgba(214,158,70,.68); border-radius: 8px; color: #ffd05f; text-align: center; font-size: 18px; font-weight: 900; background: rgba(132,84,22,.18); }

    .de-limit-box { left: 540px; top: 184px; width: 488px; height: 350px; padding: 18px; }
    .de-limit-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .de-limit-card { position: relative; height: 228px; border-radius: 8px; padding: 34px 20px; text-align: center; box-shadow: inset 0 -25px 40px rgba(0,0,0,.18); overflow: hidden; }
    .de-limit-card.red { background: linear-gradient(145deg,#f14646,#8d2528); }
    .de-limit-card.green { background: linear-gradient(145deg,#0d7c5c,#0b3e3b); }
    .de-limit-card span { display: block; color: #fff0ec; font-size: 25px; font-weight: 900; }
    .de-limit-card strong { display: block; margin-top: 18px; color: #fff1dd; font-size: 74px; line-height: 1; text-shadow: 0 3px 8px rgba(0,0,0,.45); }
    .de-limit-card em { font-size: 26px; font-style: normal; margin-left: 4px; }
    .de-limit-arrow { position: absolute; left: 14px; right: 14px; bottom: 6px; width: calc(100% - 28px); height: 98px; color: #efc16f; filter: drop-shadow(0 3px 5px rgba(0,0,0,.22)); overflow: visible; }
    .de-limit-arrow.down { color: #29b08f; bottom: 6px; }
    .de-limit-arrow-line { stroke-width: 11; stroke-linecap: round; stroke-linejoin: round; }

    .de-concentrated { left: 540px; top: 548px; width: 488px; height: 184px; padding: 16px 18px; }
    .de-concentrated h2 { margin-bottom: 9px; }
    .de-con-row, .de-small-row { display: grid; grid-template-columns: 35px 1fr 70px; align-items: center; min-height: 34px; border-top: 1px solid rgba(255,255,255,.055); }
    .de-con-row b, .de-small-row b { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; color: #f2d392; background: rgba(0,0,0,.38); border: 1px solid rgba(226,164,86,.42); }
    .de-con-row span, .de-small-row span { color: #f0f1ea; font-size: 20px; font-weight: 900; }
    .de-con-row em, .de-small-row em { color: #f2d392; font-size: 18px; font-weight: 900; font-style: normal; text-align: right; }

    .de-small-up { left: 26px; top: 802px; width: 242px; height: 266px; padding: 15px; }
    .de-small-down { left: 274px; top: 802px; width: 248px; height: 266px; padding: 15px; }
    .de-small-up h2 { color: #ff5750; }
    .de-small-down h2 { color: #1caf83; }
    .de-small-row { grid-template-columns: 28px 1fr 56px; min-height: 35px; }
    .de-small-row span { font-size: 16px; }
    .de-small-row em { font-size: 14px; }

    .de-high-board { left: 540px; top: 742px; width: 488px; height: 326px; padding: 22px 22px; text-align: center; }
    .de-medal { position: absolute; left: 24px; top: 18px; width: 70px; height: 70px; display: grid; place-items: center; color: #ffcf72; filter: drop-shadow(0 5px 10px rgba(0,0,0,.45)); }
    .de-medal .de-svg-icon { width: 70px; height: 70px; }
    .de-high-board h2 { text-align: left; margin-left: 82px; }
    .de-high-board h3 { margin: 8px 0 6px; color: #f2f2ee; font-size: 36px; }
    .de-high-board strong { display: block; color: #f4d18b; font-size: 72px; line-height: 1; font-weight: 900; text-shadow: 0 4px 10px rgba(0,0,0,.55); }
    .de-high-board strong span { font-size: 50px; margin-left: 5px; }
    .de-upgrade { height: 42px; line-height: 40px; margin: 14px 0 12px; border-radius: 999px; border: 1px solid rgba(222,169,92,.58); color: #f2d392; font-size: 22px; font-weight: 900; background: rgba(135,91,31,.20); }
    .de-high-board p { margin: 0; height: 34px; line-height: 34px; color: #a9aaa5; font-size: 16px; border: 1px solid rgba(255,255,255,.08); border-radius: 6px; }

    .de-watch { left: 26px; right: 26px; top: 1084px; height: 254px; padding: 22px; }
    .de-watch h2 { font-size: 31px; }
    .de-watch-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .de-watch-grid div { height: 126px; padding: 12px 12px 10px; border-radius: 8px; border: 1px solid rgba(201,144,69,.45); background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 9px; }
    .de-watch-grid span { display: block; color: #e8e8e2; font-size: 20px; font-weight: 900; }
    .de-watch-grid b { display: block; color: #ffd25d; font-size: 20px; }
    .de-watch-grid p { margin: 0; color: #aeb0ad; font-size: 15px; }

    .bullish { color: #ff5451 !important; }
    .bearish { color: #29b982 !important; }
    .bullish-bg { background: linear-gradient(180deg,#ff5252,#cf2d2e); }
    .bearish-bg { background: linear-gradient(180deg,#21bd8c,#0d8a68); }
  `;
}

function darkEditorialScript() {
  return `
    <script>
      for (const canvas of document.querySelectorAll('.de-spark')) {
        const ctx = canvas.getContext('2d');
        const seed = String(canvas.dataset.seed || 'editorial');
        const bearish = canvas.dataset.bearish === '1';
        const pct = Number(canvas.dataset.pct || 0);
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(180, rect.width || 210);
        const height = Math.max(52, rect.height || 58);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        let hash = 2166136261;
        for (let i = 0; i < seed.length; i += 1) {
          hash ^= seed.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        const rand = () => {
          hash ^= hash << 13;
          hash ^= hash >>> 17;
          hash ^= hash << 5;
          return ((hash >>> 0) % 10000) / 10000;
        };
        const sparkProfiles = {
          upA: [.70,.61,.67,.59,.73,.55,.62,.50,.68,.72,.63,.48,.42,.55,.60,.46,.65,.71,.58,.74,.62,.69,.56,.66,.72,.61,.49,.38,.45,.33,.42,.30,.37,.25,.35,.22,.29,.18,.25,.14,.19],
          upB: [.64,.55,.61,.47,.42,.57,.63,.46,.36,.44,.54,.60,.45,.32,.38,.50,.40,.27,.34,.46,.36,.25,.18,.31,.23,.15,.26,.12,.22,.10,.18,.08,.16,.06,.14,.08,.12,.05,.10,.07,.09],
          downA: [.34,.25,.36,.29,.45,.37,.53,.43,.57,.48,.52,.40,.49,.44,.56,.47,.60,.69,.55,.64,.75,.67,.80,.71,.84,.76,.88,.79,.86,.82,.90,.81,.87,.78,.91,.83,.93,.84,.90,.82,.92],
          downB: [.45,.34,.42,.30,.50,.39,.58,.46,.62,.51,.68,.54,.61,.49,.57,.66,.59,.73,.64,.78,.69,.82,.72,.86,.77,.91,.80,.88,.74,.93,.82,.90,.78,.94,.84,.92,.80,.95,.86,.91,.83]
        };
        const match = seed.match(/^(\\d+)/);
        const index = match ? Number(match[1]) : 0;
        const strongMove = Math.abs(pct) >= 1 || index % 2 === 1;
        const profile = sparkProfiles[bearish ? (strongMove ? 'downB' : 'downA') : (strongMove ? 'upB' : 'upA')];
        const step = width / (profile.length - 1);
        const pts = profile.map((value, i) => {
          const impulse = i % 5 === 0 ? (rand() - 0.5) * height * 0.14 : 0;
          const micro = (rand() - 0.5) * height * 0.085;
          const baseY = height * (0.08 + value * 0.68);
          const yVal = Math.max(height * 0.06, Math.min(height * 0.84, baseY + impulse + micro));
          return [i * step, Math.round(yVal * 10) / 10];
        });
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, bearish ? 'rgba(26,180,123,.35)' : 'rgba(255,72,70,.35)');
        grad.addColorStop(.58, bearish ? 'rgba(26,180,123,.14)' : 'rgba(255,72,70,.16)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[pts.length - 1][0], height + 2);
        ctx.lineTo(pts[0][0], height + 2);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = bearish ? '#1ab47b' : '#ff4f4b';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = bearish ? 'rgba(26,180,123,.45)' : 'rgba(255,72,70,.45)';
        ctx.shadowBlur = 2.4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    </script>
  `;
}

function renderDarkEditorialHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.report_date)} A股午评</title>
<style>${darkEditorialCss()}</style>
</head>
<body>
<main id="report-root" data-report-date="${escapeHtml(data.report_date)}" data-theme="dark-editorial-magazine">
${darkEditorialPage1(data)}
${darkEditorialPage2(data)}
</main>
${darkEditorialScript()}
</body>
</html>`;
}

function darkTerminalIndexDelta(item) {
  return item.delta_text ?? item.change_text ?? '';
}

function darkTerminalSparkCanvas(seed, pct) {
  return `<canvas class="dt-spark" width="172" height="40" data-seed="${escapeHtml(seed)}" data-pct="${escapeHtml(pct)}" data-bearish="${Number(pct) < 0 ? '1' : '0'}"></canvas>`;
}

function darkTerminalIcon(name) {
  if (name === 'market') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M8 45h39" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M10 38h7v7h-7zM19 33h7v12h-7zM28 28h7v17h-7zM37 24h7v21h-7z" fill="currentColor"/><path d="M8.5 29 19 19 28 25 43 10M43 10v10M43 10H33" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'coin') return `<svg viewBox="0 0 56 56" aria-hidden="true"><ellipse cx="28" cy="15" rx="17" ry="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M11 15v24c0 4 7.6 7 17 7s17-3 17-7V15M11 27c0 4 7.6 7 17 7s17-3 17-7M11 38c0 4 7.6 7 17 7s17-3 17-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  if (name === 'yuan') return `<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="23.4" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M20.8 18.6 28 29.4l7.2-10.8M28 29.4v10.2M21.1 31.2h13.8M21.1 36.4h13.8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'chat') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M12 14h32v24H27l-10 8v-8h-5V14Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 23h15M20 30h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  if (name === 'clock') return `<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 8v7l5 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'flame') return `<svg viewBox="0 0 48 58" aria-hidden="true"><path d="M29.6 2.8c1 10.7 12.1 15.6 12.1 31.1 0 12.8-8.8 22.2-22.1 22.2C8.2 56.1.8 48 .8 37.4c0-8.1 4.8-14.7 10.6-20.4-.3 6.5 2.2 10.4 7.3 11.2C20.6 17.4 23.8 9 29.6 2.8Z" fill="currentColor"/><path d="M23.1 52.2c-7.1 0-11.6-4.3-11.6-10.9 0-5.2 3.1-8.9 7-12.9.3 4.8 2.3 7.7 5.8 8.7 1.8-5.9 4.8-10.8 9.1-14.8 1.3 7.7 6.7 11.2 6.7 19 0 6.4-6.1 10.9-17 10.9Z" fill="#ff8a50"/></svg>`;
  if (name === 'down') return `<svg viewBox="0 0 42 42" aria-hidden="true"><path d="M21 34 9 19h8V7h8v12h8L21 34Z" fill="currentColor"/></svg>`;
  if (name === 'eye') return `<svg viewBox="0 0 42 42" aria-hidden="true"><path d="M3 21C9 10 33 10 39 21 33 32 9 32 3 21Z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/><circle cx="21" cy="21" r="6" fill="currentColor"/><circle cx="22.5" cy="19.5" r="1.6" fill="#071018"/></svg>`;
  if (name === 'trophy') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M18 10h20v8c0 10-4 16-10 16s-10-6-10-16v-8Z" fill="currentColor"/><path d="M18 14H9v5c0 6 4 10 11 10M38 14h9v5c0 6-4 10-11 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M28 34v8M18 46h20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
  if (name === 'check') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M12 29 23 40 45 16" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'pulse') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M7 30h11l6-17 9 31 6-14h10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === 'warning') return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M28 7 51 48H5L28 7Z" fill="currentColor"/><path d="M28 20v13M28 41h.1" fill="none" stroke="#071018" stroke-width="5" stroke-linecap="round"/></svg>`;
  return '';
}

function darkTerminalMiniFlames(count) {
  return Array.from({ length: count }).map(() => `<span>${lightMiniFlame()}</span>`).join('');
}

function darkTerminalLaurel() {
  return `
    <svg viewBox="0 0 74 102" aria-hidden="true">
      <path d="M58 90C34 69 25 42 42 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".45"/>
      <g fill="currentColor">
        <ellipse cx="48" cy="80" rx="5.4" ry="15" transform="rotate(-48 48 80)" opacity=".55"/>
        <ellipse cx="36" cy="67" rx="5" ry="14" transform="rotate(-36 36 67)" opacity=".55"/>
        <ellipse cx="31" cy="54" rx="4.8" ry="13" transform="rotate(-18 31 54)" opacity=".55"/>
        <ellipse cx="33" cy="40" rx="4.5" ry="12" transform="rotate(0 33 40)" opacity=".55"/>
        <ellipse cx="39" cy="27" rx="4" ry="10.8" transform="rotate(18 39 27)" opacity=".50"/>
        <ellipse cx="59" cy="70" rx="4.7" ry="12.4" transform="rotate(35 59 70)" opacity=".38"/>
        <ellipse cx="55" cy="56" rx="4.3" ry="11.5" transform="rotate(21 55 56)" opacity=".38"/>
        <ellipse cx="54" cy="42" rx="4" ry="10.5" transform="rotate(5 54 42)" opacity=".36"/>
      </g>
    </svg>
  `;
}

function darkTerminalFormatClose(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}

function darkTerminalLeadingSub(item) {
  const reason = String(item?.reason ?? '').trim();
  if (reason) return reason;
  const leaders = Array.isArray(item?.leaders) ? item.leaders.filter(Boolean) : [];
  if (leaders.length > 0) return leaders.slice(0, 3).join(' / ');
  return '';
}

function darkTerminalSignalList(signals, key) {
  const own = signals?.[key] ?? [];
  return own.slice(0, 3);
}

function darkTerminalIndexCards(indices) {
  return (indices ?? []).slice(0, 4).map((item, index) => `
    <div class="dt-index-card">
      <span>${escapeHtml(item.name)}</span>
      <strong class="${marketClass(item.pct)}">${escapeHtml(darkTerminalFormatClose(item.close))}</strong>
      <em class="${marketClass(item.pct)}">${escapeHtml(darkTerminalIndexDelta(item))}　${escapeHtml(pctText(item.pct))}</em>
      ${darkTerminalSparkCanvas(`dt-${index}:${item.name}:${item.pct}`, item.pct)}
    </div>
  `).join('');
}

function darkTerminalPage1(data) {
  const indices = data.indices ?? [];
  const up = Number(data.breadth?.up ?? 0);
  const down = Number(data.breadth?.down ?? 0);
  const total = Math.max(up + down, 1);
  const upPct = clamp(Math.round((up / total) * 1000) / 10, 0, 100);
  const downPct = Math.round((100 - upPct) * 10) / 10;
  return `
    <section class="poster dt-poster dt-page1" data-page="1" data-title="午盘全景与资金风格">
      <div class="dt-shell">
        <header class="dt-top">
          <div class="dt-badge">${darkTerminalIcon('market')}<div><b>市场中枢</b><span>${escapeHtml(data.midday_temperature_v1?.state ?? '分歧震荡')}</span></div></div>
          <div class="dt-title">
            <h1>A股午评 · 午盘全景</h1>
            <p>${darkTerminalIcon('clock')}<span>${escapeHtml(lightChineseDate(data.report_date))}</span><i></i><span>${escapeHtml(data.weekday)}</span><i></i><span>午盘收盘</span></p>
          </div>
        </header>

        <section class="dt-red-banner">
          <strong>${escapeHtml(data.market_view?.headline ?? '')}</strong>
          <span>${escapeHtml(data.market_view?.style_shift ?? '')}</span>
        </section>

        <section class="dt-panel dt-index-panel">
          <h2>主要指数</h2>
          <div class="dt-index-grid">${darkTerminalIndexCards(indices)}</div>
        </section>

        <section class="dt-panel dt-breadth-panel">
          <h2>市场宽度</h2>
          <div class="dt-breadth-count dt-up"><span>上涨家数</span><strong>${escapeHtml(up)}</strong><em>${upPct}%</em></div>
          <div class="dt-breadth-count dt-down"><span>下跌家数</span><strong>${escapeHtml(down)}</strong><em>${downPct}%</em></div>
          <div class="dt-breadth-bar"><i class="bullish-bg" style="width:${upPct}%"></i><i class="bearish-bg" style="width:${downPct}%"></i><b style="left:${upPct}%"></b></div>
          <div class="dt-breadth-foot"><span>涨跌比　${escapeHtml(data.breadth?.ratio_text?.replace('涨跌比 ', '') ?? '--')}</span><span>${escapeHtml(data.breadth?.notable ?? '')}</span><span>涨停　<b class="bullish">${escapeHtml(data.limit_up?.limit_up ?? '--')}</b></span><span>跌停　<b class="bearish">${escapeHtml(data.limit_up?.limit_down ?? '--')}</b></span></div>
        </section>

        <section class="dt-panel dt-turnover-panel">
          <div class="dt-round cyan">${darkTerminalIcon('coin')}</div>
          <div><h2>两市半日成交</h2><strong>${escapeHtml(data.turnover?.amount_text ?? '--')}</strong><p>${escapeHtml(data.turnover?.change_text ?? '')}</p></div>
        </section>

        <section class="dt-panel dt-money-panel">
          <div class="dt-round gold">${darkTerminalIcon('yuan')}</div>
          <div><h2>资金风向 <em>（半日）</em></h2><p><span>${escapeHtml(data.capital_flow?.metric_name ?? '主力资金')}</span><b>${escapeHtml(data.capital_flow?.net_text ?? '--')}</b></p><p><span>北向资金</span><b>${escapeHtml(data.capital_flow?.northbound_text ?? '--')}</b></p></div>
        </section>

        <section class="dt-panel dt-map-panel">
          <h2>资金风格地图 <em>资金偏好（半日净流入分布）</em></h2>
          <div class="dt-map-grid">
            ${(data.capital_flow?.receiving_directions ?? []).slice(0, 3).map((d) => `<div class="hot"><span>${escapeHtml(d.name)}</span><b>${escapeHtml(d.amount_text ?? '')}</b></div>`).join('')}
            ${(data.capital_flow?.selling_directions ?? []).slice(0, 2).map((d) => `<div class="cold"><span>${escapeHtml(d.name)}</span><b>${escapeHtml(d.amount_text ?? '')}</b></div>`).join('')}
          </div>
        </section>

        <section class="dt-panel dt-view-panel">
          <div class="dt-round filled">${darkTerminalIcon('chat')}</div>
          <div>
            <h2>午后观点</h2>
            <p>${escapeHtml(data.midday_interpretation?.core_judgment ?? '')}</p>
          </div>
        </section>

        <footer class="dt-footer">数据来源：公开市场数据　｜　仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function darkTerminalThemeRows(items, options = {}) {
  const rows = (items ?? []).slice(0, options.limit ?? 7);
  const values = rows.map((item) => Math.abs(Number(item.pct ?? 0))).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  return rows.map((item, index) => {
    const width = clamp(Math.round((Math.abs(Number(item.pct ?? 0)) / max) * 100), 8, 100);
    const cls = options.negative ? 'bearish' : 'bullish';
    const heat = [5, 4, 3, 3, 3, 3, 2][index] ?? 2;
    return `
      <div class="dt-theme-row">
        <b>${index + 1}</b>
        <div class="dt-theme-copy"><span class="dt-theme-name">${escapeHtml(item.name)}</span>${options.withReason ? `<small class="dt-theme-reason">(${escapeHtml(darkTerminalLeadingSub(item))})</small>` : ''}</div>
        <em class="${cls}">${escapeHtml(pctText(item.pct))}</em>
        ${options.withHeat ? `<i><u style="width:${width}%"></u></i><div class="dt-heat">${darkTerminalMiniFlames(heat)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function darkTerminalMetricBox(label, value, sub, cls = 'bullish') {
  return `<div class="dt-metric ${cls}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><em>${escapeHtml(sub)}</em></div>`;
}

function darkTerminalConcentrationRows(items) {
  return (items ?? []).slice(0, 3).map((item, index) => `
    <div class="dt-focus-row">
      <b>${index + 1}</b>
      <div><span>${escapeHtml(item.name)}</span><small>${escapeHtml((item.leaders ?? []).slice(0, 3).join('/'))}涨停</small></div>
      <em>${escapeHtml(item.count ?? '--')}只+</em>
    </div>
  `).join('');
}

function darkTerminalSignalCard(icon, title, cls, items) {
  return `
    <div class="dt-signal-card ${cls}">
      <h3>${darkTerminalIcon(icon)}<span>${escapeHtml(title)}</span></h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `;
}

function darkTerminalPage2(data) {
  const confirm = darkTerminalSignalList(data.afternoon_signals, '确认信号');
  const weaken = darkTerminalSignalList(data.afternoon_signals, '弱化信号');
  const risk = darkTerminalSignalList(data.afternoon_signals, '风险信号');
  const note = leadingThemeNote(data);
  return `
    <section class="poster dt-poster dt-page2" data-page="2" data-title="题材温度与涨跌停结构">
      <div class="dt-shell">
        <header class="dt-p2-head">
          <h1><span>题材温度</span> · 涨跌停结构</h1>
          <p>${darkTerminalIcon('clock')}<span>${escapeHtml(lightChineseDate(data.report_date))}</span><i></i><span>${escapeHtml(data.weekday)}</span><i></i><span>午盘收盘</span></p>
        </header>

        <section class="dt-panel dt-hot-panel">
          <h2>${darkTerminalIcon('flame')}<span>题材温度榜</span><em>TOP7</em></h2>
          <div class="dt-hot-head"><span>题材</span><span>涨幅</span><span>热度</span></div>
          ${darkTerminalThemeRows(data.themes?.leading, { limit: 7, withReason: true, withHeat: true })}
          <div class="dt-hot-note"><b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.subtitle)}</span></div>
        </section>

        <section class="dt-panel dt-structure-panel">
          <h2>涨跌停结构</h2>
          <div class="dt-metrics">
            ${darkTerminalMetricBox('涨停家数', String(data.limit_up?.limit_up ?? '--'), data.limit_up?.display口径 ?? '', 'bullish')}
            ${darkTerminalMetricBox('跌停家数', String(data.limit_up?.limit_down ?? '--'), '', 'bearish')}
            ${darkTerminalMetricBox('封板率', `${data.limit_up?.seal_rate_pct ?? '--'}%`, `炸板${data.limit_up?.broken_board ?? '--'}只`, 'bullish')}
            ${darkTerminalMetricBox('连板高度', `${data.ladder?.highest_board ?? '--'}连板`, data.ladder?.highest_stock ?? '', 'bullish')}
          </div>
          <div class="dt-highest">
            <h3>${darkTerminalIcon('trophy')}<span>最高连板</span></h3>
            <div class="dt-highest-main"><span class="dt-laurel">${darkTerminalLaurel()}</span><b>${escapeHtml(highestBoardStockLabel(data, 1))}</b><strong>${escapeHtml(data.ladder?.highest_board ?? '--')}连板</strong><span class="dt-laurel right">${darkTerminalLaurel()}</span></div>
            <p>${escapeHtml(boardTransitionText(data, ' ＞ '))}　${escapeHtml(boardActionText(data))}</p>
            <em>${escapeHtml(ladderSummaryText(data))}</em>
          </div>
        </section>

        <section class="dt-panel dt-lagging-panel">
          <h2>${darkTerminalIcon('down')}<span>领跌板块</span><em>TOP5</em></h2>
          ${darkTerminalThemeRows(data.themes?.lagging, { limit: 5, negative: true })}
        </section>

        <section class="dt-panel dt-focus-panel">
          <h2>${darkTerminalIcon('flame')}<span>涨停集中题材</span><em>TOP3</em></h2>
          ${darkTerminalConcentrationRows(data.themes?.concentrated_limit_up)}
        </section>

        <section class="dt-panel dt-signal-panel">
          <h2>${darkTerminalIcon('eye')}<span>午后验证信号</span><em>（重点观察）</em></h2>
          <div class="dt-signal-grid">
            ${darkTerminalSignalCard('check', '确认信号', 'confirm', confirm)}
            ${darkTerminalSignalCard('pulse', '走弱信号', 'weaken', weaken)}
            ${darkTerminalSignalCard('warning', '风险信号', 'risk', risk)}
          </div>
        </section>

        <footer class="dt-footer">数据来源：公开市场数据　｜　仅供复盘，不构成投资建议</footer>
      </div>
    </section>
  `;
}

function darkTerminalCss() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: #080b0d; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    #report-root { display: flex; align-items: flex-start; gap: 0; background: #080b0d; }
    .dt-poster {
      width: 1080px;
      height: 1440px;
      flex: 0 0 1080px;
      position: relative;
      overflow: hidden;
      color: #edf4f2;
      background:
        radial-gradient(circle at 16% 2%, rgba(51,167,229,.14), transparent 30%),
        radial-gradient(circle at 62% 22%, rgba(255,75,69,.10), transparent 28%),
        linear-gradient(135deg, #071018 0%, #0b1821 46%, #05080b 100%);
    }
    .dt-poster::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(86,188,232,.055) 1px, transparent 1px),
        linear-gradient(180deg, rgba(86,188,232,.042) 1px, transparent 1px);
      background-size: 54px 54px;
      opacity: .26;
      pointer-events: none;
    }
    .dt-poster::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,.38) 100%);
      pointer-events: none;
    }
    .dt-shell {
      position: absolute;
      inset: 14px;
      border: 1.5px solid rgba(112,151,172,.55);
      border-radius: 7px;
      background: linear-gradient(135deg, rgba(6,15,22,.62), rgba(8,20,28,.36));
      box-shadow: inset 0 0 80px rgba(20,126,176,.08), 0 0 26px rgba(0,0,0,.30);
      z-index: 1;
    }
    .dt-panel {
      position: absolute;
      border: 1px solid rgba(88,118,142,.55);
      border-radius: 6px;
      background: linear-gradient(145deg, rgba(13,29,40,.88), rgba(8,18,26,.82));
      box-shadow: inset 0 0 36px rgba(27,124,176,.07);
      overflow: hidden;
    }
    .dt-page1 .dt-panel { border: 1px solid #5a431c; }
    .dt-structure-panel, .dt-focus-panel, .dt-signal-panel { border: 1px solid #5a431c; }
    .dt-panel h2 { margin: 0; color: #f1c15c; font-size: 26px; line-height: 1; font-weight: 900; }
    .dt-top { position: absolute; left: 16px; right: 16px; top: 28px; height: 122px; display: flex; align-items: flex-start; }
    .dt-badge { width: 216px; height: 90px; border: 1px solid rgba(255,74,68,.62); border-radius: 6px; background: linear-gradient(135deg, rgba(147,34,29,.64), rgba(25,20,22,.82)); display: grid; grid-template-columns: 76px 1fr; align-items: center; color: #ff5148; }
    .dt-badge svg { width: 54px; height: 54px; margin-left: 12px; }
    .dt-badge b { display: block; color: #f7e1b8; font-size: 22px; line-height: 1; }
    .dt-badge span { display: block; margin-top: 7px; color: #ff4b45; font-size: 22px; font-weight: 900; }
    .dt-title { margin-left: 38px; }
    .dt-title h1, .dt-p2-head h1 { margin: 0; color: #efe1c2; font-size: 64px; line-height: 1.02; letter-spacing: 0; font-family: "Microsoft YaHei", "PingFang SC", "Heiti SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif; font-weight: 900; }
    .dt-title h1 { font-family: "Microsoft YaHei", "PingFang SC", "Heiti SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif; font-weight: 900; color: #efe1c2; }
    .dt-title p, .dt-p2-head p { display: flex; align-items: center; gap: 15px; margin: 12px 0 0; color: #b9bec0; font-size: 20px; }
    .dt-title svg, .dt-p2-head svg { width: 23px; height: 23px; color: #f4bc51; }
    .dt-title i, .dt-p2-head i { display: block; width: 1px; height: 20px; background: rgba(184,190,194,.72); }
    .dt-red-banner { position: absolute; left: 16px; right: 16px; top: 164px; min-height: 125px; border: 1px solid rgba(255,74,68,.60); border-radius: 6px; background: linear-gradient(135deg, rgba(132,27,25,.72), rgba(59,17,17,.74)); text-align: center; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: stretch; padding: 14px 24px; gap: 8px; }
    .dt-red-banner::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 200px; background: repeating-linear-gradient(45deg, rgba(255,70,62,.16) 0 2px, transparent 2px 16px); opacity: .7; pointer-events: none; }
    .dt-red-banner strong { position: relative; display: block; color: #f2e9da; font-size: 36px; line-height: 1.05; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dt-red-banner span { position: relative; display: block; color: #e9d9ca; font-size: 19px; line-height: 1.32; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .dt-index-panel { left: 16px; right: 16px; top: 305px; height: 250px; padding: 22px 16px; }
    .dt-index-panel > h2, .dt-breadth-panel > h2 { color: #efe9dd; }
    .dt-index-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 13px; }
    .dt-index-card { position: relative; height: 172px; border: 1px solid rgba(111,141,158,.46); border-radius: 6px; background: linear-gradient(180deg, rgba(8,18,25,.78), rgba(10,23,30,.92)); padding: 20px 18px; overflow: hidden; }
    .dt-index-card span { display: block; text-align: center; color: #dfd9d1; font-size: 19px; }
    .dt-index-card strong { display: block; margin-top: 10px; text-align: center; font-size: 34px; line-height: 1; }
    .dt-index-card em { display: block; margin-top: 8px; text-align: center; font-size: 17px; line-height: 1; font-style: normal; }
    .dt-spark { position: absolute; left: 16px; right: 16px; bottom: 4px; width: calc(100% - 32px); height: 48px; }
    .dt-breadth-panel { left: 16px; right: 16px; top: 563px; height: 234px; padding: 23px 18px; }
    .dt-breadth-count { position: absolute; top: 78px; color: #f2efe9; }
    .dt-breadth-count span { display: block; font-size: 19px; color: #b58a3e; font-weight: 700; }
    .dt-down span { color: #5dc7f4; }
    .dt-breadth-count strong { display: inline-block; margin-top: 4px; font-size: 42px; line-height: .95; }
    .dt-breadth-count em { display: block; margin-top: 6px; font-size: 18px; font-style: normal; }
    .dt-up { left: 18px; }
    .dt-down { right: 18px; text-align: right; }
    .dt-up strong, .dt-up em { color: #ff4b55; }
    .dt-down strong, .dt-down em { color: #36d78d; }
    .dt-breadth-bar { position: absolute; left: 132px; right: 132px; top: 108px; height: 26px; display: flex; border-radius: 999px; overflow: visible; background: rgba(255,255,255,.12); }
    .dt-breadth-bar i:first-child { border-radius: 999px 0 0 999px; }
    .dt-breadth-bar i:nth-child(2) { border-radius: 0 999px 999px 0; }
    .dt-breadth-bar b { display: none; position: absolute; top: 10px; width: 1px; height: 63px; background: rgba(255,74,68,.62); }
    .dt-breadth-bar b::before { content: ""; position: absolute; left: -4px; top: -7px; width: 9px; height: 9px; border-radius: 50%; background: #f3e6d0; }
    .dt-breadth-foot { position: absolute; left: 124px; right: 124px; bottom: 28px; display: grid; grid-template-columns: 1fr 1fr .7fr .7fr; color: #b9bfc1; font-size: 18px; text-align: center; }
    .dt-breadth-foot span { border-right: 1px solid rgba(185,191,193,.34); }
    .dt-breadth-foot span:last-child { border-right: 0; }
    .dt-turnover-panel { left: 16px; top: 803px; width: 472px; height: 191px; display: grid; grid-template-columns: 76px 1fr; gap: 16px; padding: 30px 22px; }
    .dt-money-panel { left: 493px; right: 16px; top: 803px; height: 191px; display: grid; grid-template-columns: 76px 1fr; gap: 16px; padding: 24px 22px; }
    .dt-round { width: 58px; height: 58px; border-radius: 50%; border: 1.5px solid currentColor; display: grid; place-items: center; }
    .dt-round svg { width: 38px; height: 38px; }
    .dt-round.cyan { color: #5dc7f4; }
    .dt-round.gold { color: #f0bd58; border-color: transparent; }
    .dt-round.gold svg { width: 58px; height: 58px; }
    .dt-round.filled { color: #83d2ff; background: rgba(44,122,176,.28); border-color: #66c3f3; }
    .dt-turnover-panel h2, .dt-money-panel h2, .dt-view-panel h2 { color: #f4c15d; font-size: 25px; }
    .dt-view-panel h2 { color: #3a8cc4; }
    .dt-turnover-panel strong { display: block; margin-top: 13px; color: #ff4b55; font-size: 53px; line-height: 1; }
    .dt-turnover-panel p { margin: 9px 0 0; color: #babfc0; font-size: 18px; }
    .dt-turnover-panel p b, .dt-money-panel b { color: #ff5148; font-weight: 500; }
    .dt-money-panel h2 em { color: #c5c2bb; font-size: 19px; font-style: normal; font-weight: 400; }
    .dt-money-panel p { display: flex; justify-content: space-between; margin: 6px 0 0; padding-bottom: 4px; border-bottom: 1px solid rgba(185,191,193,.16); color: #c6c8c8; font-size: 17px; }
    .dt-map-panel { left: 16px; right: 16px; top: 1004px; height: 180px; padding: 20px 14px; }
    .dt-map-panel h2 em { margin-left: 13px; color: #aeb9bc; font-size: 15px; font-style: normal; font-weight: 400; }
    .dt-map-grid { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 22px; min-height: 82px; border: 1px solid rgba(195,118,54,.35); border-radius: 4px; overflow: hidden; }
    .dt-map-grid div { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 6px 6px; border-right: 1px solid rgba(217,126,64,.55); color: #eaded1; text-align: center; }
    .dt-map-grid div:last-child { border-right: 0; }
    .dt-map-grid .hot { background: linear-gradient(180deg, rgba(108,30,26,.72), rgba(62,21,19,.72)); }
    .dt-map-grid .cold { background: linear-gradient(180deg, rgba(15,79,57,.74), rgba(10,45,39,.74)); }
    .dt-map-grid span { font-size: 15px; line-height: 1.15; }
    .dt-map-grid b { font-size: 18px; line-height: 1.22; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .dt-map-grid .hot b { color: #ff4b55; }
    .dt-map-grid .cold b { color: #36d78d; }
    .dt-view-panel { left: 16px; right: 16px; top: 1196px; height: 166px; display: grid; grid-template-columns: 72px 1fr; gap: 14px; padding: 24px 22px; }
    .dt-view-panel p { margin: 6px 0 0; color: #d0d0cc; font-size: 17px; line-height: 1.32; }
    .dt-footer { position: absolute; left: 16px; right: 16px; bottom: 8px; color: #b8bcbf; font-size: 16px; text-align: center; letter-spacing: 1px; }
    .dt-p2-head { position: absolute; left: 20px; right: 20px; top: 43px; height: 110px; text-align: center; }
    .dt-p2-head h1 { color: #f0e2ce; font-size: 66px; }
    .dt-p2-head h1 span { color: #bff3ff; }
    .dt-p2-head p { justify-content: center; margin-top: 10px; }
    .dt-hot-panel { left: 16px; top: 163px; width: 584px; height: 602px; padding: 20px 14px; }
    .dt-hot-panel h2, .dt-lagging-panel h2, .dt-focus-panel h2, .dt-signal-panel h2 { display: flex; align-items: center; gap: 9px; font-size: 23px; }
    .dt-hot-panel h2 { font-size: 25px; }
    .dt-hot-panel h2 svg, .dt-focus-panel h2 svg { width: 28px; height: 28px; color: #ff5249; }
    .dt-lagging-panel h2 svg, .dt-signal-panel h2 svg { width: 26px; height: 26px; color: #4bbaff; }
    .dt-hot-panel h2 em, .dt-lagging-panel h2 em, .dt-focus-panel h2 em, .dt-signal-panel h2 em { color: #d4d3cb; font-style: normal; font-size: 19px; font-weight: 500; }
    .dt-lagging-panel h2 { color: #3a8cc4; }
    .dt-focus-panel h2 { color: #ff5249; }
    .dt-signal-panel h2 { color: #d4d3cb; }
    .dt-hot-panel h2, .dt-structure-panel h2, .dt-highest h3 { font-family: "Microsoft YaHei", "PingFang SC", "Heiti SC", "Noto Sans CJK SC", sans-serif; color: #f1c15c; font-weight: 900; }
    .dt-highest h3 svg { color: #c8862e; }
    .dt-hot-head { display: grid; grid-template-columns: 38px minmax(0, 1fr) 100px 82px 86px; align-items: end; margin-top: 12px; padding-bottom: 9px; border-bottom: 1px solid rgba(101,132,148,.35); color: #b8bec0; font-size: 17px; }
    .dt-hot-head span:first-child { grid-column: 1 / 3; }
    .dt-hot-head span:nth-child(2) { grid-column: 3; text-align: right; padding-right: 8px; }
    .dt-hot-head span:nth-child(3) { grid-column: 5; text-align: left; padding-left: 3px; }
    .dt-theme-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) 100px 82px 86px; align-items: center; min-height: 57px; border-bottom: 1px solid rgba(101,132,148,.20); color: #e9eee9; }
    .dt-theme-row > * { min-width: 0; }
    .dt-theme-row > b { width: 31px; height: 31px; border: 1px solid #dd9c38; border-radius: 4px; display: grid; place-items: center; color: #ffc15d; font-size: 21px; overflow: visible; }
    .dt-theme-row span { display: block; font-size: 20px; font-weight: 900; }
    .dt-theme-row small { display: block; margin-top: 3px; color: #aab2b5; font-size: 14px; white-space: nowrap; }
    .dt-hot-panel .dt-theme-row .dt-theme-copy { display: grid; grid-template-rows: auto auto; gap: 3px; min-width: 0; overflow: hidden; }
    .dt-hot-panel .dt-theme-name,
    .dt-hot-panel .dt-theme-reason { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dt-hot-panel .dt-theme-name { font-size: 20px; line-height: 1.05; }
    .dt-hot-panel .dt-theme-reason { margin-top: 0; font-size: 12px; line-height: 1.05; }
    .dt-theme-row em { font-size: 25px; font-style: normal; text-align: right; font-weight: 900; padding-right: 18px; overflow: hidden; }
    .dt-theme-row i { display: block; height: 14px; margin-left: 14px; margin-right: 8px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
    .dt-theme-row i u { display: block; height: 100%; background: linear-gradient(90deg, #ff4d49, #ff6457); }
    .dt-heat { display: flex; justify-content: flex-start; align-items: center; gap: 4px; padding-left: 3px; overflow: hidden; }
    .dt-heat span { width: 11px; height: 16px; display: block; }
    .dt-heat svg { width: 100%; height: 100%; display: block; }
    .dt-hot-note { position: absolute; left: 14px; right: 14px; bottom: 20px; height: 70px; border: 1px solid rgba(182,128,47,.34); border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 16px; background: linear-gradient(90deg, rgba(124,88,25,.12), rgba(243,194,89,.12), rgba(124,88,25,.12)); overflow: hidden; }
    .dt-hot-note b { color: #ffc15d; font-size: 20px; white-space: nowrap; }
    .dt-hot-note span { color: #f1d99f; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dt-structure-panel { left: 608px; right: 16px; top: 163px; height: 602px; padding: 20px 14px; }
    .dt-structure-panel h2 { font-size: 23px; }
    .dt-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 14px; }
    .dt-metric { height: 152px; border: 1px solid rgba(255,75,69,.56); border-radius: 6px; text-align: center; padding-top: 24px; background: linear-gradient(180deg, rgba(116,30,27,.78), rgba(62,18,17,.72)); }
    .dt-metric.bearish { border-color: rgba(37,190,134,.50); background: linear-gradient(180deg, rgba(13,86,64,.86), rgba(10,50,43,.78)); }
    .dt-metric span { display: block; color: #e6ded4; font-size: 18px; }
    .dt-metric strong { display: block; margin-top: 10px; color: #efe7df; font-size: 53px; line-height: .9; text-shadow: 0 2px 0 rgba(0,0,0,.38); }
    .dt-metric em { display: block; margin-top: 12px; color: #d6d4cd; font-size: 17px; font-style: normal; }
    .dt-metric:nth-child(n+3) { height: 136px; padding-top: 22px; background: rgba(8,18,25,.60); }
    .dt-metric:nth-child(n+3) strong { color: #ff4b55; font-size: 38px; }
    .dt-highest { position: absolute; left: 14px; right: 14px; bottom: 20px; height: 186px; border: 1px solid rgba(182,128,47,.40); border-radius: 6px; background: linear-gradient(145deg, rgba(12,28,36,.74), rgba(8,17,24,.82)); text-align: center; }
    .dt-highest h3 { display: flex; align-items: center; gap: 9px; margin: 12px 0 0 15px; font-size: 22px; }
    .dt-highest h3 svg { width: 28px; height: 28px; color: #f3bd54; }
    .dt-highest-main { display: grid; grid-template-columns: 58px 1fr 92px 58px; align-items: center; gap: 8px; margin: -8px 24px 0; }
    .dt-laurel { width: 62px; height: 86px; color: rgba(158,112,52,.74); }
    .dt-laurel svg { width: 100%; height: 100%; display: block; }
    .dt-laurel.right { transform: scaleX(-1); }
    .dt-highest-main b { color: #f2eee8; font-size: 28px; }
    .dt-highest-main strong { color: #ffc15d; font-size: 34px; }
    .dt-highest p { margin: -8px 0 0; color: #e9ddd0; font-size: 18px; }
    .dt-highest em { display: block; margin-top: 7px; color: #aeb4b5; font-size: 14px; font-style: normal; }
    .dt-lagging-panel { left: 16px; top: 784px; width: 400px; height: 308px; padding: 20px 14px; }
    .dt-lagging-panel .dt-theme-row { grid-template-columns: 34px 1fr 80px; min-height: 49px; }
    .dt-lagging-panel .dt-theme-row small, .dt-lagging-panel .dt-theme-row i, .dt-lagging-panel .dt-heat { display: none; }
    .dt-lagging-panel .dt-theme-row em { font-size: 19px; color: #36d78d !important; }
    .dt-focus-panel { left: 424px; right: 16px; top: 784px; height: 308px; padding: 20px 16px; }
    .dt-focus-row { display: grid; grid-template-columns: 34px 1fr 78px; align-items: center; min-height: 70px; border-top: 1px solid rgba(101,132,148,.20); }
    .dt-focus-row b { color: #ffc15d; font-size: 23px; }
    .dt-focus-row span { display: block; color: #f1f3ec; font-size: 22px; font-weight: 900; }
    .dt-focus-row small { display: block; margin-top: 4px; color: #9aa5aa; font-size: 14px; }
    .dt-focus-row em { color: #ffc15d; font-size: 22px; font-style: normal; text-align: right; }
    .dt-signal-panel { left: 16px; right: 16px; top: 1108px; height: 262px; padding: 20px 14px; }
    .dt-signal-panel h2 span { color: #d4d3cb; font-size: 25px; }
    .dt-signal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .dt-signal-card { height: 170px; border: 1px solid rgba(101,132,148,.42); border-radius: 6px; background: rgba(8,18,25,.58); padding: 20px 18px; }
    .dt-signal-card h3 { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; font-size: 22px; }
    .dt-signal-card h3 svg { width: 34px; height: 34px; }
    .dt-signal-card ul { margin: 0; padding: 0; list-style: none; }
    .dt-signal-card li { position: relative; margin: 5px 0 0 17px; color: #d3d4ce; font-size: 17px; line-height: 1.1; }
    .dt-signal-card li::before { content: ""; position: absolute; left: -16px; top: 5px; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
    .dt-signal-card.confirm h3, .dt-signal-card.confirm li::before { color: #5cd38b; }
    .dt-signal-card.weaken h3, .dt-signal-card.weaken li::before { color: #ffb742; }
    .dt-signal-card.risk h3, .dt-signal-card.risk li::before { color: #ff5b4e; }
    .bullish { color: #ff4b55 !important; }
    .bearish { color: #36d78d !important; }
    .bullish-bg { background: linear-gradient(90deg,#ff4b55,#f13436); }
    .bearish-bg { background: linear-gradient(90deg,#157b56,#35c984); }
  `;
}

function darkTerminalScript() {
  return `
    <script>
      for (const canvas of document.querySelectorAll('.dt-spark')) {
        const ctx = canvas.getContext('2d');
        const seed = String(canvas.dataset.seed || 'terminal');
        const bearish = canvas.dataset.bearish === '1';
        const pct = Number(canvas.dataset.pct || 0);
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(150, rect.width || 172);
        const height = Math.max(36, rect.height || 45);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        let hash = 2166136261;
        for (let i = 0; i < seed.length; i += 1) {
          hash ^= seed.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        const rand = () => {
          hash ^= hash << 13;
          hash ^= hash >>> 17;
          hash ^= hash << 5;
          return ((hash >>> 0) % 10000) / 10000;
        };
        let y = bearish ? height * 0.32 : height * 0.66;
        const sparkProfiles = {
          upA: [.70,.61,.67,.59,.73,.55,.62,.50,.68,.72,.63,.48,.42,.55,.60,.46,.65,.71,.58,.74,.62,.69,.56,.66,.72,.61,.49,.38,.45,.33,.42,.30,.37,.25,.35,.22,.29,.18,.25,.14,.19],
          upB: [.64,.55,.61,.47,.42,.57,.63,.46,.36,.44,.54,.60,.45,.32,.38,.50,.40,.27,.34,.46,.36,.25,.18,.31,.23,.15,.26,.12,.22,.10,.18,.08,.16,.06,.14,.08,.12,.05,.10,.07,.09],
          downA: [.34,.25,.36,.29,.45,.37,.53,.43,.57,.48,.52,.40,.49,.44,.56,.47,.60,.69,.55,.64,.75,.67,.80,.71,.84,.76,.88,.79,.86,.82,.90,.81,.87,.78,.91,.83,.93,.84,.90,.82,.92],
          downB: [.45,.34,.42,.30,.50,.39,.58,.46,.62,.51,.68,.54,.61,.49,.57,.66,.59,.73,.64,.78,.69,.82,.72,.86,.77,.91,.80,.88,.74,.93,.82,.90,.78,.94,.84,.92,.80,.95,.86,.91,.83]
        };
        const match = seed.match(/^dt-(\\d+)/);
        const index = match ? Number(match[1]) : 0;
        const strongMove = Math.abs(pct) >= 1 || index % 2 === 1;
        const profileKey = bearish ? (strongMove ? 'downB' : 'downA') : (strongMove ? 'upB' : 'upA');
        const profile = sparkProfiles[profileKey];
        let pts = [];
        if (profile) {
          const step = width / (profile.length - 1);
          pts = profile.map((value, i) => {
            const impulse = i % 5 === 0 ? (rand() - 0.5) * height * 0.14 : 0;
            const micro = (rand() - 0.5) * height * 0.085;
            const yVal = Math.max(height * 0.08, Math.min(height * 0.94, height * value + impulse + micro));
            return [i * step, Math.round(yVal * 10) / 10];
          });
        } else {
          const count = 36;
          const step = width / (count - 1);
          const trend = bearish
            ? Math.min(0.42, 0.18 + Math.abs(pct) * 0.12)
            : -Math.min(0.52, 0.20 + Math.abs(pct) * 0.05);
          for (let i = 0; i < count; i += 1) {
            const micro = (rand() - 0.5) * 4.1;
            const pulse = Math.sin(i * 1.35 + rand() * 2.8) * 0.95;
            const snap = i % 7 === 0 ? (rand() - 0.5) * 2.4 : 0;
            y += trend + micro + pulse + snap;
            y = Math.max(height * 0.16, Math.min(height * 0.84, y));
            pts.push([i * step, Math.round(y * 10) / 10]);
          }
        }
        const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
        if (bearish) {
          fillGradient.addColorStop(0, 'rgba(54,215,141,.22)');
          fillGradient.addColorStop(.58, 'rgba(54,215,141,.10)');
          fillGradient.addColorStop(1, 'rgba(54,215,141,0)');
        } else {
          fillGradient.addColorStop(0, 'rgba(255,75,85,.24)');
          fillGradient.addColorStop(.58, 'rgba(255,75,85,.12)');
          fillGradient.addColorStop(1, 'rgba(255,75,85,0)');
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.lineTo(pts[pts.length - 1][0], height + 2);
        ctx.lineTo(pts[0][0], height + 2);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.strokeStyle = bearish ? '#36d78d' : '#ff4b55';
        ctx.lineWidth = 1.7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = bearish ? 'rgba(54,215,141,.45)' : 'rgba(255,75,85,.45)';
        ctx.shadowBlur = 2.4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    </script>
  `;
}

function renderDarkTerminalHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.report_date)} A股午评</title>
<style>${darkTerminalCss()}</style>
</head>
<body>
<main id="report-root" data-report-date="${escapeHtml(data.report_date)}" data-theme="dark-terminal-magazine">
${darkTerminalPage1(data)}
${darkTerminalPage2(data)}
</main>
${darkTerminalScript()}
</body>
</html>`;
}

export function renderReportHtml(data, options = {}) {
  const theme = resolveTheme(options.theme ?? data.theme);
  if (theme.id === 'dark-editorial-magazine') return renderDarkEditorialHtml(data);
  if (theme.id === 'light-institutional-report') return renderLightInstitutionalHtml(data);
  if (theme.id === 'dark-terminal-magazine') return renderDarkTerminalHtml(data);
  throw new Error(`Unsupported theme id: ${theme.id}`);
}

export async function runBrowserPreflight(page) {
  return await page.evaluate(() => {
    const errors = [];
    const posters = Array.from(document.querySelectorAll('.poster'));
    if (posters.length !== 2) errors.push(`expected 2 posters, found ${posters.length}`);
    for (const poster of posters) {
      const pageNo = poster.getAttribute('data-page');
      const rect = poster.getBoundingClientRect();
      if (Math.round(rect.width) !== 1080 || Math.round(rect.height) !== 1440) {
        errors.push(`page ${pageNo}: poster size ${Math.round(rect.width)}x${Math.round(rect.height)} is not 1080x1440`);
      }
      const safe = { left: rect.left + 32, right: rect.right - 32, top: rect.top + 32, bottom: rect.bottom - 32 };
      const nodes = Array.from(poster.querySelectorAll('.panel, .li-panel, .de-panel, .dt-panel, .metric-card, .quality-card, .signal-card, .dt-signal-card, .li-index-card, .de-index-card, .dt-index-card, .footer, .li-footer, .de-footer, .dt-footer'));
      for (const el of nodes) {
        const overflowX = el.scrollWidth > el.clientWidth + 8;
        const overflowY = el.scrollHeight > el.clientHeight + 8;
        if (overflowX || overflowY) {
          const snippet = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
          errors.push(`page ${pageNo}: overflow ${overflowX ? 'x' : ''}${overflowY ? 'y' : ''} at ${el.className || el.tagName}: ${snippet}`);
        }
        const r = el.getBoundingClientRect();
        const isFooter = el.tagName === 'FOOTER' || Array.from(el.classList).some((name) => name.includes('footer'));
        if (!isFooter && (r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1)) {
          const snippet = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
          errors.push(`page ${pageNo}: safe-area violation at ${el.className || el.tagName}: ${snippet}`);
        }
      }
    }
    return errors;
  });
}

export async function loadPlaywright() {
  try {
    return require('playwright');
  } catch (firstError) {
    for (const root of (process.env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean)) {
      const pnpmDir = path.join(root, '.pnpm');
      if (!existsSync(pnpmDir)) continue;
      for (const entry of readdirSync(pnpmDir)) {
        if (!entry.startsWith('playwright@')) continue;
        const candidate = path.join(pnpmDir, entry, 'node_modules', 'playwright');
        if (!existsSync(candidate)) continue;
        try {
          return require(candidate);
        } catch {
          // Try the next pnpm candidate.
        }
      }
    }
    throw new Error(`Playwright is required for PNG export. Set NODE_PATH to bundled node_modules or install playwright. Original error: ${firstError.message}`);
  }
}

function findSystemBrowser() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

export async function launchChromium() {
  const { chromium } = await loadPlaywright();
  try {
    return await chromium.launch({ headless: true });
  } catch (firstError) {
    const executablePath = findSystemBrowser();
    if (!executablePath) throw firstError;
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (fallbackError) {
      throw new Error(`Unable to launch Playwright browser. Default error: ${firstError.message}. System browser fallback error: ${fallbackError.message}`);
    }
  }
}

async function exportPngs(htmlPath, outDir, reportDate) {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts?.ready);
    const preflightErrors = await runBrowserPreflight(page);
    if (preflightErrors.length) throw new Error(`Browser preflight failed:\n${preflightErrors.map((x) => `- ${x}`).join('\n')}`);
    for (let pageNo = 1; pageNo <= 2; pageNo += 1) {
      const element = await page.locator(`.poster[data-page="${pageNo}"]`).elementHandle();
      const pngPath = path.join(outDir, outputPngName(reportDate, pageNo));
      await element.screenshot({ path: pngPath });
      const size = await readPngDimensions(pngPath);
      if (size.width !== 1080 || size.height !== 1440) {
        throw new Error(`${pngPath} exported at ${size.width}x${size.height}, expected 1080x1440`);
      }
    }
  } finally {
    await browser.close();
  }
}

export async function renderReport({ dataPath, outDir, themeName, htmlOnly = false }) {
  const data = await readJsonFile(dataPath);
  if (themeName) data.theme = themeName;
  const schemaValidation = await validateMiddayDataAgainstSchema(data);
  if (schemaValidation.errors.length) {
    printValidationResult(schemaValidation);
    throw new Error('midday-data JSON Schema validation failed');
  }
  const validation = validateMiddayData(data);
  if (validation.errors.length) {
    printValidationResult(validation);
    throw new Error('midday-data validation failed');
  }
  const targetDir = outDir ?? path.dirname(dataPath);
  await mkdir(targetDir, { recursive: true });
  const dataOutPath = path.join(targetDir, middayDataName(data.report_date));
  await writeFile(dataOutPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  const sourceNotesPath = path.join(path.dirname(dataPath), sourceNotesName(data.report_date));
  const sourceNotesOutPath = path.join(targetDir, sourceNotesName(data.report_date));
  if (sourceNotesPath !== sourceNotesOutPath && existsSync(sourceNotesPath) && !existsSync(sourceNotesOutPath)) {
    await writeFile(sourceNotesOutPath, await readFile(sourceNotesPath, 'utf8'), 'utf8');
  }
  const html = renderReportHtml(data, { theme: data.theme });
  const htmlPath = path.join(targetDir, reportHtmlName(data.report_date));
  const viewpointPath = path.join(targetDir, viewpointName(data.report_date));
  await writeFile(htmlPath, html, 'utf8');
  await writeFile(viewpointPath, `${wechatCommentaryText(data)}\n`, 'utf8');
  if (!htmlOnly) await exportPngs(htmlPath, targetDir, data.report_date);
  return { htmlPath, viewpointPath, outDir: targetDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await renderReport({
      dataPath: path.resolve(args.data),
      outDir: args.out ? path.resolve(args.out) : undefined,
      themeName: args.theme,
      htmlOnly: args.htmlOnly
    });
    console.log(`HTML: ${result.htmlPath}`);
    console.log(`Viewpoint: ${result.viewpointPath}`);
    if (!args.htmlOnly) console.log(`PNGs: ${result.outDir}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
