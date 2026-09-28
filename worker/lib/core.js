export const channels = ['Email','Call opener','Voicemail','Text','LinkedIn','Mailed card','Gift/leave-behind'];
export const rubricKeys = ['relevance','newness','value','decisionHelp','prospectBenefit'];
const generateKeys = ['firstName','relationship','stage','company','prospectName','prospectRole','situation','priority','lastContact','trigger','desiredNextStep'];
const forbidden=new Set(['prospectName','prospectCompany','situation','priority','trigger','desiredNextStep','scripts','plan','generatedPlan']);
const baseEvent=['type','sessionId','timestamp','source','email','verificationToken','selectedPlay','channel'];
const eventSchemas={lead_capture:[...baseEvent,'firstName','company','consent','verificationToken'],feedback:[...baseEvent,'answer','missing','score'],plan_generated:[...baseEvent,'relationship','stage'],play_selected:[...baseEvent,'rank','score'],channel_viewed:baseEvent,wording_copied:baseEvent,pdf_downloaded:[...baseEvent,'score'],contact_click:[...baseEvent,'target']};
const text = (value, fallback='') => String(value ?? '').trim() || fallback;

export function allowedOrigin(origin) {
  return ['https://reasontoreachout.com','https://www.reasontoreachout.com','https://api.reasontoreachout.com','https://reason-to-reach-out.pages.dev'].includes(origin)
    || /^https:\/\/[a-z0-9-]+\.reason-to-reach-out\.pages\.dev$/i.test(origin || '')
    || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin || '');
}

export function sanitizeSource(value) {
  return text(value).normalize('NFKC').replace(/[^a-zA-Z0-9 _.-]/g,'').replace(/\s+/g,' ').trim().slice(0,60) || 'direct';
}

const cleanText = (value, key, { required=false, max=2000 }={}) => {
  if (value == null || value === '') { if (required) throw new Error(`${key} is required.`); return ''; }
  if (typeof value !== 'string') throw new Error(`${key} must be text.`);
  const clean=value.trim();
  if (required && !clean) throw new Error(`${key} is required.`);
  if (clean.length > max) throw new Error(`${key} is too long.`);
  return clean;
};
const rejectUnknown = (value, keys) => { const key=Object.keys(value).find((item)=>!keys.includes(item)); if (key) throw new Error(`Unknown field: ${key}.`); };

export function validateGenerate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required.');
  rejectUnknown(value,generateKeys);
  const output={};
  for (const key of generateKeys) output[key]=cleanText(value[key],key,{ required:['firstName','relationship','stage','company','situation'].includes(key), max:key === 'situation' ? 4000 : 500 });
  return output;
}

export function validateEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required.');
  for (const key of Object.keys(value)) if (forbidden.has(key)) throw new Error(`Forbidden event field: ${key}.`);
  if (!eventSchemas[value.type]) throw new Error('Invalid event type.');
  rejectUnknown(value,eventSchemas[value.type]);
  const out={type:value.type,sessionId:cleanText(value.sessionId,'sessionId',{required:true,max:100}),timestamp:cleanText(value.timestamp,'timestamp',{required:true,max:40}),source:sanitizeSource(value.source)};
  if (out.sessionId.length < 8 || Number.isNaN(Date.parse(out.timestamp))) throw new Error('Invalid sessionId or timestamp.');
  for (const key of eventSchemas[value.type]) if (!['type','sessionId','timestamp','source','consent','rank','score'].includes(key) && value[key] != null) out[key]=cleanText(value[key],key,{max:key==='missing'?1000:key==='verificationToken'?3000:200});
  if (value.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('Invalid email.');
  if (out.channel && !channels.includes(out.channel)) throw new Error('Invalid channel.');
  if (value.consent != null) { if (typeof value.consent !== 'boolean') throw new Error('consent must be boolean.'); out.consent=value.consent; }
  for (const key of ['rank','score']) if (value[key] != null) { if (!Number.isInteger(value[key]) || value[key]<0 || value[key]>10) throw new Error(`Invalid ${key}.`); out[key]=value[key]; }
  if (value.type==='lead_capture' && (!out.firstName || !out.email || typeof out.consent!=='boolean' || !out.selectedPlay || !out.channel)) throw new Error('lead_capture requires firstName, email, consent, selectedPlay, and channel.');
  if (value.type==='feedback' && !['Yes','With Edits','No'].includes(out.answer)) throw new Error('Invalid feedback answer.');
  if (value.type==='contact_click' && !['phone','email','booking','video','mailbox_power'].includes(out.target)) throw new Error('Invalid contact target.');
  return out;
}

export function deriveRubricTotal(input={}, returnObject=false) {
  const clean=Object.fromEntries(rubricKeys.map((key)=>[key,Math.max(0,Math.min(2,Math.round(Number(input[key]) || 0)))]));
  const total=rubricKeys.reduce((sum,key)=>sum+clean[key],0);
  return returnObject ? { ...clean,total } : total;
}

export function normalizePlan(payload, firstName) {
  if (!payload || !Array.isArray(payload.plays) || payload.plays.length !== 4) throw new Error('The strategist must return exactly four complete plays.');
  const signer=text(firstName);
  const plays=payload.plays.map((play,index)=>{
    const raw=play?.scripts || {};
    const scripts={ Email:raw.email ?? raw.Email, 'Call opener':raw.callOpener ?? raw['Call opener'], Voicemail:raw.voicemail ?? raw.Voicemail, Text:raw.text ?? raw.Text, LinkedIn:raw.linkedIn ?? raw.linkedin ?? raw.LinkedIn, 'Mailed card':raw.mailedCard ?? raw['Mailed card'], 'Gift/leave-behind':raw.giftLeaveBehind ?? raw['Gift/leave-behind'] };
    for (const key of channels) { scripts[key]=text(scripts[key]); if (!scripts[key]) throw new Error(`Play ${index+1} is missing ${key}.`); if (signer && !scripts[key].trimEnd().endsWith(signer)) scripts[key]=`${scripts[key].trimEnd()}\n\n${signer}`; }
    return { rank:index+1,title:text(play.title,`Play ${index+1}`),strategicAngle:text(play.strategicAngle),whyNow:text(play.whyNow),valueToBring:text(play.valueToBring),primaryChannel:channels.includes(play.primaryChannel)?play.primaryChannel:'Email',sequence:Array.isArray(play.sequence)?play.sequence.slice(0,3).map((v)=>text(v)).filter(Boolean):[],rationale:text(play.rationale),rubric:deriveRubricTotal(play.rubric,true),scripts };
  });
  return { diagnosis:text(payload.diagnosis),assumptions:Array.isArray(payload.assumptions)?payload.assumptions.map((v)=>text(v)).filter(Boolean):[],plays };
}

export { cleanText, rejectUnknown };
