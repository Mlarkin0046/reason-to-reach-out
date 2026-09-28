import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const wrangler=await readFile(new URL('../wrangler.toml',import.meta.url),'utf8');
const workerWrangler=await readFile(new URL('../wrangler.worker.toml',import.meta.url),'utf8');
const docs=await readFile(new URL('../STAGE2_CLOUDFLARE.md',import.meta.url),'utf8');
const readme=await readFile(new URL('../README_STAGE1.md',import.meta.url),'utf8');

test('Pages config is static-only and contains no Worker bindings or secrets', () => {
  assert.match(wrangler,/pages_build_output_dir\s*=\s*"\.\/public"/);
  assert.doesNotMatch(wrangler,/\[ai\]|\[\[ratelimits\]\]|main\s*=/);
  assert.doesNotMatch(wrangler,/GHL_API_KEY\s*=|OPENROUTER_API_KEY\s*=|RESEND_API_KEY\s*=|RTRO_VERIFICATION_SECRET\s*=/);
});

test('repository has no root Pages Functions directory', async () => {
  await assert.rejects(access(new URL('../functions',import.meta.url)),{code:'ENOENT'});
});

test('standalone API Worker config declares entry, AI, and four native limiters without secrets', () => {
  assert.match(workerWrangler,/name\s*=\s*"reason-to-reach-out-api"/);
  assert.match(workerWrangler,/main\s*=\s*"worker\/index\.js"/);
  assert.match(workerWrangler,/compatibility_date\s*=/);
  assert.match(workerWrangler,/keep_vars\s*=\s*true/);
  assert.match(workerWrangler,/\[ai\][\s\S]*binding\s*=\s*"AI"/);
  for (const binding of ['GENERATION_RATE_LIMIT','VERIFICATION_REQUEST_RATE_LIMIT','VERIFICATION_CONFIRM_RATE_LIMIT','EVENT_RATE_LIMIT']) assert.match(workerWrangler,new RegExp(`name\\s*=\\s*"${binding}"`));
  assert.equal((workerWrangler.match(/\[\[ratelimits\]\]/g)||[]).length,4);
  assert.doesNotMatch(workerWrangler,/GHL_API_KEY\s*=|OPENROUTER_API_KEY\s*=|RESEND_API_KEY\s*=|RTRO_VERIFICATION_SECRET\s*=/);
});

test('runbook lists exact secrets, binding, domains, encrypted handling, and safe verification', () => {
  for (const value of ['OPENROUTER_API_KEY','GHL_API_KEY','GHL_LOCATION_ID','RTRO_VERIFICATION_SECRET','RESEND_API_KEY','RTRO_EMAIL_FROM','AI','reasontoreachout.com','www.reasontoreachout.com','api.reasontoreachout.com']) assert.match(docs,new RegExp(value));
  assert.match(docs,/encrypted/i); assert.match(docs,/never (?:enter|commit|put).*git/i);
  assert.match(docs,/preview/i); assert.match(docs,/redeploy/i);
  assert.doesNotMatch(docs,/sk-or-v1-|Bearer\s+[A-Za-z0-9_-]{20}/);
});

test('Stage 1 README states Stage 2 readiness without claiming deployment', () => {
  assert.match(readme,/Stage 2 ready|Stage 2 readiness/i);
  assert.match(readme,/not deployed|does not claim deployment/i);
});
