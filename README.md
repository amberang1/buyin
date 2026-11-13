# Big Stack

React/Vite frontend, Firebase Authentication and Firestore, and an Express server for validated ledger writes, room access, and Gemini scans.

## Setup and deployment

Dedicated Firebase project: `buy-in-d6405`. Create its `(default)` Firestore database in production mode and enable Anonymous Authentication. The old Drift project is not used or modified by this branch. The Firebase CLI project alias retains the original deployment project ID. Existing Drift rooms are not migrated.

1. Run `npm ci`.
2. Enable **Anonymous** sign-in in Firebase Authentication for the project in `firebase-applet-config.json`.
3. Deploy `firestore.rules` to the **(default) Firestore database** in the Big Stack project: `firebase deploy --only firestore:rules --project buy-in-d6405`.
4. Rotate or revoke any Gemini key previously shipped in the browser. Set a new `GEMINI_API_KEY` in server secrets (or local .env). Scanning defaults to `gemini-3.5-flash-lite`; override with the server environment variable `GEMINI_MODEL`.
5. Run `npm run dev` (Express with Vite middleware; port 3000 by default).
6. Give the Node server Application Default Credentials with Firestore read/write permissions (e.g. a Cloud Run runtime service account with Cloud Datastore User in this Firebase project). For local development use ADC via gcloud or a local credential file outside the repo. Never put a service account key in the client or GitHub.
7. Run `npm run lint` and `npm run build`. For production run `npm start` and deploy the Node server over HTTPS; static-only hosting will not support room access, ledger edits, or scanning. `npm run preview` also runs this Node server against the built frontend. Never expose the development server publicly.

## Access model

Anonymous Firebase authentication provides a browser-specific identity. Hosts create a four-digit room code or share an invitation link. A protected backend allocates short codes and maps them to internal random 32-character IDs; guests redeem codes for room membership and can link their own seat and submit financial requests. The browser saves the Firebase identity and current room ID locally and reloads the same room and ledger after refresh. Only the host can edit financial records, advance phases, or scan with Gemini. Table settings lock after setup.

Old four-digit rooms, old local host IDs, and rooms created under the intermediate 32-character invitation scheme are not migrated. Export/backup old sessions before deployment. If a host clears storage or changes devices, the anonymous identity may be lost. Never share codes publicly.

See [security checks](docs/security-checks.md) and [ledger regression checks](docs/ledger-regression-checks.md).


## Ledger integrity and release requirements

Deploy the updated Node server, built frontend, and `firestore.rules` together. Direct browser writes to games and players are now denied. The server checks the authenticated host, reads the room and complete roster in a Firestore transaction, validates the operation, and commits the ledger and phase atomically. Repeated requests with the same operation ID are idempotent. Settings use an expected-value check so stale tabs and delayed scans cannot overwrite changes.

Rooms support up to 30 players. Chip colors are unique ignoring case, limited to 30, and values are between zero and 1,000,000. All money entry paths use the same cent conversion. Fractional-cent rates retain actual chip units for new cash-outs and use cumulative rounding; final payouts allocate remaining cents deterministically by remainder and player ID. Actual chip shortages are still rejected. Older cash-outs without chip-unit records infer units from their saved cash amounts; their original fractional units cannot be reconstructed.

Settlement photos, counts and unconfirmed AI reviews are stored in IndexedDB on the current device. Storage failures are shown explicitly. Archives omit photos, handle storage failure, and can be opened from History on the home screen. They remain device-local, not a cloud backup.

Validation: `npm ci`, `npm run lint`, `npm test`, `npm run build`, and `node --check server.mjs`. The tests cover invalid amounts, stale edits, phase transitions, overdraws, equal rebuys, undo, finalization, and fractional rounding. Live Firebase/ADC, rules deployment and Gemini integration require deployment-environment verification.


## Player participation and payouts

A room member can create one seat in setup or during active play, with an optional initial buy-in request. Seat ownership is tied to the persisted Firebase anonymous UID, so refreshing on the same browser restores the seat. An existing host-created seat can be linked only after host approval. Changing browsers or clearing authentication storage does not restore that identity automatically.

Guests submit buy-in and cash-out requests only for their own seat. Requests retain requested, confirmed or rejected status and optional rejection reasons. The host confirms money received for buy-ins, and chips received plus money paid for mid-game cash-outs. Confirmation appends financial entries and resolves the request in one transaction; retries cannot append it twice. Pending requests block starting, settlement and finalization, and must be resolved before the host manually edits that player's entries. Late arrivals can enroll while play is active, but not during settlement or after finalization.

Final results show profit/loss separately from final payouts. Host-recorded payment totals support unpaid, partly paid, fully paid and zero-payout states. They exclude earlier cash-outs, do not change financial results, and do not transfer money. Payment updates reject stale totals and overpayments. Archived history saves a snapshot of payment records.

Deploy the updated frontend, backend and Firestore rules together. Request reads are limited to the host and the requesting guest; room members can read payment statuses. Every write is validated on the backend, including membership and seat ownership checks. Added tests cover permission failures, concurrent claims, duplicate confirmation, late entry, stale cash-out previews and partial payments; UI rendering tests cover restored identities, request visibility and payout labels.

New rooms use four-digit codes, including leading zeros. Existing six-digit invitations remain accepted in manual join, invite links, and API responses. Short-code creation remains atomic and retries collisions without overwriting existing rooms. Internal room IDs and access rules are unchanged.
