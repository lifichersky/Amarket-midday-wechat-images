# A股午评贴图 / A-Share Midday WeChat Images

A Codex skill that turns the A-share morning-close data into a WeChat-ready midday report: two vertical 1080×1440 PNGs, a short Chinese viewpoint, a structured `midday-data.json`, and a 数据来源与口径 note — produced from a self-contained HTML/CSS template so the same JSON always re-renders to the same images.

## What you get

For any trading day the skill produces, under `outputs/YYYY-MM-DD-midday/`:

| File | Purpose |
| --- | --- |
| `YYYY-MM-DD-A股午评-01-午盘全景与资金风格.png` | Image 1: indices, half-day turnover, breadth, capital style |
| `YYYY-MM-DD-A股午评-02-题材温度与涨跌停结构.png` | Image 2: themes, 涨跌停 quality, highest board, afternoon signals |
| `YYYY-MM-DD-midday-report.html` | Self-contained render source for both PNGs (re-renderable) |
| `YYYY-MM-DD-上午市场观点.txt` | ≤300-character Chinese morning-market viewpoint |
| `YYYY-MM-DD-midday-data.json` | Single source of truth for all numbers and copy |
| `YYYY-MM-DD-数据来源与口径.md` | Sources, 口径, and any conflict notes |

`midday-data.json` is validated against `references/midday-data.schema.json`; the report passes `scripts/validate-report.mjs` as the final quality gate.

## Three approved visual themes

The skill ships three fixed themes; pick one before any data is researched:

| Chinese name | ID | Preview |
| --- | --- | --- |
| 暗金杂志封面风格 | `dark-editorial-magazine` | `assets/theme-previews/theme-01-dark-editorial-magazine.png` |
| 浅色机构午报风格 | `light-institutional-report` | `assets/theme-previews/theme-02-light-institutional-report.png` |
| 深色终端杂志风格 | `dark-terminal-magazine` | `assets/theme-previews/theme-03-dark-terminal-magazine.png` |

A theme changes background, card fill, border, typography, and density rules only. The image sequence, panel order, data fields, and 1080×1440 dimensions are identical across themes.

## Workflow at a glance

1. Confirm the theme with the user (do not start research without it).
2. Resolve the report date (use the latest completed trading day if "今天" lands on a holiday).
3. Verify morning-close data via the fixed source mix: `financial-analysis`, 东方财富, 财联社, 证券时报·数据宝. Extra sources only when a fixed public source is unavailable.
4. Build `midday-data.json` first (read `references/midday-report-schema.md`).
5. Compute the six-factor `midday_temperature_v1` and the `midday_interpretation` memo.
6. Render `midday-report.html` from JSON (use `scripts/render-report.mjs`).
7. Browser preflight: dimensions, safe area, text overflow, 口径 labels.
8. Export PNGs from the HTML, then write the viewpoint `.txt` from `wechat_commentary_v1.text`.
9. Run `scripts/validate-report.mjs --dir outputs/YYYY-MM-DD-midday`.

See `SKILL.md` for the full contract and `references/` for the schema, layout, and source guidance.

## Repository layout

```text
.
├── SKILL.md                          # Skill contract (load this in Codex)
├── agents/openai.yaml                # Codex agent metadata
├── assets/theme-previews/            # Theme preview PNGs
├── references/                       # Schema, layout, sources, theme tokens
├── scripts/                          # Render + validate + theme tools
├── tests/                            # Tool unit tests (node:test)
└── outputs/                          # Generated reports (per date folder)
```

## Required companion skills

- `financial-analysis` — first-pass A-share insight and anomaly discovery.
- `web-access` — all live web search, source discovery, and verification.

## Visual standards

- Vertical **1080×1440** PNGs, no watermarks, no fake candlestick textures.
- A-share color semantics: red = up / bullish, green = down / risk, blue-cyan = structure / model, gold = 分歧 / observation.
- Every footer carries the source 口径 and “仅供复盘，不构成投资建议”.
- Sparklines under index cards are decorative mimics (one of four deterministic templates), not real intraday data, unless minute-level source data is explicitly added.

## License

Source-available for personal and internal use. If you fork or redistribute, keep the footer disclaimer and 口径 discipline intact.
