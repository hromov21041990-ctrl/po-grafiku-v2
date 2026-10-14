import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const KEY="sb_publishable_eIWwXJEBGxYAbnhOc-MKfw_NitfQtB_";
const origins=new Set(["https://hromov21041990-ctrl.github.io","https://grafik.hromov-aa.chatgpt.site","https://po-grafiku.ru"]);
function resp(origin:string,status:number,value:unknown){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json;charset=utf-8","access-control-allow-origin":origin,"access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"}})}
const asObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
const rand=(n:number)=>hex(crypto.getRandomValues(new Uint8Array(n)));
const makeRecovery=()=>rand(24).match(/.{8}/g)!.join("-");
const cleanRecovery=(code:string)=>code.trim().toLowerCase().replace(/-/g,"");
const validPassword=(v:unknown):v is string=>typeof v==="string"&&v.length>=10&&v.length<=128;
async function digest(s:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))))}
async function hash(pass:string,salt:string){const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveBits"]);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new TextEncoder().encode(salt),iterations:180000},material,256)))}
function validEmployees(v:unknown){return Array.isArray(v)&&v.length>=1&&v.length<=50&&v.every(x=>typeof x==="string"&&x.trim().length>0&&x.trim().length<=80)&&new Set(v.map(x=>x.trim().toLowerCase())).size===v.length}
function validConfig(v:unknown){return asObj(v)&&Number.isInteger(v.positions)&&v.positions>=1&&v.positions<=10&&typeof v.opens==="string"&&typeof v.closes==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.opens)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.closes)&&v.opens<v.closes&&Array.isArray(v.days)&&v.days.length>=1&&v.days.length<=7&&new Set(v.days).size===v.days.length&&v.days.every(x=>Number.isInteger(x)&&x>=0&&x<=6)}
function validRates(v:unknown){return asObj(v)&&["shift","hour"].every(x=>typeof v[x]==="number"&&Number.isFinite(v[x])&&(v[x] as number)>0&&(v[x] as number)<=1000000)}
function validRoleState(roles:unknown,mapping:unknown,staff:unknown){
 if(roles===undefined&&mapping===undefined)return true;
 if(!Array.isArray(roles)||roles.length>40||!asObj(mapping)||!Array.isArray(staff))return false;
 const seenNames=new Set<string>(),seenIds=new Set<string>();
 for(const r of roles){
  if(!asObj(r)||typeof r.id!=="string"||!/^[a-zA-Z0-9-]{1,90}$/.test(r.id)||typeof r.name!=="string"||r.name.trim().length<2||r.name.length>80)return false;
  const name=r.name.trim().toLocaleLowerCase("ru");
  if(seenNames.has(name)||seenIds.has(r.id))return false;
  seenNames.add(name);seenIds.add(r.id);
  for(const key of ["shift","hour"])if(typeof r[key]!=="number"||!Number.isFinite(r[key])||r[key]<=0||r[key]>1000000)return false;
 }
 const pairs=Object.entries(mapping);
 return pairs.length<=staff.length&&pairs.every(([name,id])=>staff.includes(name)&&typeof id==="string"&&seenIds.has(id));
}


function publicCompany(c:any,role:string,person:string|null=null){
 const owner=role==="owner";
 const schedule=owner?(c.schedule||[]):(c.schedule||[]).map((v:any)=>{
  if(person&&v.employee===person)return {...v};
  const {id,date,position,employee,kind,start,end,jobRoleId,jobRoleName}=v;
  return {id,date,position,employee,kind,start,end,jobRoleId,jobRoleName};
 });
 const entries=Object.entries(c.payments||{}) as [string,any][];
 const ownPayments:any={};
 if(!owner&&person){
  for(const [k,v] of entries){
   if(k==="__fines"||k==="__advances"){
    ownPayments[k]=Object.fromEntries(Object.entries(v||{}).filter(([key])=>key.endsWith("|"+person)));
   }else if(k.endsWith("|"+person)) ownPayments[k]=v;
  }
 }
 return {
  name:c.name,code:c.code,employees:c.employees,config:c.config,
  rates:owner?c.rates:{},schedule,
  payments:owner?c.payments:ownPayments,
  jobRoles:owner?(c.job_roles||[]):(c.job_roles||[]).map((r:any)=>({id:r.id,name:r.name})),
  employeeRoles:owner||role==="admin"?(c.employee_roles||{}):{},
  version:c.version,role,myEmployee:person
 };
}

