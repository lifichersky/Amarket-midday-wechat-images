---
name: a-share-midday-wechat-images
description: Use when Codex needs to generate a WeChat-ready A-share midday market review after the morning close, including live source verification, two 1080x1440 infographic images, a concise Chinese morning-market viewpoint, structured midday-data.json, and source/口径 notes with three fixed visual themes.
---

# A股午评贴图

## Goal

Generate a complete WeChat-ready A-share midday report after the morning session closes:

- 2 vertical PNG images, each 1080x1440.
- 1 Chinese morning-market viewpoint text file, no more than 300 Chinese characters.
- 1 structured `midday-data.json` file used as the single source of truth.
- 1 `数据来源与口径.md` file explaining sources, display口径, and conflicts.
- All outputs saved under a new date-named output folder.

Use a stable data product structure. Content fields,口径, image order, and validation rules stay consistent every trading day. Themes change the visual skin only.

## Required Companion Skills

Use these skills when available:

- `financial-analysis`: first-pass A-share market insight and anomaly discovery.
- `web-access`: all live web search, source discovery, and verification.

Do not require `imagegen` for the default workflow. Exact Chinese text, stock names, numbers, labels, and charts must be rendered with deterministic HTML/CSS and browser screenshots.

If the user asks for "今天", "上午", "午评", "周五", or any relative date, resolve and state the exact report date before final delivery. If the date is a weekend or market holiday and the user did not specify a trading day, use the latest completed A-share trading day and state that choice.

## Output Folder

Default to the current workspace unless the user provides another destination.

Create:

```text
outputs/YYYY-MM-DD-midday/
```

Save these files:

```text
YYYY-MM-DD-A股午评-01-午盘全景与资金风格.png
YYYY-MM-DD-A股午评-02-题材温度与涨跌停结构.png
YYYY-MM-DD-midday-report.html
YYYY-MM-DD-上午市场观点.txt
YYYY-MM-DD-midday-data.json
YYYY-MM-DD-数据来源与口径.md
```

`YYYY-MM-DD-midday-report.html` is the deterministic, self-contained render source for both PNGs. It must be possible to rerender the PNGs later from the saved HTML and `midday-data.json`.

## Workflow

1. **Confirm the visual theme with the user first.** The skill ships three approved visual themes:
   - `暗金杂志封面风格` (`dark-editorial-magazine`)
   - `浅色机构午报风格` (`light-institutional-report`)
   - `深色终端杂志风格` (`dark-terminal-magazine`)

   If the user's request already names one of these three themes (in Chinese or in its `*-xxx` id), proceed directly with it. Otherwise, present a multiple-choice question listing the three theme names (and an "Other" escape hatch) and wait for the user's reply before doing anything else. Do not research data, write `midday-data.json`, render HTML, or create any output file until the theme is confirmed. The chosen theme is locked in for the whole report and is the only value written to `midday-data.json.theme` and the `data-theme` attribute on the rendered HTML.
2. Determine the report date and create the output folder.
3. Research and verify the morning-close A-share data. Read [references/data-sources.md](references/data-sources.md). Use the fixed source mix: `financial-analysis`, 东方财富, 财联社, and 证券时报·数据宝. Add extra sources only when a fixed public source is unavailable or key numbers conflict, and record the reason in口径 notes.
4. Build and save `YYYY-MM-DD-midday-data.json` before making images. Follow [references/midday-report-schema.md](references/midday-report-schema.md) and validate against [references/midday-data.schema.json](references/midday-data.schema.json). Every image and the viewpoint text must read from this JSON. Set `theme` to the exact Chinese name confirmed in step 1.
5. Fill `midday_temperature_v1` with the six-factor model in [references/midday-report-schema.md](references/midday-report-schema.md). The score is a review model output, not source data.
6. Fill `midday_interpretation` as a judgement-oriented memo: what the morning market really was, why money selected or rejected the main directions, and what would confirm or invalidate the view in the afternoon.
7. Convert afternoon observations into `确认信号`, `弱化信号`, and `风险信号`; avoid vague "关注某方向" wording without explicit conditions.
8. Apply the theme confirmed in step 1. Read [references/theme-and-layout.md](references/theme-and-layout.md) to load the matching `THEMES[<id>]` token set; do not silently fall back to a default theme if the user has not chosen one.
9. Generate a self-contained `YYYY-MM-DD-midday-report.html` from `midday-data.json`. Prefer `scripts/render-report.mjs`. The HTML must contain two 1080x1440 `.poster` sections and local CSS for all text, numbers, bars, and theme styling.
10. Run browser-based preflight checks before PNG export: JSON schema validation, two poster dimensions, safe-area checks, and text overflow checks. Fix overlapping text, clipped text, wrong order, stale data, or ambiguous口径 before final delivery.
11. Export each `.poster` to the required PNG filenames with browser screenshots. Rerender from the same JSON/HTML when only typography, spacing, or theme styling changes.
12. Write `YYYY-MM-DD-上午市场观点.txt` from `midday-data.json.wechat_commentary_v1.text`; keep it <=300 visible Chinese characters and avoid listing more than 3 numeric values.
13. Run `scripts/validate-report.mjs --dir outputs/YYYY-MM-DD-midday` as the final automated quality gate.
14. Final response: link the two images, `midday-report.html`, viewpoint text file, `midday-data.json`, and口径 file; state main sources and unresolved口径 assumptions, if any.

