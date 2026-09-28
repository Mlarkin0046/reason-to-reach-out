# Cloudflare Pages + API Worker Stage 2 configuration

The repository is ready for configuration, but this document does not claim that it has been deployed. Keep the `reason-to-reach-out` Pages project static: `wrangler.toml` only defines the `public/` Pages output, and the repository intentionally has no root `functions/` directory. The existing `reason-to-reach-out-api` Worker owns all `/api/rtro/*` traffic and uses `wrangler.worker.toml` plus `worker/index.js`; its route and library modules live under `worker/routes/` and `worker/lib/`.

## Required project settings

Use the existing `reason-to-reach-out` Pages Git project and its V2 build system for the static site. Configure the following on the separate `reason-to-reach-out-api` Worker for its production and preview environments.

Configure these encrypted secrets for both Production and Preview:

- `GHL_API_KEY` — LeadConnector private integration token.
- `RTRO_VERIFICATION_SECRET` — a newly generated, high-entropy value of at least 32 random bytes.
- `RESEND_API_KEY` — Resend API token authorized for the sending domain.
- `OPENROUTER_API_KEY` — optional; when present, generation prefers OpenRouter. If omitted, the `AI` binding below is required.

Configure these non-secret variables for both Production and Preview:

- `GHL_LOCATION_ID` — the target GoHighLevel location ID.
- `RTRO_EMAIL_FROM` — a Resend-verified sender, such as `Reason to Reach Out <verify@your-verified-domain>`.
- `RTRO_AI_MODEL` — optional OpenRouter model override; default is `openai/gpt-4.1-mini`.
- `RTRO_CF_AI_MODEL` — optional Workers AI model override; default is `@cf/meta/llama-3.1-8b-instruct`.

All secrets must be stored as encrypted Cloudflare Worker secrets. They must never enter git, either Wrangler file, build logs, browser code, screenshots, or documentation. Do not use plaintext `[vars]` for secrets.

## Workers AI binding

`wrangler.worker.toml` declares the Workers AI binding as `AI` and four native rate-limit bindings: `GENERATION_RATE_LIMIT`, `VERIFICATION_REQUEST_RATE_LIMIT`, `VERIFICATION_CONFIRM_RATE_LIMIT`, and `EVENT_RATE_LIMIT`. Apply them to `reason-to-reach-out-api`. The Worker always fails closed with `503` if the limiter needed by a route is absent; there is no production-entry test-mode bypass. `keep_vars = true` preserves dashboard-managed non-secret variables during code deployment. At least one generation provider must be configured: `OPENROUTER_API_KEY` or `AI`.

## Custom domains

Attach the site names to Pages:

- `reasontoreachout.com`
- `www.reasontoreachout.com`

Attach the API name to the standalone `reason-to-reach-out-api` Worker:

- `api.reasontoreachout.com`

Keep `public/app.js` configured with `API_BASE=https://api.reasontoreachout.com`. The CORS allowlist also accepts the production `reason-to-reach-out.pages.dev` host, branch previews ending in `.reason-to-reach-out.pages.dev`, and explicit-port loopback development origins.

## Safe deployment and verification

1. Commit and push only after reviewing the diff and confirming `npm test` and the JavaScript syntax checks pass. This repository task intentionally does not push or deploy.
2. In Cloudflare, keep Pages static with output directory `public` and no Pages Functions. On `reason-to-reach-out-api`, add encrypted secrets, non-secret variables, `AI`, and all four native rate-limit bindings.
3. Deploy the API explicitly with `npx wrangler deploy --config wrangler.worker.toml`, then deploy the separate Pages project. Binding or secret changes require a Worker redeploy.
4. From a branch preview, use the fictional example, generate a plan, and exercise `OPTIONS` plus each Worker `/api/rtro/*` endpoint. Confirm the preview origin receives its exact `Access-Control-Allow-Origin` value.
5. Request a verification code using a controlled inbox. Confirm neither the HTTP response nor Cloudflare logs reveal the code. Try a wrong code, then the delivered code. Confirm a PDF downloads only after `/event` returns `202`.
6. In a non-production GHL test contact, verify the exact `RTRO - ...` tags and structured note, and confirm no prospect name, role, situation, priority, trigger, scripts, or plan appears in GHL. Confirm no workflow enrollment occurs.
7. After preview checks, verify apex and `www` route to Pages while `api` routes to `reason-to-reach-out-api`; verify TLS/DNS and repeat generation and verified capture from each public site. Confirm the `pages.dev` production URL remains functional.
8. Rotate any credential immediately if it appears in source, output, or logs; remove it from history before deployment.
