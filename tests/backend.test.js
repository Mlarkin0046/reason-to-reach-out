import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allowedOrigins, authorizeEvent, createRateLimiter, validateGenerate, validateEvent } from '../backend/app.js';
import { confirmVerification, requestVerification, resetVerificationRateLimits } from '../worker/lib/verification.js';

const validGenerate = {
  firstName: 'Avery', relationship: 'Stalled deal', stage: 'Proposal or quote',
  company: 'Prairie Air Systems', prospectName: 'Jordan', prospectRole: 'Operations Director',
  situation: 'The proposal is paused while the team compares installation disruption.',
  priority: 'Avoiding downtime', lastContact: '3 weeks', trigger: '', desiredNextStep: '15-minute call'
};

test('generate validation is strict and requires firstName', () => {
  assert.equal(validateGenerate(validGenerate).firstName, 'Avery');
  assert.throws(() => validateGenerate({ ...validGenerate, firstName: '' }), /firstName/);
  assert.throws(() => validateGenerate({ ...validGenerate, surprise: true }), /unknown/i);
});

test('event validation rejects forbidden and arbitrary fields', () => {
  const base = { type: 'channel_viewed', sessionId: 'session-12345678', timestamp: new Date().toISOString(), source: 'newsletter', selectedPlay: 'Decision map', channel: 'Email' };
  assert.equal(validateEvent(base).type, 'channel_viewed');
  for (const key of ['prospectName', 'company', 'prospectCompany', 'situation', 'priority', 'trigger', 'desiredNextStep', 'scripts', 'plan']) {
    assert.throws(() => validateEvent({ ...base, [key]: 'secret' }), /forbidden|unknown/i, key);
  }
  assert.throws(() => validateEvent({ ...base, arbitrary: 1 }), /unknown/i);
  assert.throws(() => validateEvent({ ...base, type: 'anything' }), /type/i);
});

test('feedback accepts only the three specified answers with exact casing', () => {
  const base = { type:'feedback', sessionId:'session-12345678', timestamp:new Date().toISOString(), source:'direct' };
  for (const answer of ['Yes', 'With Edits', 'No']) assert.equal(validateEvent({ ...base, answer }).answer, answer);
  for (const answer of ['Yes as-is', 'With edits', 'yes', 'Maybe']) assert.throws(() => validateEvent({ ...base, answer }), /feedback answer/i);
});

test('lead capture requires the fields used by its structured contact note', () => {
  const lead = { type:'lead_capture', sessionId:'session-12345678', timestamp:new Date().toISOString(), source:'direct', firstName:'Avery', email:'avery@example.com', consent:false, selectedPlay:'Decision guide', channel:'Email' };
  assert.equal(validateEvent(lead).selectedPlay, 'Decision guide');
  for (const key of ['firstName','email','consent','selectedPlay','channel']) assert.throws(() => validateEvent({ ...lead, [key]:undefined }), /lead_capture requires/);
});

test('CORS allowlist permits production and loopback origins only', () => {
  for (const origin of ['https://reasontoreachout.com', 'https://www.reasontoreachout.com', 'http://localhost:5173', 'http://127.0.0.1:8080']) assert.equal(allowedOrigins(origin), true);
  for (const origin of ['https://evil.example', 'http://localhost.evil:5173', 'https://localhost:5173', '']) assert.equal(allowedOrigins(origin), false);
});

test('generation rate limit is 10 per IP per hour', () => {
  let time=1_000; const limit=createRateLimiter(10,()=>time);
  for(let i=0;i<10;i++) assert.equal(limit('203.0.113.9'),true);
  assert.equal(limit('203.0.113.9'),false); assert.equal(limit('203.0.113.10'),true);
  time += 3_600_001; assert.equal(limit('203.0.113.9'),true);
});

test('event rate limit is 60 per IP per hour', () => {
  const limit=createRateLimiter(60); for(let i=0;i<60;i++) assert.equal(limit('198.51.100.4'),true); assert.equal(limit('198.51.100.4'),false);
});

test('/event lets relay failures reach the non-2xx error response', async () => {
  const source = await readFile(new URL('../backend/app.js', import.meta.url), 'utf8');
  assert.match(source, /const event=await authorizeEvent\(body,[\s\S]*await ghl\.record\(event\);\s*return json\(res,202/);
  assert.doesNotMatch(source, /try\s*\{\s*await ghl\.record/);
});

test('Node event path requires and strips an email-bound verification token', async () => {
  const now=1_800_000_000_000;
  const verificationEnv={RTRO_VERIFICATION_SECRET:'a-test-secret-that-is-long-enough'};
  let code;
  resetVerificationRateLimits();
  await requestVerification({email:'owner@example.com'},verificationEnv,{now:()=>now,ip:'node-test',fetchImpl:async(_url,options)=>{code=JSON.parse(options.body).text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1];return new Response('{}',{status:200});}});
  const {verificationToken}=await confirmVerification({email:'owner@example.com',code},verificationEnv,{now:()=>now});
  const event={type:'wording_copied',sessionId:'session-12345678',timestamp:'2026-09-28T12:00:00.000Z',source:'direct',email:'owner@example.com'};
  await assert.rejects(authorizeEvent(event,{verificationEnv,now:()=>now}),(error)=>error.code==='RTRO_UNAUTHORIZED');
  const authorized=await authorizeEvent({...event,verificationToken},{verificationEnv,now:()=>now});
  assert.equal(authorized.email,event.email);
  assert.equal('verificationToken' in authorized,false);
});
