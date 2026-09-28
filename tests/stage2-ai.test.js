import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin, normalizePlan, validateGenerate } from '../worker/lib/core.js';
import { createGenerator, parseModelJson } from '../worker/lib/ai.js';

const valid = { firstName:'Avery', relationship:'Stalled deal', stage:'Proposal or quote', company:'Prairie Air', situation:'A verified situation.' };
const scripts={ email:'Email body',callOpener:'Call body',voicemail:'Voicemail body',text:'Text body',linkedIn:'LinkedIn body',mailedCard:'Card body',giftLeaveBehind:'Gift body' };
const compliantPlan={ diagnosis:'A concise diagnosis.',assumptions:['Timing is unconfirmed.'],plays:Array.from({length:4},(_,index)=>({ title:`Play ${index+1}`,strategicAngle:'Useful angle',whyNow:'Relevant timing',valueToBring:'Decision support',primaryChannel:'Email',sequence:['Send the note','Follow up'],rationale:'Grounded rationale',rubric:{relevance:2,newness:1,value:2,decisionHelp:2,prospectBenefit:2},scripts })) };

test('Pages validation stays strict and CORS permits custom domains, Pages production/previews, and explicit loopback ports', () => {
  assert.equal(validateGenerate(valid).firstName, 'Avery');
  assert.throws(() => validateGenerate({ ...valid, extra:'no' }), /Unknown field/);
  for (const origin of ['https://reasontoreachout.com','https://www.reasontoreachout.com','https://api.reasontoreachout.com','https://reason-to-reach-out.pages.dev','https://feature-123.reason-to-reach-out.pages.dev','http://localhost:8788','http://127.0.0.1:8080']) assert.equal(allowedOrigin(origin), true, origin);
  for (const origin of ['https://evil.example','https://reason-to-reach-out.pages.dev.evil.test','http://localhost','https://localhost:8788','']) assert.equal(allowedOrigin(origin), false, origin);
});

test('model JSON parser accepts plain or fenced JSON and rejects surrounding prose', () => {
  assert.deepEqual(parseModelJson('{"plays":[]}'), { plays:[] });
  assert.deepEqual(parseModelJson('```json\n{"plays":[]}\n```'), { plays:[] });
  assert.throws(() => parseModelJson('Here is JSON: {"plays":[]}'), /strict JSON/);
});

test('OpenRouter receives the strict complete-plan schema, exact-four constraint, and a bounded token limit', async () => {
  const calls=[];
  const fetchImpl=async (url, options) => { calls.push({url,options,body:JSON.parse(options.body)}); return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(compliantPlan) } }] }), { status:200, headers:{'content-type':'application/json'} }); };
  const generator=createGenerator({ env:{ OPENROUTER_API_KEY:'secret', RTRO_AI_MODEL:'openai/test' }, fetchImpl, timeoutMs:50 });
  await generator(valid);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].body.model, 'openai/test');
  assert.match(calls[0].options.headers.Authorization, /^Bearer secret$/);
  assert.match(calls[0].body.messages[0].content, /sender.*recipient|recipient.*sender/i);
  assert.match(calls[0].body.messages[0].content, /only supplied|supplied facts/i);
  assert.equal(calls[0].body.response_format.type, 'json_schema');
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  const schema=calls[0].body.response_format.json_schema.schema;
  assert.deepEqual(schema.required, ['diagnosis','assumptions','plays']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.plays.minItems, 4);
  assert.equal(schema.properties.plays.maxItems, 4);
  assert.equal(schema.properties.plays.items.additionalProperties, false);
  assert.deepEqual(schema.properties.plays.items.required, ['title','strategicAngle','whyNow','valueToBring','primaryChannel','sequence','rationale','rubric','scripts']);
  assert.equal(schema.properties.plays.items.properties.sequence.minItems, 1);
  assert.equal(schema.properties.plays.items.properties.sequence.maxItems, 3);
  const rubric=schema.properties.plays.items.properties.rubric;
  assert.equal(rubric.additionalProperties, false);
  assert.deepEqual(rubric.required,['relevance','newness','value','decisionHelp','prospectBenefit']);
  assert.deepEqual(rubric.properties.relevance,{type:'integer',minimum:0,maximum:2});
  const scriptsContract=schema.properties.plays.items.properties.scripts;
  assert.equal(scriptsContract.additionalProperties, false);
  assert.deepEqual(scriptsContract.required,['email','callOpener','voicemail','text','linkedIn','mailedCard','giftLeaveBehind']);
  assert.ok(Number.isInteger(calls[0].body.max_tokens));
  assert.ok(calls[0].body.max_tokens >= 4000 && calls[0].body.max_tokens <= 8000);
});

