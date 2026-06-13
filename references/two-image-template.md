# Two-Image Template

All images must be rendered from `midday-data.json`. The layout and data fields stay stable across themes.

## 01 午盘全景与资金风格

Purpose: let readers understand the whole morning market in 5 seconds.

Include:

- Title: `A股午评`.
- Exact report date and cutoff time, usually `11:30`.
- One-line morning market judgment, e.g. `缩量分化 · 题材抱团 · 午后看承接`.
- Four index cards: 上证指数, 深证成指, 创业板指, 北证50 or 科创50. If 北证50 is unavailable, use 科创50 and note口径.
- Half-day turnover and day-over-day or same-time comparison when available.
- Breadth module:上涨/下跌家数 and ratio visualization.
- Capital style: one verified主力/行业主力 amount row plus compact flow-in and flow-out rows from `receiving_directions` and `selling_directions`. Do not display 北向资金; intraday 北向 disclosure is no longer available. Narrative capital interpretation belongs in the direction lists or viewpoint modules.
- Core features: 2-4 bullets that explain the morning, not a raw data list.
- `午后观点`: compact judgement paragraph from `midday_interpretation.core_judgment` or `wechat_commentary_v1`.

Do not include long stock lists here. Save specific leader names for image 2.

## 02 题材温度与涨跌停结构

Purpose: explain where money concentrated, whether短线质量 is improving, and what the afternoon must verify.

Include:

- Title: `题材温度与涨跌停结构`.
- `midday_temperature_v1.score`, state, and six factor bars.
- Leading theme ranking, preferably top 5-7; for Theme 2, the middle bar represents each theme's `limit_up_count`, while the separate heat column stays aligned with the flame indicators.
- Lagging theme/sector ranking, preferably top 3-5.
- Limit-up quality grid: 涨停, 跌停, 炸板, 封板率.
- Highest board spotlight: stock, theme, board count, and whether it is space expansion or compression.
- Concentrated limit-up themes: top 3, including representative stocks/counts.
- Afternoon validation strip:
  - `确认信号`
  - `弱化信号`
  - `风险信号`

Avoid turning page 2 into a full daily复盘. It should answer: "What mattered this morning, and what must the afternoon prove?"

## WeChat Viewpoint Text

The standalone `YYYY-MM-DD-上午市场观点.txt` file is a short market view, not a market-data summary. It must be generated from `midday-data.json.wechat_commentary_v1.text`.

Keep it under 300 visible Chinese characters. Prefer 160-240 characters when possible.

Required structure:

1. A clear core judgment: what the morning market really was.
2. A capital-logic chain: where money moved from, where it moved to, and why.
3. An afternoon validation condition: what would confirm or invalidate the judgment.

Hard rules:

- Include at least one explicit judgment phrase such as `不是...而是...`, `本质上`, `更像`, `说明`, `核心`, or `关键`.
- Include an afternoon condition with `午后`, `下午`, `若`, `如果`, or `一旦`.
- Use at most 3 numeric values.
- Do not merely concatenate index, turnover, breadth, sector,涨停, and ladder data.
