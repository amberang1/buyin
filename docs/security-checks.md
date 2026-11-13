# Security deployment checks

Use a test Firebase project first; enable Anonymous Authentication and publish rules to the configured named database.

- Without authentication, all game/player/member data access is denied.
- Authenticated outsiders cannot list games or read a room or its players before joining.
- Hosts create rooms with 32-character random codes. Guests joining with the code can read records, but cannot edit players, settings, or phases, or create membership for a different UID.
- Host can add/remove players only in setup, record transactions only in active, and finalize stack values together with the results transition. Neither guest nor host can reopen results.
- Old four-digit rooms are denied. Export them before migrating.
- Inspect the production JS bundle for the Gemini secret. Browser network requests should target /api/scan, not Gemini directly.
- POST /api/scan with no/invalid token: 401. Valid non-host or wrong phase: 403. Invalid/oversized input: 400/413. Exceed limits: 429.
- Confirm host scans work in setup/settlement. Verify AI results manually.
- Rotate keys exposed by older builds. Keep the replacement in server secrets only; restrict it to Gemini where supported.
- Deploy a Node service over HTTPS, not static hosting. AI Studio deployment may need a different start command or hosting configuration.

## Remaining considerations

Current scan rate limits are per server process (6/minute per UID, 30/minute total, 3 concurrent); configure distributed limits, provider quotas, monitoring and App Check for public use. Anonymous host identity can be lost if browser storage is cleared; add recoverable sign-in for long-term records. Room codes are bearer invitations and can be forwarded; there is no invitation rotation UI. Guest memberships persist. Photos are shared with members; do not upload sensitive images. Rules restrict phases and roles but trust the host's entered monetary values.

Build, emulator tests and live deployment have not been run by the patch author.
