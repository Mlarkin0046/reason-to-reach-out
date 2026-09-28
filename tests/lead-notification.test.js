import test from 'node:test';
import assert from 'node:assert/strict';
import { sendLeadNotification } from '../worker/lib/lead-notification.js';
import { onRequest as eventRoute } from '../worker/routes/event.js';
import { confirmVerification, requestVerification, resetVerificationRateLimits } from '../worker/lib/verification.js';
import { validateEvent } from '../worker/lib/core.js';

const now=1_800_000_000_000;
const baseEnv={RTRO_VERIFICATION_SECRET:'a-test-secret-that-is-long-enough'};
const lead={type:'lead_capture',sessionId:'session-12345678',timestamp:'2026-09-28T12:00:00.000Z',source:'Campaign / West!',firstName:'Avery',email:'owner@example.com',company:'Sender Co',consent:false,selectedPlay:'Decision guide',channel:'Email'};
const post=(body)=>new Request('https://api.reasontoreachout.com/api/rtro/event',{method:'POST',headers:{Origin:'https://reasontoreachout.com','Content-Type':'application/json'},body:JSON.stringify(body)});

async function proof() {
  resetVerificationRateLimits(); let code;
  await requestVerification({email:lead.email},baseEnv,{now:()=>now,ip:'lead-notification',fetchImpl:async(_url,options)=>{code=JSON.parse(options.body).text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1];return new Response('{}',{status:200});}});
  return (await confirmVerification({email:lead.email,code},baseEnv,{now:()=>now})).verificationToken;
}

test('lead notification uses the exact Resend envelope and a privacy allowlisted body', async () => {
  let call;
  await sendLeadNotification({...lead,prospectName:'SECRET PERSON',prospectCompany:'SECRET PROSPECT',scenario:'SECRET SCENARIO',priorities:'SECRET PRIORITY',triggers:'SECRET TRIGGER',desiredNextStep:'SECRET STEP',scripts:'SECRET SCRIPT',plan:'SECRET PLAN',verificationToken:'SECRET TOKEN'}, {
    env:{RESEND_API_KEY:'resend-test',RTRO_NOTIFICATION_FROM:'Reason to Reach Out <notifications@example.com>',RTRO_NOTIFICATION_TO:'team@example.com'},
    fetchImpl:async(url,options)=>{call={url,options,body:JSON.parse(options.body)};return new Response('{}',{status:200});}
  });
  assert.equal(call.url,'https://api.resend.com/emails');
  assert.equal(call.options.headers.Authorization,'Bearer resend-test');
  assert.match(call.options.headers['Idempotency-Key'],/^rtro-lead\/[a-f0-9]{64}$/);
  assert.deepEqual(call.body,{
    from:'Reason to Reach Out <notifications@example.com>',to:['team@example.com'],
    subject:'New Reason to Reach Out lead: Avery, Sender Co',
    text:'First name: Avery\nVerified email: owner@example.com\nCompany: Sender Co\nSelected play: Decision guide\nRecommended channel: Email\nMarketing consent: No\nSource: Campaign West\nSubmission timestamp: 2026-09-28T12:00:00.000Z',
    reply_to:'owner@example.com'
  });
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.doesNotMatch(JSON.stringify(call.body),/SECRET|verification token/i);

  await sendLeadNotification({...lead,company:''},{env:{RESEND_API_KEY:'resend-test',RTRO_NOTIFICATION_FROM:'from@example.com',RTRO_NOTIFICATION_TO:'to@example.com'},fetchImpl:async(_url,options)=>{call={body:JSON.parse(options.body)};return new Response('{}',{status:200});}});
  assert.equal(call.body.subject,'New Reason to Reach Out lead: Avery');
  assert.doesNotMatch(call.body.text,/^Company:/m);
});

test('lead notification idempotency keys are deterministic, distinct, bounded, and header-safe', async () => {
  const keys=[];
  const capture=async(_url,options)=>{const headers=new Headers(options.headers);keys.push(headers.get('Idempotency-Key'));return new Response('{}',{status:200});};
  const options={env:{RESEND_API_KEY:'resend-test',RTRO_NOTIFICATION_FROM:'from@example.com',RTRO_NOTIFICATION_TO:'to@example.com'},fetchImpl:capture};
  await sendLeadNotification(lead,options);
  await sendLeadNotification({...lead},options);
  await sendLeadNotification({...lead,sessionId:'session-87654321'},options);
  const hostile=validateEvent({...lead,sessionId:'valid hostile\r\nX-Evil: yes 💣'});
  await sendLeadNotification(hostile,options);
  assert.equal(keys[0],keys[1]);
  assert.notEqual(keys[0],keys[2]);
  for (const key of keys) {
    assert.match(key,/^rtro-lead\/[a-f0-9]{64}$/);
    assert.equal(Buffer.byteLength(key,'ascii'),74);
  }
});