test('OpenRouter retries a contract-invalid JSON payload once, then returns a compliant plan', async () => {
  const calls=[];
  const replies=[{...compliantPlan,plays:compliantPlan.plays.slice(0,3)},compliantPlan];
  const fetchImpl=async (_url,options)=>{ calls.push(JSON.parse(options.body)); return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(replies.shift())}}]}),{status:200}); };
  const result=await createGenerator({env:{OPENROUTER_API_KEY:'secret'},fetchImpl,timeoutMs:1000})(valid);
  assert.deepEqual(result,compliantPlan);
  assert.equal(calls.length,2);
  assert.match(calls[1].messages.at(-1).content,/contract|exactly four/i);
});

test('OpenRouter allows at most one corrective retry for contract-invalid JSON', async () => {
  let calls=0;
  const invalid={...compliantPlan,plays:[]};
  const fetchImpl=async ()=>{ calls++; return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invalid)}}]}),{status:200}); };
  await assert.rejects(createGenerator({env:{OPENROUTER_API_KEY:'secret'},fetchImpl,timeoutMs:1000})(valid),/exactly four complete plays/);
  assert.equal(calls,2);
});

test('OpenRouter corrective retry shares one deadline and receives only the remaining time', async (t) => {
  const originalNow=Date.now;
  const originalTimeout=AbortSignal.timeout;
  const clock=[1_000,1_000,1_075];
  const timeouts=[];
  t.after(()=>{ Date.now=originalNow; AbortSignal.timeout=originalTimeout; });
  Date.now=()=>clock.shift() ?? 1_075;
  AbortSignal.timeout=(milliseconds)=>{ timeouts.push(milliseconds); return new AbortController().signal; };
  const replies=[{...compliantPlan,plays:compliantPlan.plays.slice(0,3)},compliantPlan];
  const fetchImpl=async ()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(replies.shift())}}]}),{status:200});
  await createGenerator({env:{OPENROUTER_API_KEY:'secret'},fetchImpl,timeoutMs:100})(valid);
  assert.deepEqual(timeouts,[100,25]);
});

test('a representative schema-compliant result normalizes all four complete plays', () => {
  const normalized=normalizePlan(compliantPlan,valid.firstName);
  assert.equal(normalized.plays.length,4);
  assert.deepEqual(normalized.plays.map((play)=>play.rank),[1,2,3,4]);
  assert.equal(normalized.plays[0].rubric.total,9);
  assert.match(normalized.plays[0].scripts.Email,/Avery$/);
});

test('Workers AI fallback receives the complete strict contract and normalizes a realistic four-play response', async () => {
  const calls=[];
  const AI={ run:async (...args)=>{ calls.push(args); return { response:`\`\`\`json\n${JSON.stringify(compliantPlan)}\n\`\`\`` }; } };
  const generator=createGenerator({ env:{ AI, RTRO_CF_AI_MODEL:'@cf/custom/model' }, timeoutMs:50 });
  const generated=await generator(valid);
  const normalized=normalizePlan(generated,valid.firstName);
  assert.equal(calls[0][0], '@cf/custom/model');
  const prompt=calls[0][1].messages[0].content;
  assert.match(prompt,/strict JSON/i);
  assert.match(prompt,/exactly 4/i);
  for (const field of ['diagnosis','assumptions','title','strategicAngle','whyNow','valueToBring','primaryChannel','sequence','rationale','rubric','relevance','newness','value','decisionHelp','prospectBenefit','scripts','email','callOpener','voicemail','text','linkedIn','mailedCard','giftLeaveBehind']) assert.match(prompt,new RegExp(`"?${field}"?`),field);
  assert.match(prompt,/sender.*recipient/i);
  assert.match(prompt,/only supplied facts/i);
  assert.equal(normalized.plays.length,4);
  assert.deepEqual(normalized.plays.map((play)=>play.rank),[1,2,3,4]);
  assert.equal(normalized.plays[0].rubric.total,9);
  assert.match(normalized.plays[0].scripts.Email,/Avery$/);
});
