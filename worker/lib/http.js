import { allowedOrigin } from './core.js';

export function createRateLimiter(max,windowMs=3_600_000,now=Date.now) {
  const entries=new Map();
  return (key) => { const time=now(); const current=entries.get(key); if(!current||current.reset<=time){entries.set(key,{count:1,reset:time+windowMs});return true;}if(current.count>=max)return false;current.count++;return true; };
}
export const clientKey = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
export async function allowRequest(binding,fallback,key) {
  if (binding && typeof binding.limit === 'function') return (await binding.limit({key})).success === true;
  return fallback(key);
}

export const json = (status,body,origin='') => {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if (allowedOrigin(origin)) headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(body),{status,headers});
};
export const preflight = (request) => {
  const origin=request.headers.get('origin') || '';
  if (request.method !== 'OPTIONS') return null;
  if (!allowedOrigin(origin)) return json(403,{error:'Origin not allowed.'});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}});
};
export const guard = (request) => {
  const origin=request.headers.get('origin') || '';
  if (origin && !allowedOrigin(origin)) return json(403,{error:'Origin not allowed.'});
  if (request.method !== 'POST') return json(405,{error:'Method not allowed.'},origin);
  return null;
};
export async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Error('Content-Type must be application/json.');
  const raw=await request.text(); if (new TextEncoder().encode(raw).length>64_000) throw new Error('Request body too large.');
  try { return JSON.parse(raw); } catch { throw new Error('Invalid JSON.'); }
}
export const validationError = (error) => /required|unknown|forbidden|invalid|must be|too long|too large|Content-Type/i.test(error?.message || '');
