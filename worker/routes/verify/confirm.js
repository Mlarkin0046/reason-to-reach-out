import { confirmVerification } from '../../lib/verification.js';
import { json,preflight,guard,readJson,validationError,createRateLimiter,clientKey,allowRequest } from '../../lib/http.js';
const limit=createRateLimiter(10);
export async function onRequest({request,env}){const early=preflight(request)||guard(request);if(early)return early;const origin=request.headers.get('origin')||'';if(!await allowRequest(env.VERIFICATION_CONFIRM_RATE_LIMIT,limit,clientKey(request)))return json(429,{error:'Too many verification attempts. Please wait and try again.'},origin);try{return json(200,await confirmVerification(await readJson(request),env,{now:env.RTRO_NOW||Date.now}),origin);}catch(error){return json(validationError(error)?400:401,{error:error.message||'Verification failed.'},origin);}}
