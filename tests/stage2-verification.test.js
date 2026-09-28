import test from 'node:test';
import assert from 'node:assert/strict';
import { requestVerification, confirmVerification, verifyProofToken, resetVerificationRateLimits } from '../worker/lib/verification.js';

const env={ RTRO_VERIFICATION_SECRET:'a-test-secret-that-is-long-enough', RESEND_API_KEY:'resend-test', RTRO_EMAIL_FROM:'Reason to Reach Out <verify@example.com>' };

test('verification request sends a human-pasteable code with at least 60 bits without returning it', async () => {
  resetVerificationRateLimits(); const calls=[];
  const fetchImpl=async (url,options)=>{ calls.push({url,options,body:JSON.parse(options.body)}); return new Response('{}',{status:200}); };
  const result=await requestVerification({ email:' Owner@Example.COM ' },env,{ fetchImpl,now:()=>1_800_000_000_000,ip:'203.0.113.1' });
  assert.deepEqual(result,{ok:true});
  assert.equal(calls[0].url,'https://api.resend.com/emails');
  const code=calls[0].body.text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)?.[1];
  assert.ok(code,'expected a 16-character base32-style code (at least 64 bits)');
  assert.doesNotMatch(JSON.stringify(result),/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/);
  await assert.rejects(requestVerification({email:'bad'},env,{fetchImpl,ip:'other'}),/Invalid email/);
  await assert.rejects(requestVerification({email:'owner@example.com'},env,{fetchImpl,ip:'203.0.113.1'}),/Too many/);
});

test('confirm accepts the current deterministic code and returns a short-lived email-bound token', async () => {
  resetVerificationRateLimits(); let code;
  const now=1_800_000_000_000;
  const fetchImpl=async (_url,options)=>{ code=JSON.parse(options.body).text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1]; return new Response('{}',{status:200}); };
  await requestVerification({email:'owner@example.com'},env,{fetchImpl,now:()=>now,ip:'a'});
  const result=await confirmVerification({email:'OWNER@example.com',code},env,{now:()=>now});
  assert.equal(result.ok,true); assert.ok(result.verificationToken);
  assert.equal(await verifyProofToken(result.verificationToken,'owner@example.com',env,{now:()=>now+60_000}),true);
  assert.equal(await verifyProofToken(result.verificationToken,'other@example.com',env,{now:()=>now+60_000}),false);
  assert.equal(await verifyProofToken(result.verificationToken,'owner@example.com',env,{now:()=>now+16*60_000}),false);
});

test('wrong and expired verification codes are rejected', async () => {
  resetVerificationRateLimits(); let code;
  const issued=1_800_000_000_000;
  const fetchImpl=async (_url,options)=>{ code=JSON.parse(options.body).text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1]; return new Response('{}',{status:200}); };
  await requestVerification({email:'owner@example.com'},env,{fetchImpl,now:()=>issued,ip:'b'});
  await assert.rejects(confirmVerification({email:'owner@example.com',code:'AAAA-AAAA-AAAA-AAAA'},env,{now:()=>issued}),/Invalid or expired/);
  await assert.rejects(confirmVerification({email:'owner@example.com',code},env,{now:()=>issued+21*60_000}),/Invalid or expired/);
});
