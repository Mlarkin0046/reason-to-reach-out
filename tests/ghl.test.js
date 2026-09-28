import test from 'node:test';
import assert from 'node:assert/strict';
import { createGhlAdapter } from '../backend/ghl.js';

function mockGhl(seed = []) {
  const contacts = new Map(seed.map((contact) => [contact.id, structuredClone(contact)]));
  const calls = [];
  let contactNumber = seed.length;
  let noteNumber = 0;
  const notes = new Map();
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url); const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path:`${parsed.pathname}${parsed.search}`, body });
    const response = (status, value) => ({ ok:status >= 200 && status < 300, status, json:async()=>value });
    if (method === 'GET' && parsed.pathname === '/contacts/') {
      const query = (parsed.searchParams.get('query') || '').toLowerCase();
      return response(200, { contacts:[...contacts.values()].filter((c) => {
        const splitName=`${c.firstName || ''} ${c.lastName || ''}`.trim().toLowerCase();
        return JSON.stringify(c).toLowerCase().includes(query) || splitName.includes(query);
      }) });
    }
    if (method === 'POST' && parsed.pathname === '/contacts/') {
      const contact = { ...body, id:`c${++contactNumber}` }; contacts.set(contact.id, contact); return response(201, { contact });
    }
    const contactMatch = parsed.pathname.match(/^\/contacts\/([^/]+)$/);
    if (contactMatch && method === 'GET') return contacts.has(contactMatch[1]) ? response(200, { contact:contacts.get(contactMatch[1]) }) : response(404, {});
    if (contactMatch && method === 'PUT') { const updated={ ...contacts.get(contactMatch[1]), ...body }; contacts.set(contactMatch[1],updated); return response(200,{ contact:updated }); }
    const tagsMatch = parsed.pathname.match(/^\/contacts\/([^/]+)\/tags$/);
    if (tagsMatch && method === 'POST') {
      const contact=contacts.get(tagsMatch[1]);
      if (!contact) return response(404, {});
      contact.tags=[...new Set([...(contact.tags || []),...(body.tags || [])])];
      return response(200, { contact });
    }
    const notesMatch = parsed.pathname.match(/^\/contacts\/([^/]+)\/notes$/);
    if (notesMatch && method === 'POST') { const note={ id:`n${++noteNumber}`, contactId:notesMatch[1], ...body }; notes.set(note.id,note); return response(201,{ note }); }
    const noteMatch = parsed.pathname.match(/^\/contacts\/([^/]+)\/notes\/([^/]+)$/);
    if (noteMatch && method === 'GET') return notes.has(noteMatch[2]) ? response(200,{ note:notes.get(noteMatch[2]) }) : response(404,{});
    return response(404, {});
  };
  return { fetchImpl, calls, contacts, notes };
}

const event = (overrides={}) => ({ type:'channel_viewed', sessionId:'session-12345678', timestamp:'2026-09-27T12:00:00.000Z', source:'Spring Campaign', selectedPlay:'Decision guide', channel:'Email', ...overrides });

test('anonymous and known events use exact contacts, notes, tags, and readbacks', async () => {
  const mock = mockGhl([
    { id:'wrong', name:'RTRO Anonymous Feedback Copy', firstName:'RTRO', lastName:'Anonymous' },
    { id:'anon', name:'RTRO Anonymous Feedback', firstName:'RTRO Anonymous', lastName:'Feedback', tags:[] },
    { id:'near', email:'person+old@example.com', tags:[] },
    { id:'known', email:'person@example.com', tags:['Existing'] }
  ]);
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl:mock.fetchImpl });
  await adapter.record(event({ type:'feedback', answer:'With Edits', missing:'Shorter wording' }));
  await adapter.record(event({ type:'wording_copied', email:'PERSON@example.com' }));
  const posts = mock.calls.filter((call) => call.method === 'POST' && /\/notes$/.test(call.path));
  assert.equal(posts[0].path, '/contacts/anon/notes');
  assert.ok(posts.slice(1).every((call) => call.path === '/contacts/known/notes'));
  assert.match(posts[0].body.body, /With Edits|Email|Spring Campaign/);
  assert.doesNotMatch(posts[0].body.body,/Shorter wording|Decision guide/);
  assert.ok(posts.some((call) => /Earlier anonymous RTRO session activity/.test(call.body.body)));
  assert.ok(mock.calls.some((call) => call.method === 'GET' && call.path === '/contacts/anon'));
  assert.ok(mock.calls.some((call) => call.method === 'GET' && call.path === '/contacts/known'));
  assert.equal(mock.calls.filter((call) => call.method === 'GET' && /\/notes\/n\d+$/.test(call.path)).length, posts.length);
  assert.ok(mock.contacts.get('anon').tags.includes('RTRO - Feedback: With Edits'));
  assert.ok(mock.contacts.get('known').tags.includes('RTRO - Copied Wording'));
});