const ruTranslit:Record<string,string>={
 "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"
};
function suggestMemberLogin(name:string){
 let out="";
 for(const ch of name.toLowerCase().normalize("NFKC"))out+=ruTranslit[ch]??(/[a-z0-9]/.test(ch)?ch:".");
 out=out.replace(/\.+/g,".").replace(/^\.+|\.+$/g,"").slice(0,36).replace(/\.+$/,"");
 if(out.length<3)out="user."+(out||"member");
 return out.slice(0,40);
}

async function createSession(c:any,role:string,member:any=null){
 const token=rand(32);
 const {error}=await db.from("pvz2_sessions").insert({token_hash:await digest((member?"pvz-v2-members:":"")+token),company_id:c.id,role,member_id:member?.id||null,expires_at:new Date(Date.now()+24*3600*1000).toISOString()});
 if(error)throw Error("Ошибка создания сеанса");
 if(member?.must_change_password)return {token,mustChangePassword:true,employee:member.employee_name,login:member.login};
 return {token,company:publicCompany(c,role,member?.employee_name||null)};
}
const emailUser=async(v:unknown)=>{if(typeof v!=="string"||v.length<40||v.length>6000)return null;const {data,error}=await db.auth.getUser(v);return error||!data.user?.email_confirmed_at?null:data.user;};
Deno.serve(async req=>{const origin=req.headers.get("origin")||"";if(!origins.has(origin))return resp(origin,403,{error:"Недоступный источник"});if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,OPTIONS"}});if(req.method!=="POST")return resp(origin,405,{error:"Метод недоступен"});if(req.headers.get("apikey")!==KEY)return resp(origin,401,{error:"Неверный ключ приложения"});let body:any;try{const raw=await req.text();if(raw.length>250000)return resp(origin,413,{error:"Слишком большой запрос"});body=JSON.parse(raw);if(!asObj(body))throw Error()}catch{return resp(origin,400,{error:"Неверный запрос"})}
try {

if(body.action==="memberLogin"){
 const code=String(body.code||"").trim().toLowerCase();
 const username=String(body.login||"").trim().toLowerCase();
 const password=body.password;
 const denied=()=>resp(origin,401,{error:"Неверный логин или пароль"});
 if(!/^[a-z0-9-]{4,32}$/.test(code)||!/^[a-z0-9._-]{3,40}$/.test(username)||typeof password!=="string"||password.length>128)return denied();
 const {data:c}=await db.from("pvz2_companies").select("*").eq("code",code).maybeSingle();
 if(!c)return denied();
 const keyHash=await digest(code+":"+username);
 const now=Date.now();
 const {data:lim}=await db.from("pvz2_member_login_attempts").select("attempts,blocked_until,updated_at").eq("key_hash",keyHash).maybeSingle();
 if(lim?.blocked_until && Date.parse(lim.blocked_until)>now)return resp(origin,429,{error:"Слишком много попыток. Повторите вход через минуту."});
 const fail=async()=>{
  const recent=lim&&Date.parse(lim.updated_at)>now-60000&&!lim.blocked_until;
  const count=(recent?Number(lim.attempts||0):0)+1;
  await db.from("pvz2_member_login_attempts").upsert({key_hash:keyHash,attempts:count,blocked_until:count>=5?new Date(now+60000).toISOString():null,updated_at:new Date(now).toISOString()},{onConflict:"key_hash"});
  return count>=5?resp(origin,429,{error:"Слишком много попыток. Повторите вход через минуту."}):denied();
 };
 const {data:member}=await db.from("pvz2_members").select("*").eq("company_id",c.id).eq("login",username).eq("active",true).maybeSingle();
 if(!member||!(c.employees||[]).includes(member.employee_name))return await fail();
 if(await hash(password,member.password_salt)!==member.password_hash)return await fail();
 if(lim)await db.from("pvz2_member_login_attempts").delete().eq("key_hash",keyHash);
 return resp(origin,200,await createSession(c,member.role,member));
}

if(body.action==="emailPoints"){
 const u=await emailUser(body.authToken);if(!u)return resp(origin,401,{error:"Подтвердите почту и войдите"});
 const {data,error}=await db.from("pvz2_companies").select("id,code,name").eq("owner_auth_uid",u.id).order("created_at");
 if(error)return resp(origin,500,{error:"Не удалось загрузить точки"});
 return resp(origin,200,{points:data||[]});
}
if(body.action==="emailEnter"){
 const u=await emailUser(body.authToken);if(!u)return resp(origin,401,{error:"Подтвердите почту"});
 const {data:c}=await db.from("pvz2_companies").select("*").eq("owner_auth_uid",u.id).eq("id",body.pointId).maybeSingle();
 if(!c)return resp(origin,403,{error:"Точка не принадлежит аккаунту"});
 return resp(origin,200,await createSession(c,"owner"));
}
if(body.action==="emailCreate"){
 const u=await emailUser(body.authToken);if(!u)return resp(origin,401,{error:"Подтвердите почту"});
 const code=String(body.code||""),name=String(body.name||"").trim(),staff=rand(24);
 if(!/^[a-z0-9-]{4,32}$/.test(code)||name.length<2||name.length>100||!validPassword(staff)||!validEmployees(body.employees)||!validConfig(body.config)||!validRates(body.rates)||!validRoleState(body.jobRoles,body.employeeRoles,body.employees))return resp(origin,400,{error:"Проверьте настройки точки"});
 const a=rand(16),b=rand(16);
 const {data:c,error}=await db.from("pvz2_companies").insert({code,name,owner_auth_uid:u.id,owner_salt:a,owner_hash:await hash(rand(32),a),staff_salt:b,staff_hash:await hash(staff,b),employees:body.employees,config:body.config,rates:body.rates,job_roles:body.jobRoles||[],employee_roles:body.employeeRoles||{},schedule:[],payments:{}}).select("*").single();
 if(error)return resp(origin,error.code==="23505"?409:500,{error:error.code==="23505"?"Код точки уже занят":"Не удалось создать точку"});
 return resp(origin,200,{point:{id:c.id,code:c.code,name:c.name}});
}
if(body.action==="register"||body.action==="login"||body.action==="resetPassword"){
 return resp(origin,403,{error:"Используйте вход и регистрацию владельца по email или личный логин сотрудника."});
}
const bearer=req.headers.get("authorization")||"";if(!bearer.startsWith("Bearer ")||bearer.length>150)return resp(origin,401,{error:"Требуется вход"});const ownerHash=await digest(bearer.slice(7)),memberHash=await digest("pvz-v2-members:"+bearer.slice(7));const {data:s}=await db.from("pvz2_sessions").select("token_hash,company_id,role,member_id").in("token_hash",[ownerHash,memberHash]).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s||(s.role!=="owner"&&s.token_hash!==memberHash))return resp(origin,401,{error:"Сеанс истёк. Войдите снова"});const tokenHash=s.token_hash;if(body.action==="logout"){await db.from("pvz2_sessions").delete().eq("token_hash",tokenHash);return resp(origin,200,{ok:true})}
const {data:c,error:loadErr}=await db.from("pvz2_companies").select("*").eq("id",s.company_id).single();if(loadErr||!c)return resp(origin,404,{error:"Точка не найдена"});
let member:any=null;
if(s.role!=="owner"){
 if(!s.member_id)return resp(origin,403,{error:"Общий доступ отключён. Войдите по личному логину."});
 const {data:m}=await db.from("pvz2_members").select("id,employee_name,role,active,must_change_password,password_salt,password_hash").eq("id",s.member_id).eq("company_id",c.id).maybeSingle();
 if(!m||!m.active||m.role!==s.role||!(c.employees||[]).includes(m.employee_name))return resp(origin,403,{error:"Доступ сотрудника отозван"});
 member=m;
}
if(body.action==="memberChangePassword"){
 if(!member||s.role==="owner")return resp(origin,403,{error:"Смена пароля доступна сотруднику"});
 if(!member.must_change_password)return resp(origin,409,{error:"Смена временного пароля не требуется"});
 const newPassword=body.newPassword;
 if(!validPassword(newPassword))return resp(origin,400,{error:"Новый пароль должен содержать от 10 до 128 символов"});
 if(await hash(newPassword,member.password_salt)===member.password_hash)return resp(origin,400,{error:"Придумайте новый пароль, отличный от временного"});
 const salt=rand(16),password_hash=await hash(newPassword,salt);
 const {data:changed,error:changeError}=await db.from("pvz2_members")
   .update({password_salt:salt,password_hash,must_change_password:false}).eq("id",member.id).eq("company_id",c.id).eq("must_change_password",true).eq("password_hash",member.password_hash)
   .select("id").maybeSingle();
 if(changeError)return resp(origin,500,{error:"Не удалось сохранить пароль"});
 if(!changed)return resp(origin,409,{error:"Пароль уже изменён в другом окне — войдите заново"});
 await db.from("pvz2_sessions").delete().eq("member_id",member.id).neq("token_hash",tokenHash);
 return resp(origin,200,{token:bearer.slice(7),company:publicCompany(c,s.role,member.employee_name)});
}
if(member?.must_change_password&&body.action==="load")return resp(origin,200,{mustChangePassword:true,employee:member.employee_name});
if(member?.must_change_password)return resp(origin,403,{error:"Перед началом работы установите личный пароль",code:"PASSWORD_CHANGE_REQUIRED",employee:member.employee_name});
if(body.action==="memberList"){
 if(s.role!=="owner")return resp(origin,403,{error:"Доступно владельцу"});
 const {data:list,error}=await db.from("pvz2_members").select("id,employee_name,login,role,active,must_change_password").eq("company_id",c.id).order("employee_name");
 if(error)throw Error("Не удалось загрузить сотрудников");
 return resp(origin,200,{members:list||[]});
}

if(body.action==="memberIssue"){
 if(s.role!=="owner")return resp(origin,403,{error:"Доступно владельцу"});
 const who=String(body.employee||"");
 if(body.memberRole!==undefined&&!["staff","admin"].includes(body.memberRole))return resp(origin,400,{error:"Выберите права сотрудника"});
 const requestedRole=body.memberRole==="admin"?"admin":"staff";
 if(!c.employees.includes(who))return resp(origin,400,{error:"Сотрудник не найден"});
 const {data:existing,error:existingError}=await db.from("pvz2_members").select("id,login").eq("company_id",c.id).eq("employee_name",who).maybeSingle();
 if(existingError)return resp(origin,500,{error:"Не удалось проверить доступ сотрудника"});
 const requested=typeof body.login==="string"?body.login.trim().toLowerCase():"";
 const hasCustomLogin=typeof body.login==="string"&&requested!=="";
 if(hasCustomLogin&&!/^[a-z0-9._-]{3,40}$/.test(requested))return resp(origin,400,{error:"Логин: 3–40 латинских букв, цифр, точек или дефисов"});
 const {data:known,error:knownError}=await db.from("pvz2_members").select("id,login").eq("company_id",c.id);
 if(knownError)return resp(origin,500,{error:"Не удалось проверить логины"});
 let login=hasCustomLogin?requested:(existing?.login||suggestMemberLogin(who));
 const used=new Set((known||[]).filter((m:any)=>m.id!==existing?.id).map((m:any)=>m.login));
 if(!hasCustomLogin&&!existing){
  const base=login;
  for(let count=2;used.has(login)&&count<1000;count++){
   const suffix="."+count;
   login=base.slice(0,40-suffix.length).replace(/\.+$/,"")+suffix;
  }
 }
 if(used.has(login))return resp(origin,409,{error:"Логин «"+login+"» уже используется сотрудником этой точки. Выберите другой."});
 const password=rand(12),salt=rand(16),password_hash=await hash(password,salt);
 let saved:any,error:any;
 if(existing){
  ({data:saved,error}=await db.from("pvz2_members")
   .update({login,role:requestedRole,password_salt:salt,password_hash,active:true,must_change_password:true})
   .eq("id",existing.id).eq("company_id",c.id)
   .select("id,login,employee_name,role,active,must_change_password").single());
  if(!error)await db.from("pvz2_sessions").delete().eq("member_id",existing.id);
 }else{
  ({data:saved,error}=await db.from("pvz2_members")
   .insert({company_id:c.id,employee_name:who,login,role:requestedRole,password_salt:salt,password_hash,must_change_password:true})
   .select("id,login,employee_name,role,active,must_change_password").single());
 }
 if(error?.code==="23505")return resp(origin,409,{error:"Этот логин уже занят. Укажите другой."});
 if(error||!saved){console.error("memberIssue save failed",error?.code||"empty_result");return resp(origin,500,{error:"Не удалось создать доступ"});}
 return resp(origin,200,{member:saved,credentials:{login:saved.login,password}});
}
if(body.action==="memberRole"||body.action==="memberDisable"){
 if(s.role!=="owner")return resp(origin,403,{error:"Доступно владельцу"});
 const who=String(body.employee||"");
 if(!c.employees.includes(who))return resp(origin,400,{error:"Сотрудник не найден"});
 const {data:existing}=await db.from("pvz2_members").select("id").eq("company_id",c.id).eq("employee_name",who).maybeSingle();
 if(!existing)return resp(origin,404,{error:"Учётная запись не создана"});
 const changes=body.action==="memberDisable"?{active:false}:{role:body.memberRole==="admin"?"admin":"staff"};
 const {error}=await db.from("pvz2_members").update(changes).eq("id",existing.id).eq("company_id",c.id);
 if(error)throw Error("Не удалось изменить доступ");
 await db.from("pvz2_sessions").delete().eq("member_id",existing.id);
 return resp(origin,200,{ok:true});
}
if(body.action==="load")return resp(origin,200,{company:publicCompany(c,s.role,member?.employee_name||null)});
if(body.action==="payrollWeekly"||body.action==="payrollMonthly"){
 if(s.role!=="owner")return resp(origin,403,{error:"Только для владельца"});
 let result;
 if(body.action==="payrollWeekly"){
  result=await db.rpc("pvz2_owner_payroll",{p_token:bearer.slice(7),p_week:body.week,p_employee:body.employee,p_operation:body.operation,p_amount:body.amount??null,p_expected_version:body.expectedVersion});
 }else{
  result=await db.rpc("pvz2_monthly_payroll",{p_token:bearer.slice(7),p_op:body.operation,p_period:body.period,p_employee:body.employee||"",p_amount:body.amount??null,p_version:body.expectedVersion});
 }
 if(result.error)return resp(origin,400,{error:result.error.message});
 return resp(origin,200,{result:result.data});
}
if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==c.version)return resp(origin,409,{error:"График изменился на другом устройстве. Обновите страницу"});
let patch:any={};let issuedRecoveryCode:string|undefined;
if(body.action==="settings"){if(s.role!=="owner")return resp(origin,403,{error:"Доступно владельцу"});if(typeof body.name!=="string"||body.name.trim().length<2||body.name.length>100||!validEmployees(body.employees)||!validConfig(body.config)||!validRates(body.rates)||!validRoleState(body.jobRoles,body.employeeRoles,body.employees))return resp(origin,400,{error:"Неверные настройки"});if(c.schedule.some((x:any)=>x.position>=body.config.positions))return resp(origin,400,{error:"Сначала освободите удаляемые места смен"});patch={name:body.name.trim(),employees:body.employees.map((x:string)=>x.trim()),config:body.config,rates:body.rates,...(body.jobRoles===undefined?{}:{job_roles:body.jobRoles,employee_roles:body.employeeRoles})}}
else if(body.action==="security"){
 if(s.role!=="owner")return resp(origin,403,{error:"Доступно только владельцу"});
 const changeOwner=body.ownerPassword!==undefined,changeStaff=body.staffPassword!==undefined,rotate=body.rotateRecovery===true;
 if(!changeOwner&&!changeStaff&&!rotate)return resp(origin,400,{error:"Выберите изменение пароля или резервного кода"});
 if((changeOwner&&!validPassword(body.ownerPassword))||(changeStaff&&!validPassword(body.staffPassword)))return resp(origin,400,{error:"Пароли должны содержать от 10 до 128 символов"});
 if(changeOwner){const salt=rand(16);patch.owner_salt=salt;patch.owner_hash=await hash(body.ownerPassword,salt)}
 if(changeStaff){const salt=rand(16);patch.staff_salt=salt;patch.staff_hash=await hash(body.staffPassword,salt)}
 if(rotate){issuedRecoveryCode=makeRecovery();patch.recovery_hash=await digest(c.code+":"+cleanRecovery(issuedRecoveryCode))}
}
else if(body.action==="assign"){
 if(s.role!=="owner"&&s.role!=="admin")return resp(origin,403,{error:"Назначение смен доступно владельцу или администратору"});
 const date=body.date,position=body.position,idx=body.employeeIndex,kind=body.kind,start=body.start,end=body.end;
 if(typeof date!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(position)||position<0||position>=c.config.positions||!Number.isInteger(idx)||idx<0||idx>=c.employees.length||!["shift","half","hour"].includes(kind)||typeof start!=="string"||typeof end!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end||start<c.config.opens||end>c.config.closes)return resp(origin,400,{error:"Проверьте дату, сотрудника и время смены"});
 const parsed=new Date(date+"T12:00:00");
 if(!Number.isFinite(parsed.getTime())||parsed.getFullYear()!==Number(date.slice(0,4))||parsed.getMonth()+1!==Number(date.slice(5,7))||parsed.getDate()!==Number(date.slice(8,10)))return resp(origin,400,{error:"Неверная дата"});
 const day=(parsed.getDay()+6)%7;
 if(!c.config.days.includes(day))return resp(origin,400,{error:"Нерабочий день"});
 const who=c.employees[idx];
 if(c.schedule.some((x:any)=>x.date===date&&(x.position===position||x.employee===who)))return resp(origin,409,{error:"Место занято или сотрудник уже назначен"});
 const jobs=Array.isArray(c.job_roles)?c.job_roles:[];
 const roleId=typeof body.jobRoleId==="string"?body.jobRoleId:"";
 const job=jobs.find((x:any)=>x.id===roleId);
 if(jobs.length&&!job)return resp(origin,400,{error:"Выберите должность"});
 const defaultRole=c.employee_roles?.[who];
 if(s.role==="admin"&&jobs.length&&defaultRole!==roleId)return resp(origin,403,{error:"Должность сотрудника может менять только владелец"});
 let rate=job?(kind==="half"?(job.half??Math.round(job.shift*50)/100):job[kind]):(kind==="half"?(c.rates.half??Math.round(c.rates.shift*50)/100):c.rates[kind]);
 if(typeof rate!=="number"||!Number.isFinite(rate)||rate<=0||rate>1000000)return resp(origin,400,{error:"Неверная ставка"});
 const mins=(x:string)=>+x.slice(0,2)*60 + +x.slice(3);
 const pay=kind==="hour"?Math.round(rate*(mins(end)-mins(start))/60*100)/100:Math.round(rate*100)/100;
 const record={id:crypto.randomUUID(),date,position,employee:who,kind,start,end,rate,pay,...(job?{jobRoleId:job.id,jobRoleName:job.name}:{})};
 patch={schedule:[...c.schedule,record],...(s.role==="owner"&&job?{employee_roles:{...c.employee_roles,[who]:job.id}}:{})};
}
else if(body.action==="remove"){if(s.role!=="owner"&&s.role!=="admin")return resp(origin,403,{error:"Снять смену может владелец или администратор"});if(!c.schedule.some((x:any)=>x.id===body.id))return resp(origin,404,{error:"Запись не найдена"});patch={schedule:c.schedule.filter((x:any)=>x.id!==body.id)}}
else if(body.action==="paid"){if(s.role!=="owner")return resp(origin,403,{error:"Доступно владельцу"});if(typeof body.week!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(body.week)||!c.employees.includes(body.employee))return resp(origin,400,{error:"Неверный период или сотрудник"});patch={payments:{...c.payments,[body.week+"|"+body.employee]:{at:new Date().toISOString()}}}}
else return resp(origin,400,{error:"Неизвестное действие"});
const {data:next,error}=await db.from("pvz2_companies").update({...patch,version:c.version+1}).eq("id",c.id).eq("version",c.version).select("*").maybeSingle();if(error)return resp(origin,500,{error:"Ошибка сохранения"});if(!next)return resp(origin,409,{error:"Данные изменены. Обновите страницу"});
if(body.action==="security"){
 const revoke=db.from("pvz2_sessions").delete().eq("company_id",c.id).neq("token_hash",tokenHash);
 await revoke;
}
return resp(origin,200,{company:publicCompany(next,s.role,member?.employee_name||null),...(issuedRecoveryCode?{recoveryCode:issuedRecoveryCode}:{})});
}catch(e){console.error("pvz-v2-rbac request failed",String(body.action||""),e instanceof Error?e.name:"unknown");return resp(origin,500,{error:"Ошибка обработки запроса"})}
});