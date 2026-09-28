import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const origin='https://reasontoreachout.com';
const request=(path,method='POST')=>new Request(`https://api.reasontoreachout.com${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
const limiter={limit:async()=>({success:false})};

test('standalone Worker dispatches every API route and OPTIONS', async () => {
  const bindings={GENERATION_RATE_LIMIT:limiter,EVENT_RATE_LIMIT:limiter,VERIFICATION_REQUEST_RATE_LIMIT:limiter,VERIFICATION_CONFIRM_RATE_LIMIT:limiter};
  for (const path of ['/api/rtro/generate','/api/rtro/event','/api/rtro/verify/request','/api/rtro/verify/confirm']) {
    assert.equal((await worker.fetch(request(path),bindings)).status,429,path);
    assert.equal((await worker.fetch(request(path,'OPTIONS'),bindings)).status,204,path);
  }
  assert.equal((await worker.fetch(request('/api/rtro/nope'),bindings)).status,404);
});

test('standalone Worker fails closed when a route limiter binding is missing', async () => {
  const response=await worker.fetch(request('/api/rtro/event'),{RTRO_TEST_MODE:'1'});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'API rate limiting is not configured.'});
});
