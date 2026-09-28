import { channels, normalizePlan, rubricKeys } from './core.js';

const OPENROUTER_URL='https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL='openai/gpt-4.1-mini';
const DEFAULT_CF_MODEL='@cf/meta/llama-3.1-8b-instruct';
const OPENROUTER_MAX_TOKENS=7000;
const scriptKeys=['email','callOpener','voicemail','text','linkedIn','mailedCard','giftLeaveBehind'];
const playKeys=['title','strategicAngle','whyNow','valueToBring','primaryChannel','sequence','rationale','rubric','scripts'];

const nonEmptyString={type:'string',minLength:1};
const strictObject=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const rubricSchema=strictObject(Object.fromEntries(rubricKeys.map((key)=>[key,{type:'integer',minimum:0,maximum:2}])));
const scriptsSchema=strictObject(Object.fromEntries(scriptKeys.map((key)=>[key,nonEmptyString])));
const playSchema=strictObject({
  title:nonEmptyString,
  strategicAngle:nonEmptyString,
  whyNow:nonEmptyString,
  valueToBring:nonEmptyString,
  primaryChannel:{type:'string',enum:channels},
  sequence:{type:'array',items:nonEmptyString,minItems:1,maxItems:3},
  rationale:nonEmptyString,
  rubric:rubricSchema,
  scripts:scriptsSchema
},playKeys);

export const PLAN_SCHEMA=strictObject({
  diagnosis:nonEmptyString,
  assumptions:{type:'array',items:nonEmptyString},
  plays:{type:'array',items:playSchema,minItems:4,maxItems:4}
},['diagnosis','assumptions','plays']);

export function buildPrompt(input) {
  return `Create a practical outreach plan from this fictional input. The app user is the sender and the prospect is the recipient; every script must speak from sender to recipient. Address the sender as "you" in analysis. Use only supplied facts and put any clearly labeled assumptions in assumptions. Input: ${JSON.stringify(input)}`;
}

function buildWorkersPrompt(input) {
  return `You are a sales strategist. Return strict JSON only, with no markdown or prose and no additional fields. The response must match this complete contract: {"diagnosis":"non-empty string","assumptions":["non-empty string"],"plays":[exactly 4 objects, each with {"title":"non-empty string","strategicAngle":"non-empty string","whyNow":"non-empty string","valueToBring":"non-empty string","primaryChannel":"Email|Call opener|Voicemail|Text|LinkedIn|Mailed card|Gift/leave-behind","sequence":["1 to 3 non-empty strings"],"rationale":"non-empty string","rubric":{"relevance":"integer 0-2","newness":"integer 0-2","value":"integer 0-2","decisionHelp":"integer 0-2","prospectBenefit":"integer 0-2"},"scripts":{"email":"non-empty string","callOpener":"non-empty string","voicemail":"non-empty string","text":"non-empty string","linkedIn":"non-empty string","mailedCard":"non-empty string","giftLeaveBehind":"non-empty string"}}]}. The app user is the sender and the prospect is the recipient. Preserve that sender-to-recipient direction in every script, and address the sender as "you" in analysis. Use only supplied facts; do not invent facts, and place any clearly labeled assumptions in the assumptions array. Input JSON: ${JSON.stringify(input)}`;
}

export function parseModelJson(value) {
  const source=String(value ?? '').trim();
  const match=source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json=match ? match[1] : source;
  if (!match && !(json.startsWith('{') && json.endsWith('}'))) throw new Error('The model did not return strict JSON.');
  try { return JSON.parse(json); } catch { throw new Error('The model did not return valid strict JSON.'); }
}

const exactKeys=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every((key)=>Object.hasOwn(value,key));
const isText=(value)=>typeof value==='string' && value.length>0;

function assertPlanContract(payload,firstName) {
  if (!exactKeys(payload,['diagnosis','assumptions','plays']) || !isText(payload.diagnosis) || !Array.isArray(payload.assumptions) || !payload.assumptions.every(isText)) throw new Error('The strategist returned a plan outside the required contract.');
  if (!Array.isArray(payload.plays) || payload.plays.length!==4) throw new Error('The strategist must return exactly four complete plays.');
  for (const play of payload.plays) {
    if (!exactKeys(play,playKeys) || !['title','strategicAngle','whyNow','valueToBring','rationale'].every((key)=>isText(play[key])) || !channels.includes(play.primaryChannel)) throw new Error('The strategist returned a plan outside the required contract.');
    if (!Array.isArray(play.sequence) || play.sequence.length<1 || play.sequence.length>3 || !play.sequence.every(isText)) throw new Error('The strategist returned a plan outside the required contract.');
    if (!exactKeys(play.rubric,rubricKeys) || !rubricKeys.every((key)=>Number.isInteger(play.rubric[key]) && play.rubric[key]>=0 && play.rubric[key]<=2)) throw new Error('The strategist returned a plan outside the required contract.');
    if (!exactKeys(play.scripts,scriptKeys) || !scriptKeys.every((key)=>isText(play.scripts[key]))) throw new Error('The strategist returned a plan outside the required contract.');
  }
  normalizePlan(payload,firstName);
}

const timeoutError=()=>Object.assign(new Error('timeout'),{code:'RTRO_TIMEOUT'});
const timeoutSignal=(timeoutMs)=>{
  if (timeoutMs<=0) throw timeoutError();
  if (typeof AbortSignal!=='undefined' && typeof AbortSignal.timeout==='function') return AbortSignal.timeout(timeoutMs);
  const controller=new AbortController(); setTimeout(()=>controller.abort(),timeoutMs); return controller.signal;
};
const asTimeout=(error)=>{ if (error?.name==='AbortError' || error?.name==='TimeoutError' || error?.code==='RTRO_TIMEOUT') throw timeoutError(); throw error; };

export function createGenerator({ env, fetchImpl=fetch, timeoutMs=30_000 }) {
  return async (input) => {
    const prompt=buildPrompt(input);
    if (env.OPENROUTER_API_KEY) {
      const deadline=Date.now()+timeoutMs;
      const messages=[{role:'system',content:prompt}];
      for (let attempt=0;attempt<2;attempt++) {
        let response;
        try {
          response=await fetchImpl(OPENROUTER_URL,{method:'POST',headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://reasontoreachout.com','X-Title':'Reason to Reach Out'},body:JSON.stringify({model:env.RTRO_AI_MODEL || DEFAULT_OPENROUTER_MODEL,messages,temperature:0.4,max_tokens:OPENROUTER_MAX_TOKENS,response_format:{type:'json_schema',json_schema:{name:'outreach_plan',strict:true,schema:PLAN_SCHEMA}}}),signal:timeoutSignal(deadline-Date.now())});
        } catch (error) { asTimeout(error); }
        if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
        let data;
        try { data=await response.json(); } catch (error) { asTimeout(error); }
        const parsed=parseModelJson(data?.choices?.[0]?.message?.content);
        try { assertPlanContract(parsed,input.firstName); return parsed; }
        catch (error) {
          if (attempt===1) throw error;
          messages.push({role:'user',content:'Your prior JSON violated the contract. Return exactly four complete plays and satisfy the supplied JSON schema.'});
        }
      }
    }
    if (env.AI?.run) {
      const task=env.AI.run(env.RTRO_CF_AI_MODEL || DEFAULT_CF_MODEL,{messages:[{role:'system',content:buildWorkersPrompt(input)}],temperature:0.4});
      let timer;
      try { return parseModelJson((await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError()),timeoutMs);})]))?.response); }
      finally { clearTimeout(timer); }
    }
    throw new Error('AI generation is not configured.');
  };
}
