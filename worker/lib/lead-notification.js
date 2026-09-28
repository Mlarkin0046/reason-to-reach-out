import { sanitizeSource } from './core.js';

const RESEND_URL='https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS=3_000;

async function idempotencyKey(sessionId) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sessionId));
  return `rtro-lead/${Array.from(new Uint8Array(bytes),(byte)=>byte.toString(16).padStart(2,'0')).join('')}`;
}

export async function sendLeadNotification(event,{env,fetchImpl=fetch,timeoutMs=DEFAULT_TIMEOUT_MS}={}) {
  if (event?.type !== 'lead_capture') return {ok:false,skipped:true};
  if (!env?.RESEND_API_KEY || !env.RTRO_NOTIFICATION_FROM || !env.RTRO_NOTIFICATION_TO) throw new Error('Lead notification is not configured.');
  const key=await idempotencyKey(event.sessionId);
  const controller=new AbortController();
  let rejectTimeout;
  const timeout=new Promise((_,reject)=>{rejectTimeout=setTimeout(()=>{controller.abort();reject(new Error('Lead notification timed out.'));},timeoutMs);});
  const company=event.company ? `, ${event.company}` : '';
  const lines=[
    `First name: ${event.firstName}`,
    `Verified email: ${event.email}`,
    ...(event.company?[`Company: ${event.company}`]:[]),
    `Selected play: ${event.selectedPlay}`,
    `Recommended channel: ${event.channel}`,
    `Marketing consent: ${event.consent?'Yes':'No'}`,
    `Source: ${sanitizeSource(event.source)}`,
    `Submission timestamp: ${event.timestamp}`
  ];
  try {
    const response=await Promise.race([fetchImpl(RESEND_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({from:env.RTRO_NOTIFICATION_FROM,to:[env.RTRO_NOTIFICATION_TO],subject:`New Reason to Reach Out lead: ${event.firstName}${company}`,text:lines.join('\n'),reply_to:event.email}),
      signal:controller.signal
    }),timeout]);
    if (!response.ok) throw new Error(`Resend ${response.status}`);
    return {ok:true};
  } finally {
    clearTimeout(rejectTimeout);
  }
}