test('additive tagging preserves sequential event tags when contact search is stale', async () => {
  const mock = mockGhl([{ id:'known', email:'person@example.com', tags:[] }]);
  const staleSearchContact = { id:'known', email:'person@example.com', tags:[] };
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if ((options.method || 'GET') === 'GET' && parsed.pathname === '/contacts/') {
      mock.calls.push({ method:'GET', path:`${parsed.pathname}${parsed.search}`, body:undefined });
      return { ok:true, status:200, json:async()=>({ contacts:[structuredClone(staleSearchContact)] }) };
    }
    return mock.fetchImpl(url, options);
  };
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl });

  await adapter.record(event({ type:'feedback', answer:'Yes', email:'person@example.com' }));
  await adapter.record(event({ type:'wording_copied', email:'person@example.com' }));

  assert.deepEqual(mock.contacts.get('known').tags.sort(), ['RTRO - Copied Wording','RTRO - Feedback: Yes','RTRO - Source: Spring Campaign'].sort());
  assert.equal(mock.calls.filter((call) => call.method === 'PUT' && call.path === '/contacts/known').length, 0);
  assert.equal(mock.calls.filter((call) => call.method === 'POST' && call.path === '/contacts/known/tags').length, 2);
});

test('lead capture uses sanitized source and writes structured app-user-only note', async () => {
  const mock = mockGhl();
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl:mock.fetchImpl });
  await adapter.record(event({ type:'lead_capture', email:'owner@example.com', firstName:'Avery', company:'Sender Co', consent:true, source:'Spring Campaign', selectedPlay:'Capacity planning', channel:'Mailed card' }));
  const create = mock.calls.find((call) => call.method === 'POST' && call.path === '/contacts/');
  assert.equal(create.body.source, 'Spring Campaign');
  assert.deepEqual(create.body.tags.sort(), ['RTRO - Consent Yes','RTRO - PDF Download','RTRO - Physical Mail Interest','RTRO - Source: Spring Campaign'].sort());
  const note = mock.calls.find((call) => call.method === 'POST' && /\/notes$/.test(call.path)).body.body;
  for (const value of ['Consent: Yes','Source: Spring Campaign','Recommended channel: Mailed card','Timestamp: 2026-09-27T12:00:00.000Z']) assert.match(note, new RegExp(value));
  assert.doesNotMatch(note,/Capacity planning|Selected play/);
  assert.doesNotMatch(JSON.stringify(mock.calls), /prospectName|prospectRole|situation|priority|trigger|desiredNextStep/);
});

test('write/readback failure rejects the relay operation', async () => {
  const mock = mockGhl();
  const fetchImpl = async (url, options) => {
    const result = await mock.fetchImpl(url, options);
    if ((options?.method || 'GET') === 'GET' && /\/contacts\/c1$/.test(new URL(url).pathname)) return { ok:false, status:500, json:async()=>({}) };
    return result;
  };
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl });
  await assert.rejects(adapter.record(event({ email:'new@example.com' })), /LeadConnector 500/);
  assert.equal(mock.calls.filter((call) => call.method === 'GET' && call.path === '/contacts/c1').length, 3);
});

test('adversarial contact and note readback substitutions are rejected exactly', async () => {
  for (const mutation of ['firstName','companyName','email','source','tags','note']) {
    const mock=mockGhl();
    const fetchImpl=async(url,options={})=>{
      const result=await mock.fetchImpl(url,options); const path=new URL(url).pathname; const method=options.method||'GET';
      if(method==='GET'&&path==='/contacts/c1') { const json=result.json; result.json=async()=>{const value=await json(); if(mutation==='firstName')value.contact.firstName='Other';if(mutation==='companyName')value.contact.companyName='Other Co';if(mutation==='email')value.contact.email='attacker@example.com';if(mutation==='source')value.contact.source='other';if(mutation==='tags')value.contact.tags=[];return value;}; }
      if(method==='GET'&&/\/notes\/n1$/.test(path)&&mutation==='note') { const json=result.json; result.json=async()=>{const value=await json();value.note.body='substituted';return value;}; }
      return result;
    };
    const adapter=createGhlAdapter({apiKey:'test',locationId:'loc',fetchImpl});
    await assert.rejects(adapter.record(event({type:'lead_capture',email:'owner@example.com',firstName:'Avery',company:'Sender Co',consent:true})),/readback mismatch/,mutation);
  }
});

