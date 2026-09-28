Build Stage 1 public-release MVP in this repo. Do not deploy and do not touch /root/ai-surfer-assets/software/reason-to-reach-out-demo. Work only in this repo. Use strict TDD: add focused Node tests first, run them and record expected RED output in logs/tdd-red.log, then implement and run GREEN. Preserve core strategy quality while changing transport and required fields.

Structure:
- public/: static app copied from owner version. Final public files live here.
- backend/: isolated Node 22 HTTP service listening only on 127.0.0.1. Do not edit Hermes, The AI Surfer OS, nginx, PM2, systemd, or Cloudflare.
- tests/: node:test tests. Avoid third-party dependencies if practical.

Configuration:
- In public/app.js define exactly one API address: const API_BASE = "https://api.reasontoreachout.com". No other API host, IP, sslip.io, or credentials in public/. For local testability support an explicit window override such as window.__RTRO_API_BASE before network calls while retaining the one production constant.
- Public URL https://reasontoreachout.com.
- Booking URL https://book.airstrikemarketing.us/widget/bookings/30-mincalendar.
- Contact email is unresolved. Use a single clearly marked temporary constant contact@reasontoreachout.invalid and surface this in README/verification; never use an airstrikemarketing.us address. Make replacement a one-line change.
- Phone 515-577-3750 tel:+15155773750.
- Mailbox Power https://www.mailboxpower.com/platform/platform-demo?invite=loyaltyeffect
- Vimeo https://player.vimeo.com/video/921187412#t=356s

Backend endpoints:
- POST /api/rtro/generate: strict JSON validation, CORS only https://reasontoreachout.com, https://www.reasontoreachout.com, http://localhost:* and http://127.0.0.1:*; preflight support. Rate limit 10/IP/hour using CF-Connecting-IP first. 30-second ceiling. Generate through Hermes without browser secrets: invoke the installed hermes CLI as a child process or an injectable generator adapter, with a prompt constructed server-side from validated fields. Return normalized JSON only. Friendly 429 and timeout/failure messages.
- POST /api/rtro/event: strict event allowlist and per-type schemas; 60/IP/hour; same CORS. Use GHL_API_KEY and GHL_LOCATION_ID only from process env. Public code must contain no GHL credentials. Use LeadConnector API, Version 2021-07-28 or v3 where appropriate, browser-like UA, and verify writes by readback where practical. Prefix every tag with RTRO.
- Allowed events: lead_capture, feedback, plan_generated, play_selected, channel_viewed, wording_copied, pdf_downloaded, contact_click.
- Never accept/store/send prospectName, company/prospectCompany, situation, priority, trigger, desiredNextStep, scripts, generated plan, or arbitrary extra keys in event payloads. Reject unknown keys.
- Lead capture upserts app user only: firstName, email, optional company, consent boolean, source, selected play, channel, timestamp, sessionId. Tags RTRO - PDF Download, RTRO - Source: {src}, RTRO - Consent Yes only when true, RTRO - Physical Mail Interest for Mailed card or Gift/leave-behind. Do not enroll workflows.
- Feedback: known email attaches note and RTRO - Feedback: Yes/With Edits/No. Anonymous feedback/events go to one reusable GHL contact named RTRO Anonymous Feedback or simplest equivalent. If email appears later, attach earlier session event summary to that contact. Wording copied tags known contact RTRO - Copied Wording. Contact clicks tag RTRO - Clicked Contact or RTRO - Clicked Mailbox Power.
- Use dependency injection/mocks so tests never write to live GHL. Provide a documented explicit local test mode. The final live integration will be tested separately by the parent agent.

Frontend:
- Remove every real-client reference: Bethany Life, LifeChoices, Kenzie King, 65% gap, and all real data. Replace with one fictional detailed regional HVAC sample. Put pre-generated normalized output in public/example.json so example works with backend stopped. Clearly label sample.
- Add required Your first name to main form. Every generated/fallback/static sample script signs with that name. Prompt and reasoning use second person and never use Mike/Larkin in generation context. Contact block may say Talk to Mike.
- Remove Email this plan/setup required and Owner tools/CSV completely.
- Download modal sends lead_capture to /api/rtro/event then downloads PDF regardless of relay failure; relay failure only console warning. Copy accurately says contact goes to Airstrike Marketing. Consent optional unchecked. Prospect data never included.
- Privacy copy says situation text is sent to an AI service for generation; prospect details are never sent to GHL.
- One recommendations/nothing-sent disclaimer near channel tabs only.
- Add dynamic end contact block. For selected play primary channel Mailed card/Gift leave-behind show full requested copy, phone/email/book button, Vimeo and Mailbox Power links and note. Other channels show light copy. The block is based on selected play, not currently viewed tab, and updates on play switch. target=_blank rel=noopener on external web links. Phone/email need not new-tab.
- Include equivalent contact block as last PDF page.
- Feedback prompt above contact block: Yes as-is / With edits / No; conditional optional What's missing and submit; final thanks. Events include selected play, channel, score, source; known email if captured.
- Track all specified behaviors, using anonymous sessionId until email known, then include email and lead capture reconciles earlier events. Plan generated relationship/stage/source; play selection rank; channel tab; copy wording; PDF; contact clicks phone/email/booking/video/Mailbox Power. Source from ?src= persisted for session, sanitized, all events, GHL source tag.
- See an example first above form. It fills fictional form and shows example.json instantly with zero API. Friendly generation error exact text: “We're getting a lot of requests right now. Try again in a minute, or view the example below.” and reveal/focus See an example.
- Rubric object has relevance,newness,value,decisionHelp,prospectBenefit each 0..2; total derived, never trusted from model. Show breakdown on cards/scorecard and PDF. Backend prompt requires rubric.
- Footer exact copyright © Airstrike Marketing. Keep Reason to Reach Out demo. No link to airstrikemarketing.us. SEO title/meta/OG including og:url. No extension artifacts.
- Mobile 375px usable; reduce mobile hero.
- Keep local PDF library/logo; preserve ASOS_RUN compatibility safely.

Testing/reporting files:
- package.json scripts test and start.
- Automated tests for validation, forbidden event fields, CORS, rate limits, source sanitization, score derivation, public-secret scan, real-client scan, one API_BASE, absence of internal buttons, required content.
- Browser QA may use Playwright only if already available; otherwise create DOM-independent/static verifiers and leave parent agent to run browser. Do not install large packages.
- README_STAGE1.md with start commands and noted temporary contact email blocker.
- Keep all test artifacts/logs outside public/.
- Commit checkpoints. End with all tests passing and concise git diff/stat.