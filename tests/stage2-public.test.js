import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');

test('PDF capture UI requests a high-entropy pasteable code, reveals confirmation controls, and keeps consent optional unchecked', () => {
  assert.match(html,/id="verificationCode"[^>]*autocomplete="one-time-code"[^>]*maxlength="19"/);
  assert.doesNotMatch(html,/Six-digit|\[0-9\]\{6\}/i);
  assert.match(html,/id="verificationStep"/);
  assert.match(html,/id="captureStatus"[^>]*role="status"/);
  assert.doesNotMatch(html,/id="nurtureConsent"[^>]*checked/);
  assert.match(js,/\/api\/rtro\/verify\/request/);
  assert.match(js,/\/api\/rtro\/verify\/confirm/);
});

test('lead capture includes proof and PDF creation occurs only after an accepted event response', () => {
  assert.match(js,/verificationToken/);
  assert.match(js,/if\s*\(!captureResponse\.ok\)\s*throw/);
  const accepted=js.indexOf('if(!captureResponse.ok)');
  const pdf=js.indexOf('await createPdf()',accepted);
  assert.ok(accepted>=0&&pdf>accepted,'PDF must be created after accepted capture');
  assert.doesNotMatch(html,/PDF still downloads if the relay is unavailable/i);
  assert.match(js,/finally\s*\{[^}]*disabled=false/s);
});

test('browser retains the verification token and binds it to later email events', () => {
  assert.match(js,/state\.verificationToken=verificationToken/);
  assert.match(js,/state\.email\s*&&\s*state\.verificationToken\s*\?/);
  assert.doesNotMatch(js,/rtro_email/);
});

test('an expired proof clears email and token together and prompts re-verification', () => {
  assert.match(js,/captureResponse\.status\s*===\s*401/);
  assert.match(js,/state\.email\s*=\s*['"]['"][\s\S]*state\.verificationToken\s*=\s*['"]['"]/);
  assert.match(js,/verify again|re-verify|verification.*expired/i);
});

test('public files contain no service secrets or private key material', async () => {
  const files=await readdir(new URL('../public/',import.meta.url));
  const combined=(await Promise.all(files.filter((name)=>/\.(?:html|js|json|css|txt)$/i.test(name)).map((name)=>readFile(new URL(`../public/${name}`,import.meta.url),'utf8')))).join('\n');
  assert.doesNotMatch(combined,/OPENROUTER_API_KEY|RESEND_API_KEY|RTRO_VERIFICATION_SECRET|GHL_API_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-or-v1-/i);
});
