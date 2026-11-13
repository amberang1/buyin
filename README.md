# Buy In - Poker Ledger & Chip Scanner

React/Vite frontend, Firebase Authentication and Firestore, and an Express server for Gemini scans.

## Setup and deployment

1. Run `npm ci`.
2. Enable **Anonymous** sign-in in Firebase Authentication for the project in `firebase-applet-config.json`.
3. Deploy `firestore.rules` to the **named Firestore database** in that configuration, not just the default database.
4. Rotate or revoke any Gemini key previously shipped in the browser. Set a new `GEMINI_API_KEY` in server secrets (or local .env).
5. Run `npm run dev` (Express with Vite middleware; port 3000 by default).
6. Run `npm run lint` and `npm run build`. For production run `npm start` and deploy the Node server over HTTPS; static-only hosting will not support the scanner. Never expose the development server publicly.

## Access model

Anonymous Firebase authentication provides a browser-specific identity. Hosts create a random 32-character private room code. Guests paste it to acquire read-only membership. Only the host can edit financial records, advance phases, or scan with Gemini. Table settings lock after setup.

Old four-digit rooms and old local host IDs are intentionally denied. Export/backup old sessions before deployment. If a host clears storage or changes devices, the anonymous identity may be lost. Never share codes publicly.

See [security checks](docs/security-checks.md) and [ledger regression checks](docs/ledger-regression-checks.md).
