# Ledger regression checks

Run `npm ci`, `npm run lint`, and `npm run build` before deploying. Use a test Firebase project, not live financial records.

- Create a room in two browsers. Join with the same code; verify both see the same players.
- In setup add two players concurrently from two tabs signed into the same host identity. Both should remain in the roster. Guest browsers must not be able to edit. Try an invalid negative/zero buy-in and ensure it cannot be saved.
- During an active session, submit two entries of the same amount for the same player from two host tabs. Both entries should be recorded (not deduplicated).
- Submit entries for different players simultaneously. Neither should be lost.
- If a transaction fails, its modal should stay open and show an error.
- In settlement leave one stack blank: saving should be disabled. Explicitly enter 0 to represent a zero stack.
- Submit settlement from two browsers. Only the first successful transaction should advance to results; stack values and results phase should commit together.
- Try navigating from results to Game, Cash Out, and Settings/back. Results should not reopen.
- Try AI output 125.5 (should remain 125.5), or unstructured text (should show an error rather than guess).
- Share results on mobile and desktop; confirm that no photo is shared.

## Not addressed here
See the security checks for authentication, room membership and Gemini proxy deployment. Photo storage, complete monetary representation migration and offline behavior need separate work. Client validation alone is not a security boundary. Do not deploy to real users until access controls and secrets are verified.
