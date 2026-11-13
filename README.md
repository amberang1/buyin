# Buy In - Poker Ledger & Chip Scanner

React/Vite frontend, Firebase Authentication and Firestore, and an Express server for Gemini scans.

## Setup and deployment

Dedicated Firebase project: `buy-in-d6405`. Create its `(default)` Firestore database in production mode and enable Anonymous Authentication. The old Drift project is not used or modified by this branch. The Firebase CLI project alias is set to Buy In. Existing Drift rooms are not migrated.

1. Run `npm ci`.
2. Enable **Anonymous** sign-in in Firebase Authentication for the project in `firebase-applet-config.json`.
3. Deploy `firestore.rules` to the **(default) Firestore database** in Buy In: `firebase deploy --only firestore:rules --project buy-in-d6405`.
4. Rotate or revoke any Gemini key previously shipped in the browser. Set a new `GEMINI_API_KEY` in server secrets (or local .env).
5. Run `npm run dev` (Express with Vite middleware; port 3000 by default).
6. Give the Node server Application Default Credentials with Firestore read/write permissions (e.g. a Cloud Run runtime service account with Cloud Datastore User in this Firebase project). For local development use ADC via gcloud or a local credential file outside the repo. Never put a service account key in the client or GitHub.
7. Run `npm run lint` and `npm run build`. For production run `npm start` and deploy the Node server over HTTPS; static-only hosting will not support the scanner. Never expose the development server publicly.

## Access model

Anonymous Firebase authentication provides a browser-specific identity. Hosts create a six-digit room code or share an invitation link. A protected backend allocates short codes and maps them to internal random 32-character IDs; guests redeem codes for read-only membership. The browser saves the Firebase identity and current room ID locally and reloads the same room and ledger after refresh. Only the host can edit financial records, advance phases, or scan with Gemini. Table settings lock after setup.

Old four-digit rooms, old local host IDs, and rooms created under the intermediate 32-character invitation scheme are not migrated. Export/backup old sessions before deployment. If a host clears storage or changes devices, the anonymous identity may be lost. Never share codes publicly.

See [security checks](docs/security-checks.md) and [ledger regression checks](docs/ledger-regression-checks.md).
