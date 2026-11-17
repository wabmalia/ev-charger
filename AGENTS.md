# EV Charger

PWA for logging EV charges, deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`.

- `src/types.ts` – records + `SCHEMA` (column names of the Google Sheet tabs). Adding a field: add it to
  the interface and `SCHEMA`; sync appends missing columns to existing sheets automatically.
- `src/store.ts` – localStorage state, `save()` marks records dirty and schedules a sync.
- `src/google.ts` – OAuth implicit flow via redirect (popups break in installed PWAs) + Sheets sync.
  Scope is `drive.file` (non-sensitive): the app only opens sheets it created or the user picked.
- `src/picker.ts` – Google Picker (needs `VITE_GOOGLE_API_KEY`); picking a sheet is what grants access to it.
- `src/merge.ts` – pure merge plan (tested). `src/metrics.ts` – dashboard numbers (tested).
- Never hard-delete records; set `deleted: true` so the deletion syncs.
- Run `npm run check && npm test && npm run build` before pushing.
- Bump `CACHE` in `public/sw.js` when unhashed files change (icons, manifest) or the caching strategy changes; hashed JS/CSS refresh on their own.
- Icons: `branding/logo.svg` (full square) is the source; PNGs in `public/` and `branding/` are rendered from it.
