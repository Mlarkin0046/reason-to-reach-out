# Reason to Reach Out — Stage 1 public MVP, Stage 2 ready

This repository contains the static public app in `public/`, the preserved Stage 1 Node 22 relay in `backend/`, dependency-free `node:test` coverage in `tests/`, and the standalone Stage 2 API Worker in `worker/`. It is ready for the Cloudflare configuration documented in `STAGE2_CLOUDFLARE.md`; it is not deployed and does not claim deployment.

The browser retains `API_BASE=https://api.reasontoreachout.com`. Stage 2 supports generation through OpenRouter or Workers AI, stateless email ownership verification through Resend, proof-gated email events, and the existing privacy-preserving GHL relay behavior. `wrangler.toml` keeps `public/` as a static Pages app with no root `functions/` directory; `wrangler.worker.toml` configures the separate existing `reason-to-reach-out-api` Worker, preserves dashboard variables, and declares its four native rate limits. This repository is not deployed and does not claim deployment.

## Run locally

```bash
npm test
RTRO_TEST_MODE=1 npm start
python3 -m http.server 8080 --directory public --bind 127.0.0.1
```

Before loading the static app, set the explicit browser override from the same page origin (for example in a local development wrapper) to `window.__RTRO_API_BASE = 'http://127.0.0.1:8787'`. The production constant remains `https://api.reasontoreachout.com`.

`RTRO_TEST_MODE=1` is an explicit safe mode for the local Node backend only. The standalone Worker entry has no test-mode bypass and always requires the native limiter binding for the selected route. Live event relay requires `GHL_API_KEY` and `GHL_LOCATION_ID`; every event carrying email also requires an email-bound `verificationToken` signed by `RTRO_VERIFICATION_SECRET` in both the Worker and Node backend. Tests always inject mocks and never write to GHL. Generation uses the installed `hermes` CLI with provider `openrouter` and model `openai/gpt-4.1-mini` by default. `HERMES_CLI` may select another executable path; `RTRO_HERMES_PROVIDER` and `RTRO_HERMES_MODEL` override the generation provider and model.

The service binds only to `127.0.0.1` and defaults to port `8787` (`PORT` may override it). Allowed browser origins are the apex and `www` production sites plus loopback HTTP origins with explicit ports.

## Verification notes

- The fictional Prairie Air Systems sample is loaded from `public/example.json` and works with the backend stopped.
- Prospect context goes only to `/api/rtro/generate`; event validation rejects prospect fields, generated scripts/plans, and unknown keys.
- PDF creation is local. Lead capture relay failure is non-blocking and logs a browser warning.
- `logs/hardening-red.log` records this hardening pass's expected pre-implementation RED run. No logs or test artifacts live under `public/`.
- `logs/ghl-live-defects-red.log` records the expected RED run for the live-GHL defect regressions. Anonymous activity now resolves by a reserved non-deliverable email before a case-insensitive legacy-name fallback, and LeadConnector 429/5xx responses receive at most three attempts with capped backoff; other 4xx responses are not retried.
- `logs/stage2-red.log` records the expected RED run for the final static-Pages, fail-closed Worker, variable-preservation, and strict GHL-readback regressions.
- Browser automation was not added because Playwright is not present; static, service, validation, CORS, rate-limit, scan, and normalization checks run under Node.
- The suite includes mock-fetch LeadConnector adapter coverage; automated tests never contact live GHL.
- The approved contact email and booking URL are configured and covered by exact-value tests.
- No deployment, proxy, process-manager, OS, or Cloudflare configuration is performed here.
