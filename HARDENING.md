Harden the existing Stage 1 implementation. Work only in this repo. Use TDD: add failing tests for each issue, run them and save the RED output to logs/hardening-red.log, then implement and run all tests. Do not deploy or touch any service/system config.

Fix these exact acceptance gaps:

1. Contact block copy and labels must match the boss's specification exactly.
Physical primary-channel plays (Mailed card or Gift/leave-behind):
Heading: "Want this on their desk this week?"
Body: "Physical follow-up gets opened when email doesn't. I can help you set it up, or you can see how it works on your own."
Include a visible "Talk to Mike" label, phone, email, and button "Book 15 minutes".
Secondary labels: "See how sending works (2 min)" to Vimeo and "Explore the platform" to Mailbox Power.
Note: "Sending cards and gifts requires a Mailbox Power account."
Other plays:
Heading: "Questions about this play?"
Body: "Happy to talk it through."
Phone, email, Book 15 minutes only. No Mailbox Power/video links.
Use selected play primaryChannel, not viewed tab. Update on play switch. Exact same text-version logic on the PDF final page.

2. Feedback exact UX:
Question: "Would you actually send this?"
Buttons: "Yes, as-is", "With edits", "No".
Yes sends answer "Yes" immediately and replaces the prompt with exact "Thanks — this helps."
With edits/No reveal optional "What's missing?" and submit; submit sends answer and replaces prompt with exact thanks. Do not reveal textarea for Yes. Backend accepts only Yes, With Edits, No and maps tags exactly RTRO - Feedback: Yes / With Edits / No.

3. No airstrikemarketing.us link may appear anywhere in public/. The previously chosen booking link violates that rule. Replace BOOKING_URL with one temporary clearly marked value `https://booking.reasontoreachout.invalid` and document it as a second unresolved launch blocker, a one-line replacement. Keep CONTACT_EMAIL `contact@reasontoreachout.invalid`. Do not invent real addresses.

4. GHL relay correctness and verification:
- lead_capture contact source should be sanitized event.source, not a generic value.
- every lead_capture must create a structured contact note recording consent, source, selected play, recommended channel, and timestamp. Do not include prospect details.
- all anonymous events must be logged as notes on the single exact RTRO Anonymous Feedback contact; known-contact events must be notes on that contact. Keep tags for wording/contact actions.
- when an email appears later, add one note attaching that session's earlier anonymous event summary and clear the in-memory summary.
- exact-match found contact by email; exact-match anonymous record by full/name fields, not blindly first search result.
- after contact create/update and note creation, read back the exact target. Throw on write/readback failure.
- backend /event must return non-2xx on relay failure so browser track() logs it; PDF flow must still continue because track() catches internally.
- Add mock-fetch adapter tests proving request bodies/tags/notes contain app-user fields and no prospect fields, known and anonymous routes, and readbacks. Never hit live GHL from automated tests.

5. Generation request client timeout: AbortController at about 30 seconds and exact friendly error. Controls re-enable in finally. See-example remains usable.

6. Phone-proof JS: guard crypto, sessionStorage, navigator.clipboard, URL.createObjectURL, and PDFLib. No white screen in insecure context; clipboard degrades to Select and copy.

7. Preserve all currently passing requirements. Update README blockers and test count. Do not minify more. Run node --check on all JS and npm test. Commit a checkpoint when done.