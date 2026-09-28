import { sanitizeSource } from './core.js';

const API = 'https://services.leadconnectorhq.com';
const UA = 'Mozilla/5.0 (compatible; ReasonToReachOut/1.0; +https://reasontoreachout.com)';
const anonymousName = 'RTRO Anonymous Feedback';
const anonymousEmail = 'rtro-anonymous-feedback@reasontoreachout.invalid';
const maxAttempts = 3;
const retryBaseMs = 50;
const retryWaitCapMs = 1_000;
const channels=new Set(['Email','Call opener','Voicemail','Text','LinkedIn','Mailed card','Gift/leave-behind']);
const feedbackAnswers=new Set(['Yes','With Edits','No']);
const contactTargets=new Set(['phone','email','booking','video','mailbox_power']);

export function createGhlAdapter({ apiKey = process.env.GHL_API_KEY, locationId = process.env.GHL_LOCATION_ID, fetchImpl = fetch, testMode = process.env.RTRO_TEST_MODE === '1' } = {}) {
  const sessionSummaries = new Map();
  if (testMode) return { record: async (event) => ({ testMode:true, accepted:event.type }) };
  if (!apiKey || !locationId) return { record:async()=>{ throw new Error('GHL integration is not configured.'); } };
  const headers = { Authorization:`Bearer ${apiKey}`, Version:'2021-07-28', 'Content-Type':'application/json', Accept:'application/json', 'User-Agent':UA };
  const retryAfterMs = (response) => {
    const value=response.headers?.get?.('retry-after');
    if (!value) return null;
    const seconds=Number(value);
    const wait=Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
    return Number.isFinite(wait) ? Math.max(0,Math.min(wait,retryWaitCapMs)) : null;
  };
  async function request(path, options={}) {
    for (let attempt=1; attempt<=maxAttempts; attempt += 1) {
      const response = await fetchImpl(`${API}${path}`, { ...options, headers:{ ...headers, ...options.headers } });
      if (response.ok) return response.status === 204 ? {} : response.json();
      const retryable=response.status === 429 || response.status >= 500 && response.status <= 599;
      if (!retryable || attempt === maxAttempts) throw new Error(`LeadConnector ${response.status}`);
      const wait=retryAfterMs(response) ?? retryBaseMs * (2 ** (attempt - 1));
      await new Promise((resolve)=>setTimeout(resolve,wait));
    }
  }
  const tagsFor = (event) => {
    const tags=[];
    if (event.type === 'lead_capture') tags.push('RTRO - PDF Download');
    if (event.source) tags.push(`RTRO - Source: ${sanitizeSource(event.source)}`);
    if (event.consent === true) tags.push('RTRO - Consent Yes');
    if (['Mailed card','Gift/leave-behind'].includes(event.channel)) tags.push('RTRO - Physical Mail Interest');
    if (event.type === 'feedback' && feedbackAnswers.has(event.answer)) tags.push(`RTRO - Feedback: ${event.answer}`);
    if (event.type === 'wording_copied') tags.push('RTRO - Copied Wording');
    if (event.type === 'contact_click') tags.push(event.target === 'mailbox_power' ? 'RTRO - Clicked Mailbox Power' : 'RTRO - Clicked Contact');
    return [...new Set(tags)];
  };
  async function searchContacts(queryValue) {
    const query=new URLSearchParams({ locationId, query:queryValue, limit:'100' });
    return (await request(`/contacts/?${query}`)).contacts || [];
  }
  async function findExact(event) {
    if (event.email) return (await searchContacts(event.email)).find((contact)=>String(contact.email || '').toLowerCase() === event.email.toLowerCase());
    const reserved=(await searchContacts(anonymousEmail)).find((contact)=>String(contact.email || '').toLowerCase() === anonymousEmail);
    if (reserved) return reserved;
    const expected=anonymousName.toLowerCase();
    return (await searchContacts(anonymousName)).find((contact)=>{
      const fullName=String(contact.name || '').trim().toLowerCase();
      const splitName=`${contact.firstName || ''} ${contact.lastName || ''}`.trim().toLowerCase();
      return fullName === expected || splitName === expected;
    });
  }
  async function readContact(id) {
    const result=await request(`/contacts/${id}`);
    if (result.contact?.id !== id) throw new Error('LeadConnector contact readback mismatch.');
    return result.contact;
  }
  const normalized=(value)=>String(value ?? '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  function verifyCreatedContact(contact,body) {
    for (const key of ['firstName','lastName','name','companyName','locationId','source','email']) {
      if (!Object.hasOwn(body,key)) continue;
      if (!Object.hasOwn(contact,key) || normalized(contact[key]) !== normalized(body[key])) throw new Error('LeadConnector contact readback mismatch.');
    }
    if (!Object.hasOwn(contact,'tags')) throw new Error('LeadConnector contact readback mismatch.');
    const expectedTags=new Set((body.tags || []).map(normalized));
    const actualTags=new Set((contact.tags || []).map(normalized));
    if (expectedTags.size !== actualTags.size || [...expectedTags].some((tag)=>!actualTags.has(tag))) throw new Error('LeadConnector contact readback mismatch.');
  }
  async function upsert(event) {
    let contact=await findExact(event);
    const tags=tagsFor(event);
    if (!contact) {
      const body=event.email
        ? { locationId, firstName:event.firstName || 'RTRO User', email:event.email, companyName:event.company || '', source:sanitizeSource(event.source), tags }
        : { locationId, name:anonymousName, firstName:'RTRO Anonymous', lastName:'Feedback', email:anonymousEmail, source:'Reason to Reach Out', tags };
      contact=(await request('/contacts/', { method:'POST', body:JSON.stringify(body) })).contact;
      if (!contact?.id) throw new Error('LeadConnector contact create returned no target.');
      contact=await readContact(contact.id);
      verifyCreatedContact(contact,body);
      return contact;
    }
    if (tags.length) {
      await request(`/contacts/${contact.id}/tags`, { method:'POST', body:JSON.stringify({ tags }) });
      contact=await readContact(contact.id);
      const readbackTags=new Set((contact.tags || []).map((tag)=>String(tag).toLowerCase()));
      if (!tags.every((tag)=>readbackTags.has(tag.toLowerCase()))) throw new Error('LeadConnector contact tag readback mismatch.');
    }
    return contact;
  }
  async function addNote(contactId, body) {
    const created=(await request(`/contacts/${contactId}/notes`, { method:'POST', body:JSON.stringify({ body }) })).note;
    if (!created?.id) throw new Error('LeadConnector note create returned no target.');
    const readback=(await request(`/contacts/${contactId}/notes/${created.id}`)).note;
    if (readback?.id !== created.id || readback.contactId !== contactId || readback.body !== body) throw new Error('LeadConnector note readback mismatch.');
  }
  const eventNote = (event) => [
    `RTRO event: ${event.type}`,
    `Timestamp: ${event.timestamp}`,
    `Source: ${sanitizeSource(event.source)}`,
    ...(channels.has(event.channel) ? [`Recommended channel: ${event.channel}`] : []),
    ...(event.type === 'lead_capture' ? [`Consent: ${event.consent ? 'Yes' : 'No'}`,`App user: ${event.firstName}`,`App user email: ${event.email}`,...(event.company ? [`App user company: ${event.company}`] : [])] : []),
    ...(event.type === 'feedback' && feedbackAnswers.has(event.answer) ? [`Answer: ${event.answer}`] : []),
    ...(event.type === 'contact_click' && contactTargets.has(event.target) ? [`Target: ${event.target}`] : [])
  ].join('\n');
  return { record:async(event)=>{
    const prior=sessionSummaries.get(event.sessionId) || [];
    const contact=await upsert(event);
    if (event.email && prior.length) {
      await addNote(contact.id,`Earlier anonymous RTRO session activity:\n${prior.join('\n\n')}`);
      sessionSummaries.delete(event.sessionId);
    }
    const note=eventNote(event);
    await addNote(contact.id,note);
    if (!event.email) sessionSummaries.set(event.sessionId,[...prior,note].slice(-30));
    return { ok:true };
  } };
}