## Two-Image Template

Read [references/two-image-template.md](references/two-image-template.md) before laying out images.

Strict sequence:

1. `01 午盘全景与资金风格`: morning market conclusion, indices, half-day turnover, breadth, capital style, and core features.
2. `02 题材温度与涨跌停结构`: leading/lagging themes, limit-up/down quality, highest board, concentrated limit-up themes, and afternoon validation signals.

The sequence, core panels, and data fields are fixed across all themes. A theme may change background, card fill, border, typography color, title treatment, and density rules only.

## 口径 Discipline

Always label口径 when mixing data types:

- `上午收盘口径`: numbers observed at or shortly after the 11:30 close.
- `全口径`: includes ST, 科创/创业/北交所 differences, and all涨跌停 statistics from a source.
- `非ST短线口径`: excludes ST and focuses on ordinary ultra-short board counts.
- `题材概念口径`: theme/concept count such as 玻璃基板8只 or 6G概念3只.
- `行业口径`: industry涨跌幅 or行业涨跌家数.
- `主力资金口径`: do not mix with all-order net flow without labeling.
- `资金动向展示口径`: image 1 no longer displays 北向资金 because intraday disclosure is no longer available. Use `capital_flow.metric_name/net_text` for the verified compact money value, then show `receiving_directions` and `selling_directions` as the flow-in/flow-out rows. Do not place sector rankings, theme judgments, missing-data placeholders, vague phrases like `大幅净流入`, or comma-separated narrative clauses in `net_text`.
- `午评模型 v1`: midday temperature score is model output, not source data.

If sources disagree, choose the clearest mainstream source for the displayed number and note the口径 in the footer, commentary, or `数据来源与口径.md`. Do not silently blend conflicting numbers.

## Visual Standards

- Use vertical 1080x1440 PNGs.
- Preserve the three approved theme routes from `assets/theme-previews/`.
- Keep layout coordinates, panel order, text hierarchy, and data fields stable across themes.
- Avoid one-hue palettes. Do not use grid/repeated-line backgrounds, fake candlestick textures, generated text, watermarks, or decorative blobs in default themes.
- Use small rounded corners for content blocks: 6px for panels/cards and 4px for tags/chips.
- Use fixed A-share color semantics: red for bullish/up/repair/strong, green for bearish/down/risk/negative feedback, blue/cyan for structure/model, and gold for分歧/observation/hierarchy.
- Add a footer with source口径 and "仅供复盘，不构成投资建议".
- Use HTML/CSS for all exact text, stock names, numbers, labels, and charts.
- In all three themes, the tiny sparkline under each index card is a decorative market-movement mimic, not true intraday minute data. Use one of four deterministic templates (`上涨A`, `上涨B`, `下跌A`, `下跌B`) based on index pct direction and strength; do not imply it is real分时走势 unless minute-level source data is explicitly added later.

## Final Quality Gate

Before telling the user the report is complete, verify:

- `scripts/validate-report.mjs --dir outputs/YYYY-MM-DD-midday` passes.
- Both PNG images exist in the date folder and are 1080x1440.
- `YYYY-MM-DD-midday-report.html` exists and contains two 1080x1440 `.poster` sections.
- The viewpoint text file is generated from `midday-data.json.wechat_commentary_v1.text`, matches it exactly, and is <=300 Chinese characters.
- `midday-data.json` is valid JSON, passes `references/midday-data.schema.json`, and contains `schema_version`, `report_date`, `cutoff_time`, `theme`, `data_quality`, `indices`, `turnover`, `breadth`, `capital_flow`, `limit_up`, `themes`, `ladder`, `midday_temperature_v1`, `midday_interpretation`, `afternoon_signals`, `wechat_commentary_v1`, and `sources`.
- `data_quality.status` is not `incomplete` unless the user explicitly accepted the limitation.
- `midday_temperature_v1.factors` contains all 6 model factors with integer scores, correct max values, reasons, and confidence.
- `数据来源与口径.md` records source URLs or page names for key numbers.
- Browser preflight found no text overflow, clipped text, panel overflow, or safe-area violations.
- Image 1 explains the whole morning market and capital style.
- Image 2 explains the theme structure,涨跌停 quality, highest board, and afternoon validation path.
- `wechat_commentary_v1.text` reads as a short market view, not a data recap: it includes an explicit judgment, a capital-logic chain, and an afternoon validation condition.
