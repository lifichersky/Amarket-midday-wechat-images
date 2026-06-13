# Data Sources

Use the fixed source family mix unless a source is unavailable or conflicting:

| Family | Purpose |
|---|---|
| `financial-analysis` | First-pass market insight, anomaly discovery, cross-checking, and synthesis. |
| 东方财富 | Indices,涨跌家数,成交额,资金流向,板块涨跌幅. |
| 财联社 | 涨停复盘,封板率,炸板,跌停,连板梯队,高标状态. |
| 证券时报·数据宝 | 行业/题材强弱,代表个股,板块复盘交叉验证. |

## Required Capital-Flow Rows

Image 1's `资金动向/资金风向` module must not display 北向资金, missing placeholders, or vague descriptions. Verify and fill the主力/行业主力资金 amount before rendering completed images:

- `行业主力资金/主力资金`: prefer 东方财富资金流向 or another source with a same-session amount. The displayed value must contain an amount such as `+69.63亿`, `净流出约300亿`, or `0.00亿`.
- `流入方向/流出方向`: use `receiving_directions` and `selling_directions` from the same capital-flow source family when possible. Keep each displayed row compact and move longer interpretation into `market_view.core_features` or `midday_interpretation`.

If a fixed source family does not expose the主力/行业主力 amount, use a reasonable fallback source and record it in `数据来源与口径.md`. If no reliable amount can be verified, stop before final image export or mark the report incomplete; do not render `数据暂缺`, `暂无`, `--`, or `大幅净流入` in the finished image.

Do not create or carry forward `capital_flow.northbound_text`; it is a legacy field for this midday report.

## Morning-Close Timing

- Use `上午收盘口径` for numbers observed at or shortly after the 11:30 A-share morning close.
- If a public page updates continuously and no archived 11:30 snapshot is available, record the access time and mark `data_quality.status` as `review_needed`.
- Do not display a live afternoon-changing number as completed morning data unless the source explicitly provides a morning-close snapshot.

## Conflict Handling

When sources disagree:

1. Prefer the source that states the exact口径 and time.
2. Prefer morning-close snapshots over live rolling pages.
3. Prefer a dated public source over an undated aggregation.
4. Record the alternatives, chosen value, reason, and `resolved` state in `data_quality.conflicts`.
5. Mention the conflict in `数据来源与口径.md`.

## Source Notes File

`YYYY-MM-DD-数据来源与口径.md` must include:

- Key source families used.
- Source URLs or page names for displayed headline numbers.
- Display口径, especially `上午收盘口径`, `全口径`, `非ST短线口径`, `题材概念口径`, `行业口径`, and `主力资金口径`.
- Any missing source family or conflict.
- `仅供复盘，不构成投资建议`.
