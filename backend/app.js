import http from 'node:http';
import { normalizePlan, sanitizeSource } from './core.js';
import { createHermesGenerator } from './hermes.js';
import { createGhlAdapter } from './ghl.js';
import { verifyProofToken } from '../worker/lib/verification.js';

const generateKeys = ['firstName','relationship','stage','company','prospectName','prospectRole','situation','priority','lastContact','trigger','desiredNextStep'];
const forbidden = new Set(['prospectName','company','prospectCompany','situation','priority','trigger','desiredNextStep','scripts','plan','generatedPlan']);
const baseEvent = ['type','sessionId','timestamp','source','email','verificationToken','selectedPlay','channel'];
const eventSchemas = {
  lead_capture: [...baseEvent,'firstName','company','consent'],
  feedback: [...baseEvent,'answer','missing','score'],
  plan_generated: [...baseEvent,'relationship','stage'],
  play_selected: [...baseEvent,'rank','score'],
  channel_viewed: baseEvent,
  wording_copied: baseEvent,
  pdf_downloaded: [...baseEvent,'score'],
  contact_click: [...baseEvent,'target']
};
export const allowedOrigins = (origin) => origin === 'https://reasontoreachout.com' || origin === 'https://www.reasontoreachout.com' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
const cleanText = (value, key, { required = false, max = 2000 } = {}) => {
  if (value == null || value === '') { if (required) throw new Error(`${key} is required.`); return ''; }
  if (typeof value !== 'string') throw new Error(`${key} must be text.`);
  const clean = value.trim(); if (required && !clean) throw new Error(`${key} is required.`); if (clean.length > max) throw new Error(`${key} is too long.`); return clean;
};
function rejectUnknown(value, keys) { const unknown = Object.keys(value).filter((key) => !keys.includes(key)); if (unknown.length) throw new Error(`Unknown field: ${unknown[0]}.`); }

export function validateGenerate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required.');
  rejectUnknown(value, generateKeys);
  const output = {};
  for (const key of generateKeys) output[key] = cleanText(value[key], key, { required:['firstName','relationship','stage','company','situation'].includes(key), max:key === 'situation' ? 4000 : 500 });
  return output;
}

export function validateEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required.');
  for (const key of Object.keys(value)) if (forbidden.has(key) && !(value.type === 'lead_capture' && key === 'company')) throw new Error(`Forbidden event field: ${key}.`);
  if (!eventSchemas[value.type]) throw new Error('Invalid event type.');
  rejectUnknown(value, eventSchemas[value.type]);
  const out = { type:value.type, sessionId:cleanText(value.sessionId,'sessionId',{required:true,max:100}), timestamp:cleanText(value.timestamp,'timestamp',{required:true,max:40}), source:sanitizeSource(value.source) };
  if (out.sessionId.length < 8 || Number.isNaN(Date.parse(out.timestamp))) throw new Error('Invalid sessionId or timestamp.');
  for (const key of eventSchemas[value.type]) if (!['type','sessionId','timestamp','source','consent','rank','score'].includes(key) && value[key] != null) out[key] = cleanText(value[key], key, { max:key === 'missing' ? 1000 : key === 'verificationToken' ? 3000 : 200 });
  if (value.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('Invalid email.');
  if (out.channel && !['Email','Call opener','Voicemail','Text','LinkedIn','Mailed card','Gift/leave-behind'].includes(out.channel)) throw new Error('Invalid channel.');
  if (value.consent != null) { if (typeof value.consent !== 'boolean') throw new Error('consent must be boolean.'); out.consent = value.consent; }
  for (const key of ['rank','score']) if (value[key] != null) { if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 10) throw new Error(`Invalid ${key}.`); out[key] = value[key]; }
  if (value.type === 'lead_capture' && (!out.firstName || !out.email || typeof out.consent !== 'boolean' || !out.selectedPlay || !out.channel)) throw new Error('lead_capture requires firstName, email, consent, selectedPlay, and channel.');
  if (value.type === 'feedback' && !['Yes','With Edits','No'].includes(out.answer)) throw new Error('Invalid feedback answer.');
  if (value.type === 'contact_click' && !['phone','email','booking','video','mailbox_power'].includes(out.target)) throw new Error('Invalid contact target.');
  return out;
}

const json = (res, status, body, origin) => { const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }; if (allowedOrigins(origin)) headers['Access-Control-Allow-Origin'] = origin; res.writeHead(status, headers); res.end(JSON.stringify(body)); };
async function readJson(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new Error('Content-Type must be application/json.');
  const chunks=[]; let size=0; for await (const chunk of req) { size += chunk.length; if (size > 64_000) throw new Error('Request body too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON.'); }
}
export function createRateLimiter(max, now = () => Date.now()) { const entries=new Map(); return (ip) => { const time=now(), current=entries.get(ip); if (!current || current.reset <= time) { entries.set(ip,{ count:1, reset:time+3_600_000 }); return true; } if (current.count >= max) return false; current.count++; return true; }; }
const requestIp = (req) => String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').split(',')[0].trim();

export async function authorizeEvent(value,{verificationEnv=process.env,now=Date.now}={}) {
  const event=validateEvent(value);
  if (event.email && !await verifyProofToken(event.verificationToken,event.email,verificationEnv,{now})) throw Object.assign(new Error('Email verification is required.'),{code:'RTRO_UNAUTHORIZED'});
  delete event.verificationToken;
  return event;
}

export function createApp({ generator = createHermesGenerator(), ghl = createGhlAdapter(), verificationEnv = process.env, now = Date.now } = {}) {
  const generateLimit=createRateLimiter(10), eventLimit=createRateLimiter(60);
  return http.createServer(async (req,res) => {
    const origin=req.headers.origin || '';
    if (origin && !allowedOrigins(origin)) return json(res,403,{ error:'Origin not allowed.' });
    if (req.method === 'OPTIONS') { res.writeHead(204,{ 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'86400', Vary:'Origin' }); return res.end(); }
    if (req.method !== 'POST' || !['/api/rtro/generate','/api/rtro/event'].includes(req.url)) return json(res,404,{ error:'Not found.' },origin);
    const isGenerate=req.url.endsWith('/generate');
    if (!(isGenerate ? generateLimit : eventLimit)(requestIp(req))) return json(res,429,{ error:'Too many requests. Please try again later.' },origin);
    try {
      const body=await readJson(req);
      if (isGenerate) {
        const input=validateGenerate(body);
        let timer; const timeout=new Promise((_,reject)=>{ timer=setTimeout(()=>reject(Object.assign(new Error('timeout'),{ code:'RTRO_TIMEOUT' })),30_000); });
        try { const raw=await Promise.race([generator(input,{timeoutMs:30_000}),timeout]); return json(res,200,normalizePlan(raw,input.firstName),origin); }
        finally { clearTimeout(timer); }
      }
      const event=await authorizeEvent(body,{verificationEnv,now});
      await ghl.record(event);
      return json(res,202,{ ok:true },origin);
    } catch (error) {
      if (error.code === 'RTRO_TIMEOUT') return json(res,504,{ error:'Generation timed out. Please try again in a minute.' },origin);
      if (error.code === 'RTRO_UNAUTHORIZED') return json(res,401,{ error:error.message },origin);
      const validation=/required|unknown|forbidden|invalid|must be|too long|too large|Content-Type/i.test(error.message);
      return json(res,validation ? 400 : 502,{ error:validation ? error.message : 'Generation is temporarily unavailable. Please try again.' },origin);
    }
  });
}
