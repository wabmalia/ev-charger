# EV Charger

A small installable web app (PWA) to log electric car charges: start/stop a charge,
or log one after the fact with start/end %, kWh, meter readings and odometer.
Tracks electric board meters (latest reading + price per kWh, used as defaults) and
shows a dashboard with cost, energy, consumption per 100 km, charging efficiency and more.

Live: https://ev-charger.wabmalia.eu/ (the old https://wabmalia.github.io/ev-charger/ redirects there)

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
2. **APIs & Services → Library** → enable **Google Sheets API** and **Google Picker API**.
3. **OAuth consent screen** (Google Auth Platform): External, app name "EV Charger",
   Data access: add the scope `.../auth/drive.file`. Branding: home page, privacy and terms
   on `https://ev-charger.wabmalia.eu/` (`about.html`, `privacy.html`, `terms.html`), authorized
   domain `wabmalia.eu`. The domain is verified in Search Console as a Domain property (DNS TXT
   record in the Hetzner zone); a github.io address can't pass brand verification.
   Then **Audience → Publish app** (In production). The app is published and brand-verified.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://ev-charger.wabmalia.eu`, `http://localhost:5173`
   - Authorized redirect URIs: `https://ev-charger.wabmalia.eu/`, `http://localhost:5173/`
5. **Credentials → Create credentials → API key** for the file picker. Restrict it to the
   **Google Picker API** and to the websites `https://ev-charger.wabmalia.eu/*` and `http://localhost:5173/*`.
6. Put both in `.env` (`VITE_GOOGLE_CLIENT_ID=...`, `VITE_GOOGLE_API_KEY=...`). They are public,
   so they are committed. The client id can also be overridden per device under Setup.

A Google session lasts about an hour. When the app opens
with an expired session it renews it silently (a quick redirect to Google with
`prompt=none` and back); if Google needs you to confirm, it shows "Sign in to sync"
instead. Everything keeps working offline in the meantime and syncs later.
No refresh tokens: a static site can't keep the client secret Google requires for
them.

Scopes: `drive.file` and `email` (the email is kept on the device as the login
hint for silent sign-in). Add both under Data access on the consent screen. Neither
is sensitive, so publishing the app only needs brand verification, not a scope review.

`drive.file` only lets the app open sheets it created or that the user picked in the
Google Picker. So a shared sheet is opened with **Choose from Drive** (Settings); there is
no paste-a-link option, the picker is what grants access. If a connected sheet answers
"no access" (for example after an invite link), Settings shows **Allow access**.

The picker is a frame from docs.google.com inside the app, so it needs the browser to let
Google use its cookies there. Browsers with strict cross-site cookie blocking (Waterfox,
Firefox in strict mode) answer it with a 401 and the picker says the API key is invalid.
Chrome works; allow cookies for the site or turn off tracking protection for it otherwise.
Settings also lists the sheets the account already allowed (Drive API `files.list`, which with
`drive.file` only returns those), so a new device connects without the picker.
Picking is a one-time step per sheet and Google account: the access it grants belongs to
the account, so picking once in any browser makes the sheet open everywhere, including an
iPhone PWA where the picker might be blocked.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # merge, row parsing and metrics tests
npm run check    # typecheck
```

Stack: Preact + TypeScript + Vite, hand-written service worker (`public/sw.js`),
no backend. Pushing to `main` deploys to GitHub Pages.
