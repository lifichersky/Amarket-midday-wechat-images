# Theme And Layout

The report is a stable data product. Theme changes the visual skin only; it must not change image order, panel purpose, required fields, or口径 labels.

Default rendering is deterministic HTML/CSS. Do not call image generation for the normal workflow.

## Three Fixed Themes

### 暗金杂志封面风格

- Theme id: `dark-editorial-magazine`.
- Preview: `assets/theme-previews/theme-01-dark-editorial-magazine.png`.
- Use as the default theme when the user does not specify.
- Visual tone: premium dark editorial magazine, strong title hierarchy, warm gold, restrained A-share red/green, ivory institutional panels.
- Best for: WeChat cover impact and a strong morning-market judgment.

### 浅色机构午报风格

- Theme id: `light-institutional-report`.
- Preview: `assets/theme-previews/theme-02-light-institutional-report.png`.
- Visual tone: off-white paper surface, crisp white panels, blue-gray separators, restrained shadows, research-note typography.
- Best for: high readability, institutional credibility, and a clean观点段.

### 深色终端杂志风格

- Theme id: `dark-terminal-magazine`.
- Preview: `assets/theme-previews/theme-03-dark-terminal-magazine.png`.
- Visual tone: graphite terminal surface blended with magazine typography, higher information density, cyan structure accents, tight ranking modules.
- Best for: short-term readers scanning themes,涨跌停 quality, and连板 structure.
- Index-card sparklines use the same decorative trend-mimic system across all three themes. Select one of four deterministic line templates (`上涨A`, `上涨B`, `下跌A`, `下跌B`) by index涨跌方向 and strength. They must stay thin, jagged, market-like, and visually contained inside each index card; they must not be described as real intraday minute走势 unless actual minute data is added to the schema and source notes.

## Theme Token Contract

Implement themes with CSS variables so data mapping and page structure do not change:

```css
[data-theme] {
  --page-bg: ...;
  --panel-bg: ...;
  --panel-border: ...;
  --text-main: ...;
  --text-panel: ...;
  --text-muted: ...;
  --accent-bullish: ...;
  --accent-bearish: ...;
  --accent-structure: ...;
  --accent-gold: ...;
  --shadow-panel: ...;
  --radius-panel: 6px;
  --radius-chip: 4px;
}
```

Token rules:

- Red means bullish/up/repair/strong.
- Green means bearish/down/risk/negative feedback.
- Blue or cyan means structure/model/terminal information.
- Gold means hierarchy,分歧, watch state, or editorial emphasis.
- Do not encode data values in CSS tokens.
- Do not change DOM order or field selection per theme.

## HTML Layout Contract

Generate one self-contained `YYYY-MM-DD-midday-report.html` containing two poster sections:

```html
<main id="report-root" data-report-date="YYYY-MM-DD" data-theme="dark-editorial-magazine">
  <section class="poster" data-page="1" data-title="午盘全景与资金风格">...</section>
  <section class="poster" data-page="2" data-title="题材温度与涨跌停结构">...</section>
</main>
```

Each `.poster` must be exactly:

```css
.poster {
  width: 1080px;
  height: 1440px;
  position: relative;
  overflow: hidden;
}
```

Use fixed 1080x1440 layout zones:

| Zone | Coordinates | Purpose |
|---|---|---|
| Header | x=42 y=36 w=996 h=150 | Title, date, cutoff time, market thesis. |
| Top metrics | y=210-430 | Index cards or涨跌停 quality cards. |
| Middle analysis | y=455-880 | Breadth/capital map or theme ranking. |
| Lower analysis | y=905-1330 | Core features, interpretation, signals, ladder. |
| Footer | y=1362-1408 | Source口径 and disclaimer. |

Safe-area rules:

- Keep all text at least 32px from image edges.
- Keep at least 18px between major panels and 16px inside panel padding.
- Never place body text below y=1338.
- Footer text must fit inside x=42-1038 and y=1362-1408.
- If a list is too long, show the most important 3-7 items and put the full list in `midday-data.json`.

## Typography

- Title: 52-66px bold.
- Subtitle: 26-32px bold.
- Metric numbers: 34-60px bold.
- Section headers: 24-30px bold.
- Body: 21-28px.
- Footer/source: 15-18px.

Use Microsoft YaHei, PingFang SC, Noto Sans CJK SC, or another reliable Chinese font. Do not use image generation to render exact text.
