# Rendering Workflow

Use deterministic HTML/CSS and browser screenshots.

## Commands

Render HTML only:

```bash
node scripts/render-report.mjs --data outputs/YYYY-MM-DD-midday/YYYY-MM-DD-midday-data.json --html-only
```

Render HTML and PNGs:

```bash
node scripts/render-report.mjs --data outputs/YYYY-MM-DD-midday/YYYY-MM-DD-midday-data.json
```

Override theme during render:

```bash
node scripts/render-report.mjs --data outputs/YYYY-MM-DD-midday/YYYY-MM-DD-midday-data.json --theme 深色终端杂志风格
```

Validate final folder:

```bash
node scripts/validate-report.mjs --dir outputs/YYYY-MM-DD-midday
```

## Preflight Expectations

The renderer and validator must check:

- `midday-data.json` parses and passes schema validation.
- Custom semantic validation passes.
- Two `.poster` sections exist and are exactly 1080x1440.
- Text and panels do not overflow their containers.
- Both PNGs are 1080x1440 when exported.
- The viewpoint text file matches `wechat_commentary_v1.text`.

## Failure Handling

- Data validation failure: fix `midday-data.json` first.
- Overflow: shorten displayed lists, adjust typography, or rerender from the same data.
- Theme issue: adjust CSS tokens, not data mapping.
- Browser/export failure: fix the browser or renderer environment; do not fall back to image generation for exact text.
