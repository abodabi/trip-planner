# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private trip-budget planner for a Tatra mountains trip (August 2026), shared between two people. Hebrew, RTL UI. Vite + React 18 + Tailwind, with Firebase (Google auth + Firestore) for sync and Firebase Hosting for deployment. There are no tests and no linter.

## Commands

```bash
npm run dev        # local dev server (http://localhost:5173)
npm run build      # production build to dist/
npm run preview    # serve the built dist/

firebase deploy --only hosting          # deploy the site (after npm run build)
firebase deploy --only firestore:rules  # deploy security rules
```

## Architecture

The entire app is six source files:

- `src/firebase.js` — Firebase initialization from `VITE_FB_*` env vars (`.env.local`, gitignored; template in `.env.example`), exports `auth`, `googleProvider`, `db`.
- `src/App.jsx` — auth gate, trip selection (localStorage + `#/trip/<id>` hash links), and data layer. Subscribes via `onSnapshot` to **one Firestore document per trip** (`trips/{tripId}`) holding that trip's entire state. Passes `data` and a `persist(next)` callback down — every mutation writes the whole document back with `setDoc`. A permission error on subscribe returns the user to the picker.
- `src/TripPicker.jsx` — "my trips" list (query `memberEmails array-contains` user email) and new-trip creation (`addDoc` of `defaultData(title, start, end)` + `memberEmails: [creator]`).
- `src/TripPlanner.jsx` — the full UI (~650 lines): budget categories, expenses (EUR/ILS with conversion rate), per-day destination planning, CSV/JSON export, plus `defaultData()` defining the document shape.
- `src/destinationsCsv.js` — pure CSV helpers for the bulk destination import: `CSV_COLUMNS` (Hebrew headers + English aliases per destination field), `parseCsv` (RFC4180-ish, auto-detects `,` `;` or tab), `parseDestinationsCsv` (validates rows, flags duplicates by name, caps a batch at `MAX_IMPORT_ROWS`) and `destinationsCsvTemplate` (the downloadable template). No React, no Firestore — the parsing rules are testable on their own.
- `src/DestinationMap.jsx` — Leaflet/OpenStreetMap map of all destinations. Gets positions from stored `lat`/`lng` on the destination, else by parsing the Google Maps link, else by geocoding name+region via Nominatim (result persisted back to the doc as `lat`/`lng`).

Key implications:
- Destinations can be added one by one (`DestinationForm`) or in bulk from CSV (`DestinationsImportForm` — template download, file pick or paste, per-row preview, one `persist` write for the whole batch). Both produce the same destination shape, so a new destination field needs adding in both places plus `CSV_COLUMNS`.
- All state lives in one Firestore doc; there are no per-entity collections. Changing the data shape means updating `defaultData()` and being aware existing docs won't have new fields.
- Access control: per-trip. Each trip doc carries `memberEmails` (array) — `firestore.rules` checks it for read/update/delete, create requires including yourself. Members are managed in the app's trip settings; the array doubles as the trip-list query key. No emails live in the repo. Any Google account can sign in and create trips.
- Styling is Tailwind utility classes mixed with inline `style` for the palette (dark green `#142E28`, cream `#F1F4EF`, etc.) and Hebrew fonts (Frank Ruhl Libre / Assistant). UI text is Hebrew; keep `dir="rtl"`.

## README

`README.md` is a Hebrew step-by-step setup/deploy guide for the owner (Firebase project creation, enabling Google sign-in, filling in config, deploying). It's user documentation, not developer docs — keep it in sync if setup steps change.
