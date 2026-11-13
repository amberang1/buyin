# Security deployment checks

Use a test Firebase project first; enable Anonymous Authentication and publish rules to the configured named database.

- Without authentication, all game/player/member data access is denied.
- Authenticated outsiders cannot list games or read a room or its players before joining.
- Hosts create rooms with six-digit codes allocated by the authenticated backend. Direct client reads of roomCodes, client room creation, and self-created memberships are denied. Guests can read records only after redeeming a code through the backend; they cannot edit the ledger. Verify duplicate code allocation and concurrent join/finalization.
- Host can add/remove players only in setup, record transactions only in active, and finalize stack values together with the results transition. Neither guest nor host can reopen results.
- Old four-digit rooms are denied. Export them before migrating.
- Inspect the production JS bundle for the Gemini secret. Browser network requests should target /api/scan, not Gemini directly.
- POST /api/scan with no/invalid token: 401. Valid non-host or wrong phase: 403. Invalid/oversized input: 400/413. Exceed limits: 429.
- Confirm host scans work in setup/settlement. Verify AI results manually.
- Rotate keys exposed by older builds. Keep the replacement in server secrets only; restrict it to Gemini where supported.
- Deploy a Node service over HTTPS with ADC and a least-privilege Firestore runtime service account, not static hosting. Verify the account is authorized in the named database. AI Studio deployment may need a different start command or hosting configuration.

## Remaining considerations

Room and scan rate limits are per server process. Short codes are guessable, so before public use configure shared IP/UID/global limits, a gateway or App Check and monitoring. Current scan rate limits are per server process (6/minute per UID, 30/minute total, 3 concurrent); configure distributed limits, provider quotas, monitoring and App Check for public use. Anonymous host identity can be lost if browser storage is cleared; add recoverable sign-in for long-term records. Room codes are bearer invitations and can be forwarded; there is no invitation rotation UI. Codes remain allocated and cannot be reused; completed rooms refuse new guests. Guest memberships persist. Photos are shared with members; do not upload sensitive images. Rules restrict phases and roles but trust the host's entered monetary values.

Build, emulator tests and live deployment have not been run by the patch author.
