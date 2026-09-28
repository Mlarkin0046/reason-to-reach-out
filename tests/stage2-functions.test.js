import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as eventRoute } from '../worker/routes/event.js';
import { onRequest as generateRoute } from '../worker/routes/generate.js';
import { onRequest as requestRoute } from '../worker/routes/verify/request.js';
import { onRequest as confirmRoute } from '../worker/routes/verify/confirm.js';
import { confirmVerification, requestVerification, resetVerificationRateLimits } from '../worker/lib/verification.js';
import { createGhlAdapter } from '../worker/lib/ghl.js';
import { createRateLimiter } from '../worker/lib/http.js';

const origin='https://branch.reason-to-reach-out.pages.dev';
const env={ RTRO_VERIFICATION_SECRET:'a-test-secret-that-is-long-enough',RTRO_NOTIFICATION_LOGGER:()=>{} };
const event={ type:'lead_capture',sessionId:'session-12345678',timestamp:'2026-09-28T12:00:00.000Z',source:'Campaign / West!',firstName:'Avery',email:'owner@example.com',company:'Sender Co',consent:false,selectedPlay:'Decision guide',channel:'Email' };
const context=(request,extraEnv={})=>({request,env:{...env,...extraEnv}});
const post=(path,body,headers={})=>new Request(`https://api.reasontoreachout.com${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('Pages best-effort rate limiter resets by window and isolates client keys', () => {
  let now=1_000; const limit=createRateLimiter(2,1_000,()=>now);
  assert.equal(limit('a'),true); assert.equal(limit('a'),true); assert.equal(limit('a'),false);
  assert.equal(limit('b'),true); now+=1_001; assert.equal(limit('a'),true);
});

async function proof(now=1_800_000_000_000) {
  resetVerificationRateLimits(); let code;
  await requestVerification({email:event.email},env,{now:()=>now,ip:'proof',fetchImpl:async(_url,options)=>{code=JSON.parse(options.body).text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1];return new Response('{}',{status:200});}});
  return (await confirmVerification({email:event.email,code},env,{now:()=>now})).verificationToken;
}

test('lead_capture rejects missing proof and strips proof before the GHL write', async () => {
  let recorded;
  let response=await eventRoute(context(post('/api/rtro/event',event),{RTRO_NOW:()=>1_800_000_000_000,RTRO_GHL_ADAPTER:{record:async(value)=>{recorded=value;}}}));
  assert.equal(response.status,401);
  const token=await proof();
  response=await eventRoute(context(post('/api/rtro/event',{...event,verificationToken:token}),{RTRO_NOW:()=>1_800_000_000_000,RTRO_GHL_ADAPTER:{record:async(value)=>{recorded=value;}}}));
  assert.equal(response.status,202); assert.equal(recorded.email,event.email); assert.equal('verificationToken' in recorded,false);
});

test('every event carrying email requires an email-bound proof', async () => {
  const ordinary={type:'wording_copied',sessionId:event.sessionId,timestamp:event.timestamp,source:event.source,selectedPlay:event.selectedPlay,channel:event.channel,email:event.email};
  let response=await eventRoute(context(post('/api/rtro/event',ordinary),{RTRO_NOW:()=>1_800_000_000_000,RTRO_GHL_ADAPTER:{record:async()=>assert.fail('must not relay')}}));
  assert.equal(response.status,401);
  const token=await proof(); let recorded;
  response=await eventRoute(context(post('/api/rtro/event',{...ordinary,verificationToken:token}),{RTRO_NOW:()=>1_800_000_000_000,RTRO_GHL_ADAPTER:{record:async(value)=>{recorded=value;}}}));
  assert.equal(response.status,202); assert.equal(recorded.email,event.email); assert.equal('verificationToken' in recorded,false);
});

test('Pages routes use their Cloudflare native rate-limit bindings', async () => {
  const denied={limit:async({key})=>{assert.ok(key);return {success:false};}};
  const cases=[
    [generateRoute,'/api/rtro/generate',{},'GENERATION_RATE_LIMIT'],
    [eventRoute,'/api/rtro/event',{},'EVENT_RATE_LIMIT'],
    [requestRoute,'/api/rtro/verify/request',{email:event.email},'VERIFICATION_REQUEST_RATE_LIMIT'],
    [confirmRoute,'/api/rtro/verify/confirm',{email:event.email,code:'AAAA-BBBB-CCCC-DDDD'},'VERIFICATION_CONFIRM_RATE_LIMIT']
  ];
  for (const [route,path,body,binding] of cases) {
    const response=await route(context(post(path,body,{'cf-connecting-ip':'203.0.113.8'}),{[binding]:denied}));
    assert.equal(response.status,429,`${binding} must deny`);
  }
});

test('all routes support CORS preflight and friendly JSON errors', async () => {
  for (const route of [eventRoute,generateRoute,requestRoute,confirmRoute]) {
    const response=await route(context(new Request('https://api.reasontoreachout.com/api/rtro/x',{method:'OPTIONS',headers:{Origin:origin}})));
    assert.equal(response.status,204); assert.equal(response.headers.get('access-control-allow-origin'),origin);
  }
  const denied=await generateRoute(context(post('/api/rtro/generate',{}, {Origin:'https://evil.example'})));
  assert.equal(denied.status,403); assert.match(denied.headers.get('content-type'),/application\/json/);
});

test('verification request and confirm Pages routes never expose the code', async () => {
  resetVerificationRateLimits(); let sent;
  const routeEnv={...env,RESEND_API_KEY:'resend-test',RTRO_EMAIL_FROM:'verify@example.com',RTRO_NOW:()=>1_800_000_000_000,RTRO_FETCH:async(_url,options)=>{sent=JSON.parse(options.body);return new Response('{}',{status:200});}};
  let response=await requestRoute(context(post('/api/rtro/verify/request',{email:event.email}),routeEnv));
  assert.equal(response.status,202); assert.deepEqual(await response.json(),{ok:true});
  const code=sent.text.match(/\b([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/)[1];
  response=await confirmRoute(context(post('/api/rtro/verify/confirm',{email:event.email,code}),routeEnv));
  assert.equal(response.status,200); assert.ok((await response.json()).verificationToken);
});

test('GHL payloads preserve exact RTRO tags/notes, read back writes, and contain no prospect context', async () => {
  const calls=[]; const contact={id:'c1',email:event.email,tags:[]}; let note;
  const fetchImpl=async(url,options={})=>{const path=new URL(url).pathname;const method=options.method||'GET';const body=options.body?JSON.parse(options.body):undefined;calls.push({path,method,body,headers:options.headers});
    if(path==='/contacts/'&&method==='GET')return new Response(JSON.stringify({contacts:[contact]}));
    if(path==='/contacts/c1/tags'){contact.tags.push(...body.tags);return new Response(JSON.stringify({contact}));}
    if(path==='/contacts/c1'&&method==='GET')return new Response(JSON.stringify({contact}));
    if(path==='/contacts/c1/notes'&&method==='POST'){note={id:'n1',contactId:'c1',...body};return new Response(JSON.stringify({note}),{status:201});}
    if(path==='/contacts/c1/notes/n1')return new Response(JSON.stringify({note}));
    return new Response('{}',{status:404}); };
  await createGhlAdapter({env:{GHL_API_KEY:'test',GHL_LOCATION_ID:'loc'},fetchImpl,sleep:async()=>{}}).record(event);
  assert.deepEqual(contact.tags.sort(),['RTRO - PDF Download','RTRO - Source: Campaign West'].sort());
  assert.match(note.body,/RTRO event: lead_capture[\s\S]*Consent: No[\s\S]*App user: Avery/);
  assert.doesNotMatch(JSON.stringify(calls),/prospectName|prospectRole|situation|priority|trigger|desiredNextStep/);
  assert.ok(calls.every((call)=>call.headers.Version==='2021-07-28'));
});

test('Worker GHL create readback rejects every omitted expected field', async () => {
  const scenarios=[
    {event,fields:['locationId','firstName','email','companyName','source','tags']},
    {event:{...event,type:'feedback',answer:'Yes',email:undefined,firstName:undefined,company:undefined,consent:undefined},fields:['locationId','name','firstName','lastName','email','source','tags']}
  ];
  for (const scenario of scenarios) for (const field of scenario.fields) {
    let contact;
    const fetchImpl=async(url,options={})=>{
      const path=new URL(url).pathname; const method=options.method||'GET'; const body=options.body?JSON.parse(options.body):undefined;
      if(path==='/contacts/'&&method==='GET')return new Response(JSON.stringify({contacts:[]}));
      if(path==='/contacts/'&&method==='POST'){contact={id:'c1',...body};return new Response(JSON.stringify({contact}),{status:201});}
      if(path==='/contacts/c1'&&method==='GET'){const readback=structuredClone(contact);delete readback[field];return new Response(JSON.stringify({contact:readback}));}
      return new Response('{}',{status:404});
    };
    const adapter=createGhlAdapter({env:{GHL_API_KEY:'test',GHL_LOCATION_ID:'loc'},fetchImpl,sleep:async()=>{}});
    await assert.rejects(adapter.record(scenario.event),/readback mismatch/,field);
  }
});
