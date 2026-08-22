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

The entire app is four source files:

- `src/firebase.js` — Firebase initialization from `VITE_FB_*` env vars (`.env.local`, gitignored; template in `.env.example`), exports `auth`, `googleProvider`, `db`.
- `src/App.jsx` — auth gate and data layer. Subscribes via `onSnapshot` to a **single Firestore document** (`trips/tatra-2026`) that holds all app state; seeds it with `defaultData()` on first run. Passes `data` and a `persist(next)` callback down — every mutation writes the whole document back with `setDoc`.
- `src/TripPlanner.jsx` — the full UI (~650 lines): budget categories, expenses (EUR/ILS with conversion rate), per-day destination planning, CSV/JSON export, plus `defaultData()` defining the document shape.
- `src/DestinationMap.jsx` — Leaflet/OpenStreetMap map of all destinations. Gets positions from stored `lat`/`lng` on the destination, else by parsing the Google Maps link, else by geocoding name+region via Nominatim (result persisted back to the doc as `lat`/`lng`).

Key implications:
- All state lives in one Firestore doc; there are no per-entity collections. Changing the data shape means updating `defaultData()` and being aware existing docs won't have new fields.
- Access control: membership is a document per email in the Firestore `allowlist` collection (managed in the console, never from code). `firestore.rules` enforces it; `App.jsx` reads the signed-in user's own entry for the UX gate. No emails live in the repo.
- Styling is Tailwind utility classes mixed with inline `style` for the palette (dark green `#142E28`, cream `#F1F4EF`, etc.) and Hebrew fonts (Frank Ruhl Libre / Assistant). UI text is Hebrew; keep `dir="rtl"`.

## README

`README.md` is a Hebrew step-by-step setup/deploy guide for the owner (Firebase project creation, enabling Google sign-in, filling in config, deploying). It's user documentation, not developer docs — keep it in sync if setup steps change.
