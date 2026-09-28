Fix the verified generation timeout while preserving quality. Use TDD first and work only here.

Observed live result: current backend using default `hermes --oneshot` hit the 30-second server timeout. A direct test using Hermes with `--provider openrouter --model openai/gpt-4.1-mini --reasoning none --safe-mode` and compact output constraints completed in 28.48 seconds with four valid plays.

Required changes:
- In backend/hermes.js default to provider `openrouter` and model `openai/gpt-4.1-mini`, overridable with RTRO_HERMES_PROVIDER and RTRO_HERMES_MODEL. Invoke Hermes with `--provider`, `--model`, `--reasoning none`, `--safe-mode`, `--oneshot`, prompt. Continue honoring HERMES_CLI.
- Keep the exact strategic/prompt safeguards. Add compact output constraints: diagnosis 2 sentences; title under 7 words; strategicAngle, whyNow, valueToBring, rationale each one sentence under 28 words; exactly 2 short sequence steps; email under 90 words; call opener under 55; voicemail under 50; text under 35; LinkedIn under 65; mailed card and gift note under 70. This is latency control, not quality reduction.
- Explicitly require assumptions to be grounded in supplied input; if unknown, leave assumptions empty. No location/market/budget/authority/technical feasibility inventions.
- Robustly parse exact JSON, fenced JSON, or a short wrapper around the first complete JSON object. Reject missing/unparseable JSON.
- Add unit tests that inspect invocation arguments and parsing via an injectable exec function. Capture failing RED test output in logs/generation-red.log, then pass the whole suite and node --check.
- Update README with default model/provider and overrides. Do not touch deployment or public code.