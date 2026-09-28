import { onRequest as generate } from './routes/generate.js';
import { onRequest as event } from './routes/event.js';
import { onRequest as verificationRequest } from './routes/verify/request.js';
import { onRequest as verificationConfirm } from './routes/verify/confirm.js';
import { json } from './lib/http.js';

const routes=new Map([
  ['/api/rtro/generate',{handler:generate,binding:'GENERATION_RATE_LIMIT'}],
  ['/api/rtro/event',{handler:event,binding:'EVENT_RATE_LIMIT'}],
  ['/api/rtro/verify/request',{handler:verificationRequest,binding:'VERIFICATION_REQUEST_RATE_LIMIT'}],
  ['/api/rtro/verify/confirm',{handler:verificationConfirm,binding:'VERIFICATION_CONFIRM_RATE_LIMIT'}]
]);

export default {
  async fetch(request,env,ctx) {
    const route=routes.get(new URL(request.url).pathname);
    const origin=request.headers.get('origin') || '';
    if (!route) return json(404,{error:'Not found.'},origin);
    if (!env[route.binding] || typeof env[route.binding].limit !== 'function') {
      return json(503,{error:'API rate limiting is not configured.'},origin);
    }
    return route.handler({request,env,params:{},data:{},waitUntil:ctx?.waitUntil?.bind(ctx),next:()=>json(404,{error:'Not found.'},origin)});
  }
};
