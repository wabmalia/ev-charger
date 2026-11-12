# EV Charger

PWA for logging EV charges, deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`.

- `src/types.ts` – records + `SCHEMA` (column names of the Google Sheet tabs). Adding a field: add it to
  the interface and `SCHEMA`; sync appends missing columns to existing sheets automatically.
- `src/store.ts` – localStorage state, `save()` marks records dirty and schedules a sync.
- `src/google.ts` – OAuth implicit flow via redirect (popups break in installed PWAs) + Sheets sync.
- `src/merge.ts` – pure merge plan (tested). `src/metrics.ts` – dashboard numbers (tested).
- Never hard-delete records; set `deleted: true` so the deletion syncs.
- Run `npm run check && npm test && npm run build` before pushing.
- Bump `CACHE` in `public/sw.js` only if the caching strategy changes; hashed assets refresh on their own.
