Last checkpoint: verified-lead email notifications are deployed and passed a controlled production test. A verified lead capture returned 202, GHL contact/tag/note readbacks matched, Outlook received the internal alert from `notifications@notify.airstrikemarketing.us`, Reply-To matched the verified app user, approved fields were present, and prospect context was absent. Worker version: `7520acf8-4fa0-416c-9d8b-20d4cdfaeb0f`.
Next: no implementation work remains; monitor the first real verified lead notification.

Final design:
- Cloudflare Pages serves only `public/`; there is no reserved root `functions/` directory and therefore no Pages API surface.
- `reason-to-reach-out-api` is a standalone Worker whose code lives entirely under `worker/` and always fails closed when a route's native limiter binding is absent.
- `wrangler.worker.toml` declares Workers AI, all four native limiters, and `keep_vars = true` for dashboard-managed variables.
- Both GHL adapters require every written contact field to be present and equal after normalization; tags are compared as case-insensitive, order-independent sets. Note readbacks remain exact.
- OpenRouter generation uses strict OpenAI-compatible `json_schema` output for the complete plan. The schema closes every object, requires all plan/play/rubric/script fields, constrains rubric scores to integers from 0–2, and requires exactly four plays with 1–3 sequence steps each.
- OpenRouter generation is capped at 7,000 output tokens. A syntactically valid JSON response that violates the plan contract receives at most one corrective retry, and both attempts share the original overall request deadline. Invalid JSON, provider errors, and a second contract failure fail honestly through the existing API error handling.
- The prompt preserves fictional-input-only grounding and explicitly keeps every script directed from the app user (sender) to the prospect (recipient).
- Focused pre-implementation failures are recorded in `logs/stage2-red.log`.

Before any future deployment, rerun `npm test`, syntax checks for changed JavaScript, `git diff --check`, `npx wrangler pages functions build`, and `npx wrangler deploy --config wrangler.worker.toml --dry-run`. Then review the diff and Cloudflare bindings. A real deployment still requires appropriate Cloudflare credentials and explicit authorization.
