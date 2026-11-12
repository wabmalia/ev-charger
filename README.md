# EV Charger

A small installable web app (PWA) to log electric car charges: start/stop a charge,
or log one after the fact with start/end %, kWh, meter readings and odometer.
Tracks electric board meters (latest reading + price per kWh, used as defaults) and
shows a dashboard with cost, energy, consumption per 100 km, charging efficiency and more.

Live: https://wabmalia.github.io/ev-charger/

## How data is stored

- Everything is saved on the device first (works offline).
- Optionally, sign in with Google and connect a **Google Sheet**. The app creates
  three tabs (`Vehicles`, `Meters`, `Charges`) and syncs both ways.
- Sharing: share the Google Sheet with someone (editor), then send them the
  "Copy invite link" URL from Setup. They sign in with their own Google account.
- Sync is per record, last edit wins, and new rows are appended, so two phones
  logging at the same time don't overwrite each other.
- You can read and fix data in the sheet directly. Rules: don't delete or rename
  the `id` column; to delete a charge set `deleted` to `TRUE` (or delete the row).
  Adding your own extra columns is fine, the app ignores them.

Apple sign-in isn't offered: storing data in iCloud from a web app needs a paid
Apple developer account (CloudKit). Google works on iPhone too.

## Google OAuth setup (one time, free)

1. https://console.cloud.google.com → create a project (e.g. "EV Charger").
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **OAuth consent screen** (Google Auth Platform): External, app name "EV Charger",
   leave it in **Testing** and add every user's Gmail under **Test users** (max 100).
   Data access: add the scope `.../auth/spreadsheets`.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://wabmalia.github.io`, `http://localhost:5173`
   - Authorized redirect URIs: `https://wabmalia.github.io/ev-charger/`, `http://localhost:5173/`
5. Put the client id in `.env` (`VITE_GOOGLE_CLIENT_ID=...`). It is public, so it is committed.
   It can also be overridden per device under Setup.

Because the app stays in "Testing", Google shows an "unverified app" warning on
sign-in; press Continue. Sign-in lasts about an hour, after that the app keeps
working offline and asks to sign in again to sync.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # merge, row parsing and metrics tests
npm run check    # typecheck
```

Stack: Preact + TypeScript + Vite, hand-written service worker (`public/sw.js`),
no backend. Pushing to `main` deploys to GitHub Pages.
