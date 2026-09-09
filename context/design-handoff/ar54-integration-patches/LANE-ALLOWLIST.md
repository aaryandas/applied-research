# Lane allowlist for AR-54 remote delivery

`lane:explanations` must include the new main producer files. This branch
adds the glob; keep it if a later integration PR rewrites `.github/lanes.json`.

```json
"explanations": [
  "src/renderer/explanations/**",
  "src/render-worker/**",
  "src/backend/render-delivery/**",
  "src/main/retained-media-*.ts",
  "src/main/clip-*.ts",
  "src/main/contextual-help-*.ts",
  "src/main/explanation-*.ts",
  "src/backend/explanations/**",
  "drizzle/0006_contextual_retention.sql"
]
```

Do not add App/Shell/preload, AR-48 `http.ts`/`runtime.ts`/`config.ts`, or
AR-51 planner modules to this lane to complete remote delivery.
