# Midday Report Schema

Create `YYYY-MM-DD-midday-data.json` before rendering images. Treat it as the single source of truth for all text, numbers, charts, and the standalone WeChat viewpoint.

Current schema version: `1.0.0`.

Validate every completed file against [midday-data.schema.json](midday-data.schema.json) before rendering images.

## Required Top-Level Fields

```json
{
  "schema_version": "1.0.0",
  "report_date": "YYYY-MM-DD",
  "weekday": "周五",
  "cutoff_time": "11:30",
  "theme": "暗金杂志封面风格",
  "data_quality": {},
  "market_view": {},
  "indices": [],
  "turnover": {},
  "breadth": {},
  "capital_flow": {},
  "limit_up": {},
  "themes": {},
  "ladder": {},
  "midday_temperature_v1": {},
  "midday_interpretation": {},
  "afternoon_signals": {},
  "wechat_commentary_v1": {},
  "sources": {},
  "assumptions": []
}
```

## Midday Temperature Model

`midday_temperature_v1` is a compact model score for morning market health. It is not source data. The factor max values must sum to 100:

| Factor | Max | Meaning |
|---|---:|---|
| `指数强度` | 18 | Index direction, breadth across major indices, and weight support. |
| `市场广度` | 16 | Up/down count and whether赚钱效应 is broad or narrow. |
| `量能变化` | 12 | Half-day turnover and volume expansion/shrinkage. |
| `资金风格` | 14 | Capital concentration into active themes or defensive directions. |
| `涨停质量` | 22 | Limit-up count, seal quality, broken-board pressure, promotion quality. |
| `风险反馈控制` | 18 | Limit-down count, high-board failure, lagging sectors, and negative feedback. |

Score bands:

- 0-24: `冰点退潮`
- 25-39: `弱修复`
- 40-54: `分歧震荡`
- 55-69: `分歧修复`
- 70-84: `主线扩散`
- 85-100: `情绪高潮`

Each factor must include `name`, `score`, `max`, and `reason`.

## Theme And Ladder Rules

- `themes.leading`: max 7 displayed leading themes; include `rank`, `name`, `pct`, `limit_up_count`, `reason`, `leaders`, and `口径`. `limit_up_count` is the displayed count-bar source for Theme 2, and its口径 must match the row's `口径`.
- `themes.lagging`: max 5 displayed lagging directions.
- `themes.concentrated_limit_up`: max 3 displayed themes with concentrated涨停 names or counts.
- `ladder.highest_board`: highest accurate morning board height.
- `ladder.highest_stock`: the stock name driving that height.
- `ladder.boards`: board rows, with first boards allowed but not counted as连板总数.

## Midday Interpretation

`midday_interpretation` controls the judgement modules on both images.

Required fields:

- `state`: compact morning state, such as `低位题材抱团`, `缩量分化`, `指数护盘`, `高位退潮`, or `主线扩散`.
- `core_judgment`: one sentence explaining what the morning really was.
- `narrative`: compact cause-effect paragraph connecting index, volume, themes, capital style, and short-term quality.
- `afternoon_confirm`: explicit condition that would confirm continuation or repair.
- `afternoon_weaken`: explicit condition that would show the morning logic is weakening.
- `afternoon_risk`: explicit condition that would turn into risk or negative feedback.
- `source_keys`: at least one source key supporting the judgement.

Do not invent policy/news/catalyst background. If no reliable source verifies a catalyst, use safer language such as `盘面逻辑`, `资金偏好`, `短线情绪路径`, `低位补涨试错`, `高位抱团`, `防御承接`, or `退潮负反馈`.

## Capital Flow Display Contract

`capital_flow` drives the `资金动向/资金风向` module on image 1. 北向资金 is not displayed because intraday disclosure is no longer available. These fields are display fields, not narrative fields:

- `metric_name`: short label, max 6 visible characters, such as `主力资金` or `行业主力资金`.
- `net_text`: short money value, max 16 visible characters, and must include an amount with `亿` or `万`, such as `净流出约300亿`, `+69.63亿`, or `0.00亿`.
- `receiving_directions`: displayed as the flow-in row in image 1; keep names and amounts compact.
- `selling_directions`: displayed as the flow-out row in image 1; keep names and amounts compact.

Do not write `northbound_text`. Do not put sector explanations, theme judgments, comma-separated clauses, missing-data placeholders, or vague non-numeric values such as `大幅净流入` into `net_text`. Put detailed capital interpretation into `receiving_directions`, `selling_directions`, `market_view.core_features`, or `midday_interpretation.narrative`. If the displayed money value cannot be verified after trying the fixed source families and reasonable fallback sources, do not render completed images; set `data_quality.status` to `incomplete` or ask the user whether to proceed with that limitation.

## Data Quality

`data_quality` is the machine-readable audit status for the report.

| Field | Values | Rule |
|---|---|---|
| `status` | `complete`, `review_needed`, `incomplete` | Use `complete` only when displayed key numbers are sourced and conflicts resolved. |
| `confidence` | `high`, `medium`, `low` | `high` requires all four fixed source families. |
| `source_coverage` | booleans | Must include `financial_analysis`, `eastmoney`, `cls`, and `stcn_databao`. |
| `missing_fields` | string array | Any unavailable display data. |
| `conflicts` | object array | Conflicting values and chosen口径. |
| `warnings` | string array | Non-blocking limitations. |

`incomplete` must not be rendered as a completed report unless the user explicitly accepts the limitation.
