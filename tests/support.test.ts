import { containsSecret } from '../supabase/functions/pvz2-support/privacy.ts';
const assert = (value: unknown, message='Assertion failed') => { if (!value) throw Error(message); };
Deno.test('privacy blocks recognizable credentials but permits support questions',()=>{
  for(const text of ['Пароль: TestCredential42','password=TestCredential42','токен: very-secret-value','Bearer abcdefghijklmnop','sb_secret_abcdefghijklmnop','123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh','a'.repeat(64),'https://example.org/#access_token=example-secret','Резервный код: abcdefghijklmnop','-----BEGIN RSA PRIVATE KEY-----'])assert(containsSecret(text),'Not blocked: '+text.slice(0,20));
  for(const text of ['Забыл пароль, как восстановить доступ?','Не получается назначить смену с 08:00 до 20:00','Ошибка на странице графика','password: [скрыто]'])assert(!containsSecret(text),'False positive');
});

Deno.env.set('SUPABASE_URL','https://support-test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-server-only-key-that-is-never-persisted');
const {handler}=await import('../supabase/functions/pvz2-support/index.ts');
const key='sb_publishable_eIWwXJEBGxYAbnhOc-MKfw_NitfQtB_';
const originalFetch=globalThis.fetch;
const ticketId='12345678-1234-4234-8234-123456789012';
const request=(body:unknown,headers:Record<string,string>={},method='POST')=>new Request('https://support-test.supabase.co/functions/v1/pvz2-support',{method,headers:{origin:'https://po-grafiku.ru','content-type':'text/plain',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const payload=(action:string,extra:Record<string,unknown>={})=>({action,transport:{apikey:key},...extra});

Deno.test('handler rejects untrusted origins, malformed bodies and credentials',async()=>{
  assert((await handler(request({}, {origin:'https://evil.example'}))).status===403);
  assert((await handler(request({}, {},'GET'))).status===405);
  assert((await handler(request('{'))).status===400);
  assert((await handler(request({action:'supportList'}))).status===401);
  assert((await handler(request('x'.repeat(28001)))).status===413);
  assert((await handler(request(payload('supportList',{transport:{apikey:key,token:'wrong'}})))).status===401);
  assert((await handler(request(payload('supportRead',{guestKey:'a'.repeat(64),ticketId:'invalid'})))).status===400);
});

Deno.test('ordinary Auth account cannot impersonate a service administrator',async()=>{
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{const u=String(input);calls.push(u);if(u.includes('/auth/v1/user'))return Response.json({id:'ordinary-user',email_confirmed_at:'2026-10-01T00:00:00Z'});if(u.includes('/rpc/pvz2_service_admin_access')){assert(new Headers(init?.headers).get('authorization')==='Bearer test-auth-jwt');return Response.json(false)}throw Error('Unexpected privileged request');};
  try{assert((await handler(request(payload('adminList',{authToken:'test-auth-jwt',role:'admin'})))).status===403);assert(calls.length===2)}finally{globalThis.fetch=originalFetch}
});

Deno.test('guest cannot read or reply to another requester ticket',async()=>{
  globalThis.fetch=async input=>{assert(String(input).includes('/pvz2_support_access'));return Response.json(null)};
  try{for(const action of ['supportRead','supportReply','supportSeen'])assert((await handler(request(payload(action,{guestKey:'b'.repeat(64),ticketId})))).status===404)}finally{globalThis.fetch=originalFetch}
});

Deno.test('invalid session header overrides a valid body session; legacy staff session refused',async()=>{
  const owner='a'.repeat(64);let queries=0;
  globalThis.fetch=async input=>{queries++;assert(String(input).includes('/pvz2_sessions'));return Response.json({token_hash:'legacy-hash',company_id:ticketId,role:'staff',member_id:ticketId})};
  try{assert((await handler(request(payload('supportList',{transport:{apikey:key,token:owner}}),{authorization:'Bearer invalid'}))).status===401);assert(queries===0);assert((await handler(request(payload('supportList',{transport:{apikey:key,token:owner}})))).status===401);assert(queries===1)}finally{globalThis.fetch=originalFetch}
});

Deno.test('secrets never reach persistence; honeypot consumes no budget',async()=>{
  globalThis.fetch=async()=>{throw Error('Must not write or call a third party')};
  const base={guestKey:'c'.repeat(64),category:'bug',title:'Проверка формы',message:'Описание ошибки. Пароль: TestCredential42',email:'qa@example.invalid'};
  try{assert((await handler(request(payload('supportSubmit',base)))).status===400);assert((await handler(request(payload('supportSubmit',{...base,website:'bot'})))).status===200)}finally{globalThis.fetch=originalFetch}
});

Deno.test('service admin uses allowlist on every call, then reads only support data',async()=>{
  let accessChecks=0;
  globalThis.fetch=async(input,init)=>{const u=String(input);if(u.includes('/auth/v1/user'))return Response.json({id:'admin-user',email_confirmed_at:'2026-10-01T00:00:00Z'});if(u.includes('/rpc/pvz2_service_admin_access')){accessChecks++;return Response.json(true)}if(u.includes('/pvz2_support_tickets'))return new Response(null,{headers:{'content-range':'0-0/3'}});throw Error('Unexpected request '+u)};
  try{for(let i=0;i<2;i++){const response=await handler(request(payload('adminCount',{authToken:'test-auth-jwt'})));assert(response.status===200);assert((await response.json()).unread===3)}assert(accessChecks===2)}finally{globalThis.fetch=originalFetch}
});