test('created contact readback accepts tag order and casing differences', async () => {
  const mock=mockGhl();
  const fetchImpl=async(url,options={})=>{
    const result=await mock.fetchImpl(url,options);
    if((options.method||'GET')==='GET'&&new URL(url).pathname==='/contacts/c1') {
      const json=result.json;
      result.json=async()=>{const value=await json();value.contact.tags=[...value.contact.tags].reverse().map((tag)=>tag.toUpperCase());return value;};
    }
    return result;
  };
  await createGhlAdapter({apiKey:'test',locationId:'loc',fetchImpl}).record(event({type:'lead_capture',email:'owner@example.com',firstName:'Avery',company:'Sender Co',consent:true}));
});

test('created contact readback rejects every omitted expected field', async () => {
  const scenarios=[
    {event:event({type:'lead_capture',email:'owner@example.com',firstName:'Avery',company:'Sender Co',consent:true}),fields:['locationId','firstName','email','companyName','source','tags']},
    {event:event({type:'feedback',answer:'Yes'}),fields:['locationId','name','firstName','lastName','email','source','tags']}
  ];
  for (const scenario of scenarios) for (const field of scenario.fields) {
    const mock=mockGhl();
    const fetchImpl=async(url,options={})=>{
      const result=await mock.fetchImpl(url,options);
      if ((options.method||'GET')==='GET' && new URL(url).pathname==='/contacts/c1') {
        const json=result.json;
        result.json=async()=>{const value=await json();delete value.contact[field];return value;};
      }
      return result;
    };
    const adapter=createGhlAdapter({apiKey:'test',locationId:'loc',fetchImpl});
    await assert.rejects(adapter.record(scenario.event),/readback mismatch/,field);
  }
});

test('lowercased anonymous contacts are reused by their reserved email', async () => {
  const mock = mockGhl();
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if ((options.method || 'GET') === 'POST' && parsed.pathname === '/contacts/') {
      const body = JSON.parse(options.body);
      options = {
        ...options,
        body:JSON.stringify({ ...body, firstName:'rtro anonymous', lastName:'feedback' })
      };
    }
    return mock.fetchImpl(url, options);
  };
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl });

  await adapter.record(event({ type:'feedback', answer:'Yes' }));
  await adapter.record(event({ type:'channel_viewed', channel:'Call' }));

  const creates = mock.calls.filter((call) => call.method === 'POST' && call.path === '/contacts/');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.email, 'rtro-anonymous-feedback@reasontoreachout.invalid');
  assert.equal(mock.contacts.size, 1);
  assert.ok(mock.calls.filter((call) => call.method === 'POST' && /\/notes$/.test(call.path)).every((call) => call.path === '/contacts/c1/notes'));
});

test('case-insensitive legacy anonymous name fallback adopts an existing contact', async () => {
  const mock = mockGhl([{ id:'legacy', name:null, firstName:'rtro', lastName:'anonymous feedback', tags:[] }]);
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl:mock.fetchImpl });

  await adapter.record(event({ type:'feedback', answer:'No' }));

  assert.equal(mock.calls.filter((call) => call.method === 'POST' && call.path === '/contacts/').length, 0);
  assert.ok(mock.calls.some((call) => call.method === 'POST' && call.path === '/contacts/legacy/notes'));
  const searches = mock.calls.filter((call) => call.method === 'GET' && call.path.startsWith('/contacts/?'));
  assert.equal(new URL(`https://example.test${searches[0].path}`).searchParams.get('query'), 'rtro-anonymous-feedback@reasontoreachout.invalid');
  assert.equal(new URL(`https://example.test${searches[1].path}`).searchParams.get('query'), 'RTRO Anonymous Feedback');
});

test('transient 500 is retried and then succeeds', async () => {
  const mock = mockGhl();
  let attempts = 0;
  const fetchImpl = async (url, options) => {
    if (attempts++ === 0) return { ok:false, status:500, headers:new Headers(), json:async()=>({}) };
    return mock.fetchImpl(url, options);
  };
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl });

  await adapter.record(event({ email:'retry@example.com' }));

  assert.equal(attempts, 6);
});

test('validation 400 is not retried', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return { ok:false, status:400, headers:new Headers(), json:async()=>({}) };
  };
  const adapter = createGhlAdapter({ apiKey:'test', locationId:'loc', fetchImpl });

  await assert.rejects(adapter.record(event({ email:'invalid@example.com' })), /LeadConnector 400/);
  assert.equal(attempts, 1);
});