test('lead notification timeout is bounded even when the fetch never settles', async () => {
  const started=Date.now();
  await assert.rejects(sendLeadNotification(lead,{env:{RESEND_API_KEY:'resend-test',RTRO_NOTIFICATION_FROM:'from@example.com',RTRO_NOTIFICATION_TO:'to@example.com'},fetchImpl:async()=>new Promise(()=>{}),timeoutMs:10}),/timed out/);
  assert.ok(Date.now()-started<1_000);
});

test('event notification runs only after successful verified lead GHL readback and uses waitUntil', async () => {
  const verificationToken=await proof(); const order=[]; const pending=[];
  const response=await eventRoute({request:post({...lead,verificationToken}),env:{...baseEnv,RTRO_NOW:()=>now,RTRO_GHL_ADAPTER:{record:async()=>{order.push('ghl');}},RTRO_LEAD_NOTIFIER:async(value)=>{order.push('notify');assert.equal('verificationToken' in value,false);}},waitUntil:(promise)=>{order.push('waitUntil');pending.push(promise);}});
  assert.equal(response.status,202);
  await Promise.all(pending);
  assert.deepEqual(order,['ghl','waitUntil','notify']);
});

test('notification is skipped for other event types and GHL failures', async () => {
  let sends=0;
  const other={type:'channel_viewed',sessionId:lead.sessionId,timestamp:lead.timestamp,source:lead.source,selectedPlay:lead.selectedPlay,channel:lead.channel};
  let response=await eventRoute({request:post(other),env:{...baseEnv,RTRO_GHL_ADAPTER:{record:async()=>{}},RTRO_LEAD_NOTIFIER:async()=>{sends++;}},waitUntil:()=>assert.fail('must not schedule')});
  assert.equal(response.status,202);
  response=await eventRoute({request:post({...lead,verificationToken:await proof()}),env:{...baseEnv,RTRO_NOW:()=>now,RTRO_GHL_ADAPTER:{record:async()=>{throw new Error('readback failed');}},RTRO_LEAD_NOTIFIER:async()=>{sends++;}},waitUntil:()=>assert.fail('must not schedule')});
  assert.equal(response.status,502); assert.equal(sends,0);
});

test('notification rejection is isolated from the successful response with and without waitUntil', async () => {
  for (const deferred of [false,true]) {
    const pending=[];
    const response=await eventRoute({request:post({...lead,verificationToken:await proof()}),env:{...baseEnv,RTRO_NOW:()=>now,RTRO_GHL_ADAPTER:{record:async()=>{}},RTRO_LEAD_NOTIFIER:async()=>{throw new Error('Resend rejected');},RTRO_NOTIFICATION_LOGGER:()=>{}},...(deferred?{waitUntil:(promise)=>pending.push(promise)}:{})});
    assert.equal(response.status,202); assert.deepEqual(await response.json(),{ok:true});
    await Promise.all(pending);
  }
});

test('missing notification config is isolated and emits only generic sanitized telemetry', async () => {
  const verificationToken=await proof(); const pending=[]; const logs=[];
  const response=await eventRoute({
    request:post({...lead,verificationToken}),
    env:{...baseEnv,RTRO_NOW:()=>now,RTRO_GHL_ADAPTER:{record:async()=>{}},RTRO_NOTIFICATION_LOGGER:(entry)=>logs.push(entry)},
    waitUntil:(promise)=>pending.push(promise)
  });
  assert.equal(response.status,202);
  await Promise.all(pending);
  assert.deepEqual(logs,[{category:'lead_notification_failure',message:'Lead notification failed.'}]);
  assert.doesNotMatch(JSON.stringify(logs),/Avery|owner@example\.com|Sender Co|session-12345678|verification|config|RESEND/i);
});

test('Resend non-2xx is isolated and emits the same generic sanitized telemetry', async () => {
  const verificationToken=await proof(); const pending=[]; const logs=[];
  const response=await eventRoute({
    request:post({...lead,verificationToken}),
    env:{...baseEnv,RESEND_API_KEY:'resend-test',RTRO_NOTIFICATION_FROM:'from@example.com',RTRO_NOTIFICATION_TO:'to@example.com',RTRO_NOW:()=>now,RTRO_GHL_ADAPTER:{record:async()=>{}},RTRO_FETCH:async()=>new Response('recipient rejected',{status:422}),RTRO_NOTIFICATION_LOGGER:(entry)=>logs.push(entry)},
    waitUntil:(promise)=>pending.push(promise)
  });
  assert.equal(response.status,202);
  await Promise.all(pending);
  assert.deepEqual(logs,[{category:'lead_notification_failure',message:'Lead notification failed.'}]);
  assert.doesNotMatch(JSON.stringify(logs),/Avery|owner@example\.com|Sender Co|session-12345678|verification|recipient|422|RESEND/i);
});
