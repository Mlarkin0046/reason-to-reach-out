const CODE_WINDOW_MS=5*60_000;
const TOKEN_TTL_MS=15*60_000;
const resendUrl='https://api.resend.com/emails';
const rateLimits=new Map();
const encoder=new TextEncoder();
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normalizeEmail = (value) => {
  if (typeof value !== 'string') throw new Error('Invalid email.');
  const email=value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  return email;
};
const bytesToBase64Url = (bytes) => {
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const base64UrlToBytes = (value) => {
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
  return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
};
const secretKey = async (secret) => {
  if (typeof secret !== 'string' || secret.length < 24) throw new Error('Verification is not configured.');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
};
const sign = async (value, secret) => new Uint8Array(await crypto.subtle.sign('HMAC',await secretKey(secret),encoder.encode(value)));
const equal = (left,right) => { if (left.length !== right.length) return false; let mismatch=0; for (let i=0;i<left.length;i++) mismatch|=left[i]^right[i]; return mismatch === 0; };
const codeFor = async (email, window, secret) => {
  const digest=await sign(`rtro-code:${email}:${window}`,secret);
  let code='',buffer=0,bits=0;
  for (const byte of digest.slice(0,10)) { buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;code+=CODE_ALPHABET[(buffer>>>bits)&31];buffer&=(1<<bits)-1;} }
  return code.match(/.{1,4}/g).join('-');
};

export function resetVerificationRateLimits() { rateLimits.clear(); }

export async function requestVerification(value,env,{fetchImpl=fetch,now=Date.now,ip='unknown'}={}) {
  const email=normalizeEmail(value?.email);
  const time=now(); const key=`${ip}:${email}`; const available=rateLimits.get(key) || 0;
  if (available > time) throw new Error('Too many verification requests. Please wait and try again.');
  rateLimits.set(key,time+60_000);
  const code=await codeFor(email,Math.floor(time/CODE_WINDOW_MS),env.RTRO_VERIFICATION_SECRET);
  const response=await fetchImpl(resendUrl,{ method:'POST',headers:{ Authorization:`Bearer ${env.RESEND_API_KEY || ''}`,'Content-Type':'application/json' },body:JSON.stringify({ from:env.RTRO_EMAIL_FROM,to:[email],subject:'Your Reason to Reach Out secure verification code',text:`Paste this secure verification code into Reason to Reach Out: ${code}\n\nIt expires in about 10 minutes. If you did not request it, ignore this email.` }) });
  if (!response.ok) throw new Error('Verification email could not be sent.');
  return {ok:true};
}

export async function confirmVerification(value,env,{now=Date.now}={}) {
  const email=normalizeEmail(value?.email); const raw=String(value?.code ?? '').trim().toUpperCase();
  if (!/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/.test(raw)) throw new Error('Invalid or expired verification code.');
  const code=raw;
  const current=Math.floor(now()/CODE_WINDOW_MS);
  const valid=equal(encoder.encode(code),encoder.encode(await codeFor(email,current,env.RTRO_VERIFICATION_SECRET))) || equal(encoder.encode(code),encoder.encode(await codeFor(email,current-1,env.RTRO_VERIFICATION_SECRET)));
  if (!valid) throw new Error('Invalid or expired verification code.');
  const payload=bytesToBase64Url(encoder.encode(JSON.stringify({email,exp:now()+TOKEN_TTL_MS})));
  const signature=bytesToBase64Url(await sign(`rtro-proof:${payload}`,env.RTRO_VERIFICATION_SECRET));
  return {ok:true,verificationToken:`${payload}.${signature}`};
}

export async function verifyProofToken(token,emailValue,env,{now=Date.now}={}) {
  try {
    const email=normalizeEmail(emailValue); const [payload,signature,...extra]=String(token || '').split('.');
    if (!payload || !signature || extra.length) return false;
    const expected=await sign(`rtro-proof:${payload}`,env.RTRO_VERIFICATION_SECRET);
    if (!equal(base64UrlToBytes(signature),expected)) return false;
    const data=JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    return data.email === email && Number.isFinite(data.exp) && data.exp >= now() && data.exp <= now()+TOKEN_TTL_MS;
  } catch { return false; }
}

export { normalizeEmail };
